#!/usr/bin/env node
/**
 * BUSY accounting transformation checks.
 * Run: node --experimental-strip-types scripts/verify_busy_accounting.mjs
 */
import assert from 'node:assert/strict'
import { resolveBusyBranch, resolveDebtorGroup, BUSY_DEBTOR_GROUPS } from '../src/lib/busy/branch.ts'
import { existsSync, readFileSync } from 'node:fs'
import { isDateInInclusiveRange, dateRangeError, formatBusyBillDate, parsePartsInvoiceDate } from '../src/lib/busy/dates.ts'
import { invoiceMatchesPortalSeries } from '../src/lib/busy/eligibility.ts'
import { matchBusyInsurance, readAuthoritativeGstin } from '../src/lib/busy/insuranceMaster.ts'
import { inclusiveFromNet, nearestWholeRupee, roundOffToNearestRupee } from '../src/lib/busy/money.ts'
import { classifyBusyInvoice, parseBodyshopPartyName, PDI_PARTY_NAME, resolvePartyName } from '../src/lib/busy/partyName.ts'
import {
  mapPartsRows,
  parseSpreadsheetBuffer,
  PARTS_CRM_INVOICE_DATE,
  PARTS_CRM_INVOICE_NO,
  PARTS_CRM_JOB_CARD_NO,
  PARTS_CRM_NET_AMOUNT,
} from '../src/lib/busy/partsParser.ts'
import { buildBusyPartsSourceRowKey } from '../src/lib/busy/sourceRowKey.ts'
import {
  busyPartsInvoiceKey,
  partitionBusyPartsImport,
  toBusyPartsPersistRows,
} from '../src/lib/busy/partsPersist.ts'
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
  assertInvoiceVoucherContract(result)
  assert.equal(result.invoiceRows.length, 3)
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
  assertInvoiceVoucherContract(result)
  assert.equal(result.invoiceRows.length, 3)
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

function voucherGroups(invoiceRows) {
  const groups = new Map()
  for (const row of invoiceRows) {
    const key = row['bill no']
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }
  return groups
}

function assertInvoiceVoucherContract(result) {
  const eligible = result.preview.filter((row) => row.status === 'ready' || row.status === 'warning')
  const groups = voucherGroups(result.invoiceRows)
  assert.equal(groups.size, eligible.length)
  for (const preview of eligible) {
    const rows = groups.get(preview.invoiceNumber)
    assert.ok(rows, `missing voucher rows for ${preview.invoiceNumber}`)
    const items = rows.map((row) => row['Item Name'])
    const parts5 = rows.filter((row) => row['Item Name'] === 'SPARE PARTS @5%')
    const parts18 = rows.filter((row) => row['Item Name'] === 'SPARE PARTS @18%')
    const labour = rows.filter((row) => row['Item Name'] === 'LABOUR CHARGES @18%')
    const roundOff = rows.filter((row) => row['Item Name'] === 'ROUND OFF')
    assert.equal(parts18.length, 1)
    assert.equal(labour.length, 1)
    assert.equal(roundOff.length, 1)
    assert.equal(parts5.length, preview.hasParts5Line ? 1 : 0)
    if (preview.hasParts5Line) {
      assert.deepEqual(items, ['SPARE PARTS @5%', 'SPARE PARTS @18%', 'LABOUR CHARGES @18%', 'ROUND OFF'])
    } else {
      assert.deepEqual(items, ['SPARE PARTS @18%', 'LABOUR CHARGES @18%', 'ROUND OFF'])
    }
    for (const row of rows) {
      assert.equal(row['Bill date'], formatBusyBillDate(preview.invoiceDate))
      assert.equal(row['Bill date'], rows[0]['Bill date'])
      assert.equal(row['bill no'], preview.invoiceNumber)
      assert.equal(row['Party Name'], preview.partyName)
      assert.equal(row.naration, rows[0].naration)
      assert.equal(row.Qty, 0)
      assert.equal(row.Price, 0)
    }
    assert.equal(parts18[0].Amount, preview.parts18)
    assert.equal(labour[0].Amount, preview.labour)
    assert.equal(roundOff[0].Amount, preview.roundOff)
    if (preview.hasParts5Line) assert.equal(parts5[0].Amount, preview.parts5)
    const subtotalPaise = Math.round((preview.parts5 + preview.parts18 + preview.labour) * 100)
    const finalPaise = subtotalPaise + Math.round(preview.roundOff * 100)
    assert.equal(finalPaise % 100, 0)
  }
}

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
  assertInvoiceVoucherContract(result)
  const items = result.invoiceRows.map((row) => row['Item Name'])
  assert.deepEqual(items, ['SPARE PARTS @5%', 'SPARE PARTS @18%', 'LABOUR CHARGES @18%', 'ROUND OFF'])
  assert.equal(result.invoiceRows[0].Amount, 105)
  assert.equal(result.invoiceRows[1].Amount, 236)
  assert.equal(result.invoiceRows[0]['bill no'], 'IMBTAI2627000001')
})

test('17. no 5% source line does not create a 5% row', () => {
  const result = transformBusyAccounting({
    labourRows: [labour()],
    partsLines: [
      { portal: 'PV', jobCardNumber: 'JC-1001', invoiceNumber: '', netAmount: 200, taxAmount: null, gstRate: 18, gstIssue: null, sourceRowNumber: 2 },
    ],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assertInvoiceVoucherContract(result)
  assert.equal(result.preview[0].hasParts5Line, false)
  assert.equal(result.invoiceRows.some((row) => row['Item Name'] === 'SPARE PARTS @5%'), false)
  assert.equal(result.invoiceRows.length, 3)
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
  assertInvoiceVoucherContract(result)
  assert.equal(result.preview[0].parts5, 157.5)
  assert.equal(result.invoiceRows.length, 4)
  assert.equal(result.invoiceRows.find((row) => row['Item Name'] === 'SPARE PARTS @18%').Amount, 0)
  assert.equal(result.invoiceRows.find((row) => row['Item Name'] === 'LABOUR CHARGES @18%').Amount, 0)
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
  assertInvoiceVoucherContract(result)
  assert.equal(result.invoiceRows[0]['bill no'], 'IMBTAI2627000001')
  assert.equal(result.preview[0].status, 'warning')
})

test('mandatory 18% Parts and Labour rows are retained at Amount 0', () => {
  const result = transformBusyAccounting({
    labourRows: [labour({ final_labour_amount: 0 })],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assertInvoiceVoucherContract(result)
  assert.deepEqual(result.invoiceRows.map((row) => row['Item Name']), ['SPARE PARTS @18%', 'LABOUR CHARGES @18%', 'ROUND OFF'])
  assert.equal(result.invoiceRows[0].Amount, 0)
  assert.equal(result.invoiceRows[1].Amount, 0)
  assert.equal(result.invoiceRows[2].Amount, 0)
})

test('5% row is created from a genuine 5% line even when Amount is 0', () => {
  const result = transformBusyAccounting({
    labourRows: [labour({ job_card_number: 'JC-ZERO5' })],
    partsLines: [
      { portal: 'PV', jobCardNumber: 'JC-ZERO5', invoiceNumber: '', netAmount: 0, taxAmount: null, gstRate: 5, gstIssue: null, sourceRowNumber: 2 },
    ],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assertInvoiceVoucherContract(result)
  assert.equal(result.preview[0].hasParts5Line, true)
  assert.equal(result.invoiceRows[0]['Item Name'], 'SPARE PARTS @5%')
  assert.equal(result.invoiceRows[0].Amount, 0)
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
  assertInvoiceVoucherContract(result)
  assert.equal(result.unmatchedParts.length, 1)
  assert.equal(result.invoiceRows.every((row) => row.Amount !== 1178.82), true)
  assert.equal(result.summary.eligible, 1)
  assert.equal(result.invoiceRows.length, 3)
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
  assertInvoiceVoucherContract(result)
  assert.equal(result.invoiceRows.length, 6)
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
    {
      Invoice_No: 'IMBTAI2627000001',
      Invoice_Date: '01/09/2026 05:30:00 AM',
      'Job Card_No': 'JC-1001',
      Net_Amount: '100',
      'Part #': 'P12',
      Quantity: '1',
      'CGST Classification': 'Output CGST @6%',
      'SGST Classification': 'Output SGST @6%',
    },
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
    { 'Party Name': 'RAMESH KUMAR-SITAPURA RJ14AB1234', Group: 'SERVICE CENTRE DEBTORS 2022-23', GSTIN: '' },
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
  assertInvoiceVoucherContract(result)
  assert.equal(result.preview[0].labour, 1180)
  const labourRow = result.invoiceRows.find((row) => row['Item Name'] === 'LABOUR CHARGES @18%')
  assert.equal(labourRow.Amount, 1180)
  assert.equal(result.invoiceRows.find((row) => row['Item Name'] === 'SPARE PARTS @18%').Amount, 0)
})

test('eligible invoices do not always emit 3 voucher rows', () => {
  const result = transformBusyAccounting({
    labourRows: [
      labour({ invoice_number: 'IMBTAI1', job_card_number: 'JC-A' }),
      labour({ invoice_number: 'IMBTAI2', job_card_number: 'JC-B' }),
    ],
    partsLines: [
      { portal: 'PV', jobCardNumber: 'JC-A', invoiceNumber: '', netAmount: 100, taxAmount: null, gstRate: 5, gstIssue: null, sourceRowNumber: 2 },
    ],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assertInvoiceVoucherContract(result)
  assert.equal(result.summary.eligible, 2)
  assert.notEqual(result.invoiceRows.length, result.summary.eligible * 3)
  assert.equal(result.invoiceRows.length, 7)
  const byBill = voucherGroups(result.invoiceRows)
  assert.deepEqual(byBill.get('IMBTAI1').map((row) => row['Item Name']), ['SPARE PARTS @5%', 'SPARE PARTS @18%', 'LABOUR CHARGES @18%', 'ROUND OFF'])
  assert.deepEqual(byBill.get('IMBTAI2').map((row) => row['Item Name']), ['SPARE PARTS @18%', 'LABOUR CHARGES @18%', 'ROUND OFF'])
})

test('workbook round-trip keeps per-invoice voucher shape', () => {
  const result = transformBusyAccounting({
    labourRows: [
      labour({ invoice_number: 'IMBTAI1', job_card_number: 'JC-A', final_labour_amount: 0 }),
      labour({ invoice_number: 'IMBTAI2', job_card_number: 'JC-B' }),
    ],
    partsLines: [
      { portal: 'PV', jobCardNumber: 'JC-A', invoiceNumber: '', netAmount: 100, taxAmount: null, gstRate: 5, gstIssue: null, sourceRowNumber: 2 },
      { portal: 'PV', jobCardNumber: 'JC-B', invoiceNumber: '', netAmount: 200, taxAmount: null, gstRate: 18, gstIssue: null, sourceRowNumber: 3 },
    ],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assertInvoiceVoucherContract(result)
  const workbook = buildInvoiceVoucherWorkbook(result.invoiceRows)
  const workbookRows = workbookDataRows(workbook)
  assert.equal(workbookRows.length, 7)
  const groups = voucherGroups(workbookRows)
  const with5 = groups.get('IMBTAI1')
  const without5 = groups.get('IMBTAI2')
  assert.deepEqual(with5.map((row) => row['Item Name']), ['SPARE PARTS @5%', 'SPARE PARTS @18%', 'LABOUR CHARGES @18%', 'ROUND OFF'])
  assert.deepEqual(without5.map((row) => row['Item Name']), ['SPARE PARTS @18%', 'LABOUR CHARGES @18%', 'ROUND OFF'])
  for (const row of workbookRows) {
    assert.equal(row['Bill date'], '01-09-2026')
    assert.equal(row.Qty, 0)
    assert.equal(row.Price, 0)
  }
  assert.equal(with5[0].Amount, 105)
  assert.equal(with5[1].Amount, 0)
  assert.equal(with5[2].Amount, 0)
  assert.equal(with5[3].Amount, 0)
  assert.equal(without5[0].Amount, 236)
  assert.equal(without5[1].Amount, 1180)
  assert.equal(without5[2].Amount, 0)
  assert.equal(with5.every((row) => row['Party Name'] === with5[0]['Party Name']), true)
  assert.equal(with5.every((row) => row.naration === with5[0].naration), true)
})

test('parsed GST % 5 source line creates the 5% voucher row', () => {
  const mapped = mapPartsRows([
    {
      Invoice_No: 'IMBTAI2627000001',
      Invoice_Date: '01/09/2026 05:30:00 AM',
      'Job Card_No': 'JC-1001',
      Net_Amount: '100',
      'Part #': 'P5',
      Quantity: '1',
      'CGST Classification': 'Output CGST @2.5%',
      'SGST Classification': 'Output SGST @2.5%',
    },
  ], 'PV')
  assert.equal(mapped.lines[0].gstRate, 5)
  const result = transformBusyAccounting({
    labourRows: [labour()],
    partsLines: mapped.lines,
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assertInvoiceVoucherContract(result)
  assert.equal(result.preview[0].hasParts5Line, true)
  assert.equal(result.invoiceRows[0]['Item Name'], 'SPARE PARTS @5%')
})

test('Parts CRM Invoice_No and Invoice_Date are mapped and persisted as evidence', () => {
  const mapped = mapPartsRows([
    {
      Invoice_No: 'PARTS-INV-9',
      Invoice_Date: '08/09/2026 05:30:00 AM',
      'Job Card_No': 'JC-1001',
      Net_Amount: '200',
      'Part #': '541288506307',
      Quantity: '1',
      'CGST Classification': 'Output CGST @9%',
      'SGST Classification': 'Output SGST @9%',
      'Tax Amount': '36',
    },
  ], 'PV', 'Parts - PV.csv')
  assert.equal(mapped.errors.length, 0)
  assert.equal(mapped.lines[0].invoiceNumber, 'PARTS-INV-9')
  assert.equal(mapped.lines[0].invoiceDate, '2026-09-08')
  assert.equal(parsePartsInvoiceDate('08/09/2026 05:30:00 AM'), '2026-09-08')
  const persistRows = toBusyPartsPersistRows(mapped.lines, 'PV', 'Parts - PV.csv')
  assert.equal(persistRows.length, 1)
  assert.equal(persistRows[0].invoice_no, 'PARTS-INV-9')
  assert.equal(persistRows[0].invoice_date, '2026-09-08')
  assert.equal(persistRows[0].job_card_no, 'JC-1001')
  assert.equal(persistRows[0].gst_rate, 18)
  assert.equal(persistRows[0].net_amount, 200)
  assert.ok(persistRows[0].source_row_key)
  const result = transformBusyAccounting({
    labourRows: [labour()],
    partsLines: mapped.lines,
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.invoiceRows[0]['bill no'], 'IMBTAI2627000001')
  assert.equal(result.invoiceRows[0]['Bill date'], '01-09-2026')
  assert.match(result.preview[0].issue, /Invoice_No PARTS-INV-9/)
  assert.match(result.preview[0].issue, /Invoice_Date 2026-09-08/)
  assert.equal(result.preview[0].status, 'warning')
})

test('re-upload of the same Parts content keeps the same source_row_key', () => {
  const row = {
    Invoice_No: 'IMBTAI2627007262',
    Invoice_Date: '08/09/2026 05:30:00 AM',
    'Job Card_No': 'JC-MbtPlt-JP1-2627-005977',
    Net_Amount: '4,933.050850000',
    'Part #': '541288506307',
    Quantity: '1',
    'CGST Classification': 'Output CGST @9%',
    'SGST Classification': 'Output SGST @9%',
    'Tax Amount': '887.949140000',
  }
  const first = mapPartsRows([row], 'PV', 'Parts - PV.csv')
  const second = mapPartsRows([row], 'PV', 'Parts - PV (1).csv')
  assert.equal(first.lines[0].sourceRowKey, second.lines[0].sourceRowKey)
  assert.equal(
    first.lines[0].sourceRowKey,
    buildBusyPartsSourceRowKey({
      sourceType: 'PV',
      jobCardNo: 'JC-MbtPlt-JP1-2627-005977',
      invoiceNo: 'IMBTAI2627007262',
      invoiceDate: '2026-09-08',
      gstRate: 18,
      netAmount: 4933.05085,
      partNo: '541288506307',
      quantity: '1',
    }),
  )
  const persistFirst = toBusyPartsPersistRows(first.lines, 'PV', 'Parts - PV.csv')
  const persistSecond = toBusyPartsPersistRows(second.lines, 'PV', 'Parts - PV (1).csv')
  assert.equal(persistFirst[0].source_row_key, persistSecond[0].source_row_key)
  assert.notEqual(persistFirst[0].source_file_name, persistSecond[0].source_file_name)
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
  assertInvoiceVoucherContract(result)
  assert.equal(result.invoiceRows.every((row) => row.naration === PDI_PARTY_NAME), true)
})

test('practical CRM Parts PV/EV files map Invoice_No and Invoice_Date', () => {
  const files = [
    { path: '/Users/apple/Downloads/Parts - PV.csv', portal: 'PV' },
    { path: '/Users/apple/Downloads/Parts - EV.csv', portal: 'EV' },
  ]
  let inspected = 0
  for (const file of files) {
    if (!existsSync(file.path)) continue
    inspected += 1
    const buffer = readFileSync(file.path)
    const rows = parseSpreadsheetBuffer(buffer, file.path)
    assert.ok(rows.length > 0, `${file.path} has no data rows`)
    const headers = Object.keys(rows[0])
    assert.ok(headers.includes(PARTS_CRM_INVOICE_NO), `${file.path} missing ${PARTS_CRM_INVOICE_NO}`)
    assert.ok(headers.includes(PARTS_CRM_INVOICE_DATE), `${file.path} missing ${PARTS_CRM_INVOICE_DATE}`)
    assert.ok(headers.includes(PARTS_CRM_JOB_CARD_NO), `${file.path} missing ${PARTS_CRM_JOB_CARD_NO}`)
    assert.ok(headers.includes(PARTS_CRM_NET_AMOUNT), `${file.path} missing ${PARTS_CRM_NET_AMOUNT}`)
    const mapped = mapPartsRows(rows, file.portal, file.path.split('/').pop())
    assert.equal(mapped.errors.length, 0)
    assert.ok(mapped.lines.length > 0)
    assert.equal(mapped.lines.every((line) => Boolean(line.invoiceNumber)), true)
    assert.equal(mapped.lines.every((line) => Boolean(line.invoiceDate)), true)
    const first = toBusyPartsPersistRows(mapped.lines, file.portal, file.path.split('/').pop())
    const second = toBusyPartsPersistRows(mapped.lines, file.portal, 're-upload.csv')
    assert.equal(first.length, second.length)
    assert.deepEqual(first.map((row) => row.source_row_key), second.map((row) => row.source_row_key))
    const with5 = mapped.lines.filter((line) => line.gstRate === 5).length
    const with18 = mapped.lines.filter((line) => line.gstRate === 18).length
    console.log(`  ${file.portal}: ${mapped.lines.length} persistable lines, 5%=${with5}, 18%=${with18}, skipped=${mapped.skippedIncomplete}`)
  }
  if (inspected === 0) {
    console.log('  skipped: CRM Parts files were not on disk')
  }
})

function persistLine(overrides) {
  const invoiceNo = overrides.invoice_no ?? 'IMBTAI001'
  const invoiceDate = overrides.invoice_date ?? '2026-09-10'
  const sourceType = overrides.source_type ?? 'PV'
  const partNo = overrides.part_no ?? 'PART-A'
  const netAmount = overrides.net_amount ?? 100
  const gstRate = overrides.gst_rate ?? 18
  const jobCardNo = overrides.job_card_no ?? 'JC-1'
  return {
    source_type: sourceType,
    job_card_no: jobCardNo,
    invoice_no: invoiceNo,
    invoice_date: invoiceDate,
    gst_rate: gstRate,
    net_amount: netAmount,
    source_row_key: buildBusyPartsSourceRowKey({
      sourceType,
      jobCardNo,
      invoiceNo,
      invoiceDate,
      gstRate,
      netAmount,
      partNo,
      quantity: overrides.quantity ?? '1',
    }),
    source_file_name: overrides.source_file_name ?? 'parts.csv',
  }
}

function createPartsStore() {
  const rows = []
  function existingKeys() {
    return rows.map((row) => busyPartsInvoiceKey(row.source_type, row.invoice_no, row.invoice_date))
  }
  function importRows(incoming) {
    const result = partitionBusyPartsImport(existingKeys(), incoming)
    rows.push(...result.newRows)
    return result
  }
  function snapshot() {
    return {
      totalRows: rows.length,
      pvInvoices: new Set(rows.filter((row) => row.source_type === 'PV').map((row) => busyPartsInvoiceKey(row.source_type, row.invoice_no, row.invoice_date))).size,
      evInvoices: new Set(rows.filter((row) => row.source_type === 'EV').map((row) => busyPartsInvoiceKey(row.source_type, row.invoice_no, row.invoice_date))).size,
      invoices: [...new Set(rows.map((row) => busyPartsInvoiceKey(row.source_type, row.invoice_no, row.invoice_date)))],
      rows: rows.map((row) => ({ ...row })),
    }
  }
  return { importRows, snapshot }
}

test('Test A — first upload stores every line of one invoice', () => {
  const store = createPartsStore()
  const incoming = [
    persistLine({ part_no: 'PART-A', net_amount: 100, gst_rate: 18 }),
    persistLine({ part_no: 'PART-B', net_amount: 250, gst_rate: 18 }),
    persistLine({ part_no: 'PART-C', net_amount: 500, gst_rate: 5 }),
  ]
  const result = store.importRows(incoming)
  assert.equal(result.newInvoices, 1)
  assert.equal(result.newRows.length, 3)
  assert.equal(result.skippedInvoices, 0)
  assert.equal(store.snapshot().totalRows, 3)
})

test('Test B — same file again inserts nothing', () => {
  const store = createPartsStore()
  const incoming = [
    persistLine({ part_no: 'PART-A', net_amount: 100 }),
    persistLine({ part_no: 'PART-B', net_amount: 250 }),
    persistLine({ part_no: 'PART-C', net_amount: 500, gst_rate: 5 }),
  ]
  store.importRows(incoming)
  const before = store.snapshot()
  const result = store.importRows(incoming)
  const after = store.snapshot()
  assert.equal(result.newInvoices, 0)
  assert.equal(result.newRows.length, 0)
  assert.equal(result.skippedInvoices, 1)
  assert.equal(result.skippedRows.length, 3)
  assert.equal(after.totalRows, before.totalRows)
  assert.deepEqual(after.rows.map((row) => row.source_row_key), before.rows.map((row) => row.source_row_key))
})

test('Test C — overlapping file skips B, inserts C, keeps A', () => {
  const store = createPartsStore()
  const invoiceA = Array.from({ length: 5 }, (_, index) => persistLine({ invoice_no: 'INV-A', part_no: `A-${index}`, net_amount: 10 + index }))
  const invoiceB = Array.from({ length: 7 }, (_, index) => persistLine({ invoice_no: 'INV-B', part_no: `B-${index}`, net_amount: 20 + index }))
  const invoiceC = Array.from({ length: 4 }, (_, index) => persistLine({ invoice_no: 'INV-C', part_no: `C-${index}`, net_amount: 30 + index }))
  store.importRows([...invoiceA, ...invoiceB])
  const result = store.importRows([...invoiceB, ...invoiceC])
  const after = store.snapshot()
  assert.equal(result.skippedInvoices, 1)
  assert.equal(result.skippedRows.length, 7)
  assert.equal(result.newInvoices, 1)
  assert.equal(result.newRows.length, 4)
  assert.equal(after.totalRows, 16)
  assert.equal(after.rows.filter((row) => row.invoice_no === 'INV-A').length, 5)
  assert.equal(after.rows.filter((row) => row.invoice_no === 'INV-B').length, 7)
  assert.equal(after.rows.filter((row) => row.invoice_no === 'INV-C').length, 4)
})

test('Test D — September remains after October upload', () => {
  const store = createPartsStore()
  const september = [
    persistLine({ invoice_no: 'INV-SEP-1', invoice_date: '2026-09-10', part_no: 'S1' }),
    persistLine({ invoice_no: 'INV-SEP-1', invoice_date: '2026-09-10', part_no: 'S2' }),
    persistLine({ invoice_no: 'INV-SEP-2', invoice_date: '2026-09-11', part_no: 'S3' }),
  ]
  const october = [
    persistLine({ invoice_no: 'INV-OCT-1', invoice_date: '2026-10-01', part_no: 'O1' }),
    persistLine({ invoice_no: 'INV-OCT-1', invoice_date: '2026-10-01', part_no: 'O2' }),
  ]
  store.importRows(september)
  const result = store.importRows(october)
  const after = store.snapshot()
  assert.equal(result.newInvoices, 1)
  assert.equal(result.newRows.length, 2)
  assert.equal(result.skippedInvoices, 0)
  assert.equal(after.totalRows, 5)
  assert.equal(after.rows.filter((row) => row.invoice_date.startsWith('2026-09')).length, 3)
  assert.equal(after.rows.filter((row) => row.invoice_date.startsWith('2026-10')).length, 2)
})

test('Test E — PV upload does not replace EV', () => {
  const store = createPartsStore()
  const evRows = [
    persistLine({ source_type: 'EV', invoice_no: 'EMBTAI001', part_no: 'E1' }),
    persistLine({ source_type: 'EV', invoice_no: 'EMBTAI001', part_no: 'E2' }),
  ]
  const pvRows = [
    persistLine({ source_type: 'PV', invoice_no: 'IMBTAI001', part_no: 'P1' }),
    persistLine({ source_type: 'PV', invoice_no: 'IMBTAI001', part_no: 'P2' }),
    persistLine({ source_type: 'PV', invoice_no: 'IMBTAI001', part_no: 'P3' }),
  ]
  store.importRows(evRows)
  const afterEv = store.snapshot()
  const pvResult = store.importRows(pvRows)
  const afterPv = store.snapshot()
  assert.equal(pvResult.newInvoices, 1)
  assert.equal(pvResult.skippedInvoices, 0)
  assert.equal(afterPv.evInvoices, afterEv.evInvoices)
  assert.equal(afterPv.rows.filter((row) => row.source_type === 'EV').length, 2)
  assert.equal(afterPv.rows.filter((row) => row.source_type === 'PV').length, 3)
  const evAgain = store.importRows(evRows)
  const afterEvAgain = store.snapshot()
  assert.equal(evAgain.newInvoices, 0)
  assert.equal(evAgain.skippedInvoices, 1)
  assert.equal(afterEvAgain.totalRows, afterPv.totalRows)
  assert.equal(afterEvAgain.pvInvoices, 1)
  assert.equal(afterEvAgain.evInvoices, 1)
})

test('duplicate detection is invoice-level, not row-level unique on invoice_no+invoice_date', () => {
  const key = busyPartsInvoiceKey('PV', 'IMBTAI2627001234', '2026-09-10')
  assert.equal(key, 'PV|IMBTAI2627001234|2026-09-10')
  const store = createPartsStore()
  const first = [
    persistLine({ invoice_no: 'IMBTAI2627001234', invoice_date: '2026-09-10', part_no: 'A', net_amount: 100 }),
    persistLine({ invoice_no: 'IMBTAI2627001234', invoice_date: '2026-09-10', part_no: 'B', net_amount: 250 }),
  ]
  store.importRows(first)
  const extraLineSameInvoice = persistLine({ invoice_no: 'IMBTAI2627001234', invoice_date: '2026-09-10', part_no: 'C', net_amount: 500, gst_rate: 5 })
  const skipped = store.importRows([extraLineSameInvoice])
  assert.equal(skipped.newInvoices, 0)
  assert.equal(skipped.skippedInvoices, 1)
  assert.equal(skipped.skippedRows.length, 1)
  assert.equal(store.snapshot().totalRows, 2)
})

test('practical CRM Parts re-upload does not increase invoice or row counts', () => {
  const files = [
    { path: '/Users/apple/Downloads/Parts - PV.csv', portal: 'PV' },
    { path: '/Users/apple/Downloads/Parts - EV.csv', portal: 'EV' },
  ]
  const store = createPartsStore()
  let inspected = 0
  for (const file of files) {
    if (!existsSync(file.path)) continue
    inspected += 1
    const rows = parseSpreadsheetBuffer(readFileSync(file.path), file.path)
    const mapped = mapPartsRows(rows, file.portal, file.path.split('/').pop())
    const persistRows = toBusyPartsPersistRows(mapped.lines, file.portal, file.path.split('/').pop())
    const first = store.importRows(persistRows)
    const before = store.snapshot()
    const second = store.importRows(persistRows)
    const after = store.snapshot()
    assert.equal(second.newInvoices, 0)
    assert.equal(second.newRows.length, 0)
    assert.equal(second.skippedInvoices, first.newInvoices)
    assert.equal(second.skippedRows.length, first.newRows.length)
    assert.equal(after.totalRows, before.totalRows)
    assert.equal(after.pvInvoices, before.pvInvoices)
    assert.equal(after.evInvoices, before.evInvoices)
    console.log(`  ${file.portal} first upload: new invoices=${first.newInvoices}, new rows=${first.newRows.length}`)
    console.log(`  ${file.portal} re-upload: new invoices=${second.newInvoices}, skipped invoices=${second.skippedInvoices}, skipped rows=${second.skippedRows.length}, store rows=${after.totalRows}`)
  }
  if (inspected === 0) {
    console.log('  skipped: CRM Parts files were not on disk')
  } else {
    const beforeNew = store.snapshot()
    const newInvoice = [
      persistLine({ source_type: 'PV', invoice_no: 'IMBTAI-NEW-ONLY', invoice_date: '2026-10-31', part_no: 'N1', net_amount: 11 }),
      persistLine({ source_type: 'PV', invoice_no: 'IMBTAI-NEW-ONLY', invoice_date: '2026-10-31', part_no: 'N2', net_amount: 22 }),
    ]
    const added = store.importRows(newInvoice)
    const afterNew = store.snapshot()
    assert.equal(added.newInvoices, 1)
    assert.equal(added.newRows.length, 2)
    assert.equal(afterNew.totalRows, beforeNew.totalRows + 2)
    assert.equal(afterNew.pvInvoices, beforeNew.pvInvoices + 1)
    assert.equal(afterNew.evInvoices, beforeNew.evInvoices)
    console.log(`  after genuine new invoice: rows ${beforeNew.totalRows} -> ${afterNew.totalRows}, PV invoices ${beforeNew.pvInvoices} -> ${afterNew.pvInvoices}, EV invoices ${beforeNew.evInvoices} -> ${afterNew.evInvoices}`)
  }
})

test('normal customer uses branch debtor group and blank GSTIN when source has none', () => {
  const result = transformBusyAccounting({
    labourRows: [labour({ sr_assigned_to: 'PUM_3000840' })],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.preview[0].classification, 'Normal')
  assert.equal(result.preview[0].partyName, 'RAMESH KUMAR-TONK RJ14AB1234')
  assert.equal(result.preview[0].debtorGroup, 'TONK DEBTORS')
  assert.equal(result.preview[0].gstin, '')
  assert.equal(result.partyRows[0].Group, 'TONK DEBTORS')
  assert.equal(result.partyRows[0].GSTIN, '')
})

test('normal customer GSTIN is included only when authoritative source GSTIN exists', () => {
  const withGstin = transformBusyAccounting({
    labourRows: [labour({ gstin: '08ABCDE1234F1Z5' })],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(withGstin.preview[0].gstin, '08ABCDE1234F1Z5')
  assert.equal(withGstin.partyRows[0].GSTIN, '08ABCDE1234F1Z5')

  const inventedRejected = transformBusyAccounting({
    labourRows: [labour({ gstin: 'NOT-A-GSTIN' })],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(inventedRejected.preview[0].gstin, '')
  assert.equal(readAuthoritativeGstin('NOT-A-GSTIN'), '')
  assert.equal(readAuthoritativeGstin(''), '')
})

test('PDI remains CASH AT SITAPURA with Sitapura group and blank GSTIN', () => {
  const result = transformBusyAccounting({
    labourRows: [labour({ sr_type: 'PDI', sr_assigned_to: 'PUM_3000840' })],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.preview[0].partyName, PDI_PARTY_NAME)
  assert.equal(result.preview[0].debtorGroup, 'SERVICE CENTRE DEBTORS 2022-23')
  assert.equal(result.preview[0].gstin, '')
  assert.equal(result.partyRows[0]['Party Name'], PDI_PARTY_NAME)
  assert.equal(result.partyRows[0].GSTIN, '')
})

test('Bodyshop ICICI maps Party Name, BUSY Group, and GSTIN from insurance master', () => {
  const account = 'ICICI LOMBARD GENERAL INSURANCE COMPANY LIMITED C/O PREM CHAND KUMAWAT'
  const mapped = matchBusyInsurance(account)
  assert.equal(mapped.match?.busyGroup, 'ICICI LOMBARD')
  assert.equal(mapped.match?.gstin, '08AAACI7904G1ZN')

  const result = transformBusyAccounting({
    labourRows: [labour({
      account,
      sr_type: 'Accidental Repair',
      first_name: 'PREM',
      last_name: 'KUMAWAT',
    })],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.preview[0].status, 'ready')
  assert.equal(result.preview[0].classification, 'Bodyshop')
  assert.equal(result.preview[0].partyName, 'ICICI LOMBARD PREM CHAND KUMAWAT')
  assert.equal(result.preview[0].debtorGroup, 'ICICI LOMBARD')
  assert.equal(result.preview[0].gstin, '08AAACI7904G1ZN')
  assert.notEqual(result.preview[0].debtorGroup, 'SERVICE CENTRE DEBTORS 2022-23')
  assert.equal(result.partyRows[0].Group, 'ICICI LOMBARD')
  assert.equal(result.partyRows[0].GSTIN, '08AAACI7904G1ZN')
})

test('additional Bodyshop insurers map from INSU.DATA without changing C/O Party Name', () => {
  const cases = [
    {
      account: 'HDFC ERGO GENERAL INSURANCE COMPANY C/O MANOJ KUMAR JAIN',
      party: 'HDFC ERGO MANOJ KUMAR JAIN',
      group: 'HDFC ERGO GIC LTD',
      gstin: '08AABCL5045N1Z8',
    },
    {
      account: 'THE ORIENTAL INSURANCE COMPANY LIMITED C/O ROBIN PRAKASH',
      party: 'THE ORIENTAL ROBIN PRAKASH',
      group: 'ORIENTAL INSURANCE COMPANY',
      gstin: '08AAACT0627R3ZX',
    },
    {
      account: 'TATA AIG GENERAL INSURANCE COMPANY LIMITED C/O KUNAL KHADOLIYA',
      party: 'TATA AIG KUNAL KHADOLIYA',
      group: 'TATA AIG',
      gstin: '08AABCT3518Q1ZW',
    },
  ]
  for (const item of cases) {
    const result = transformBusyAccounting({
      labourRows: [labour({ account: item.account, sr_type: 'Accidental Repair' })],
      partsLines: [],
      fromDate: '2026-09-01',
      toDate: '2026-09-10',
    })
    assert.equal(result.preview[0].partyName, item.party, item.account)
    assert.equal(result.preview[0].debtorGroup, item.group, item.account)
    assert.equal(result.preview[0].gstin, item.gstin, item.account)
    assert.equal(result.summary.unmappedBodyshop, 0)
  }
})

test('unmapped Bodyshop insurer is surfaced and blocked from Party/voucher export', () => {
  const account = 'MAGMA GENERAL INSURANCE COMPANY LIMITED C/O PRAJAPATI DIPAKKUMAR MAGANBHAI'
  const result = transformBusyAccounting({
    labourRows: [labour({ account, sr_type: 'Accidental Repair' })],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.preview[0].status, 'blocked')
  assert.match(result.preview[0].issue, /Unmapped Bodyshop insurance company/)
  assert.equal(result.preview[0].debtorGroup, '')
  assert.equal(result.preview[0].gstin, '')
  assert.notEqual(result.preview[0].debtorGroup, 'SERVICE CENTRE DEBTORS 2022-23')
  assert.equal(result.summary.eligible, 0)
  assert.equal(result.summary.unmappedBodyshop, 1)
  assert.equal(result.partyRows.length, 0)
  assert.equal(result.invoiceRows.length, 0)
})

test('duplicate Party Names still export once after GSTIN addition', () => {
  const result = transformBusyAccounting({
    labourRows: [
      labour({ invoice_number: 'IMBTAI1', job_card_number: 'JC-A', gstin: '08ABCDE1234F1Z5' }),
      labour({ invoice_number: 'IMBTAI2', job_card_number: 'JC-B', gstin: '08ABCDE1234F1Z5' }),
    ],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assert.equal(result.partyRows.length, 1)
  assert.deepEqual(Object.keys(result.partyRows[0]), ['Party Name', 'Group', 'GSTIN'])
})

test('round off uses nearest whole rupee and existing half-up paise convention', () => {
  assert.equal(roundOffToNearestRupee(10823.55), 0.45)
  assert.equal(roundOffToNearestRupee(9003.20), -0.20)
  assert.equal(roundOffToNearestRupee(2719.90), 0.10)
  assert.equal(roundOffToNearestRupee(3090.42), -0.42)
  assert.equal(roundOffToNearestRupee(1180), 0)
  assert.equal(roundOffToNearestRupee(10.50), 0.50)
  assert.equal(roundOffToNearestRupee(11.50), 0.50)
  assert.equal(nearestWholeRupee(10.50), 11)
  assert.equal(nearestWholeRupee(11.50), 12)
  assert.equal(String(roundOffToNearestRupee(10823.55)), '0.45')
})

test('every eligible invoice emits exactly one ROUND OFF row including zero', () => {
  const result = transformBusyAccounting({
    labourRows: [
      labour({ invoice_number: 'IMBTAI1', job_card_number: 'JC-A', final_labour_amount: 10823.55 }),
      labour({ invoice_number: 'IMBTAI2', job_card_number: 'JC-B', final_labour_amount: 9003.20 }),
      labour({ invoice_number: 'IMBTAI3', job_card_number: 'JC-C', final_labour_amount: 1180 }),
    ],
    partsLines: [],
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  })
  assertInvoiceVoucherContract(result)
  const groups = voucherGroups(result.invoiceRows)
  assert.equal(groups.get('IMBTAI1').at(-1).Amount, 0.45)
  assert.equal(groups.get('IMBTAI2').at(-1).Amount, -0.20)
  assert.equal(groups.get('IMBTAI3').at(-1).Amount, 0)
  assert.equal(result.preview.find((row) => row.invoiceNumber === 'IMBTAI1').total, 10824)
  assert.equal(result.preview.find((row) => row.invoiceNumber === 'IMBTAI2').total, 9003)
})

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}

console.log('\nAll BUSY accounting checks passed')
