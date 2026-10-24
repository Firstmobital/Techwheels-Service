/**
 * Validation harness for Parts Stock Discipline window math (no DB).
 * Run: npx tsx scripts/parts-stock-discipline.harness.ts
 */
import {
  computeDisciplineOrderMetrics,
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

console.log('\nAll parts-stock-discipline harness checks passed.')
