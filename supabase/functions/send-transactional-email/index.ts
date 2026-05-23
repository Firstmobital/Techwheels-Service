import { validateRequest } from '../_shared/auth.ts'
import { logAuditEvent } from '../_shared/audit.ts'

type SendEmailBody = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  reply_to?: string
  purpose?: 'non_auth_notification' | 'operational' | 'report' | 'manual_message'
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
