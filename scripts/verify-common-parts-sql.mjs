import fs from 'fs'
import pg from 'pg'

const env = fs.readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '')
}

const WD = 92
const client = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: 5432,
  database: 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

function metrics(total, stock, pipe) {
  const req = total > 0 ? Math.max(1, Math.ceil((total / WD) * 30)) : 0
  const ord = Math.max(0, Math.ceil(req - stock - pipe))
  return { total, req, ord, avg: total / WD }
}

async function branchReport(branch) {
  const { rows } = await client.query(
    `
    WITH cons AS (
      SELECT upper(trim(part_number)) pn, portal,
        sum(CASE WHEN lower(month_name) LIKE 'jul%' THEN total_consumption ELSE 0 END) AS jul,
        sum(CASE WHEN lower(month_name) LIKE 'aug%' THEN total_consumption ELSE 0 END) AS aug,
        sum(CASE WHEN lower(month_name) LIKE 'sep%' THEN total_consumption ELSE 0 END) AS sep
      FROM service_parts_consumption_data
      WHERE branch = $1 AND fiscal_year = 2026 AND portal IN ('PV','EV')
      GROUP BY 1, 2
    ),
    st AS (
      SELECT upper(trim(part_number)) pn, portal,
        sum(on_hand_quantity::numeric) AS qty,
        max(weighted_avg_cost) FILTER (WHERE weighted_avg_cost > 0) AS wac
      FROM service_parts_stock_snapshot_data
      WHERE branch = $1
      GROUP BY 1, 2
    ),
    pip AS (
      SELECT upper(trim(part_number)) pn, portal,
        sum(
          CASE
            WHEN coalesce(order_status, '') = 'Received' THEN 0
            WHEN coalesce(confirmation_qty, 0) > 0 THEN greatest(0, confirmation_qty - received_quantity)
            WHEN coalesce(ordered_quantity, 0) > 0 THEN greatest(0, ordered_quantity - received_quantity)
            ELSE 0
          END
        ) AS pipeline
      FROM service_parts_order_data
      WHERE branch = $1 AND order_date >= '2026-04-01'
      GROUP BY 1, 2
    ),
    piv AS (
      SELECT c.pn,
        max(CASE WHEN c.portal = 'PV' THEN c.jul END)::float AS pv_jul,
        max(CASE WHEN c.portal = 'PV' THEN c.aug END)::float AS pv_aug,
        max(CASE WHEN c.portal = 'PV' THEN c.sep END)::float AS pv_sep,
        max(CASE WHEN c.portal = 'EV' THEN c.jul END)::float AS ev_jul,
        max(CASE WHEN c.portal = 'EV' THEN c.aug END)::float AS ev_aug,
        max(CASE WHEN c.portal = 'EV' THEN c.sep END)::float AS ev_sep,
        coalesce(max(CASE WHEN c.portal = 'PV' THEN st.qty END), 0)::float AS pv_stock,
        coalesce(max(CASE WHEN c.portal = 'EV' THEN st.qty END), 0)::float AS ev_stock,
        coalesce(max(CASE WHEN c.portal = 'PV' THEN pip.pipeline END), 0)::float AS pv_pipe,
        coalesce(max(CASE WHEN c.portal = 'EV' THEN pip.pipeline END), 0)::float AS ev_pipe,
        max(CASE WHEN c.portal = 'PV' THEN st.wac END)::float AS pv_wac,
        max(CASE WHEN c.portal = 'EV' THEN st.wac END)::float AS ev_wac
      FROM cons c
      LEFT JOIN st ON st.pn = c.pn AND st.portal = c.portal
      LEFT JOIN pip ON pip.pn = c.pn AND pip.portal = c.portal
      GROUP BY c.pn
      HAVING count(DISTINCT c.portal) = 2
    )
    SELECT * FROM piv
    ORDER BY (coalesce(pv_jul,0)+coalesce(pv_aug,0)+coalesce(pv_sep,0)+coalesce(ev_jul,0)+coalesce(ev_aug,0)+coalesce(ev_sep,0)) DESC
    LIMIT 5
    `,
    [branch],
  )

  const out = []
  for (const r of rows) {
    const pvT = r.pv_jul + r.pv_aug + r.pv_sep
    const evT = r.ev_jul + r.ev_aug + r.ev_sep
    const combT = pvT + evT
    const combS = r.pv_stock + r.ev_stock
    const combP = r.pv_pipe + r.ev_pipe
    out.push({
      partNumber: r.pn,
      branch,
      pv: { jul: r.pv_jul, aug: r.pv_aug, sep: r.pv_sep, total: pvT, stock: r.pv_stock, pipeline: r.pv_pipe, ...metrics(pvT, r.pv_stock, r.pv_pipe), wac: r.pv_wac },
      ev: { jul: r.ev_jul, aug: r.ev_aug, sep: r.ev_sep, total: evT, stock: r.ev_stock, pipeline: r.ev_pipe, ...metrics(evT, r.ev_stock, r.ev_pipe), wac: r.ev_wac },
      consolidated: { ...metrics(combT, combS, combP), stock: combS, pipeline: combP, jul: r.pv_jul + r.ev_jul, aug: r.pv_aug + r.ev_aug, sep: r.pv_sep + r.ev_sep },
      naiveOrderSum: metrics(pvT, r.pv_stock, r.pv_pipe).ord + metrics(evT, r.ev_stock, r.ev_pipe).ord,
      wacMismatch: r.pv_wac > 0 && r.ev_wac > 0 && Math.abs(r.pv_wac - r.ev_wac) > 0.005,
      consolidatedWacRule: r.pv_wac > 0 ? r.pv_wac : r.ev_wac,
    })
  }
  return out
}

await client.connect()
const sitapura = await branchReport('Sitapura')
const ajmer = await branchReport('Ajmer Road')
console.log(JSON.stringify({ windowDays: WD, sitapuraTop: sitapura, ajmerTop: ajmer.slice(0, 2) }, null, 2))
await client.end()
