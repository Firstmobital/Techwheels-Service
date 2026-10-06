import {
  authEmailHtml,
  copyForLinkType,
  defaultWebAuthRedirect,
  generateAuthActionLink,
  sendAuthEmailViaResend,
} from '../_shared/authEmailDelivery.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors })
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env')

    const body = (await req.json()) as { email?: string; redirectTo?: string }
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Valid email is required' }), { status: 400, headers: cors })
    }

    const redirectTo = String(body.redirectTo ?? '').trim() || defaultWebAuthRedirect()

    const lookup = await fetch(
      `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
      {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      },
    )

    if (!lookup.ok) {
      const errText = await lookup.text()
      console.error('[deliver-password-reset-email] user lookup failed', lookup.status, errText)
      return new Response(JSON.stringify({ success: true, delivered: false }), { status: 200, headers: cors })
    }

    const users = (await lookup.json()) as { users?: Array<{ email?: string; banned_until?: string | null }> }
    const row = users.users?.[0]
    if (!row?.email) {
      return new Response(JSON.stringify({ success: true, delivered: false }), { status: 200, headers: cors })
    }

    const { actionLink } = await generateAuthActionLink({
      supabaseUrl: SUPABASE_URL,
      serviceKey: SERVICE_KEY,
      email,
      type: 'recovery',
      redirectTo,
    })

    const copy = copyForLinkType('recovery')
    await sendAuthEmailViaResend({
      to: email,
      subject: copy.subject,
      html: authEmailHtml({
        title: copy.title,
        intro: copy.intro,
        actionLabel: copy.actionLabel,
        actionLink,
      }),
      text: `${copy.intro}\n\n${actionLink}`,
    })

    return new Response(JSON.stringify({ success: true, delivered: true }), { status: 200, headers: cors })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[deliver-password-reset-email]', message)
    return new Response(JSON.stringify({ error: message }), { status: 502, headers: cors })
  }
})
