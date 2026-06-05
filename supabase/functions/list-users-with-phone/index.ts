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
      const err = await usersWithDealerRes.text()
      if (!/dealer_code|dealer_name|column/i.test(err)) {
        return new Response(JSON.stringify({ error: `Failed to load users: ${err}` }), {
          status: usersWithDealerRes.status,
          headers,
        })
      }

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
        return new Response(JSON.stringify({ error: `Failed to load users: ${fallbackErr}` }), {
          status: usersFallbackRes.status,
          headers,
        })
      }

      userRows = (await usersFallbackRes.json()) as typeof userRows
    }

    const phoneByUserId = new Map<string, string | null>()
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
        return new Response(JSON.stringify({ error: `Failed to load auth users: ${authErr}` }), {
          status: authUsersRes.status,
          headers,
        })
      }

      const payload = (await authUsersRes.json()) as {
        users?: Array<{ id?: string; phone?: string | null }>
      }

      const pageUsers = payload.users ?? []
      pageUsers.forEach((u) => {
        if (u.id) {
          phoneByUserId.set(u.id, u.phone ?? null)
        }
      })

      if (pageUsers.length < perPage) {
        break
      }
    }

    const users = userRows.map((u) => ({
      ...u,
      phone: phoneByUserId.get(u.id) ?? null,
      dealer_code: u.dealer_code ?? null,
      dealer_name: u.dealer_name ?? null,
    }))

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
