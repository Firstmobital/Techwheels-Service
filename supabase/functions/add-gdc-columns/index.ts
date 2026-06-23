import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Check if columns already exist
  const { data: colCheck } = await admin
    .from('job_cards')
    .select('id')
    .limit(1)

  // Try to read the gdc_status column — if it errors, we need migration
  const { error: colErr } = await admin
    .from('job_cards')
    .select('gdc_status')
    .limit(1)

  if (!colErr) {
    return new Response(JSON.stringify({ ok: true, status: 'columns_exist' }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  // Use postgres.js with the internal direct DB URL
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) {
    return new Response(JSON.stringify({ ok: false, error: 'SUPABASE_DB_URL not available' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  try {
    const { default: postgres } = await import('https://deno.land/x/postgresjs@v3.4.4/mod.js')
    const sql = postgres(dbUrl, { ssl: 'require', max: 1 })

    await sql`ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS gdc_status TEXT DEFAULT 'none' CHECK (gdc_status IN ('none','pending','done'))`
    await sql`ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS claim_submitted_at TIMESTAMPTZ DEFAULT NULL`
    await sql`ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS claim_submitted_by TEXT DEFAULT NULL`
    await sql`ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS claim_hidden BOOLEAN DEFAULT FALSE`

    // Refresh job_card_summary view to include new columns
    await sql`
      CREATE OR REPLACE VIEW job_card_summary AS
      SELECT
        jc.id AS job_card_id, jc.jc_number, jc.complaint_date, jc.km_reading,
        jc.claim_type, jc.complaint_text, jc.status,
        jc.gdc_status, jc.claim_submitted_at, jc.claim_submitted_by, jc.claim_hidden,
        jc.created_at AS jc_created_at, jc.updated_at AS jc_updated_at,
        v.reg_number, v.vin, v.model, v.vehicle_year, v.colour, v.paint_type,
        d.dealer_code, d.dealer_name, d.dealer_city, d.bp_city_category,
        v.owner_name, v.owner_phone, v.date_of_sale,
        CASE WHEN v.date_of_sale IS NULL THEN NULL
          ELSE EXTRACT(DAY FROM (jc.complaint_date::date - v.date_of_sale::date))::int
        END AS warranty_age_days,
        CASE
          WHEN v.date_of_sale IS NULL THEN 0
          WHEN EXTRACT(DAY FROM (jc.complaint_date::date - v.date_of_sale::date)) <= 365 THEN 100
          WHEN EXTRACT(DAY FROM (jc.complaint_date::date - v.date_of_sale::date)) <= 730 THEN 50
          WHEN EXTRACT(DAY FROM (jc.complaint_date::date - v.date_of_sale::date)) <= 1095 THEN 25
          ELSE 0
        END AS tml_share_percent,
        COUNT(DISTINCT p.id) AS panel_count,
        COUNT(DISTINCT ph.id) AS photo_count,
        COUNT(DISTINCT doc.id) AS document_count,
        COUNT(DISTINCT er.id) AS estimate_row_count,
        COALESCE(SUM(er.total_charges),0) AS total_estimate_amount,
        CASE
          WHEN v.date_of_sale IS NULL THEN 0
          WHEN EXTRACT(DAY FROM (jc.complaint_date::date - v.date_of_sale::date)) <= 365 THEN COALESCE(SUM(er.total_charges),0)*1.0
          WHEN EXTRACT(DAY FROM (jc.complaint_date::date - v.date_of_sale::date)) <= 730 THEN COALESCE(SUM(er.total_charges),0)*0.5
          WHEN EXTRACT(DAY FROM (jc.complaint_date::date - v.date_of_sale::date)) <= 1095 THEN COALESCE(SUM(er.total_charges),0)*0.25
          ELSE 0
        END AS tml_share_amount,
        BOOL_OR(ph.photo_type='defect') AS has_defect_photos,
        BOOL_OR(ph.photo_type='primer') AS has_primer_photos,
        BOOL_OR(ph.photo_type='paint')  AS has_paint_photos,
        BOOL_OR(ph.photo_type='service_history') AS has_service_history,
        BOOL_OR(doc.doc_type='video_job_card')   AS has_video_job_card,
        BOOL_OR(doc.doc_type='video_delivery')   AS has_video_delivery,
        BOOL_OR(doc.doc_type='ppt_pre')          AS has_ppt_pre,
        BOOL_OR(doc.doc_type='ppt_post')         AS has_ppt_post,
        BOOL_OR(doc.doc_type='excel_estimate')   AS has_excel_estimate
      FROM job_cards jc
      LEFT JOIN vehicles       v   ON v.id  = jc.vehicle_id
      LEFT JOIN dealer_settings d  ON d.id  = jc.dealer_id
      LEFT JOIN panels         p   ON p.job_card_id = jc.id
      LEFT JOIN photos         ph  ON ph.job_card_id = jc.id
      LEFT JOIN documents      doc ON doc.job_card_id = jc.id
      LEFT JOIN estimate_rows  er  ON er.job_card_id  = jc.id
      GROUP BY
        jc.id, jc.jc_number, jc.complaint_date, jc.km_reading, jc.claim_type,
        jc.complaint_text, jc.status, jc.gdc_status, jc.claim_submitted_at,
        jc.claim_submitted_by, jc.claim_hidden, jc.created_at, jc.updated_at,
        v.reg_number, v.vin, v.model, v.vehicle_year, v.colour, v.paint_type,
        d.dealer_code, d.dealer_name, d.dealer_city, d.bp_city_category,
        v.owner_name, v.owner_phone, v.date_of_sale
    `

    await sql.end()

    return new Response(JSON.stringify({ ok: true, status: 'migration_complete' }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
