import { validateRequest } from '../_shared/auth.ts'
import { logAuditEvent } from '../_shared/audit.ts'

type AttachmentRef = {
  filename: string
  storagePath: string
  bucket?: string
}

type SendEmailBody = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  reply_to?: string
  purpose?: 'non_auth_notification' | 'operational' | 'report' | 'manual_message'
  attachments?: AttachmentRef[]
}

function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

function buildHeaders(origin: string | null): HeadersInit {
  const allowList = allowedOrigins()
  const allowOrigin = allowList.length === 0
    ? '*'
    : origin && allowList.includes(origin)
      ? origin
      : allowList[0]

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

function json(headers: HeadersInit, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

function toEmailArray(input: string | string[]): string[] {
  return Array.isArray(input) ? input : [input]
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function encodeStoragePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function toResendAttachment(
  ref: AttachmentRef,
  deps: { supabaseUrl: string; serviceRoleKey: string },
): Promise<{ filename: string; content: string }> {
  const bucket = (ref.bucket ?? 'autodoc').trim()
  const normalizedPath = ref.storagePath.trim().replace(/^\/+/, '')
  const objectUrl = `${deps.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${bucket}/${encodeStoragePath(normalizedPath)}`

  const downloadRes = await fetch(objectUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${deps.serviceRoleKey}`,
      apikey: deps.serviceRoleKey,
    },
  })

  if (!downloadRes.ok) {
    const errText = await downloadRes.text()
    throw new Error(`Failed to fetch attachment ${ref.storagePath}: ${errText}`)
  }

  const bytes = new Uint8Array(await downloadRes.arrayBuffer())
  return {
    filename: ref.filename,
    content: bytesToBase64(bytes),
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  const headers = buildHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  if (req.method !== 'POST') {
    return json(headers, { error: 'Method not allowed' }, 405)
  }

  const allowList = allowedOrigins()
  if (allowList.length > 0 && origin && !allowList.includes(origin)) {
    return json(headers, { error: 'Origin is not allowed' }, 403)
  }

  try {
    const auth = await validateRequest(req)

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
    const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? ''
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('SUPBASE_URL') ?? ''
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPBASE_SERVICE_ROLE_KEY') ?? ''

    if (!RESEND_API_KEY || !FROM_EMAIL) {
      return json(headers, { error: 'Missing RESEND_API_KEY or RESEND_FROM_EMAIL env' }, 500)
    }

    let body: SendEmailBody
    try {
      body = (await req.json()) as SendEmailBody
    } catch {
      return json(headers, { error: 'Invalid JSON body' }, 400)
    }

    if (!body.to || !body.subject || !body.html) {
      return json(headers, { error: 'to, subject, html are required' }, 400)
    }

    const recipients = toEmailArray(body.to).map((v) => v.trim()).filter((v) => v.length > 0)
    if (recipients.length === 0) {
      return json(headers, { error: 'At least one recipient is required' }, 400)
    }

    if (!recipients.every(isEmail)) {
      return json(headers, { error: 'Invalid recipient email format' }, 400)
    }

    if (body.reply_to && !isEmail(body.reply_to)) {
      return json(headers, { error: 'Invalid reply_to email format' }, 400)
    }

    let resendAttachments: Array<{ filename: string; content: string }> = []
    if ((body.attachments ?? []).length > 0) {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return json(headers, { error: 'Missing SUPABASE_URL/SUPBASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPBASE_SERVICE_ROLE_KEY env for attachments' }, 500)
      }

      resendAttachments = await Promise.all(
        (body.attachments ?? []).map((ref) => toResendAttachment(ref, {
          supabaseUrl: SUPABASE_URL,
          serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        })),
      )
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Techwheels <${FROM_EMAIL}>`,
        to: recipients,
        subject: body.subject,
        html: body.html,
        text: body.text,
        reply_to: body.reply_to ?? FROM_EMAIL,
        attachments: resendAttachments,
      }),
    })

    const resendText = await resendRes.text()
    if (!resendRes.ok) {
      await logAuditEvent({
        actor_id: auth.userId,
        action: 'send_transactional_email_failed',
        resource_type: 'email',
        resource_id: null,
        details: {
          purpose: body.purpose ?? 'manual_message',
          recipients_count: recipients.length,
          attachments_count: resendAttachments.length,
          resend_status: resendRes.status,
          resend_response: resendText,
        },
        timestamp: new Date().toISOString(),
      })

      return json(headers, { error: 'Failed to send email', details: resendText }, 502)
    }

    await logAuditEvent({
      actor_id: auth.userId,
      action: 'send_transactional_email',
      resource_type: 'email',
      resource_id: null,
      details: {
        purpose: body.purpose ?? 'manual_message',
        recipients_count: recipients.length,
        recipients: recipients,
        subject: body.subject,
        attachments_count: resendAttachments.length,
      },
      timestamp: new Date().toISOString(),
    })

    return json(headers, {
      success: true,
      message: 'Transactional email sent',
      recipients_count: recipients.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json(headers, { error: message }, 401)
  }
})
