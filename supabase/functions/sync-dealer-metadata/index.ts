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
    // Get environment variables
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error('Missing environment variables')
    }

    const { userId, dealerCode, dealerName, dealerCodes } = await req.json()

    if (!userId || typeof userId !== 'string') {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400,
        headers,
      })
    }

    const normalizedCodes = Array.isArray(dealerCodes)
      ? Array.from(
          new Set(
            dealerCodes
              .map((value) => String(value ?? '').trim().toUpperCase())
              .filter(Boolean),
          ),
        )
      : []

    const normalizedPrimary = String(dealerCode ?? '').trim().toUpperCase()
    const finalCodes = normalizedPrimary
      ? Array.from(new Set([normalizedPrimary, ...normalizedCodes]))
      : normalizedCodes

    // Call Supabase Auth API to update metadata
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_metadata: {
          dealer_code: normalizedPrimary || null,
          dealer_name: dealerName,
          dealer_codes: finalCodes.length > 0 ? finalCodes : null,
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return new Response(
        JSON.stringify({ error: `Failed to sync dealer metadata: ${normalizeSupabaseError(err)}` }),
        {
          status: res.status,
          headers,
        }
      )
    }

    // Metadata synced to JWT. Public.users table display will use JWT fallback via React component.
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers,
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers }
    )
  }
})

function normalizeSupabaseError(errorText: string): string {
  try {
    const parsed = JSON.parse(errorText) as { error?: string; msg?: string; message?: string }
    return parsed.error ?? parsed.msg ?? parsed.message ?? errorText
  } catch {
    return errorText
  }
}
