/**
 * Production data verification (requires DB password in .env.local).
 * Run: node scripts/verify-stock-discipline-production.mjs
 */
import fs from 'fs'
import pg from 'pg'

function loadEnv() {
  const env = fs.readFileSync('.env.local', 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '')
  }
}

loadEnv()

const { Client } = pg
const client = new Client({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

const BRANCH = 'Sitapura'
const WINDOW_FMS = [4, 5, 6] // Jul-Sep for Oct 2026 context
const FY = 2026
const WINDOW_DAYS = 92
const FY_START = '2026-04-01'

function normalizePn(pn) {
  return String(pn ?? '').trim().toUpperCase()
}

function computeOrder(total, stock, pipeline) {
  const avg = total / WINDOW_DAYS
  const req = total > 0 ? Math.max(1, Math.ceil(avg * 30)) : 0
  const order = Math.max(0, Math.ceil(req - stock - pipeline))
  return { avg, req, order }
}

async function portalPartMaps(portal) {
  const cons = await client.query(
    `SELECT part_number, month_name, fiscal_month, transaction_date, total_consumption
     FROM service_parts_consumption_data
     WHERE branch = $1 AND portal = $2 AND fiscal_year = $3`,
    [BRANCH, portal, FY],
  )
  const stock = await client.query(
    `SELECT part_number, on_hand_quantity, weighted_avg_cost, snapshot_date
     FROM service_parts_stock_snapshot_data
     WHERE branch = $1 AND portal = $2`,
    [BRANCH, portal],
  )
  const orders = await client.query(
    `SELECT part_number, ordered_quantity, received_quantity, confirmation_qty, order_status
     FROM service_parts_order_data
     WHERE branch = $1 AND portal = $2 AND order_date >= $3`,
    [BRANCH, portal, FY_START],
  )

  const monthTotals = new Map()
  for (const r of cons.rows) {
    const pn = normalizePn(r.part_number)
    if (!monthTotals.has(pn)) monthTotals.set(pn, { jul: 0, aug: 0, sep: 0, total: 0 })
    const e = monthTotals.get(pn)
    const c = Number(r.total_consumption || 0)
    e.total += c
    const mn = (r.month_name || '').toLowerCase()
    if (mn.includes('jul')) e.jul += c
    else if (mn.includes('aug')) e.aug += c
    else if (mn.includes('sep')) e.sep += c
  }

  const stockByPn = new Map()
  for (const r of stock.rows) {
    const pn = normalizePn(r.part_number)
    const snap = r.snapshot_date ? String(r.snapshot_date).slice(0, 10) : ''
    const qty = Number(r.on_hand_quantity || 0)
    const wac = Number(r.weighted_avg_cost || 0)
    const prev = stockByPn.get(pn)
    if (!prev || snap > prev.snap) {
      stockByPn.set(pn, { qty, wac, snap })
    } else if (snap === prev.snap) {
      prev.qty += qty
    }
  }

  const pipelineByPn = new Map()
  for (const r of orders.rows) {
    if ((r.order_status || '').trim() === 'Received') continue
    const pn = normalizePn(r.part_number)
    const conf = Number(r.confirmation_qty || 0)
    const recv = Number(r.received_quantity || 0)
    const ord = Number(r.ordered_quantity || 0)
    let pending = conf > 0 ? Math.max(0, conf - recv) : ord > 0 ? Math.max(0, ord - recv) : 0
    if (pending <= 0) continue
    pipelineByPn.set(pn, (pipelineByPn.get(pn) || 0) + pending)
  }

  const allPn = new Set([...monthTotals.keys(), ...stockByPn.keys()])
  const out = new Map()
  for (const pn of allPn) {
    const m = monthTotals.get(pn) || { jul: 0, aug: 0, sep: 0, total: 0 }
    const s = stockByPn.get(pn) || { qty: 0, wac: 0, snap: null }
    const pipe = pipelineByPn.get(pn) || 0
    const calc = computeOrder(m.total, s.qty, pipe)
    out.set(pn, { ...m, stock: s.qty, wac: s.wac, pipeline: pipe, ...calc })
  }
  return out
}

async function main() {
  await client.connect()
  const pv = await portalPartMaps('PV')
  const ev = await portalPartMaps('EV')

  const common = [...pv.keys()].filter((pn) => ev.has(pn)).slice(0, 5)
  console.log(JSON.stringify({ branch: BRANCH, windowDays: WINDOW_DAYS, commonCount: [...pv.keys()].filter((pn) => ev.has(pn)).length, sample: common }, null, 2))

  for (const pn of common.slice(0, 3)) {
    const p = pv.get(pn)
    const e = ev.get(pn)
    const combined = {
      jul: p.jul + e.jul,
      aug: p.aug + e.aug,
      sep: p.sep + e.sep,
      total: p.total + e.total,
      stock: p.stock + e.stock,
      pipeline: p.pipeline + e.pipeline,
      wacPv: p.wac,
      wacEv: e.wac,
    }
    const ind = computeOrder(combined.total, combined.stock, combined.pipeline)
    const naiveSumOrders = p.order + e.order
    console.log('\n---', pn, '---')
    console.log(JSON.stringify({ pv: p, ev: e, combined, independent: ind, naiveSumOrders }, null, 2))
  }

  const pvOnly = [...pv.keys()].filter((pn) => !ev.has(pn)).slice(0, 2)
  const evOnly = [...ev.keys()].filter((pn) => !pv.has(pn)).slice(0, 2)
  console.log('\nPV-only sample:', pvOnly)
  console.log('EV-only sample:', evOnly)

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
