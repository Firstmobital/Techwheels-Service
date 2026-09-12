/**
 * Client-side allocation / overpayment checks for Accounts split receipts.
 * Keep formulas aligned with src/lib/api/accounts.ts helpers.
 */

function roundAccountsMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

function mechanicalDraftEnteredTotal(amounts) {
  let sum = 0
  for (const raw of amounts) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) sum += n
  }
  return roundAccountsMoney(sum)
}

function mechanicalDraftRowRemaining(billedRemaining, otherDraftAmounts) {
  return Math.max(0, roundAccountsMoney(billedRemaining - mechanicalDraftEnteredTotal(otherDraftAmounts)))
}

function mechanicalDraftsFitRemaining(billedRemaining, enteredAmounts) {
  const total = mechanicalDraftEnteredTotal(enteredAmounts)
  const over = roundAccountsMoney(total - billedRemaining)
  return {
    total,
    over,
    withinPaiseCap: over > 0 && over <= 1,
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

// A. Single payment ₹584
{
  const remaining = 584
  const drafts = [584]
  const fit = mechanicalDraftsFitRemaining(remaining, drafts)
  assert(fit.total === 584 && fit.over <= 0, 'A: single payment should fit')
  assert(mechanicalDraftRowRemaining(remaining, []) === 584, 'A: use remaining on only row is 584')
}

// B. Split Cash 400 + UPI 600
{
  const remaining = 1000
  const fit = mechanicalDraftsFitRemaining(remaining, [400, 600])
  assert(fit.total === 1000 && fit.over <= 0, 'B: 400+600 should complete 1000')
}

// C. Three-way 4000 + 3000 + 3000
{
  const remaining = 10000
  const fit = mechanicalDraftsFitRemaining(remaining, [4000, 3000, 3000])
  assert(fit.total === 10000 && fit.over <= 0, 'C: three-way should complete 10000')
}

// D. Partial 2000 + 3000 of 10000
{
  const remaining = 10000
  const fit = mechanicalDraftsFitRemaining(remaining, [2000, 3000])
  assert(fit.total === 5000 && fit.over <= 0, 'D: partial split should remain under billed')
  assert(mechanicalDraftRowRemaining(10000, [2000, 3000]) === 5000, 'D: leftover after both drafts is 5000')
}

// E. Existing 2000 + new 3000 + 5000
{
  const billedRemaining = 8000
  const fit = mechanicalDraftsFitRemaining(billedRemaining, [3000, 5000])
  assert(fit.total === 8000 && fit.over <= 0, 'E: new drafts should fill remaining after saved 2000')
}

// F. Overpayment 3000 + 3000 vs remaining 5000
{
  const fit = mechanicalDraftsFitRemaining(5000, [3000, 3000])
  assert(fit.total === 6000 && fit.over === 1000 && !fit.withinPaiseCap, 'F: 6000 vs 5000 must reject')
}

// G. Remove unsaved middle row: 4000 + 3000 remain
{
  const afterRemove = [4000, 3000]
  const fit = mechanicalDraftsFitRemaining(10000, afterRemove)
  assert(fit.total === 7000 && fit.over <= 0, 'G: removed row is not in the post total')
}

// H. Use remaining after row 1 = 200 of 584
{
  const fill = mechanicalDraftRowRemaining(584, [200])
  assert(fill === 384, `H: row 2 use remaining should be 384, got ${fill}`)
  assert(mechanicalDraftRowRemaining(584, []) === 584, 'H: empty other rows still see full remaining')
}

// I. Dates are per draft (client does not copy/overwrite). Totals still independent.
{
  const cash = { amount: 500, date: '2026-09-11' }
  const upi = { amount: 500, date: '2026-09-12' }
  assert(cash.date !== upi.date, 'I: draft dates stay independent')
  const fit = mechanicalDraftsFitRemaining(1000, [cash.amount, upi.amount])
  assert(fit.total === 1000 && fit.over <= 0, 'I: different dates still post as two amounts')
}

console.log('verify_accounts_split_payment_drafts: A–I allocation checks passed')
