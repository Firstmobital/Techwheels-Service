import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js'

Deno.serve(async (_req) => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) return Response.json({ error: 'SUPABASE_DB_URL not set' }, { status: 500 })

  try {
    const sql = postgres(dbUrl, { max: 1, ssl: { rejectUnauthorized: false } })

    await sql`
      CREATE OR REPLACE FUNCTION public.compute_parts_order_status()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      begin
        new.order_status := case
          when new.received_quantity >= new.ordered_quantity and new.ordered_quantity > 0
            then 'Received'
          when new.invoice_qty is not null and new.invoice_qty >= new.ordered_quantity and new.ordered_quantity > 0
            then 'Received'
          when new.challan_qty > 0
            then 'In-Transit'
          when new.confirmation_qty > 0
            then 'Confirmed'
          when new.order_date is not null
            then 'Ordered'
          else null
        end;
        return new;
      end;
      $$
    `

    const recompute = await sql`
      UPDATE public.service_parts_order_data SET updated_at = now() WHERE true
    `

    const dist = await sql`
      SELECT order_status, COUNT(*) as cnt
      FROM public.service_parts_order_data
      GROUP BY order_status ORDER BY cnt DESC
    `

    await sql.end()
    return Response.json({
      ok: true,
      rows_recomputed: recompute.count,
      new_distribution: dist
    })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
})
