import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Read-only lookup: Part Number -> latest Part Description + Order No. + Order Status
// sourced from service_parts_order_data.
//
// ORDER STATUS PRIORITY (latest fulfilled stage wins):
//   Docket No filled    → "Dispatched – Docket No: XYZ"
//   Invoice Date filled → "Invoiced – DD/MM/YYYY"
//   Challan Date filled → "Challan Generated – DD/MM/YYYY"
//   Conf. Date filled   → "Confirmed – DD/MM/YYYY"
//   (nothing)           → "Order Pending"
//
// Runs with service role — advisors are not granted direct access to service_parts_order_data.
// Returns ONLY part_number + description + order numbers + order status fields.

function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return ''
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return v
  return `${m[3]}/${m[2]}/${m[1]}`
}

interface OrderRow {
  part_number: string | null
  part_description: string | null
  order_date: string | null
  updated_at: string | null
  sap_order_number: string | null
  crm_order_number: string | null
  confirmation_date: string | null
  challan_date: string | null
  invoice_date: string | null
  docket_number: string | null
}

function isNewer(a: OrderRow, b: OrderRow): boolean {
  const ad = a.order_date ?? ''
  const bd = b.order_date ?? ''
  if (ad !== bd) return ad > bd
  return (a.updated_at ?? '') > (b.updated_at ?? '')
}

function computeOrderStatus(row: OrderRow): string {
  if (row.docket_number && row.docket_number.trim()) {
    return `Dispatched – Docket No: ${row.docket_number.trim()}`
  }
  if (row.invoice_date && row.invoice_date.trim()) {
    return `Invoiced – ${fmtDate(row.invoice_date)}`
  }
  if (row.challan_date && row.challan_date.trim()) {
    return `Challan Generated – ${fmtDate(row.challan_date)}`
  }
  if (row.confirmation_date && row.confirmation_date.trim()) {
    return `Confirmed – ${fmtDate(row.confirmation_date)}`
  }
  return 'Order Pending'
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

    const rows: OrderRow[] = []
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('service_parts_order_data')
        .select('part_number, part_description, order_date, updated_at, sap_order_number, crm_order_number, confirmation_date, challan_date, invoice_date, docket_number')
        .not('part_number', 'is', null)
        .range(from, from + pageSize - 1)
      if (error) throw new Error(`Failed to load service_parts_order_data: ${error.message}`)
      const chunk = (data ?? []) as OrderRow[]
      rows.push(...chunk)
      if (chunk.length < pageSize) break
    }

    const best = new Map<string, OrderRow>()
    for (const row of rows) {
      const pn = norm(row.part_number)
      if (!pn) continue
      const existing = best.get(pn)
      if (!existing || isNewer(row, existing)) best.set(pn, row)
    }

    const descriptions: Record<string, string> = {}
    const orderNumbers: Record<string, string> = {}
    const orderStatuses: Record<string, string> = {}
    for (const [pn, row] of best) {
      if (row.part_description) descriptions[pn] = row.part_description as string
      const orderNo = row.sap_order_number || row.crm_order_number
      if (orderNo) orderNumbers[pn] = orderNo
      orderStatuses[pn] = computeOrderStatus(row)
    }

    return new Response(
      JSON.stringify({
        success: true,
        descriptions,
        orderNumbers,
        orderStatuses,
        count: Object.keys(descriptions).length,
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
