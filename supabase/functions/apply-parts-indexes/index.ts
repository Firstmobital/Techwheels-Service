// One-time migration: creates unique indexes on parts tables to enable idempotent upserts
// Requires x-migration-secret: tw-parts-index-2026 header
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js'

Deno.serve(async (req) => {
  if (req.headers.get('x-migration-secret') !== 'tw-parts-index-2026') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: 'SUPABASE_DB_URL not set' }), { status: 500 })
  }

  const sql = postgres(dbUrl, { ssl: 'require', max: 1 })
  const results: Record<string, string> = {}

  const indexes = [
    {
      name: 'uq_consumption_part_branch_portal_fy_month_hash',
      ddl: `CREATE UNIQUE INDEX IF NOT EXISTS uq_consumption_part_branch_portal_fy_month_hash
            ON service_parts_consumption_data
            (part_number, branch, portal, fiscal_year, fiscal_month, source_row_hash)`
    },
    {
      name: 'uq_stock_part_branch_portal_snap_hash',
      ddl: `CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_part_branch_portal_snap_hash
            ON service_parts_stock_snapshot_data
            (part_number, branch, portal, snapshot_date, source_row_hash)`
    },
    {
      name: 'uq_order_part_branch_portal_hash',
      ddl: `CREATE UNIQUE INDEX IF NOT EXISTS uq_order_part_branch_portal_hash
            ON service_parts_order_data
            (part_number, branch, portal, source_row_hash)`
    },
  ]

  for (const idx of indexes) {
    try {
      await sql.unsafe(idx.ddl)
      results[idx.name] = 'OK'
    } catch (e: unknown) {
      results[idx.name] = `ERROR: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  await sql.end()

  return new Response(JSON.stringify({ status: 'done', results }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  })
})
