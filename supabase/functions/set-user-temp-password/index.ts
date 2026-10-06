import * as jose from 'jsr:@panva/jose@6'

/** Same reason as list-users-with-phone: GET /auth/v1/user returns session_not_found when the JWT is still signed but the session row is gone. */
async function actorIdFromAccessToken(token: string, supabaseUrl: string): Promise<string> {
  const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`
  const errors: string[] = []

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
    errors.push('JWT has no subject')
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'JWKS verify failed')
  }

  const hmacSecret = Deno.env.get('SUPABASE_JWT_SECRET') ?? Deno.env.get('JWT_SECRET') ?? ''
  if (hmacSecret) {
    try {
      const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(hmacSecret), { issuer })
      const sub = String(payload.sub ?? '').trim()
      if (sub) return sub
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'HMAC verify failed')
    }
  }

  throw new Error(errors.filter(Boolean).join('; ') || 'Invalid access token')
}

Deno.serve(async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers,
      })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error('Missing environment variables')
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: missing bearer token' }), {
        status: 401,
        headers,
      })
    }

    let actorId = ''
    try {
      actorId = await actorIdFromAccessToken(token, SUPABASE_URL)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'invalid token'
      return new Response(JSON.stringify({ error: `Unauthorized: ${message}` }), {
        status: 401,
        headers,
      })
    }

    const roleRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(actorId)}&select=role,is_active`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
      }
    )

    if (!roleRes.ok) {
      const err = await roleRes.text()
      throw new Error(`Failed to verify actor role: ${err}`)
    }

    const rows = (await roleRes.json()) as Array<{ role?: string; is_active?: boolean }>
    const role = rows[0]?.role
    const isActive = rows[0]?.is_active

    if (role !== 'admin' || isActive !== true) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin access required' }), {
        status: 403,
        headers,
      })
    }

    const body = (await req.json()) as {
      userId?: string
      temporaryPassword?: string
      emailConfirm?: boolean
    }

    const userId = (body.userId ?? '').trim()
    const temporaryPassword = body.temporaryPassword ?? ''
    const emailConfirm = body.emailConfirm ?? true

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400,
        headers,
      })
    }

    if (!isStrongPassword(temporaryPassword)) {
      return new Response(
        JSON.stringify({
          error:
            'temporaryPassword must be at least 12 characters and include uppercase, lowercase, number, and special character',
        }),
        {
          status: 400,
          headers,
        }
      )
    }

    const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password: temporaryPassword,
        email_confirm: emailConfirm,
        user_metadata: {
          force_password_change: true,
          temp_password_issued_at: new Date().toISOString(),
        },
      }),
    })

    if (!updateRes.ok) {
      const err = await updateRes.text()
      const normalizedError = normalizeSupabaseError(err)
      return new Response(
        JSON.stringify({
          error: `Failed to set temporary password: ${normalizedError}`,
        }),
        {
          status: updateRes.status,
          headers,
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        message: 'Temporary password set. Ask user to sign in and change password immediately.',
      }),
      {
        status: 200,
        headers,
      }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers }
    )
  }
})

function isStrongPassword(password: string): boolean {
  if (password.length < 12) return false
  if (!/[A-Z]/.test(password)) return false
  if (!/[a-z]/.test(password)) return false
  if (!/[0-9]/.test(password)) return false
  if (!/[^A-Za-z0-9]/.test(password)) return false
  return true
}

function normalizeSupabaseError(errorText: string): string {
  try {
    const parsed = JSON.parse(errorText) as { error?: string; msg?: string; message?: string }
    return parsed.error ?? parsed.msg ?? parsed.message ?? errorText
  } catch {
    return errorText
  }
}
