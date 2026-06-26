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
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error('Missing environment variables')
    }

    const body = await req.json().catch(() => ({})) as { importRunId?: number }
    const importRunId = body.importRunId

    const rpcName = typeof importRunId === 'number' ? 'process_psf_import_run' : 'process_next_psf_import_run'
    const rpcPayload = typeof importRunId === 'number' ? { p_import_run_id: importRunId } : {}

    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcPayload),
    })

    const payload = await rpcRes.json().catch(() => ({}))
    if (!rpcRes.ok) {
      return new Response(JSON.stringify({ error: 'Worker RPC failed', details: payload }), {
        status: rpcRes.status,
        headers,
      })
    }

    return new Response(JSON.stringify({ success: true, rpc: rpcName, data: payload }), {
      status: 200,
      headers,
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers },
    )
  }
})
