export type AuthLinkType = 'recovery' | 'invite' | 'signup' | 'magiclink'

export function defaultWebAuthRedirect(): string {
  const fromEnv = (Deno.env.get('AUTH_EMAIL_REDIRECT_WEB') ?? '').trim()
  if (fromEnv) return fromEnv
  return 'https://techwheels-service.vercel.app/auth/callback'
}

export function authEmailHtml(params: {
  title: string
  intro: string
  actionLabel: string
  actionLink: string
  footer?: string
}): string {
  const footer = params.footer ?? 'This link expires soon and can be used only once. If you did not request this, ignore this email.'
  return `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1a1b21;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="color:#2a4cd0;margin:0 0 12px">${escapeHtml(params.title)}</h2>
  <p style="margin:0 0 20px">${escapeHtml(params.intro)}</p>
  <p style="margin:0 0 24px">
    <a href="${escapeHtml(params.actionLink)}" style="display:inline-block;background:#2a4cd0;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700">${escapeHtml(params.actionLabel)}</a>
  </p>
  <p style="font-size:12px;color:#5c5f69;margin:0 0 8px">If the button does not work, copy this link:</p>
  <p style="font-size:12px;word-break:break-all;color:#2a4cd0;margin:0 0 20px">${escapeHtml(params.actionLink)}</p>
  <p style="font-size:12px;color:#82858f;margin:0">${escapeHtml(footer)}</p>
</body></html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function generateAuthActionLink(input: {
  supabaseUrl: string
  serviceKey: string
  email: string
  type: AuthLinkType
  redirectTo: string
}): Promise<{ actionLink: string; email: string }> {
  const res = await fetch(`${input.supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: input.serviceKey,
      Authorization: `Bearer ${input.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: input.type,
      email: input.email,
      options: { redirect_to: input.redirectTo },
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`generate_link failed (${res.status}): ${text}`)
  }

  let payload: { action_link?: string; email?: string }
  try {
    payload = JSON.parse(text) as { action_link?: string; email?: string }
  } catch {
    throw new Error(`generate_link returned invalid JSON: ${text}`)
  }

  const actionLink = String(payload.action_link ?? '').trim()
  if (!actionLink) throw new Error('generate_link did not return action_link')
  return { actionLink, email: String(payload.email ?? input.email).trim() }
}

export async function sendAuthEmailViaResend(input: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<{ resendStatus: number; resendBody: string }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
  const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? ''
  if (!RESEND_API_KEY || !FROM_EMAIL) {
    throw new Error('Missing RESEND_API_KEY or RESEND_FROM_EMAIL on edge function')
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Techwheels <${FROM_EMAIL}>`,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: FROM_EMAIL,
    }),
  })

  const resendBody = await res.text()
  if (!res.ok) {
    throw new Error(`Resend failed (${res.status}): ${resendBody}`)
  }
  return { resendStatus: res.status, resendBody }
}

export function copyForLinkType(type: AuthLinkType): { subject: string; title: string; intro: string; actionLabel: string } {
  if (type === 'recovery') {
    return {
      subject: 'Reset your Techwheels password',
      title: 'Password reset',
      intro: 'Use the button below to set a new password for your Techwheels Service account.',
      actionLabel: 'Set new password',
    }
  }
  if (type === 'invite') {
    return {
      subject: 'You are invited to Techwheels Service',
      title: 'Welcome to Techwheels',
      intro: 'Your admin created an account for you. Open the link below to set your password and sign in.',
      actionLabel: 'Accept invite & sign in',
    }
  }
  return {
    subject: 'Confirm your Techwheels account',
    title: 'Confirm your email',
    intro: 'Confirm your email address to activate your Techwheels Service login.',
    actionLabel: 'Confirm & continue',
  }
}
