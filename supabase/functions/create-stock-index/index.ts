import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// Use postgres client to run DDL directly
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js'

Deno.serve(async (_req) => {
  // Get database URL from environment (Supabase injects this for edge functions)
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) {
    // Construct from known project details
    const password = Deno.env.get('SUPABASE_DB_PASSWORD') ?? ''
    const host = 'db.jmdndcphkmaljhwgzqxq.supabase.co'
    const connStr = `postgresql://postgres:${password}@${host}:5432/postgres`
    return Response.json({ error: 'SUPABASE_DB_URL not available', hint: 'needs db password env var', dbUrl: !!dbUrl })
  }

  try {
    const sql = postgres(dbUrl, { max: 1, ssl: { rejectUnauthorized: false } })

    const results = []

    // Remove duplicates
    const dedup = await sql`
      DELETE FROM service_parts_stock_snapshot_data 
      WHERE id NOT IN (
        SELECT MIN(id) 
        FROM service_parts_stock_snapshot_data 
        GROUP BY part_number, branch, portal
      )
      RETURNING id
    `
    results.push({ step: 'dedup', deleted: dedup.count })

    // Create unique index
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_part_branch_portal 
      ON service_parts_stock_snapshot_data (part_number, branch, portal)
    `
    results.push({ step: 'create_index', ok: true })

    await sql.end()
    return Response.json({ ok: true, results })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
})
