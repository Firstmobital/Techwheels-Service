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
    let debugStep = 'init'

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers,
      })
    }

    debugStep = 'read_env'
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

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

    // Verify actor is authenticated
    debugStep = 'verify_actor'
    const actorRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: ANON_KEY ?? SERVICE_KEY,
      },
    })

    if (!actorRes.ok) {
      const err = await actorRes.text()
      return new Response(JSON.stringify({ error: `Unauthorized: ${err}` }), {
        status: 401,
        headers,
      })
    }

    const actor = (await actorRes.json()) as { id?: string }
    const actorId = actor.id
    if (!actorId) {
      return new Response(JSON.stringify({ error: 'Unauthorized: invalid actor' }), {
        status: 401,
        headers,
      })
    }

    // Verify actor is admin via public.users
    debugStep = 'verify_actor_role'
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

    const roleRows = (await roleRes.json()) as Array<{ role?: string; is_active?: boolean }>
    const role = roleRows[0]?.role
    const isActive = roleRows[0]?.is_active

    if (role !== 'admin' || isActive !== true) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin access required' }), {
        status: 403,
        headers,
      })
    }

    // Fetch all auth.users with phone via admin API (pagination required)
    debugStep = 'fetch_auth_users'
    const phoneByUserId = new Map<string, string | null>()
    const phoneByEmail = new Map<string, string | null>()
    const dealerCodesByUserId = new Map<string, string[] | null>()
    const dealerCodeByUserId = new Map<string, string | null>()
    const dealerNameByUserId = new Map<string, string | null>()
    let authListFailedReason: string | null = null

    const ingestAuthUser = (u: {
      id?: string
      email?: string
      phone?: string | null
      user_metadata?: {
        dealer_code?: string | null
        dealer_name?: string | null
        dealer_codes?: string[] | null
      } | null
    }) => {
      if (u.id) phoneByUserId.set(u.id, u.phone ?? null)
      if (u.email) phoneByEmail.set((u.email ?? '').toLowerCase(), u.phone ?? null)
      if (u.id) {
        const metadataCodes = normalizeDealerCodes(u.user_metadata?.dealer_codes)
        const metadataPrimary = u.user_metadata?.dealer_code ? String(u.user_metadata.dealer_code).trim().toUpperCase() : null
        const mergedCodes = Array.from(
          new Set(
            [metadataPrimary, ...(metadataCodes ?? [])]
              .map((value) => String(value ?? '').trim().toUpperCase())
              .filter(Boolean),
          ),
        )

        dealerCodesByUserId.set(u.id, mergedCodes.length > 0 ? mergedCodes : null)
        dealerCodeByUserId.set(u.id, metadataPrimary)
        dealerNameByUserId.set(u.id, u.user_metadata?.dealer_name ? String(u.user_metadata.dealer_name).trim() : null)
      }
    }
    // Auth Admin API is stricter on per_page limits; 100 is broadly supported.
    const perPage = 100

    for (let page = 1; page <= 100; page += 1) {
      debugStep = `fetch_auth_users_page_${page}`
      const authUsersRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
        {
          method: 'GET',
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
        }
      )

      if (!authUsersRes.ok) {
        const authErr = await authUsersRes.text()
        authListFailedReason = `status=${authUsersRes.status} error=${authErr}`
        console.error('auth admin list failed; switching to per-user fallback', {
          page,
          reason: authListFailedReason,
        })
        break
      }

      const authPayload = (await authUsersRes.json()) as {
        users?: Array<{
          id?: string
          email?: string
          phone?: string | null
          user_metadata?: {
            dealer_code?: string | null
            dealer_name?: string | null
            dealer_codes?: string[] | null
          } | null
        }>
        error?: string
      }

      if (authPayload.error) {
        authListFailedReason = `Auth API error (page ${page}): ${authPayload.error}`
        console.error('auth admin list payload error; switching to per-user fallback', {
          page,
          reason: authListFailedReason,
        })
        break
      }

      const pageUsers = authPayload.users ?? []
      pageUsers.forEach((u) => ingestAuthUser(u))

      if (pageUsers.length < perPage) {
        break
      }
    }

    // Fetch public.users with dealer columns
    debugStep = 'fetch_public_users_with_dealer'
    const usersWithDealerRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=id,email,full_name,role,branch,dealer_code,dealer_name,is_active,created_at&order=full_name.asc`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
      }
    )

    let supportsDealerColumns = true
    let userRows: Array<{
      id: string
      email: string
      full_name: string | null
      role: string
      branch: string | null
      dealer_code?: string | null
      dealer_name?: string | null
      is_active: boolean
      created_at: string
    }> = []

    if (usersWithDealerRes.ok) {
      debugStep = 'parse_public_users_with_dealer'
      userRows = (await usersWithDealerRes.json()) as typeof userRows
    } else {
      supportsDealerColumns = false
      debugStep = 'fetch_public_users_fallback'
      const usersFallbackRes = await fetch(
        `${SUPABASE_URL}/rest/v1/users?select=id,email,full_name,role,branch,is_active,created_at&order=full_name.asc`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
          },
        }
      )

      if (!usersFallbackRes.ok) {
        const fallbackErr = await usersFallbackRes.text()
        throw new Error(`Failed to load users fallback: ${fallbackErr}`)
      }

      debugStep = 'parse_public_users_fallback'
      userRows = (await usersFallbackRes.json()) as typeof userRows
    }

    if (authListFailedReason) {
      debugStep = 'fetch_auth_users_by_id_fallback'
      for (const userRow of userRows) {
        const userId = String(userRow.id ?? '').trim()
        if (!userId) continue
        if (phoneByUserId.has(userId) || dealerCodeByUserId.has(userId) || dealerNameByUserId.has(userId) || dealerCodesByUserId.has(userId)) {
          continue
        }

        const authUserRes = await fetch(
          `${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
          {
            method: 'GET',
            headers: {
              apikey: SERVICE_KEY,
              Authorization: `Bearer ${SERVICE_KEY}`,
            },
          },
        )

        if (!authUserRes.ok) {
          const errText = await authUserRes.text()
          console.error('auth admin user-by-id failed', { userId, status: authUserRes.status, error: errText })
          continue
        }

        const authUserPayload = await authUserRes.json()
        const authUser = pickAuthUserFromPayload(authUserPayload)
        const payloadError =
          authUserPayload && typeof authUserPayload === 'object' && 'error' in (authUserPayload as Record<string, unknown>)
            ? String((authUserPayload as Record<string, unknown>).error ?? '')
            : ''

        if (payloadError || !authUser) {
          console.error('auth admin user-by-id payload error', { userId, error: payloadError || 'missing user payload' })
          continue
        }

        ingestAuthUser(authUser)
      }
    }

    debugStep = 'map_users_payload'
    const users = userRows.map((u) => {
      const normalizedEmail = String(u.email ?? '').trim().toLowerCase()
      const dbDealerCode = String(u.dealer_code ?? '').trim().toUpperCase() || null
      const dbDealerName = String(u.dealer_name ?? '').trim() || null
      const metaDealerCodes = dealerCodesByUserId.get(u.id) ?? null

      return {
        ...u,
        phone: phoneByUserId.get(u.id) ?? (normalizedEmail ? phoneByEmail.get(normalizedEmail) ?? null : null),
        dealer_code: dbDealerCode ?? dealerCodeByUserId.get(u.id) ?? null,
        dealer_name: dbDealerName ?? dealerNameByUserId.get(u.id) ?? null,
        dealer_codes: metaDealerCodes,
      }
    })

    return new Response(
      JSON.stringify({ users, supportsDealerColumns, authUsersFallbackUsed: Boolean(authListFailedReason) }),
      {
        status: 200,
        headers,
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack ?? null : null
    console.error('list-users-with-phone failure', { message, stack })
    return new Response(
      JSON.stringify({
        error: message,
        stack,
      }),
      { status: 500, headers }
    )
  }
})

function normalizeDealerCodes(value: unknown): string[] | null {
  const normalizeList = (input: unknown[]): string[] => {
    const normalized = Array.from(
      new Set(
        input
          .map((item) => String(item ?? '').trim().toUpperCase())
          .filter(Boolean),
      ),
    )
    return normalized
  }

  if (Array.isArray(value)) {
    const normalized = normalizeList(value)
    return normalized.length > 0 ? normalized : null
  }

  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return null

    if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const normalized = normalizeList(parsed)
          return normalized.length > 0 ? normalized : null
        }
      } catch {
        // Fall through to split-based parsing
      }
    }

    const splitCodes = normalizeList(raw.split(/[\s,]+/))
    return splitCodes.length > 0 ? splitCodes : null
  }

  return null
}

function pickAuthUserFromPayload(payload: unknown): {
  id?: string
  email?: string
  phone?: string | null
  user_metadata?: {
    dealer_code?: string | null
    dealer_name?: string | null
    dealer_codes?: string[] | null
  } | null
} | null {
  if (!payload || typeof payload !== 'object') return null

  const asRecord = payload as Record<string, unknown>

  const nested = asRecord.user
  if (nested && typeof nested === 'object') {
    return nested as {
      id?: string
      email?: string
      phone?: string | null
      user_metadata?: {
        dealer_code?: string | null
        dealer_name?: string | null
        dealer_codes?: string[] | null
      } | null
    }
  }

  // Some auth endpoints return the user object directly.
  if ('id' in asRecord || 'email' in asRecord || 'phone' in asRecord || 'user_metadata' in asRecord) {
    return asRecord as {
      id?: string
      email?: string
      phone?: string | null
      user_metadata?: {
        dealer_code?: string | null
        dealer_name?: string | null
        dealer_codes?: string[] | null
      } | null
    }
  }

  return null
}
