import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  // Use the Supabase SQL API via the pg endpoint
  // This executes raw SQL using the service role
  const sqlStatements = [
    // Remove duplicates keeping only lowest id per (part_number, branch, portal)
    `DELETE FROM service_parts_stock_snapshot_data 
     WHERE id NOT IN (
       SELECT MIN(id) 
       FROM service_parts_stock_snapshot_data 
       GROUP BY part_number, branch, portal
     )`,
    // Create the unique index
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_part_branch_portal 
     ON service_parts_stock_snapshot_data (part_number, branch, portal)`,
  ]

  const results: Array<{ sql: string; status: number; ok: boolean; body: string }> = []

  for (const sql of sqlStatements) {
    try {
      const resp = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer': 'params=single-object',
        },
        body: JSON.stringify({ query: sql }),
      })
      results.push({ sql: sql.trim().slice(0, 60) + '...', status: resp.status, ok: resp.ok, body: await resp.text() })
    } catch (e) {
      results.push({ sql: sql.trim().slice(0, 60) + '...', status: 0, ok: false, body: String(e) })
    }
  }

  return Response.json({ results }, { headers: corsHeaders })
})
