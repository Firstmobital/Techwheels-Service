import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface EstimateRowInput {
  job_card_id:           string
  sr_no:                 number
  panel_name:            string | null
  part_number:           string | null
  part_description?:     string | null
  defect?:               string | null
  action:                string | null
  qty:                   number
  ndp_value:             number
  cut_weld_charges:      number
  paint_charges:         number
  total_special_charges: number
  job_code?:             string | null
  job_code_desc?:        string | null
  no_off:                number
  labour_charges:        number
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
    // Parse request
    const body = await req.json()
    const { jobCardId, rows } = body

    if (!jobCardId || typeof jobCardId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'jobCardId is required' }),
        { status: 400, headers }
      )
    }

    if (!Array.isArray(rows)) {
      return new Response(
        JSON.stringify({ error: 'rows must be an array' }),
        { status: 400, headers }
      )
    }

    const normalizedRows = (rows as Partial<EstimateRowInput>[]).map((row) => ({
      ...row,
      job_card_id: jobCardId,
    })) as EstimateRowInput[]

    if (normalizedRows.some((row) => row.job_card_id !== jobCardId)) {
      return new Response(
        JSON.stringify({ error: 'row job_card_id does not match jobCardId' }),
        { status: 400, headers }
      )
    }

    // Initialize Supabase client with SERVICE_ROLE key (bypasses RLS)
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error('[estimate-rows-insert] Missing env vars')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers }
      )
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Replace all rows for the job card to keep DB in sync with the latest estimate state.
    const { error: deleteError } = await supabase
      .from('estimate_rows')
      .delete()
      .eq('job_card_id', jobCardId)

    if (deleteError) {
      console.error(`[estimate-rows-insert] Delete error:`, deleteError)
      return new Response(
        JSON.stringify({
          error: `Failed to replace rows: ${deleteError.message}`
        }),
        { status: 500, headers }
      )
    }

    if (normalizedRows.length === 0) {
      console.log(`[estimate-rows-insert] Cleared rows for ${jobCardId}`)
      return new Response(
        JSON.stringify({ success: true, count: 0 }),
        { status: 200, headers }
      )
    }

    // Insert rows
    const { data: insertedData, error: insertError } = await supabase
      .from('estimate_rows')
      .insert(normalizedRows)
      .select()

    if (insertError) {
      console.error(`[estimate-rows-insert] Insert error:`, insertError)
      return new Response(
        JSON.stringify({
          error: `Failed to insert rows: ${insertError.message}`
        }),
        { status: 500, headers }
      )
    }

    console.log(`[estimate-rows-insert] Success: inserted ${insertedData?.length ?? 0} rows`)

    // Return success
    return new Response(
      JSON.stringify({
        success: true,
        count: insertedData?.length ?? 0,
      }),
      { status: 200, headers }
    )

  } catch (err) {
    console.error('[estimate-rows-insert] Exception:', err)
    return new Response(
      JSON.stringify({
        error: `Server error: ${(err as Error).message}`
      }),
      { status: 500, headers }
    )
  }
})
