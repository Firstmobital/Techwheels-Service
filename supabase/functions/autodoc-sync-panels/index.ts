import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type SyncBody = {
  jobCardId?: string
  selectedPanels?: string[]
}

type PanelRow = {
  id: string
  panel_name: string | null
  action: string | null
}

function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

function buildHeaders(origin: string | null): HeadersInit {
  const allowList = allowedOrigins()
  const allowOrigin = allowList.length === 0
    ? '*'
    : origin && allowList.includes(origin)
      ? origin
      : allowList[0]

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

Deno.serve(async (req) => {
  const headers = buildHeaders(req.headers.get('origin'))

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  try {
    const body = (await req.json()) as SyncBody
    const jobCardId = (body.jobCardId ?? '').trim()
    const selectedPanels = Array.from(
      new Set((body.selectedPanels ?? []).map((name) => name.trim()).filter((name) => name.length > 0)),
    )

    if (!jobCardId) {
      return new Response(JSON.stringify({ error: 'jobCardId is required' }), { status: 400, headers })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: existingPanels, error: listErr } = await supabase
      .from('panels')
      .select('id, panel_name, action')
      .eq('job_card_id', jobCardId)

    if (listErr) {
      return new Response(JSON.stringify({ error: listErr.message }), { status: 500, headers })
    }

    const existingByName = new Map<string, PanelRow>()
    for (const panel of (existingPanels ?? []) as PanelRow[]) {
      const name = panel.panel_name?.trim()
      if (!name) continue
      existingByName.set(name, panel)
    }

    const removedPanelNames: string[] = []
    const removedPanelIds: string[] = []
    for (const [name, panel] of existingByName.entries()) {
      if (selectedPanels.includes(name)) continue
      removedPanelNames.push(name)
      removedPanelIds.push(panel.id)
    }

    if (removedPanelIds.length > 0) {
      const { error: deletePhotosErr } = await supabase
        .from('panel_photos')
        .delete()
        .eq('job_card_id', jobCardId)
        .in('panel_id', removedPanelIds)

      if (deletePhotosErr) {
        return new Response(JSON.stringify({ error: deletePhotosErr.message }), { status: 500, headers })
      }

      const { error: deletePanelsErr } = await supabase
        .from('panels')
        .delete()
        .eq('job_card_id', jobCardId)
        .in('id', removedPanelIds)

      if (deletePanelsErr) {
        return new Response(JSON.stringify({ error: deletePanelsErr.message }), { status: 500, headers })
      }
    }

    if (removedPanelNames.length > 0) {
      const { error: deleteEstimateErr } = await supabase
        .from('estimate_rows')
        .delete()
        .eq('job_card_id', jobCardId)
        .in('panel_name', removedPanelNames)

      if (deleteEstimateErr) {
        return new Response(JSON.stringify({ error: deleteEstimateErr.message }), { status: 500, headers })
      }
    }

    const rowsToInsert = selectedPanels
      .filter((name) => !existingByName.has(name))
      .map((name) => ({
        job_card_id: jobCardId,
        panel_name: name,
        action: 'repaint',
      }))

    if (rowsToInsert.length > 0) {
      const { error: createErr } = await supabase
        .from('panels')
        .insert(rowsToInsert)

      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), { status: 500, headers })
      }
    }

    const { data: finalPanels, error: finalErr } = await supabase
      .from('panels')
      .select('id, panel_name, action')
      .eq('job_card_id', jobCardId)
      .order('created_at', { ascending: true })

    if (finalErr) {
      return new Response(JSON.stringify({ error: finalErr.message }), { status: 500, headers })
    }

    return new Response(
      JSON.stringify({
        success: true,
        removedPanelNames,
        panels: finalPanels ?? [],
      }),
      { status: 200, headers },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Server error: ${(err as Error).message}` }),
      { status: 500, headers },
    )
  }
})
