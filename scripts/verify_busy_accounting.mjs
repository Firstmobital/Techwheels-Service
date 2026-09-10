#!/usr/bin/env node
/**
 * BUSY accounting transformation checks.
 * Run: node --experimental-strip-types scripts/verify_busy_accounting.mjs
 */
import assert from 'node:assert/strict'
import { resolveBusyBranch, resolveDebtorGroup, BUSY_DEBTOR_GROUPS } from '../src/lib/busy/branch.ts'
import { isDateInInclusiveRange, dateRangeError } from '../src/lib/busy/dates.ts'
import { invoiceMatchesPortalSeries } from '../src/lib/busy/eligibility.ts'
import { inclusiveFromNet } from '../src/lib/busy/money.ts'
import { classifyBusyInvoice, parseBodyshopPartyName, PDI_PARTY_NAME, resolvePartyName } from '../src/lib/busy/partyName.ts'
import { mapPartsRows } from '../src/lib/busy/partsParser.ts'
import { transformBusyAccounting } from '../src/lib/busy/transform.ts'
import { buildInvoiceVoucherWorkbook, buildPartyAccountWorkbook, workbookHeaders, workbookDataRows } from '../src/lib/busy/xlsx.ts'
import { INVOICE_VOUCHER_HEADERS, PARTY_ACCOUNT_HEADERS } from '../src/lib/busy/types.ts'

let failed = 0
function test(name, fn) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL  ${name}`)
    console.error(error instanceof Error ? error.stack : error)
  }
}

const labour = (overrides) => ({
  invoice_number: 'IMBTAI2627000001',
  invoice_date: '2026-09-01',
  account: 'CASH',
  first_name: 'RAMESH',
  last_name: 'KUMAR',
  job_card_number: 'JC-1001',
  vehicle_registration_number: 'RJ14AB1234',
  sr_type: 'Paid Service',
  sr_assigned_to: 'SIT_3000840',
  final_labour_amount: 1180,
  invoice_status: 'Active',
  portal: 'PV',
  ...overrides,
})

test('1. PV + IMBTAI => included', () => {
  const result = transformBusyAccounting({
    labourRows: [labour()],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.summary.eligible, 1)
  assert.equal(result.preview[0].status, 'ready')
})

test('2. PV + other prefix => excluded', () => {
  const result = transformBusyAccounting({
    labourRows: [labour({ invoice_number: 'XXXTAI2627000001' })],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.summary.eligible, 0)
  assert.equal(result.preview[0].status, 'excluded')
  assert.equal(result.preview[0].exclusionKind, 'series')
})

test('3. EV + EMBTAI => included', () => {
  const result = transformBusyAccounting({
    labourRows: [labour({ invoice_number: 'EMBTAI2627000001', portal: 'EV', sr_assigned_to: 'EV_500A840' })],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.summary.eligible, 1)
  assert.equal(invoiceMatchesPortalSeries('EMBTAI2627000001', 'EV'), true)
})

test('4. EV + other prefix => excluded', () => {
  const result = transformBusyAccounting({
    labourRows: [labour({ invoice_number: 'IMBTAI2627000001', portal: 'EV' })],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.preview[0].status, 'excluded')
})

test('5-10. branch resolver', () => {
  assert.equal(resolveBusyBranch('PUM_3000840'), 'Tonk')
  assert.equal(resolveBusyBranch('EAA_500A840'), 'Tonk')
  assert.equal(resolveBusyBranch('GT_3000840'), 'Shahpura')
  assert.equal(resolveBusyBranch('EHS1_500A840'), 'Shahpura')
  assert.equal(resolveBusyBranch('BS_500A840'), 'Mansarovar')
  assert.equal(resolveBusyBranch('SIT_3000840'), 'Sitapura')
  assert.equal(resolveBusyBranch('anything-else'), 'Sitapura')
})

test('11. Normal Party Name generation', () => {
  const party = resolvePartyName({
    classification: 'Normal',
    firstName: 'RAMESH',
    lastName: 'KUMAR',
    account: 'CASH',
    branch: 'Sitapura',
    vehicleRegistrationNumber: 'RJ14AB1234',
  })
  assert.equal(party.partyName, 'RAMESH KUMAR-SITAPURA RJ14AB1234')
})

test('12. PDI => CASH AT SITAPURA', () => {
  assert.equal(classifyBusyInvoice('PDI', 'ICICI C/O X'), 'PDI')
  const party = resolvePartyName({
    classification: 'PDI',
    firstName: 'A',
    lastName: 'B',
    account: 'X',
    branch: 'Tonk',
    vehicleRegistrationNumber: 'RJ00AA0000',
  })
  assert.equal(party.partyName, PDI_PARTY_NAME)
})

test('13. Bodyshop C/O parsing', () => {
  assert.equal(
    parseBodyshopPartyName('ICICI LOMBARD GENERAL INSURANCE COMPANY LIMITED C/O RAMESH KUMAR'),
    'ICICI LOMBARD RAMESH KUMAR',
  )
})

test('14. 5% Parts conversion to GST-inclusive', () => {
  assert.equal(inclusiveFromNet(1000, 5), 1050)
  assert.equal(inclusiveFromNet(10.5, 5), 11.03)
})

test('15. 18% Parts conversion to GST-inclusive', () => {
  assert.equal(inclusiveFromNet(1000, 18), 1180)
})

test('16. invoice with both 5% and 18% Parts produces separated accounting rows', () => {
  const result = transformBusyAccounting({
    labourRows: [labour({ job_card_number: 'JC-BOTH' })],
    partsLines: [
      { portal: 'PV', jobCardNumber: 'JC-BOTH', invoiceNumber: 'OTHER', netAmount: 100, taxAmount: null, gstRate: 5, gstIssue: null, sourceRowNumber: 2 },
      { portal: 'PV', jobCardNumber: 'JC-BOTH', invoiceNumber: 'OTHER', netAmount: 200, taxAmount: null, gstRate: 18, gstIssue: null, sourceRowNumber: 3 },
    ],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  const items = result.invoiceRows.map((row) => row['Item Name'])
  assert.deepEqual(items, ['SPARE PARTS @5%', 'SPARE PARTS @18%', 'LABOUR CHARGES @18%'])
  assert.equal(result.invoiceRows[0].Amount, 105)
  assert.equal(result.invoiceRows[1].Amount, 236)
  assert.equal(result.invoiceRows[0]['bill no'], 'IMBTAI2627000001')
})

test('17. zero 5% Parts does not create unwanted 5% row', () => {
  const result = transformBusyAccounting({
    labourRows: [labour()],
    partsLines: [
      { portal: 'PV', jobCardNumber: 'JC-1001', invoiceNumber: '', netAmount: 200, taxAmount: null, gstRate: 18, gstIssue: null, sourceRowNumber: 2 },
    ],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.invoiceRows.some((row) => row['Item Name'] === 'SPARE PARTS @5%'), false)
})

test('18. multiple Parts rows for same invoice aggregate correctly', () => {
  const result = transformBusyAccounting({
    labourRows: [labour({ job_card_number: 'JC-AGG', final_labour_amount: 0 })],
    partsLines: [
      { portal: 'PV', jobCardNumber: 'JC-AGG', invoiceNumber: '', netAmount: 100, taxAmount: null, gstRate: 5, gstIssue: null, sourceRowNumber: 2 },
      { portal: 'PV', jobCardNumber: 'JC-AGG', invoiceNumber: '', netAmount: 50, taxAmount: null, gstRate: 5, gstIssue: null, sourceRowNumber: 3 },
    ],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.preview[0].parts5, 157.5)
  assert.equal(result.invoiceRows.length, 1)
})

test('19. mismatched Parts invoice number does not override Labour invoice', () => {
  const result = transformBusyAccounting({
    labourRows: [labour({ job_card_number: 'JC-MIS' })],
    partsLines: [
      { portal: 'PV', jobCardNumber: 'JC-MIS', invoiceNumber: 'PARTS-INV-9', netAmount: 100, taxAmount: null, gstRate: 18, gstIssue: null, sourceRowNumber: 2 },
    ],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.invoiceRows[0]['bill no'], 'IMBTAI2627000001')
  assert.equal(result.preview[0].status, 'warning')
})

test('20. unmatched Parts do not create independent invoice', () => {
  const result = transformBusyAccounting({
    labourRows: [labour()],
    partsLines: [
      { portal: 'PV', jobCardNumber: 'JC-ORPHAN', invoiceNumber: 'X', netAmount: 999, taxAmount: null, gstRate: 18, gstIssue: null, sourceRowNumber: 2 },
    ],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.unmatchedParts.length, 1)
  assert.equal(result.invoiceRows.every((row) => row.Amount !== 1178.82), true)
  assert.equal(result.summary.eligible, 1)
})

test('21-23. inclusive date filter', () => {
  assert.equal(isDateInInclusiveRange('2026-09-01', '2026-09-01', '2026-09-10'), true)
  assert.equal(isDateInInclusiveRange('2026-09-10', '2026-09-01', '2026-09-10'), true)
  assert.equal(isDateInInclusiveRange('2026-09-11', '2026-09-01', '2026-09-10'), false)
  const result = transformBusyAccounting({
    labourRows: [
      labour({ invoice_number: 'IMBTAI1', invoice_date: '2026-09-01' }),
      labour({ invoice_number: 'IMBTAI2', invoice_date: '2026-09-10', job_card_number: 'JC-2' }),
      labour({ invoice_number: 'IMBTAI3', invoice_date: '2026-08-31', job_card_number: 'JC-3' }),
    ],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.summary.eligible, 2)
  assert.equal(result.preview.filter((row) => row.exclusionKind === 'date').length, 1)
})

test('24. duplicate Party Names export once', () => {
  const result = transformBusyAccounting({
    labourRows: [
      labour({ invoice_number: 'IMBTAI1', job_card_number: 'JC-A' }),
      labour({ invoice_number: 'IMBTAI2', job_card_number: 'JC-B' }),
    ],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.partyRows.length, 1)
})

test('25. branch gets exact debtor group string', () => {
  assert.equal(resolveDebtorGroup('Shahpura'), 'SHAHPPURA DEBTORS')
  assert.equal(resolveDebtorGroup('Tonk'), 'TONK DEBTORS')
  assert.equal(resolveDebtorGroup('Mansarovar'), 'SERVICE CENTER DEBTORS -MAN SER')
  assert.equal(resolveDebtorGroup('Sitapura'), 'SERVICE CENTRE DEBTORS 2022-23')
  assert.equal(BUSY_DEBTOR_GROUPS.Shahpura, 'SHAHPPURA DEBTORS')
})

test('26. unsupported GST classification surfaces exception', () => {
  const mapped = mapPartsRows([
    { 'Job Card_No': 'JC-1001', 'Net Amount': '100', 'GST %': '12' },
  ], 'PV')
  assert.equal(mapped.lines[0].gstRate, null)
  const result = transformBusyAccounting({
    labourRows: [labour()],
    partsLines: mapped.lines,
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.preview[0].status, 'blocked')
  assert.match(result.preview[0].issue, /unsupported GST/)
})

test('date range validation', () => {
  assert.equal(dateRangeError('', '2026-09-10'), 'From Date is required')
  assert.equal(dateRangeError('2026-09-10', '2026-09-01'), 'From Date must be on or before To Date')
})

test('workbook headers match BUSY contracts', () => {
  const invoiceWb = buildInvoiceVoucherWorkbook([{
    'Bill date': '01-09-2026',
    'bill no': 'IMBTAI1',
    'Party Name': 'RAMESH KUMAR-SITAPURA RJ14AB1234',
    'Item Name': 'LABOUR CHARGES @18%',
    Qty: 0,
    Price: 0,
    Amount: 1180,
    naration: 'RJ14AB1234',
  }])
  assert.deepEqual(workbookHeaders(invoiceWb), [...INVOICE_VOUCHER_HEADERS])
  const invoiceRows = workbookDataRows(invoiceWb)
  assert.equal(invoiceRows[0]['bill no'], 'IMBTAI1')
  assert.equal(invoiceRows[0].Qty, 0)
  assert.equal(invoiceRows[0].Price, 0)

  const partyWb = buildPartyAccountWorkbook([
    { 'Party Name': 'RAMESH KUMAR-SITAPURA RJ14AB1234', Group: 'SERVICE CENTRE DEBTORS 2022-23' },
  ])
  assert.deepEqual(workbookHeaders(partyWb), [...PARTY_ACCOUNT_HEADERS])
})

test('Labour amount is used GST-inclusive without * 1.18', () => {
  const result = transformBusyAccounting({
    labourRows: [labour({ final_labour_amount: 1180 })],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.preview[0].labour, 1180)
  assert.equal(result.invoiceRows[0].Amount, 1180)
})

test('PDI debtor group is Sitapura even when Labour branch is Tonk', () => {
  const result = transformBusyAccounting({
    labourRows: [labour({ sr_type: 'PDI', sr_assigned_to: 'PUM_3000840' })],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.preview[0].partyName, PDI_PARTY_NAME)
  assert.equal(result.preview[0].debtorGroup, 'SERVICE CENTRE DEBTORS 2022-23')
  assert.equal(result.preview[0].branch, 'Tonk')
})

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}

console.log('\nAll BUSY accounting checks passed')
