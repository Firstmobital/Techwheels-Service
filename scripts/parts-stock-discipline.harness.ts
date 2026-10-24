/**
 * Validation harness for Parts Stock Discipline window math (no DB).
 * Run: npx tsx scripts/parts-stock-discipline.harness.ts
 */
import {
  classifyCombinedDisciplineSources,
  computeDisciplineOrderMetrics,
  normalizeDisciplinePartNo,
  resolveCommonPartUnitPrice,
  windowDaysFromFiscalMonths,
} from '../src/pages/reports/parts/partsStockDisciplineWindow.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('PASS:', msg)
}

// Jul (FM4) + Aug (FM5) + Sep (FM6) in FY 2026 → 31 + 31 + 30 = 92
const julAugSep2026 = windowDaysFromFiscalMonths(2026, [4, 5, 6])
assert(julAugSep2026 === 92, `Jul+Aug+Sep 2026 window days = 92 (got ${julAugSep2026})`)

// Audit screenshot example
const total = 3_589_222
const onHand = 197_099
const conf = 336
const metrics = computeDisciplineOrderMetrics({
  totalConsumption: total,
  windowDays: 92,
  currentStock: onHand,
  confirmationQty: conf,
})

assert(metrics.requirement30Day === 1_170_399, `30-Day Req = 1,170,399 (got ${metrics.requirement30Day})`)
assert(metrics.actualOrderQty === 972_964, `Order Qty = 972,964 (got ${metrics.actualOrderQty})`)
assert(
  Math.abs(metrics.avgDailyRaw - total / 92) < 1e-9,
  `avgDailyRaw uses full precision (${metrics.avgDailyRaw})`,
)

// Common PV+EV: combine sources then compute (not sum of separate order qtys)
const pvM1 = 1_000
const evM1 = 500
const pvStock = 100
const evStock = 50
const combined = classifyCombinedDisciplineSources(92, pvM1 + evM1, 0, 0, 0, pvStock + evStock, 0, 10)
const pvOnly = classifyCombinedDisciplineSources(92, pvM1, 0, 0, 0, pvStock, 0, 10)
const evOnly = classifyCombinedDisciplineSources(92, evM1, 0, 0, 0, evStock, 0, 10)
const sumSeparateOrders = pvOnly.actualOrderQty + evOnly.actualOrderQty
assert(
  combined.actualOrderQty ===
    computeDisciplineOrderMetrics({
      totalConsumption: pvM1 + evM1,
      windowDays: 92,
      currentStock: pvStock + evStock,
      confirmationQty: 0,
    }).actualOrderQty,
  'Common part order qty from combined sources',
)
assert(
  combined.actualOrderQty !== sumSeparateOrders || pvOnly.actualOrderQty === 0,
  'Combined order qty differs from naive sum of portal orders when both need order',
)

const price = resolveCommonPartUnitPrice(100, 100)
assert(price.unitPrice === 100 && !price.priceMismatch, 'Matching PV/EV WAC')
const mismatch = resolveCommonPartUnitPrice(100, 120)
assert(mismatch.unitPrice === 100 && mismatch.priceMismatch, 'PV WAC authority on mismatch')

const commonSet = new Set(['ABC123'])
const evRows = [{ pn: 'ABC123' }, { pn: 'EV-ONLY' }]
const evFiltered = evRows.filter((r) => !commonSet.has(normalizeDisciplinePartNo(r.pn)))
assert(evFiltered.length === 1 && evFiltered[0].pn === 'EV-ONLY', 'Common part removed from EV list')

console.log('\nAll parts-stock-discipline harness checks passed.')
