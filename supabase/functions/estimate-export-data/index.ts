import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface JobSummary {
  job_card_id:       string
  jc_number:         string
  complaint_date:    string | null
  claim_type:        string | null
  km_reading:        number | null
  reg_number:        string
  vin:               string | null
  model:             string | null
  colour:            string | null
  paint_type:        string | null
  dealer_code:       string
  dealer_name:       string | null
  dealer_city:       string | null
  bp_city_category:  string | null
  date_of_sale:      string | null
  warranty_age_days: number | null
  tml_share_percent: number | null
}

interface EstimateRow {
  sr_no:                 number
  panel_name:            string | null
  part_number:           string | null
  part_description:      string | null
  defect:                string | null
  action:                string | null
  qty:                   number
  ndp_value:             number
  cut_weld_charges:      number
  paint_charges:         number
  total_special_charges: number
  job_code:              string | null
  job_code_desc:         string | null
  no_off:                number
  labour_charges:        number
  row_total:             number
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
    const { jobCardId } = await req.json()

    if (!jobCardId || typeof jobCardId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'jobCardId is required' }),
        { status: 400, headers }
      )
    }

    // Initialize Supabase client with SERVICE_ROLE key (bypasses RLS)
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers }
      )
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Fetch job card summary with all columns
    const { data: jcData, error: jcError } = await supabase
      .from('job_card_summary')
      .select([
        'job_card_id', 'jc_number', 'complaint_date', 'claim_type', 'km_reading',
        'reg_number', 'vin', 'model', 'colour', 'paint_type',
        'dealer_code', 'dealer_name', 'dealer_city', 'bp_city_category',
        'date_of_sale', 'warranty_age_days', 'tml_share_percent',
      ].join(', '))
      .eq('job_card_id', jobCardId)
      .single<JobSummary>()

    if (jcError || !jcData) {
      return new Response(
        JSON.stringify({
          error: `Job card not found: ${jcError?.message ?? 'no data'}`
        }),
        { status: 404, headers }
      )
    }

    // Fetch estimate rows - return all available columns
    const { data: estData, error: estError } = await supabase
      .from('estimate_rows')
      .select([
        'sr_no', 'panel_name', 'part_number', 'part_description', 'defect', 'action',
        'qty', 'ndp_value', 'cut_weld_charges', 'paint_charges',
        'total_special_charges', 'job_code', 'job_code_desc', 'no_off', 'labour_charges', 'row_total',
      ].join(', '))
      .eq('job_card_id', jobCardId)
      .order('sr_no')

    if (estError) {
      return new Response(
        JSON.stringify({ error: `Estimate rows fetch failed: ${estError.message}` }),
        { status: 500, headers }
      )
    }

    // Return success with data
    return new Response(
      JSON.stringify({
        jc: jcData,
        rows: (estData ?? []) as EstimateRow[],
      }),
      { status: 200, headers }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({
        error: `Server error: ${(err as Error).message}`
      }),
      { status: 500, headers }
    )
  }
})
