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

    const body = await req.json().catch(() => ({})) as { importRunId?: number; maxRuns?: number }
    const importRunId = body.importRunId
    const maxRuns = Math.max(1, Math.min(Number(body.maxRuns ?? 5), 25))

    const callRpc = async (rpcName: string, rpcPayload: Record<string, unknown>) => {
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

      return payload
    }

    if (typeof importRunId === 'number') {
      const payload = await callRpc('process_psf_import_run', { p_import_run_id: importRunId })
      if (payload instanceof Response) return payload

      return new Response(JSON.stringify({ success: true, rpc: 'process_psf_import_run', data: payload }), {
        status: 200,
        headers,
      })
    }

    const processedRunIds: number[] = []
    for (let i = 0; i < maxRuns; i += 1) {
      const payload = await callRpc('process_next_psf_import_run', {})
      if (payload instanceof Response) return payload

      const nextRun = Number(payload)
      if (!Number.isFinite(nextRun) || nextRun <= 0) {
        break
      }
      processedRunIds.push(nextRun)
    }

    return new Response(JSON.stringify({ success: true, rpc: 'process_next_psf_import_run', processedRunIds }), {
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
