import * as jose from 'jsr:@panva/jose@6'
import {
  authEmailHtml,
  copyForLinkType,
  defaultWebAuthRedirect,
  generateAuthActionLink,
  sendAuthEmailViaResend,
  type AuthLinkType,
} from '../_shared/authEmailDelivery.ts'

async function actorIdFromAccessToken(token: string, supabaseUrl: string): Promise<string> {
  const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`
  try {
    const jwks = jose.createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
    let payload: jose.JWTPayload
    try {
      payload = (await jose.jwtVerify(token, jwks, { issuer })).payload
    } catch {
      payload = (await jose.jwtVerify(token, jwks)).payload
    }
    const sub = String(payload.sub ?? '').trim()
    if (sub) return sub
  } catch {
    /* fall through */
  }
  const hmacSecret = Deno.env.get('SUPABASE_JWT_SECRET') ?? Deno.env.get('JWT_SECRET') ?? ''
  if (hmacSecret) {
    const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(hmacSecret), { issuer })
    const sub = String(payload.sub ?? '').trim()
    if (sub) return sub
  }
  throw new Error('Invalid access token')
}

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

    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: missing bearer token' }), { status: 401, headers: cors })
    }

    const actorId = await actorIdFromAccessToken(token, SUPABASE_URL)
    const roleRes = await fetch(
      `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/users?id=eq.${encodeURIComponent(actorId)}&select=role,is_active`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } },
    )
    if (!roleRes.ok) throw new Error(`Failed to verify actor: ${await roleRes.text()}`)
    const rows = (await roleRes.json()) as Array<{ role?: string; is_active?: boolean }>
    if (rows[0]?.role !== 'admin' || rows[0]?.is_active !== true) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin access required' }), { status: 403, headers: cors })
    }

    const body = (await req.json()) as {
      userId?: string
      email?: string
      type?: AuthLinkType
      redirectTo?: string
    }

    const type = (body.type ?? 'recovery') as AuthLinkType
    if (!['recovery', 'invite', 'signup', 'magiclink'].includes(type)) {
      return new Response(JSON.stringify({ error: 'Invalid type' }), { status: 400, headers: cors })
    }

    let email = String(body.email ?? '').trim().toLowerCase()
    const userId = String(body.userId ?? '').trim()
    if (!email && userId) {
      const userRes = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      })
      if (!userRes.ok) {
        return new Response(JSON.stringify({ error: `User not found: ${await userRes.text()}` }), { status: 404, headers: cors })
      }
      const user = (await userRes.json()) as { email?: string }
      email = String(user.email ?? '').trim().toLowerCase()
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Valid email or userId is required' }), { status: 400, headers: cors })
    }

    const redirectTo = String(body.redirectTo ?? '').trim() || defaultWebAuthRedirect()
    const { actionLink } = await generateAuthActionLink({
      supabaseUrl: SUPABASE_URL,
      serviceKey: SERVICE_KEY,
      email,
      type,
      redirectTo,
    })

    const copy = copyForLinkType(type === 'magiclink' ? 'signup' : type)
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

    return new Response(JSON.stringify({ success: true, email, type }), { status: 200, headers: cors })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), { status: 502, headers: cors })
  }
})
