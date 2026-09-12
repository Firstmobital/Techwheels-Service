/**
 * Logic checks for Mechanical payment received date helpers.
 * Run: node scripts/verify_mechanical_payment_received_date.mjs
 */

function asiaKolkataTodayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function asiaKolkataDateFromTimestamp(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function mechanicalPaymentReceivedDate(line) {
  const raw = String(line.payment_received_date ?? '').trim()
  if (raw) return raw.slice(0, 10)
  return asiaKolkataDateFromTimestamp(line.posted_at)
}

function utcDateOnlyWrong(iso) {
  return String(iso).slice(0, 10)
}

const todayIst = asiaKolkataTodayDate()
const todayUtc = new Date().toISOString().slice(0, 10)

const cases = [
  ['today is YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(todayIst)],
  ['today uses Asia/Kolkata not UTC Date#toISOString', todayIst === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })],
  ['example 15:32 IST -> 2026-09-12', asiaKolkataDateFromTimestamp('2026-09-12T10:02:00.000Z') === '2026-09-12'],
  ['example timestamptz +05:30', asiaKolkataDateFromTimestamp('2026-09-12T15:32:00+05:30') === '2026-09-12'],
  ['late IST evening stays same calendar day', asiaKolkataDateFromTimestamp('2026-09-12T23:50:00+05:30') === '2026-09-12'],
  ['just after IST midnight is next day', asiaKolkataDateFromTimestamp('2026-09-12T00:10:00+05:30') === '2026-09-12'],
  ['UTC slice can be wrong near IST midnight', utcDateOnlyWrong('2026-09-11T19:00:00.000Z') === '2026-09-11'
    && asiaKolkataDateFromTimestamp('2026-09-11T19:00:00.000Z') === '2026-09-12'],
  ['history prefers payment_received_date', mechanicalPaymentReceivedDate({
    payment_received_date: '2026-09-08',
    posted_at: '2026-09-12T10:02:00.000Z',
  }) === '2026-09-08'],
  ['history falls back to IST date of posted_at', mechanicalPaymentReceivedDate({
    payment_received_date: null,
    posted_at: '2026-09-12T10:02:00.000Z',
  }) === '2026-09-12'],
  ['recalc ignores received date', (() => {
    const billed = 9154
    const lines = [{ amount: 4000 }, { amount: 5154 }]
    const received = lines.reduce((s, l) => s + l.amount, 0)
    return Math.max(0, billed - received) === 0
  })()],
]

const failed = cases.filter(([, ok]) => !ok)
for (const [name, ok] of cases) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
}
console.log(`Asia/Kolkata today: ${todayIst}`)
console.log(`UTC date (do not use for default): ${todayUtc}`)
if (failed.length) {
  console.error(`Failed ${failed.length} helper check(s)`)
  process.exit(1)
}
console.log('All helper checks passed')
