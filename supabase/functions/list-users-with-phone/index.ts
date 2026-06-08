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
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
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
    const actorRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: ANON_KEY,
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
    const phoneByUserId = new Map<string, string | null>()
    const phoneByEmail = new Map<string, string | null>()
    const dealerCodesByUserId = new Map<string, string[] | null>()
    const dealerCodeByUserId = new Map<string, string | null>()
    const dealerNameByUserId = new Map<string, string | null>()
    const perPage = 1000

    for (let page = 1; page <= 20; page += 1) {
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
        throw new Error(`Failed to load auth users (page ${page}): status=${authUsersRes.status} error=${authErr}`)
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
        throw new Error(`Auth API error (page ${page}): ${authPayload.error}`)
      }

      const pageUsers = authPayload.users ?? []
      pageUsers.forEach((u) => {
        if (u.id) phoneByUserId.set(u.id, u.phone ?? null)
        if (u.email) phoneByEmail.set((u.email ?? '').toLowerCase(), u.phone ?? null)
        if (u.id) {
          const metadataCodes = Array.isArray(u.user_metadata?.dealer_codes)
            ? Array.from(
                new Set(
                  (u.user_metadata?.dealer_codes ?? [])
                    .map((value) => String(value ?? '').trim().toUpperCase())
                    .filter(Boolean),
                ),
              )
            : []
          dealerCodesByUserId.set(u.id, metadataCodes.length > 0 ? metadataCodes : null)
          dealerCodeByUserId.set(u.id, u.user_metadata?.dealer_code ? String(u.user_metadata.dealer_code).trim().toUpperCase() : null)
          dealerNameByUserId.set(u.id, u.user_metadata?.dealer_name ? String(u.user_metadata.dealer_name).trim() : null)
        }
      })

      if (pageUsers.length < perPage) {
        break
      }
    }

    // Fetch public.users with dealer columns
    const usersWithDealerRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=id,email,full_name,role,branch,dealer_code,dealer_name,is_active,created_at&order=full_name.asc.nullslast`,
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
      userRows = (await usersWithDealerRes.json()) as typeof userRows
    } else {
      supportsDealerColumns = false
      const usersFallbackRes = await fetch(
        `${SUPABASE_URL}/rest/v1/users?select=id,email,full_name,role,branch,is_active,created_at&order=full_name.asc.nullslast`,
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

      userRows = (await usersFallbackRes.json()) as typeof userRows
    }

    const users = userRows.map((u) => {
      const dbDealerCode = String(u.dealer_code ?? '').trim().toUpperCase() || null
      const dbDealerName = String(u.dealer_name ?? '').trim() || null
      const metaDealerCodes = dealerCodesByUserId.get(u.id) ?? null

      return {
        ...u,
        phone: phoneByUserId.get(u.id) ?? phoneByEmail.get(u.email.toLowerCase()) ?? null,
        dealer_code: dbDealerCode ?? dealerCodeByUserId.get(u.id) ?? null,
        dealer_name: dbDealerName ?? dealerNameByUserId.get(u.id) ?? null,
        dealer_codes: metaDealerCodes,
      }
    })

    return new Response(
      JSON.stringify({ users, supportsDealerColumns }),
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
