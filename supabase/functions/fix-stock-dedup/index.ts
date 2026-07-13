import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const results: string[] = []

  try {
    // Step 1: Count before
    const { count: beforeCount } = await supabase
      .from('service_parts_stock_snapshot_data')
      .select('*', { count: 'exact', head: true })
    results.push(`Before: ${beforeCount} total rows`)

    // Step 2: Run dedup via RPC (need a custom function or use Supabase SQL endpoint)
    // Since we can't run raw SQL via supabase-js, we'll do it at application level:
    // Fetch all rows, find duplicates, delete them

    // Get all rows with id, branch, portal, part_number
    let allRows: Array<{id: number, branch: string, portal: string, part_number: string}> = []
    let from = 0
    const pageSize = 2000
    while (true) {
      const { data, error } = await supabase
        .from('service_parts_stock_snapshot_data')
        .select('id,branch,portal,part_number')
        .range(from, from + pageSize - 1)
        .order('id', { ascending: false })
      if (error) throw new Error(`Fetch error: ${error.message}`)
      allRows.push(...(data ?? []))
      if ((data?.length ?? 0) < pageSize) break
      from += pageSize
    }
    results.push(`Fetched ${allRows.length} rows`)

    // Find IDs to keep: first occurrence (highest id) per (branch, portal, part_number)
    const seen = new Map<string, number>()
    const toDelete: number[] = []
    for (const row of allRows) {
      const key = `${row.branch}|${row.portal}|${row.part_number}`
      if (seen.has(key)) {
        // This row has a lower id than the one we already saw → it's a duplicate → delete it
        toDelete.push(row.id)
      } else {
        seen.set(key, row.id)
      }
    }
    results.push(`Found ${toDelete.length} duplicate rows to delete`)

    // Delete duplicates in batches of 500
    let deletedTotal = 0
    const BATCH = 500
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const batch = toDelete.slice(i, i + BATCH)
      const { error } = await supabase
        .from('service_parts_stock_snapshot_data')
        .delete()
        .in('id', batch)
      if (error) throw new Error(`Delete error: ${error.message}`)
      deletedTotal += batch.length
    }
    results.push(`Deleted ${deletedTotal} duplicate rows`)

    // Step 3: Count after
    const { count: afterCount } = await supabase
      .from('service_parts_stock_snapshot_data')
      .select('*', { count: 'exact', head: true })
    results.push(`After: ${afterCount} total rows`)

    // Step 4: Summary by portal/branch
    const { data: summary } = await supabase
      .from('service_parts_stock_snapshot_data')
      .select('portal,branch')
      .order('portal')
    
    const breakdown = new Map<string, number>()
    for (const row of (summary ?? [])) {
      const k = `${row.portal}|${row.branch}`
      breakdown.set(k, (breakdown.get(k) ?? 0) + 1)
    }
    for (const [k, count] of breakdown.entries()) {
      results.push(`  ${k}: ${count} rows`)
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err), results }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
