import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Rebuilds warranty_spl_codes_data (9800xx special codes) and warranty_labour_data
// (everything else) from warranty_claim_settlement_report_data, which is the raw table
// the Import page actually writes to.
//
// Root cause fixed: uploading a Claim-Settlement-Report only ever wrote raw JSONB rows.
// Nothing transformed those into the two structured tables the Warranty Overview report
// reads from, so the report has been stale since it was built. This function is the
// missing sync step, run automatically after every successful upload (also callable
// manually for a one-time backfill).
//
// Runs with the service role so it always succeeds regardless of the uploader's RBAC role
// (warranty_spl_codes_data / warranty_labour_data writes are admin-only via RLS, but any
// authenticated user can upload a Claim-Settlement-Report).
//
// Does a full delete+rebuild each run (not incremental) so the derived tables always
// exactly match the raw table — correctly handles edits/deletes upstream too, not just
// new inserts.

const SPL_CODES = new Set([
  '980001', '980002', '980003', '980004', '980009', '980011', '980016', '980019', '980025',
])

const CODE_LABELS: Record<string, string> = {
  '980001': 'Loading / Unloading',
  '980002': 'Crane Charges',
  '980003': 'Towing Charges',
  '980004': 'PDI Charges',
  '980009': 'Body Repair SPL',
  '980011': 'Misc SPL',
  '980016': 'Rusting / Body SPL',
  '980019': 'Loaner Car',
  '980025': 'Special Misc',
}

interface RawClaimRow {
  id: number
  portal: string | null
  source_row_data: Record<string, unknown>
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0
  const n = parseFloat(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

function toDateOrNull(v: unknown): string | null {
  const s = str(v)
  if (!s || s === '0000-00-00') return null
  return s
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // 1. Fetch every raw claim line (paginated)
    const pageSize = 1000
    let from = 0
    const rawRows: RawClaimRow[] = []
    while (true) {
      const { data, error } = await supabase
        .from('warranty_claim_settlement_report_data')
        .select('id,portal,source_row_data')
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) throw new Error(`Failed to load raw claim rows: ${error.message}`)
      const rows = (data ?? []) as RawClaimRow[]
      rawRows.push(...rows)
      if (rows.length < pageSize) break
      from += pageSize
    }

    // 2. Dedupe true duplicate claim lines — same claim/invoice/job-code/part/amounts
    // uploaded twice across overlapping source files (confirmed to happen: e.g. the same
    // claim appears in both "PV Claim Settlement Report.xlsx" and a later "PV WC.xlsx"
    // re-export, sometimes with a tiny description-text correction).
    const seen = new Map<string, RawClaimRow>()
    let duplicatesSkipped = 0
    for (const r of rawRows) {
      const d = r.source_row_data || {}
      const key = [
        str(d.sap_claim), str(d.job_code), str(d.dealer_invc_no), str(d.posting_document_number),
        str(d.job_card_number_number), str(d.part_number),
        str(d.labour_chgs), str(d.misc_chgs), str(d.spl_labour_chgs), str(d.ndp), str(d.list_price),
      ].join('|')
      const existing = seen.get(key)
      if (existing) {
        duplicatesSkipped++
        const existingDesc = str((existing.source_row_data || {}).description)
        const currentDesc = str(d.description)
        if (currentDesc.length > existingDesc.length) seen.set(key, r)
        continue
      }
      seen.set(key, r)
    }
    const dedupedRows = Array.from(seen.values())

    // 3. Classify: exact match on the 9 codes → SPL; everything else → Labour
    const splRows: Record<string, unknown>[] = []
    const labourRows: Record<string, unknown>[] = []

    for (const r of dedupedRows) {
      const d = r.source_row_data || {}
      const jobCode = str(d.job_code)
      const common: Record<string, unknown> = {
        source_claim_id: r.id,
        dealer_code: str(d.dealer_code) || null,
        portal: r.portal,
        job_card_number: str(d.job_card_number_number) || null,
        prowac_no: str(d.prowac_no) || null,
        sap_claim: str(d.sap_claim) || null,
        job_code: jobCode || null,
        part_number: str(d.part_number) || null,
        description: str(d.description) || null,
        ndp: toNum(d.ndp),
        list_price: toNum(d.list_price),
        misc_chgs: toNum(d.misc_chgs),
        labour_chgs: toNum(d.labour_chgs),
        spl_labour_chgs: toNum(d.spl_labour_chgs),
        dealer_invc_no: str(d.dealer_invc_no) || null,
        invc_date: toDateOrNull(d.invc_date_yyyy_mm_dd),
        posting_document_number: str(d.posting_document_number) || null,
        posting_date: str(d.posting_date_yyyy_mm_dd) || null,
        hsn_code: str(d.hsn_code) || null,
        sac_code: str(d.sac_code) || null,
        tml_reference_number: str(d.tml_reference_number) || null,
      }
      if (SPL_CODES.has(jobCode)) {
        splRows.push({ ...common, code_label: CODE_LABELS[jobCode] ?? null })
      } else {
        labourRows.push(common)
      }
    }

    const dryRun = req.method === 'GET'
      ? new URL(req.url).searchParams.get('dry_run') === 'true'
      : Boolean((await safeJson(req)).dry_run)

    if (dryRun) {
      return new Response(
        JSON.stringify({
          dryRun: true,
          totalRaw: rawRows.length,
          duplicatesSkipped,
          splRowsToWrite: splRows.length,
          labourRowsToWrite: labourRows.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 4. Full rebuild: clear both derived tables, then bulk insert the corrected data.
    // This (not incremental sync) guarantees the report always exactly matches the raw
    // upload data, including cases where upstream rows were edited or removed.
    const delSpl = await supabase.from('warranty_spl_codes_data').delete().gte('id', 0)
    if (delSpl.error) throw new Error(`Failed to clear warranty_spl_codes_data: ${delSpl.error.message}`)
    const delLabour = await supabase.from('warranty_labour_data').delete().gte('id', 0)
    if (delLabour.error) throw new Error(`Failed to clear warranty_labour_data: ${delLabour.error.message}`)

    const chunkSize = 500
    for (let i = 0; i < splRows.length; i += chunkSize) {
      const chunk = splRows.slice(i, i + chunkSize)
      const { error } = await supabase.from('warranty_spl_codes_data').insert(chunk)
      if (error) throw new Error(`Failed inserting SPL rows (chunk starting ${i}): ${error.message}`)
    }
    for (let i = 0; i < labourRows.length; i += chunkSize) {
      const chunk = labourRows.slice(i, i + chunkSize)
      const { error } = await supabase.from('warranty_labour_data').insert(chunk)
      if (error) throw new Error(`Failed inserting Labour rows (chunk starting ${i}): ${error.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalRaw: rawRows.length,
        duplicatesSkipped,
        splRowsWritten: splRows.length,
        labourRowsWritten: labourRows.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

async function safeJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return {}
  }
}
