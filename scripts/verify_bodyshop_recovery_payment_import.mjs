#!/usr/bin/env node
/**
 * Checks for Bodyshop Recovery payment import preview/idempotency helpers.
 * Run: node scripts/verify_bodyshop_recovery_payment_import.mjs
 */
import * as XLSX from 'xlsx'

function fail(msg) {
  console.error('FAIL', msg)
  process.exit(1)
}
function ok(label, cond) {
  if (!cond) fail(label)
  console.log('ok', label)
}

function normalizeMatchText(value) {
  return String(value ?? '').trim().toUpperCase()
}
function identitiesMatch(exported, live) {
  return (
    normalizeMatchText(exported.jobCardNo) === normalizeMatchText(live.jobCardNo)
    && normalizeMatchText(exported.vehicleNo) === normalizeMatchText(live.regNumber)
    && normalizeMatchText(exported.invoiceNo) === normalizeMatchText(live.invoiceNumber)
  )
}
function parsePaymentAmount(raw) {
  if (raw == null) return { ok: true, value: null }
  const text = String(raw).trim()
  if (!text) return { ok: true, value: null }
  const n = Number(text.replace(/,/g, ''))
  if (!Number.isFinite(n)) return { ok: false, error: 'Amount must be numeric' }
  if (n < 0) return { ok: false, error: 'Amount cannot be negative' }
  const rounded = Math.round(n * 100) / 100
  if (rounded === 0) return { ok: true, value: null }
  return { ok: true, value: rounded }
}
function receivedReferenceCell(value) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}
function parseNewPaymentAmounts(row) {
  return {
    main: parsePaymentAmount(row.main_amount),
    gst: parsePaymentAmount(row.gst_amount),
    tds: parsePaymentAmount(row.tds_amount),
    cp: parsePaymentAmount(row.customer_payment_cp),
  }
}
function remainingAmounts(requested, postedComponents) {
  return {
    main: postedComponents.has('MAIN') ? null : requested.main,
    gst: postedComponents.has('GST') ? null : requested.gst,
    tds: postedComponents.has('TDS') ? null : requested.tds,
    cp: postedComponents.has('CUSTOMER') || postedComponents.has('CUSTOMER_REFUND') ? null : requested.cp,
  }
}
function hasPositiveAmount(amounts) {
  return (amounts.main ?? 0) + (amounts.gst ?? 0) + (amounts.tds ?? 0) + (amounts.cp ?? 0) > 0
}
function pick(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== '') return String(row[key]).trim()
  }
  return ''
}
function previewPaymentImport(rows, liveById, postedByToken) {
  const previewRows = []
  let valid = 0
  let rejected = 0
  let alreadyImported = 0
  let totalMain = 0
  let totalGst = 0
  let totalTds = 0
  let totalCp = 0
  rows.forEach((row, idx) => {
    const rowNumber = idx + 2
    const jobCardNo = pick(row, 'job_card_no', 'jc')
    const vehicleNo = pick(row, 'vehicle_no', 'vrn', 'reg_number')
    const invoiceNo = pick(row, 'invoice_no', 'invoice_number')
    const token = pick(row, 'import_row_token')
    const idRaw = pick(row, 'repair_card_id')
    const { main: mainParsed, gst: gstParsed, tds: tdsParsed, cp: cpParsed } = parseNewPaymentAmounts(row)
    const base = {
      rowNumber, jobCardNo, vehicleNo, invoiceNo, importRowToken: token || null,
      amounts: { main: null, gst: null, tds: null, cp: null },
      remaining: { main: null, gst: null, tds: null, cp: null },
    }
    const reject = (message, repairCardId = null) => {
      rejected += 1
      previewRows.push({ ...base, repairCardId, status: 'rejected', message })
    }
    if (!mainParsed.ok) return reject(mainParsed.error)
    if (!gstParsed.ok) return reject(gstParsed.error)
    if (!tdsParsed.ok) return reject(tdsParsed.error)
    if (!cpParsed.ok) return reject(cpParsed.error)
    const amounts = { main: mainParsed.value, gst: gstParsed.value, tds: tdsParsed.value, cp: cpParsed.value }
    base.amounts = amounts
    if (!hasPositiveAmount(amounts)) return reject('Enter Main, GST, TDS, or Customer Payment (CP)')
    if (!idRaw) return reject('Missing technical repair card id; export a new payment template')
    const repairCardId = Number(idRaw)
    if (!Number.isInteger(repairCardId) || repairCardId <= 0) return reject('Invalid technical repair card id')
    if (!token) return reject('Missing import row token; export a new payment template')
    const live = liveById.get(repairCardId)
    if (!live) return reject('Recovery case was not found for this repair card', repairCardId)
    if (!identitiesMatch({ jobCardNo, vehicleNo, invoiceNo }, live)) {
      return reject('Job Card / Vehicle / Invoice do not match this repair card', repairCardId)
    }
    const posted = postedByToken.get(token) ?? new Set()
    const remaining = remainingAmounts(amounts, posted)
    base.remaining = remaining
    if (!hasPositiveAmount(remaining)) {
      alreadyImported += 1
      previewRows.push({ ...base, repairCardId, remaining, status: 'already_imported', message: 'Already imported' })
      return
    }
    if ((remaining.main ?? 0) + (remaining.gst ?? 0) + (remaining.tds ?? 0) > 0 && live.doAmount == null) {
      return reject('DO amount must be captured before posting DO payment', repairCardId)
    }
    if (remaining.cp != null) {
      const kind = String(live.customerSettlementKind ?? '')
      if (kind !== 'due' && kind !== 'refund') return reject('no customer due or refund to post against', repairCardId)
      if (remaining.cp > Math.round(Number(live.customerRemainingAmount ?? 0) * 100) / 100) {
        return reject('customer receipt cannot exceed remaining recoverable', repairCardId)
      }
    }
    valid += 1
    totalMain += remaining.main ?? 0
    totalGst += remaining.gst ?? 0
    totalTds += remaining.tds ?? 0
    totalCp += remaining.cp ?? 0
    previewRows.push({ ...base, repairCardId, remaining, status: 'valid', message: 'Ready to post' })
  })
  return { totalRows: rows.length, valid, rejected, alreadyImported, totalMain, totalGst, totalTds, totalCp, rows: previewRows }
}

ok('blank amount', parsePaymentAmount('').value === null)
ok('zero amount', parsePaymentAmount('0').value === null)
ok('positive', parsePaymentAmount('250000').value === 250000)
ok('indian commas', parsePaymentAmount('2,50,000.50').value === 250000.5)
ok('negative rejected', parsePaymentAmount('-1').ok === false)
ok('non-numeric rejected', parsePaymentAmount('abc').ok === false)
ok('identity match', identitiesMatch(
  { jobCardNo: 'jc001', vehicleNo: 'rj14ab1234', invoiceNo: 'inv001' },
  { jobCardNo: 'JC001', regNumber: 'RJ14AB1234', invoiceNumber: 'INV001' },
))
ok('identity mismatch invoice', !identitiesMatch(
  { jobCardNo: 'JC001', vehicleNo: 'RJ14AB1234', invoiceNo: 'INV002' },
  { jobCardNo: 'JC001', regNumber: 'RJ14AB1234', invoiceNumber: 'INV001' },
))
const remaining = remainingAmounts({ main: 100, gst: 18, tds: 10, cp: 50 }, new Set(['MAIN', 'GST', 'TDS']))
ok('retry skips posted DO', remaining.main == null && remaining.gst == null && remaining.tds == null && remaining.cp === 50)

const live = new Map([[11, {
  repairCardId: 11,
  jobCardNo: 'JC001',
  regNumber: 'RJ14AB1234',
  invoiceNumber: 'INV001',
  doAmount: 300000,
  customerSettlementKind: 'due',
  customerRemainingAmount: 2000,
}]])
const token = 'brp-test-row-1'
const baseRow = {
  job_card_no: 'JC001',
  vehicle_no: 'RJ14AB1234',
  invoice_no: 'INV001',
  repair_card_id: '11',
  import_row_token: token,
  main_amount: '250000',
  gst_amount: '45000',
  tds_amount: '5000',
  customer_payment_cp: '0',
  reference_remark: 'UTR123456',
}

ok('TEST E blank rejected', previewPaymentImport([{ ...baseRow, main_amount: '', gst_amount: '', tds_amount: '', customer_payment_cp: '' }], live, new Map()).rejected === 1)
ok('TEST F negative rejected', previewPaymentImport([{ ...baseRow, main_amount: '-10' }], live, new Map()).rejected === 1)
const first = previewPaymentImport([baseRow], live, new Map())
ok('TEST A first import valid', first.valid === 1 && first.totalMain === 250000 && first.totalGst === 45000 && first.totalTds === 5000)
ok('TEST G same workbook already imported', previewPaymentImport([baseRow], live, new Map([[token, new Set(['MAIN', 'GST', 'TDS'])]])).alreadyImported === 1)
const retryCp = previewPaymentImport([{ ...baseRow, customer_payment_cp: '500' }], live, new Map([[token, new Set(['MAIN', 'GST', 'TDS'])]]))
ok('TEST H retry CP only', retryCp.valid === 1 && retryCp.totalMain === 0 && retryCp.totalCp === 500 && retryCp.rows[0].remaining.main == null)
const mixed = previewPaymentImport([{ ...baseRow, customer_payment_cp: '500' }], live, new Map())
ok('TEST C mixed row', mixed.valid === 1 && mixed.totalCp === 500 && mixed.totalMain === 250000)
const live2 = new Map(live)
live2.set(12, {
  repairCardId: 12,
  jobCardNo: 'JC002',
  regNumber: 'RJ14CD5678',
  invoiceNumber: 'INV002',
  doAmount: 100000,
  customerSettlementKind: 'none',
  customerRemainingAmount: 0,
})
const multi = previewPaymentImport([
  baseRow,
  {
    ...baseRow,
    job_card_no: 'JC002',
    vehicle_no: 'RJ14CD5678',
    invoice_no: 'INV002',
    repair_card_id: '12',
    import_row_token: 'brp-test-row-2',
    main_amount: '1000',
    gst_amount: '',
    tds_amount: '',
    customer_payment_cp: '',
  },
], live2, new Map())
ok('TEST D multiple rows', multi.valid === 2 && multi.rows[0].repairCardId === 11 && multi.rows[1].repairCardId === 12)
ok('TEST D unknown card rejected', previewPaymentImport([baseRow, { ...baseRow, repair_card_id: '99', import_row_token: 'brp-other' }], live, new Map()).rejected === 1)
ok('TEST I identity mismatch rejected', /do not match/i.test(previewPaymentImport([{ ...baseRow, job_card_no: 'JC-OTHER' }], live, new Map()).rows[0].message))
ok('TEST B CP only', previewPaymentImport([{ ...baseRow, main_amount: '', gst_amount: '', tds_amount: '', customer_payment_cp: '500' }], live, new Map()).totalCp === 500)

ok('pending received cell is 0', receivedReferenceCell(null) === 0 && receivedReferenceCell(undefined) === 0)
ok('partial received cell keeps posted amount', receivedReferenceCell(150000) === 150000)

const VISIBLE_HEADERS = [
  'Job Card No.',
  'Vehicle No.',
  'Invoice No.',
  'Main Received',
  'GST Received',
  'TDS Received',
  'CP Received',
  'Main Amount',
  'GST Amount',
  'TDS Amount',
  'Customer Payment (CP)',
  'Reference / Remark',
]
const wb = XLSX.utils.book_new()
const pendingRow = {
  'Job Card No.': 'JC001',
  'Vehicle No.': 'RJ14AB1234',
  'Invoice No.': 'INV001',
  'Main Received': receivedReferenceCell(null),
  'GST Received': receivedReferenceCell(null),
  'TDS Received': receivedReferenceCell(null),
  'CP Received': receivedReferenceCell(0),
  'Main Amount': '',
  'GST Amount': '',
  'TDS Amount': '',
  'Customer Payment (CP)': '',
  'Reference / Remark': '',
  _repair_card_id: 11,
  _import_row_token: 'brp-hidden',
}
const partialRow = {
  'Job Card No.': 'JC-PARTIAL',
  'Vehicle No.': 'RJ14AB1234',
  'Invoice No.': 'INV-P',
  'Main Received': receivedReferenceCell(150000),
  'GST Received': receivedReferenceCell(27000),
  'TDS Received': receivedReferenceCell(5000),
  'CP Received': receivedReferenceCell(10000),
  'Main Amount': '',
  'GST Amount': '',
  'TDS Amount': '',
  'Customer Payment (CP)': '',
  'Reference / Remark': '',
  _repair_card_id: 12,
  _import_row_token: 'brp-partial',
}
const ws = XLSX.utils.json_to_sheet([pendingRow, partialRow], {
  header: [...VISIBLE_HEADERS, '_repair_card_id', '_import_row_token'],
})
ws['!cols'] = [
  {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
  { hidden: true }, { hidden: true },
]
XLSX.utils.book_append_sheet(wb, ws, 'Payments')
const parsedRows = XLSX.utils.sheet_to_json(wb.Sheets.Payments, { defval: '' })
const parsed = parsedRows[0]
const parsedPartial = parsedRows[1]
const headerOrder = XLSX.utils.sheet_to_json(wb.Sheets.Payments, { header: 1 })[0]
ok('hidden technical fields round-trip', parsed._repair_card_id === 11 && parsed._import_row_token === 'brp-hidden')
ok('twelve visible columns present', VISIBLE_HEADERS.every((h) => Object.prototype.hasOwnProperty.call(parsed, h)))
ok('visible column order', VISIBLE_HEADERS.every((h, i) => headerOrder[i] === h))
ok('hidden columns after visible', headerOrder[12] === '_repair_card_id' && headerOrder[13] === '_import_row_token')
ok('pending received columns are zero', parsed['Main Received'] === 0 && parsed['GST Received'] === 0 && parsed['TDS Received'] === 0 && parsed['CP Received'] === 0)
ok('new payment cells blank by default', parsed['Main Amount'] === '' && parsed['GST Amount'] === '' && parsed['TDS Amount'] === '' && parsed['Customer Payment (CP)'] === '' && parsed['Reference / Remark'] === '')
ok('partial received columns populated', parsedPartial['Main Received'] === 150000 && parsedPartial['GST Received'] === 27000 && parsedPartial['TDS Received'] === 5000 && parsedPartial['CP Received'] === 10000)
ok('partial new payment cells stay blank', parsedPartial['Main Amount'] === '' && parsedPartial['Customer Payment (CP)'] === '')

const liveWide = new Map([[11, { ...live.get(11), customerRemainingAmount: 20000 }]])

const editedReceived = previewPaymentImport([{
  ...baseRow,
  main_received: '999999',
  gst_received: '888888',
  tds_received: '777777',
  cp_received: '666666',
  main_amount: '50000',
  gst_amount: '9000',
  tds_amount: '',
  customer_payment_cp: '5000',
}], liveWide, new Map())
ok('manually edited received columns are ignored', editedReceived.valid === 1 && editedReceived.totalMain === 50000 && editedReceived.totalGst === 9000 && editedReceived.totalTds === 0 && editedReceived.totalCp === 5000)

const partialPay = previewPaymentImport([{
  ...baseRow,
  main_received: '150000',
  gst_received: '27000',
  tds_received: '5000',
  cp_received: '10000',
  main_amount: '100000',
  gst_amount: '',
  tds_amount: '',
  customer_payment_cp: '',
}], liveWide, new Map())
ok('partial case posts only new Main Amount', partialPay.valid === 1 && partialPay.totalMain === 100000 && partialPay.totalGst === 0 && partialPay.totalTds === 0 && partialPay.totalCp === 0)

const pendingBlank = previewPaymentImport([{
  ...baseRow,
  main_received: '0',
  gst_received: '0',
  tds_received: '0',
  cp_received: '0',
  main_amount: '',
  gst_amount: '',
  tds_amount: '',
  customer_payment_cp: '',
}], liveWide, new Map())
ok('pending received zeros do not count as new payment', pendingBlank.rejected === 1)

function headerKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}
function toImportRow(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[headerKey(k)] = String(v ?? '').trim()
  return out
}
const fromSheet = toImportRow({
  ...parsed,
  'Main Received': 150000,
  'GST Received': 27000,
  'TDS Received': 5000,
  'CP Received': 10000,
  'Main Amount': 50000,
  'GST Amount': 9000,
  'TDS Amount': 0,
  'Customer Payment (CP)': 5000,
})
ok('excel keys split received vs new payment', fromSheet.main_received === '150000' && fromSheet.main_amount === '50000' && fromSheet.cp_received === '10000' && fromSheet.customer_payment_cp === '5000')
const fromSheetPreview = previewPaymentImport([fromSheet], liveWide, new Map())
ok('sheet received values do not post', fromSheetPreview.valid === 1 && fromSheetPreview.totalMain === 50000 && fromSheetPreview.totalGst === 9000 && fromSheetPreview.totalTds === 0 && fromSheetPreview.totalCp === 5000)

console.log('bodyshop recovery payment import checks passed')
