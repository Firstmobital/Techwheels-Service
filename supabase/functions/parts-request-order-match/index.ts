import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Auto-matches advisor Parts Requests against:
//   1) the Parts Order Sheet (service_parts_order_data)  -> status / order date / tracking
//   2) the Stock Snapshot (service_parts_stock_snapshot_data) -> Parts Qty (on-hand stock)
// after every import of either file, so the advisor sees live info without the Parts SPM
// typing it in manually.
//
// Matching rule (per spec): primary key = Parts Number. Fallback = Parts Description,
// only applied when it resolves to exactly one distinct part number (avoids false
// positives) — service_parts_order_data / service_parts_stock_snapshot_data have no
// per-vehicle/registration linkage, so a text fallback is the only option there.
//
// Status/order-date/tracking updates never touch a request SPM already marked 'Cancelled'
// or 'Delivered to Workshop' (terminal, human-controlled states) and are idempotent
// (checked via matched_order_row_id) so the advisor's notification badge only flips when
// something genuinely changed.
//
// Order Date guard rails (added 2026-07-07, Advisor Panel restriction): an imported Order
// Date is only ever applied — along with the status/tracking that ride alongside it — when
// BOTH hold true:
//   (a) it is the same as or later than the Order Date already stored on the request
//       (never regress a date backwards because a differently-dated order-sheet row now
//       resolves as the "best" match for that part number), and
//   (b) it is the same as or later than the advisor's own Entry Date (the "Requirement
//       Date" — the date the advisor raised the requirement), so an order can never appear
//       to have happened before the requirement even existed.
// If either check fails the entire status/order-date/tracking update for that request is
// skipped for this run (exactly as if no match had been found) — the existing Order Date,
// status and tracking are left untouched. Parts Qty refresh is completely independent of
// this and is never affected by it.
//
// Parts Qty is refreshed for ALL requests (including terminal ones, for accurate
// historical reference) every run, but only written when the value actually changed, and
// never flips the advisor "unseen" notification badge on its own — that's reserved for
// status changes so the advisor isn't alerted just because a stock count moved.

const TERMINAL_STATUSES = new Set(['Cancelled', 'Delivered to Workshop'])

interface OrderRow {
  id: number
  part_number: string | null
  part_description: string | null
  order_date: string | null
  expected_date: string | null
  ordered_quantity: number | null
  received_quantity: number | null
  backorder_quantity: number | null
  intransit_qty: number | null
  status: string | null
  order_status: string | null
  eta_1: string | null
  eta_2: string | null
  eta_3: string | null
  docket_number: string | null
  updated_at: string | null
}

interface StockRow {
  part_number: string | null
  part_description: string | null
  on_hand_quantity: number | null
}

interface RequestRow {
  id: number
  parts_number: string | null
  parts_required: string | null
  parts_description: string | null
  parts_status: string
  parts_qty: number | null
  parts_order_date: string | null
  matched_order_row_id: number | null
  auto_match_note: string | null
  entry_date: string | null
}

function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

function normDesc(v: string | null | undefined): string {
  return (v ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
}

function num(v: number | null | undefined): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0
}

// Compares two 'YYYY-MM-DD' date strings lexicographically (safe for ISO dates, matches
// the comparison style already used elsewhere in this file, e.g. isNewer()).
function dateStr(v: string | null | undefined): string {
  return (v ?? '').trim().slice(0, 10)
}

// Order Date guard: reject an incoming order date if it would regress before the
// currently-stored order date, or fall before the advisor's own requirement (entry) date.
// Only compares when both sides of a given check are present — never blocks on missing data.
function isOrderDateAllowed(newDate: string | null, existingOrderDate: string | null, requirementDate: string | null): boolean {
  const nd = dateStr(newDate)
  if (!nd) return true // nothing to validate against if the new date itself is blank

  const existing = dateStr(existingOrderDate)
  if (existing && nd < existing) return false // never move the order date backwards

  const requirement = dateStr(requirementDate)
  if (requirement && nd < requirement) return false // order can never predate the requirement

  return true
}

function mapStatus(row: OrderRow): string {
  const raw = `${row.status ?? ''} ${row.order_status ?? ''}`.toLowerCase()
  const ordered = num(row.ordered_quantity)
  const received = num(row.received_quantity)
  const backorder = num(row.backorder_quantity)
  const intransit = num(row.intransit_qty)

  if (raw.includes('cancel')) return 'Cancelled'
  if (backorder > 0 || raw.includes('back order') || raw.includes('backorder')) return 'Back Order'
  if (ordered > 0 && received >= ordered) return 'Received'
  if (received > 0 && received < ordered) return 'Partially Received'
  if (intransit > 0 || raw.includes('transit')) return 'In Transit'
  if (raw.includes('confirm') || raw.includes('order') || row.order_date) return 'Ordered'
  return 'Pending'
}

function buildNote(row: OrderRow, status: string): string {
  const parts: string[] = [`Auto-matched from Parts Order Sheet — Status: ${status}`]
  const eta = row.eta_1 || row.eta_2 || row.eta_3
  if (eta) parts.push(`ETA ${eta}`)
  if (row.docket_number) parts.push(`Docket ${row.docket_number}`)
  if (num(row.intransit_qty) > 0) parts.push(`In-Transit Qty ${row.intransit_qty}`)
  if (num(row.backorder_quantity) > 0) parts.push(`Back-Order Qty ${row.backorder_quantity}`)
  if (num(row.received_quantity) > 0) parts.push(`Received Qty ${row.received_quantity}/${num(row.ordered_quantity)}`)
  return parts.join(' · ')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase service role credentials')
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // 1. Load ALL parts requests (qty refresh applies to every row; status/order-date
    // matching below additionally filters out terminal-status rows)
    const { data: requestRows, error: reqErr } = await supabase
      .from('parts_requests')
      .select('id, parts_number, parts_required, parts_description, parts_status, parts_qty, parts_order_date, matched_order_row_id, auto_match_note, entry_date')

    if (reqErr) throw new Error(`Failed to load parts_requests: ${reqErr.message}`)
    const requests = (requestRows ?? []) as RequestRow[]

    if (requests.length === 0) {
      return new Response(JSON.stringify({ success: true, statusMatched: 0, qtyUpdated: 0, checked: 0, orderDateRejected: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Load the parts order sheet dataset (paginated)
    const orderRows: OrderRow[] = []
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('service_parts_order_data')
        .select('id, part_number, part_description, order_date, expected_date, ordered_quantity, received_quantity, backorder_quantity, intransit_qty, status, order_status, eta_1, eta_2, eta_3, docket_number, updated_at')
        .range(from, from + pageSize - 1)
      if (error) throw new Error(`Failed to load service_parts_order_data: ${error.message}`)
      const chunk = (data ?? []) as OrderRow[]
      orderRows.push(...chunk)
      if (chunk.length < pageSize) break
    }

    // 3. Load the current stock snapshot dataset (paginated) — used for Parts Qty
    const stockRows: StockRow[] = []
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('service_parts_stock_snapshot_data')
        .select('part_number, part_description, on_hand_quantity')
        .range(from, from + pageSize - 1)
      if (error) throw new Error(`Failed to load service_parts_stock_snapshot_data: ${error.message}`)
      const chunk = (data ?? []) as StockRow[]
      stockRows.push(...chunk)
      if (chunk.length < pageSize) break
    }

    // 4. Build best-match-per-part-number index for the order sheet (most recent
    // order_date, then updated_at)
    const byPartNumber = new Map<string, OrderRow>()
    const byDescription = new Map<string, Set<string>>() // normalized description -> set of part numbers
    const byDescriptionRow = new Map<string, OrderRow>() // normalized description -> best row (for single-match case)

    for (const row of orderRows) {
      const pn = norm(row.part_number)
      if (pn) {
        const existing = byPartNumber.get(pn)
        if (!existing || isNewer(row, existing)) byPartNumber.set(pn, row)
      }

      const desc = normDesc(row.part_description)
      if (desc) {
        if (!byDescription.has(desc)) byDescription.set(desc, new Set())
        if (pn) byDescription.get(desc)!.add(pn)
        const existingDescRow = byDescriptionRow.get(desc)
        if (!existingDescRow || isNewer(row, existingDescRow)) byDescriptionRow.set(desc, row)
      }
    }

    function isNewer(a: OrderRow, b: OrderRow): boolean {
      const ad = a.order_date ?? ''
      const bd = b.order_date ?? ''
      if (ad !== bd) return ad > bd
      return (a.updated_at ?? '') > (b.updated_at ?? '')
    }

    // 5. Build stock qty index: sum on-hand qty per part number, and per description
    // (tracking how many distinct part numbers share that description, for unambiguous
    // fallback matching)
    const stockQtyByPartNumber = new Map<string, number>()
    const stockPartNumbersByDescription = new Map<string, Set<string>>()

    for (const row of stockRows) {
      const pn = norm(row.part_number)
      const qty = num(row.on_hand_quantity)
      if (pn) {
        stockQtyByPartNumber.set(pn, (stockQtyByPartNumber.get(pn) ?? 0) + qty)
      }
      const desc = normDesc(row.part_description)
      if (desc && pn) {
        if (!stockPartNumbersByDescription.has(desc)) stockPartNumbersByDescription.set(desc, new Set())
        stockPartNumbersByDescription.get(desc)!.add(pn)
      }
    }

    function lookupStockQty(reqRow: RequestRow): number | null {
      const pn = norm(reqRow.parts_number)
      if (pn) {
        return stockQtyByPartNumber.has(pn) ? stockQtyByPartNumber.get(pn)! : null
      }
      // Fallback: unambiguous description match against parts_description, else parts_required
      for (const candidate of [reqRow.parts_description, reqRow.parts_required]) {
        const desc = normDesc(candidate)
        if (!desc) continue
        const matchSet = stockPartNumbersByDescription.get(desc)
        if (matchSet && matchSet.size === 1) {
          const matchedPn = [...matchSet][0]
          return stockQtyByPartNumber.get(matchedPn) ?? null
        }
      }
      return null
    }

    // 6. Compute updates per request row
    let statusMatched = 0
    let qtyUpdated = 0
    let orderDateRejected = 0
    const nowIso = new Date().toISOString()

    for (const reqRow of requests) {
      const updatePayload: Record<string, unknown> = {}

      // -- Parts Qty refresh (all rows) — entirely independent of the Order Date guard --
      const newQty = lookupStockQty(reqRow)
      const currentQty = reqRow.parts_qty
      const qtyChanged = (newQty ?? null) !== (currentQty ?? null) &&
        !(newQty == null && currentQty == null)
      if (qtyChanged) {
        updatePayload.parts_qty = newQty
      }

      // -- Status / order-date / tracking match (non-terminal rows only) --
      if (!TERMINAL_STATUSES.has(reqRow.parts_status)) {
        let matchRow: OrderRow | undefined
        let matchedPartNumber: string | null = null

        const pn = norm(reqRow.parts_number)
        if (pn && byPartNumber.has(pn)) {
          matchRow = byPartNumber.get(pn)
          matchedPartNumber = reqRow.parts_number
        } else if (!pn) {
          const desc = normDesc(reqRow.parts_description)
          if (desc && byDescription.has(desc) && byDescription.get(desc)!.size === 1) {
            matchRow = byDescriptionRow.get(desc)
            matchedPartNumber = matchRow?.part_number ?? null
          }
        }

        if (matchRow && reqRow.matched_order_row_id !== matchRow.id) {
          const candidateOrderDate = matchRow.order_date ?? matchRow.expected_date ?? null

          if (isOrderDateAllowed(candidateOrderDate, reqRow.parts_order_date, reqRow.entry_date)) {
            const status = mapStatus(matchRow)
            const note = buildNote(matchRow, status)
            updatePayload.parts_status = status
            updatePayload.parts_order_date = candidateOrderDate
            updatePayload.auto_match_note = note
            updatePayload.last_matched_at = nowIso
            updatePayload.matched_order_row_id = matchRow.id
            updatePayload.advisor_seen = false
            updatePayload.status_updated_at = nowIso
            if (!reqRow.parts_number && matchedPartNumber) {
              updatePayload.parts_number = matchedPartNumber
            }
            statusMatched += 1
          } else {
            // Imported Order Date would regress before the existing Order Date, or falls
            // before the advisor's Requirement (Entry) Date — ignore this record entirely,
            // keep the existing Order Date / status / tracking untouched this run.
            orderDateRejected += 1
          }
        }
      }

      if (Object.keys(updatePayload).length === 0) continue

      if ('parts_qty' in updatePayload) qtyUpdated += 1

      const { error: updErr } = await supabase
        .from('parts_requests')
        .update(updatePayload)
        .eq('id', reqRow.id)

      if (updErr) {
        console.warn(`Failed to update parts_requests id=${reqRow.id}: ${updErr.message}`)
      }
    }

    return new Response(
      JSON.stringify({ success: true, checked: requests.length, statusMatched, qtyUpdated, orderDateRejected }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
