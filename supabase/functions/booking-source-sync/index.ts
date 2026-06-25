import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type SourceBookingRow = {
  id: string
  chassis_no: string | null
  rto_date: string | null
  engine_no: string | null
  customer_phone: string | null
  customer_name: string | null
  insurance_company_name: string | null
  insurance_date: string | null
  quote_snapshot: unknown
  updated_at: string | null
  created_at: string | null
}

type SyncStateRow = {
  sync_name: string
  last_source_cursor_id: string | null
  last_source_updated_at: string | null
  updated_at: string
  metadata: Record<string, unknown>
}

const SYNC_NAME = 'booking_to_all_service_data'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    })
  }

  try {
    const sourceUrl = Deno.env.get('SOURCE_SUPABASE_URL') ?? ''
    const sourceServiceKey = Deno.env.get('SOURCE_SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const targetUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const targetServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!sourceUrl || !sourceServiceKey || !targetUrl || !targetServiceKey) {
      return new Response(
        JSON.stringify({
          error:
            'Missing env vars. Required: SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
        }),
        { status: 500, headers: corsHeaders },
      )
    }

    const body = await safeJson(req)
    const batchSize = clampNumber(body.batch_size, 1, 500, 200)
    const dryRun = Boolean(body.dry_run)
    const fullResync = Boolean(body.full_resync)
    const testSourceId = asNonEmptyString(body.test_source_id)
    const testChassisNo = asNonEmptyString(body.test_chassis_no)
    const testMode = Boolean(testSourceId || testChassisNo)
    const persistState = body.persist_state === undefined ? !testMode : Boolean(body.persist_state)

    const source = createClient(sourceUrl, sourceServiceKey)
    const target = createClient(targetUrl, targetServiceKey)

    const state = await getSyncState(target)
    const lastSourceUpdatedAt = fullResync ? null : state?.last_source_updated_at ?? null
    const lastSourceCursorId = fullResync ? null : state?.last_source_cursor_id ?? null

    const rows = await fetchSourceRows(
      source,
      lastSourceUpdatedAt,
      lastSourceCursorId,
      batchSize,
      testSourceId,
      testChassisNo,
    )

    let processed = 0
    let inserted = 0
    let skippedExistingChassis = 0
    let skippedNoChassis = 0
    let skippedMissingCoreFields = 0
    let errors = 0

    let maxProcessedUpdatedAt: string | null = lastSourceUpdatedAt
    let maxProcessedCursorId: string | null = lastSourceCursorId

    for (const row of rows) {
      processed += 1

      const rowWatermarkTs = row.updated_at ?? row.created_at
      if (rowWatermarkTs) {
        if (!maxProcessedUpdatedAt || rowWatermarkTs > maxProcessedUpdatedAt) {
          maxProcessedUpdatedAt = rowWatermarkTs
          maxProcessedCursorId = row.id
        } else if (rowWatermarkTs === maxProcessedUpdatedAt) {
          if (!maxProcessedCursorId || row.id > maxProcessedCursorId) {
            maxProcessedCursorId = row.id
          }
        }
      }

      if (dryRun) {
        continue
      }

      const rtoDate = normalizeDateOrNull(row.rto_date)
      const insuranceExpiryDate = addOneYearDateOrNull(row.insurance_date)
      const quoteDerived = deriveQuoteFields(row.quote_snapshot)

      const { data, error } = await target.rpc('upsert_all_service_data_from_booking_source', {
        p_chassis_no: row.chassis_no,
        p_vehicle_sale_date: rtoDate,
        p_engine_no: row.engine_no,
        p_contact_phones: row.customer_phone,
        p_first_name: row.customer_name,
        p_last_insurance_comapny: row.insurance_company_name,
        p_last_insurance_expiry_date: insuranceExpiryDate,
        p_model: quoteDerived.model,
        p_product_line: quoteDerived.productLine,
        p_source_updated_at: row.updated_at ?? row.created_at,
        p_source_row_id: row.id,
      })

      if (error) {
        errors += 1
        continue
      }

      const action = Array.isArray(data) && data.length > 0 ? String(data[0].action ?? '') : ''
      if (action === 'inserted') inserted += 1
      else if (action === 'skipped_existing_chassis') skippedExistingChassis += 1
      else if (action === 'skipped_no_chassis') skippedNoChassis += 1
      else if (action === 'skipped_missing_core_fields') skippedMissingCoreFields += 1
    }

    if (!dryRun && persistState && rows.length > 0) {
      const statePayload = {
        sync_name: SYNC_NAME,
        last_source_cursor_id: maxProcessedCursorId,
        last_source_updated_at: maxProcessedUpdatedAt,
        updated_at: new Date().toISOString(),
        metadata: {
          batch_size: batchSize,
          processed,
          inserted,
          skipped_existing_chassis: skippedExistingChassis,
          skipped_no_chassis: skippedNoChassis,
          skipped_missing_core_fields: skippedMissingCoreFields,
          errors,
          last_run_at: new Date().toISOString(),
        },
      }

      const { error: stateErr } = await target.from('integration_sync_state').upsert(statePayload, {
        onConflict: 'sync_name',
      })

      if (stateErr) {
        return new Response(
          JSON.stringify({
            error: 'Sync completed but failed to persist watermark state',
            details: stateErr.message,
            processed,
            inserted,
            skipped_existing_chassis: skippedExistingChassis,
            skipped_no_chassis: skippedNoChassis,
            skipped_missing_core_fields: skippedMissingCoreFields,
            errors,
          }),
          { status: 500, headers: corsHeaders },
        )
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sync_name: SYNC_NAME,
        mode: dryRun ? 'dry_run' : fullResync ? 'full_resync' : 'incremental',
        test_mode: testMode,
        test_source_id: testSourceId,
        test_chassis_no: testChassisNo,
        persist_state: persistState,
        starting_last_source_updated_at: lastSourceUpdatedAt,
        ending_last_source_updated_at: rows.length > 0 ? maxProcessedUpdatedAt : lastSourceUpdatedAt,
        ending_last_source_cursor_id: rows.length > 0 ? maxProcessedCursorId : lastSourceCursorId,
        fetched_rows: rows.length,
        processed,
        inserted,
        skipped_existing_chassis: skippedExistingChassis,
        skipped_no_chassis: skippedNoChassis,
        skipped_missing_core_fields: skippedMissingCoreFields,
        errors,
      }),
      { status: 200, headers: corsHeaders },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: corsHeaders },
    )
  }
})

async function getSyncState(target: ReturnType<typeof createClient>): Promise<SyncStateRow | null> {
  const { data, error } = await target
    .from('integration_sync_state')
    .select('sync_name, last_source_cursor_id, last_source_updated_at, updated_at, metadata')
    .eq('sync_name', SYNC_NAME)
    .limit(1)

  if (error || !data || data.length === 0) {
    return null
  }

  return data[0] as SyncStateRow
}

async function fetchSourceRows(
  source: ReturnType<typeof createClient>,
  lastSourceUpdatedAt: string | null,
  lastSourceCursorId: string | null,
  batchSize: number,
  testSourceId: string | null,
  testChassisNo: string | null,
): Promise<SourceBookingRow[]> {
  if (testSourceId || testChassisNo) {
    let testQuery = source
      .from('booking')
      .select(
        'id, chassis_no, rto_date, engine_no, customer_phone, customer_name, insurance_company_name, insurance_date, quote_snapshot, updated_at, created_at',
      )
      .limit(1)

    if (testSourceId) {
      testQuery = testQuery.eq('id', testSourceId)
    }

    if (testChassisNo) {
      testQuery = testQuery.eq('chassis_no', testChassisNo)
    }

    const { data: testRows, error: testErr } = await testQuery

    if (testErr) {
      throw new Error(`Source booking test fetch failed: ${testErr.message}`)
    }

    return (testRows ?? []) as SourceBookingRow[]
  }

  let query = source
    .from('booking')
    .select(
      'id, chassis_no, rto_date, engine_no, customer_phone, customer_name, insurance_company_name, insurance_date, quote_snapshot, updated_at, created_at',
    )
    .not('chassis_no', 'is', null)
    .order('updated_at', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
    .limit(lastSourceUpdatedAt ? batchSize * 3 : batchSize)

  if (lastSourceUpdatedAt) {
    query = query.gte('updated_at', lastSourceUpdatedAt)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Source booking fetch failed: ${error.message}`)
  }

  const rows = (data ?? []) as SourceBookingRow[]

  const filtered = rows.filter((row) => {
    const rowTs = row.updated_at ?? row.created_at
    if (!lastSourceUpdatedAt || !rowTs) return true

    if (rowTs > lastSourceUpdatedAt) return true
    if (rowTs < lastSourceUpdatedAt) return false

    if (!lastSourceCursorId) return true
    return row.id > lastSourceCursorId
  })

  return filtered.slice(0, batchSize)
}

function addOneYearDateOrNull(value: string | null | undefined): string | null {
  const base = normalizeDateOrNull(value)
  if (!base) return null

  const parsed = new Date(`${base}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return null

  parsed.setUTCFullYear(parsed.getUTCFullYear() + 1)
  const y = parsed.getUTCFullYear()
  const m = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  const d = String(parsed.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function deriveQuoteFields(quoteSnapshot: unknown): {
  model: string | null
  productLine: string | null
} {
  const parsed = parseQuoteSnapshot(quoteSnapshot)
  const model = cleanText(readPathAsString(parsed, ['car', 'name']))
  const productLine = cleanText(readPathAsString(parsed, ['variant', 'name']))

  return {
    model,
    productLine,
  }
}

function parseQuoteSnapshot(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'object') return value as Record<string, unknown>

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>
      }
    } catch {
      return null
    }
  }

  return null
}

function readPathAsString(root: Record<string, unknown> | null, path: string[]): string | null {
  let current: unknown = root
  for (const key of path) {
    if (!current || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[key]
  }

  return typeof current === 'string' ? current : null
}

function cleanText(value: string | null): string | null {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

function asNonEmptyString(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

function normalizeDateOrNull(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const dateOnly = raw.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return dateOnly

  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (dmy) {
    const day = Number(dmy[1])
    const month = Number(dmy[2])
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
      const mm = String(month).padStart(2, '0')
      const dd = String(day).padStart(2, '0')
      return `${year}-${mm}-${dd}`
    }
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null

  const y = parsed.getUTCFullYear()
  const m = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  const d = String(parsed.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function safeJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = await req.json()
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}
