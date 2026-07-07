import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Read-only lookup: Part Number -> latest Part Description, sourced from the Parts Order
// Sheet (service_parts_order_data) — the same data used during the order import process.
// Powers the Service Advisor page's "Description" column so advisors can see what a Part
// Number actually is without leaving the page.
//
// Runs with service role because Service Advisors are not granted the 'parts_orders'
// module (RLS blocks direct SELECT on service_parts_order_data for their role). This
// function deliberately returns ONLY part_number + part_description — nothing else from
// that table (no pricing, vendor, docket, dealer, or tracking info) — so it exposes
// strictly the minimum needed for this feature.
//
// Never writes anything. Purely additive and read-only: does not touch any existing
// table, function, RLS policy, or import process. If a part number appears in multiple
// order-sheet rows (e.g. re-ordered across imports) the most recent one wins (same
// order_date-then-updated_at tie-break already used by parts-request-order-match), so an
// updated description in a later import is automatically reflected.

function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

interface OrderRow {
  part_number: string | null
  part_description: string | null
  order_date: string | null
  updated_at: string | null
}

function isNewer(a: OrderRow, b: OrderRow): boolean {
  const ad = a.order_date ?? ''
  const bd = b.order_date ?? ''
  if (ad !== bd) return ad > bd
  return (a.updated_at ?? '') > (b.updated_at ?? '')
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
        .select('part_number, part_description, order_date, updated_at')
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
      if (!pn || !row.part_description) continue
      const existing = best.get(pn)
      if (!existing || isNewer(row, existing)) best.set(pn, row)
    }

    const descriptions: Record<string, string> = {}
    for (const [pn, row] of best) {
      descriptions[pn] = row.part_description as string
    }

    return new Response(
      JSON.stringify({ success: true, descriptions, count: Object.keys(descriptions).length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
