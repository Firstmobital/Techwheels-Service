import { validateRequest } from '../_shared/auth.ts'
import { logAuditEvent } from '../_shared/audit.ts'
import { SignJWT, importPKCS8 } from 'https://esm.sh/jose@5.9.6'

type AttachmentRef = {
  filename: string
  storagePath: string
  bucket?: string
  driveFileId?: string | null
  driveUrl?: string | null
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

function decodeServiceAccountKey(rawBase64: string): string {
  const decoded = atob(rawBase64)
  const maybeUnescaped = decoded.includes('\\n') ? decoded.replace(/\\n/g, '\n') : decoded
  if (maybeUnescaped.includes('BEGIN PRIVATE KEY')) return maybeUnescaped
  const normalized = maybeUnescaped.replace(/\r/g, '').replace(/\n/g, '')
  const lines = normalized.match(/.{1,64}/g) ?? []
  return [
    '-----BEGIN PRIVATE KEY-----',
    ...lines,
    '-----END PRIVATE KEY-----',
    '',
  ].join('\n')
}

function extractDriveFileId(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return ''
  if (!trimmed.includes('http')) return trimmed

  const byFilePath = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (byFilePath?.[1]) return byFilePath[1]

  const byFoldersPath = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (byFoldersPath?.[1]) return byFoldersPath[1]

  try {
    const url = new URL(trimmed)
    return url.searchParams.get('id')?.trim() ?? ''
  } catch {
    return ''
  }
}

async function fetchGoogleAccessToken(input: {
  clientEmail: string
  privateKey: string
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const key = await importPKCS8(input.privateKey, 'RS256')
  const assertion = await new SignJWT({
    iss: input.clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setAudience('https://oauth2.googleapis.com/token')
    .sign(key)

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    throw new Error(`Failed to fetch Google access token: ${text}`)
  }

  const payload = await tokenRes.json() as { access_token?: string }
  if (!payload.access_token) throw new Error('Google access token missing in response')
  return payload.access_token
}

async function fetchDriveFileBytes(input: {
  driveFileId: string
  accessToken: string
}): Promise<Uint8Array> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.driveFileId)}?alt=media&supportsAllDrives=true`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${input.accessToken}` },
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to fetch Drive attachment ${input.driveFileId}: ${text}`)
  }

  return new Uint8Array(await res.arrayBuffer())
}

async function lookupDriveFileIdByStoragePath(input: {
  supabaseUrl: string
  serviceRoleKey: string
  storagePath: string
}): Promise<string> {
  const normalizedPath = input.storagePath.trim().replace(/^\/+/, '')
  if (!normalizedPath) return ''

  async function queryTable(table: 'documents' | 'panel_photos'): Promise<string> {
    const endpoint = `${input.supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}?select=drive_file_id&storage_path=eq.${encodeURIComponent(normalizedPath)}&drive_file_id=not.is.null&order=created_at.desc&limit=1`
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.serviceRoleKey}`,
        apikey: input.serviceRoleKey,
      },
    })

    if (!res.ok) return ''
    const payload = await res.json().catch(() => []) as Array<{ drive_file_id?: string | null }>
    const id = payload[0]?.drive_file_id?.trim()
    return id ?? ''
  }

  const docId = await queryTable('documents')
  if (docId) return docId
  return await queryTable('panel_photos')
}

async function toResendAttachment(
  ref: AttachmentRef,
  deps: {
    supabaseUrl?: string
    serviceRoleKey?: string
    googleServiceAccountEmail?: string
    googleServiceAccountPrivateKey?: string
  },
): Promise<{ filename: string; content: string }> {
  let driveFileId = extractDriveFileId(ref.driveFileId ?? ref.driveUrl)
  if (!driveFileId && deps.supabaseUrl && deps.serviceRoleKey) {
    driveFileId = await lookupDriveFileIdByStoragePath({
      supabaseUrl: deps.supabaseUrl,
      serviceRoleKey: deps.serviceRoleKey,
      storagePath: ref.storagePath,
    })
  }

  if (driveFileId) {
    if (!deps.googleServiceAccountEmail || !deps.googleServiceAccountPrivateKey) {
      throw new Error('Missing Google service account env for Drive attachment fetch')
    }

    const accessToken = await fetchGoogleAccessToken({
      clientEmail: deps.googleServiceAccountEmail,
      privateKey: deps.googleServiceAccountPrivateKey,
    })

    const bytes = await fetchDriveFileBytes({
      driveFileId,
      accessToken,
    })

    if (bytes.length === 0) {
      throw new Error(`Drive attachment ${driveFileId} is empty (0 bytes)`)
    }

    return {
      filename: ref.filename,
      content: bytesToBase64(bytes),
    }
  }

  if (!deps.supabaseUrl || !deps.serviceRoleKey) {
    throw new Error('Missing Supabase env for storage attachment fetch')
  }

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
  
  if (bytes.length === 0) {
    throw new Error(`Attachment ${ref.storagePath} is empty (0 bytes)`)
  }
  
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
    const GOOGLE_SERVICE_ACCOUNT_EMAIL = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL') ?? ''
    const GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_BASE64 = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_BASE64') ?? ''
    const GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_RAW = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY') ?? ''
    const GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_BASE64
      ? decodeServiceAccountKey(GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_BASE64)
      : GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_RAW.includes('\\n')
        ? GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_RAW.replace(/\\n/g, '\n')
        : GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_RAW

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
      const needsStorageFetch = (body.attachments ?? []).some((ref) => !extractDriveFileId(ref.driveFileId ?? ref.driveUrl))
      if (needsStorageFetch && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
        return json(headers, { error: 'Missing SUPABASE_URL/SUPBASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPBASE_SERVICE_ROLE_KEY env for attachments' }, 500)
      }

      const needsDriveFetch = (body.attachments ?? []).some((ref) => Boolean(extractDriveFileId(ref.driveFileId ?? ref.driveUrl)))
      if (needsDriveFetch && (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)) {
        return json(headers, { error: 'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY(_BASE64) env for Drive attachments' }, 500)
      }

      resendAttachments = await Promise.all(
        (body.attachments ?? []).map((ref) => toResendAttachment(ref, {
          supabaseUrl: SUPABASE_URL,
          serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
          googleServiceAccountEmail: GOOGLE_SERVICE_ACCOUNT_EMAIL,
          googleServiceAccountPrivateKey: GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
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
