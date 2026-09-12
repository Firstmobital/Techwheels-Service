#!/usr/bin/env node
/**
 * Practical BUSY GSTIN + ROUND OFF verification against supplied workbooks.
 * Run: node --experimental-strip-types scripts/verify_busy_workbook_corrections.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { matchBusyInsurance } from '../src/lib/busy/insuranceMaster.ts'
import { roundOffToNearestRupee, roundPaise } from '../src/lib/busy/money.ts'
import { parseBodyshopPartyName } from '../src/lib/busy/partyName.ts'
import { transformBusyAccounting } from '../src/lib/busy/transform.ts'
import {
  buildInvoiceVoucherWorkbook,
  buildPartyAccountWorkbook,
  workbookDataRows,
  workbookHeaders,
} from '../src/lib/busy/xlsx.ts'
import { INVOICE_VOUCHER_HEADERS, PARTY_ACCOUNT_HEADERS } from '../src/lib/busy/types.ts'

const SOURCE_VOUCHER = '/Users/apple/Downloads/BUSY_Invoice_Vouchers_2026-09-10_to_2026-09-11 (1).xlsx'
const SOURCE_INSURANCE = '/Users/apple/Downloads/INSU.DATA.xlsx'
const OUT_DIR = '/tmp/busy_corrections_2026-09-12'

if (!existsSync(SOURCE_VOUCHER)) {
  console.error(`Missing source voucher: ${SOURCE_VOUCHER}`)
  process.exit(1)
}
if (!existsSync(SOURCE_INSURANCE)) {
  console.error(`Missing insurance master: ${SOURCE_INSURANCE}`)
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })

function readSheet(path) {
  const workbook = XLSX.read(readFileSync(path))
  const name = workbook.SheetNames[0]
  return XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '', raw: true })
}

const sourceRows = readSheet(SOURCE_VOUCHER)
const insuranceRows = readSheet(SOURCE_INSURANCE)
assert.equal(insuranceRows.length, 19)
assert.deepEqual(Object.keys(insuranceRows[0]), ['INSURANCE CO. NAME', 'GST NUMBER', 'BUSY GROUP'])

const byBill = new Map()
for (const row of sourceRows) {
  const key = String(row['bill no'] ?? '')
  const list = byBill.get(key) ?? []
  list.push(row)
  byBill.set(key, list)
}

const correctedRows = []
for (const [billNo, rows] of byBill) {
  const ordered = []
  const five = rows.filter((row) => row['Item Name'] === 'SPARE PARTS @5%')
  const parts18 = rows.filter((row) => row['Item Name'] === 'SPARE PARTS @18%')
  const labour = rows.filter((row) => row['Item Name'] === 'LABOUR CHARGES @18%')
  assert.equal(parts18.length, 1, `${billNo} missing 18% Parts`)
  assert.equal(labour.length, 1, `${billNo} missing Labour`)
  ordered.push(...five, ...parts18, ...labour)
  const subtotal = roundPaise(ordered.reduce((sum, row) => sum + Number(row.Amount || 0), 0))
  const roundOff = roundOffToNearestRupee(subtotal)
  const template = ordered[0]
  for (const row of ordered) {
    correctedRows.push({
      'Bill date': row['Bill date'],
      'bill no': row['bill no'],
      'Party Name': row['Party Name'],
      'Item Name': row['Item Name'],
      Qty: 0,
      Price: 0,
      Amount: Number(row.Amount || 0),
      naration: row.naration,
    })
  }
  if (roundOff !== 0) {
    correctedRows.push({
      'Bill date': template['Bill date'],
      'bill no': template['bill no'],
      'Party Name': template['Party Name'],
      'Item Name': 'Rounded Off (+)',
      Qty: 0,
      Price: 0,
      Amount: roundOff,
      naration: template.naration,
    })
  }
}

const voucherWb = buildInvoiceVoucherWorkbook(correctedRows)
const voucherPath = join(OUT_DIR, 'BUSY_Invoice_Vouchers_corrected.xlsx')
XLSX.writeFile(voucherWb, voucherPath)

const rereadWb = XLSX.read(readFileSync(voucherPath))
const rereadRows = workbookDataRows(rereadWb)
assert.deepEqual(workbookHeaders(rereadWb), [...INVOICE_VOUCHER_HEADERS])

const rereadByBill = new Map()
for (const row of rereadRows) {
  const key = String(row['bill no'] ?? '')
  const list = rereadByBill.get(key) ?? []
  list.push(row)
  rereadByBill.set(key, list)
}

let missingRoundOff = 0
let duplicateRoundOff = 0
let unexpectedRoundOffOnWhole = 0
let notWholeRupee = 0
let missingParts18 = 0
let missingLabour = 0
let unexpectedParts5 = 0
let signedMismatch = 0

for (const [billNo, rows] of rereadByBill) {
  const items = rows.map((row) => row['Item Name'])
  const parts5 = rows.filter((row) => row['Item Name'] === 'SPARE PARTS @5%')
  const parts18 = rows.filter((row) => row['Item Name'] === 'SPARE PARTS @18%')
  const labour = rows.filter((row) => row['Item Name'] === 'LABOUR CHARGES @18%')
  const roundOff = rows.filter((row) => row['Item Name'] === 'Rounded Off (+)')
  if (parts18.length !== 1) missingParts18 += 1
  if (labour.length !== 1) missingLabour += 1
  if (parts5.length !== 0) unexpectedParts5 += 1

  const subtotal = roundPaise(
    [...parts5, ...parts18, ...labour].reduce((sum, row) => sum + Number(row.Amount || 0), 0),
  )
  const expectedRoundOff = roundOffToNearestRupee(subtotal)
  const needsRoundOff = expectedRoundOff !== 0
  if (needsRoundOff && roundOff.length === 0) missingRoundOff += 1
  if (!needsRoundOff && roundOff.length > 0) unexpectedRoundOffOnWhole += 1
  if (roundOff.length > 1) duplicateRoundOff += 1
  const baseItems = parts5.length > 0
    ? ['SPARE PARTS @5%', 'SPARE PARTS @18%', 'LABOUR CHARGES @18%']
    : ['SPARE PARTS @18%', 'LABOUR CHARGES @18%']
  assert.deepEqual(items, needsRoundOff ? [...baseItems, 'Rounded Off (+)'] : baseItems, billNo)

  const actualRoundOff = needsRoundOff ? Number(roundOff[0]?.Amount ?? NaN) : 0
  if (actualRoundOff !== expectedRoundOff) signedMismatch += 1
  const finalPaise = Math.round(subtotal * 100) + Math.round(actualRoundOff * 100)
  if (finalPaise % 100 !== 0) notWholeRupee += 1

  assert.equal(rows.every((row) => row['Bill date'] === rows[0]['Bill date']), true, billNo)
  assert.equal(rows.every((row) => row['Party Name'] === rows[0]['Party Name']), true, billNo)
  assert.equal(rows.every((row) => row.naration === rows[0].naration), true, billNo)
  assert.equal(rows.every((row) => row.Qty === 0 && row.Price === 0), true, billNo)
}

const reconstructedAccounts = [
  'ICICI LOMBARD GENERAL INSURANCE COMPANY LIMITED C/O PREM CHAND KUMAWAT',
  'HDFC ERGO GENERAL INSURANCE COMPANY C/O MANOJ KUMAR JAIN',
  'HDFC ERGO GENERAL INSURANCE COMPANY C/O AKASH JAIN',
  'THE ORIENTAL INSURANCE COMPANY LIMITED C/O ROBIN PRAKASH',
  'THE ORIENTAL INSURANCE COMPANY LIMITED C/O NAVEEN KUMAR JAIN',
  'TATA AIG GENERAL INSURANCE COMPANY LIMITED C/O KUNAL KHADOLIYA',
  'TATA AIG GENERAL INSURANCE COMPANY LIMITED C/O HEMANT MITTAL',
  'MAGMA GENERAL INSURANCE COMPANY LIMITED C/O PRAJAPATI DIPAKKUMAR MAGANBHAI',
]

const labourRows = reconstructedAccounts.map((account, index) => ({
  invoice_number: `IMBTAI2627009${String(index + 1).padStart(3, '0')}`,
  invoice_date: '2026-09-10',
  account,
  first_name: 'X',
  last_name: 'Y',
  job_card_number: `JC-BS-${index + 1}`,
  vehicle_registration_number: `RJ14BS${String(index + 1).padStart(4, '0')}`,
  sr_type: 'Accidental Repair',
  sr_assigned_to: 'SIT_3000840',
  final_labour_amount: 10823.55,
  invoice_status: 'Active',
  portal: 'PV',
}))

const transform = transformBusyAccounting({
  labourRows,
  partsLines: [],
  fromDate: '2026-09-10',
  toDate: '2026-09-11',
})

const partyPath = join(OUT_DIR, 'BUSY_Party_Accounts_corrected.xlsx')
XLSX.writeFile(buildPartyAccountWorkbook(transform.partyRows), partyPath)
const partyReread = workbookDataRows(XLSX.read(readFileSync(partyPath)))
assert.deepEqual(workbookHeaders(XLSX.read(readFileSync(partyPath))), [...PARTY_ACCOUNT_HEADERS])

const mappingExamples = reconstructedAccounts.map((account) => {
  const insurance = matchBusyInsurance(account)
  const preview = transform.preview.find((row) => row.issue.includes(account) || row.partyName === parseBodyshopPartyName(account))
  return {
    account,
    insurerDetected: insurance.insurerPortion,
    partyName: parseBodyshopPartyName(account),
    busyGroup: insurance.match?.busyGroup ?? null,
    gstin: insurance.match?.gstin ?? null,
    mapped: Boolean(insurance.match),
    previewStatus: preview?.status ?? null,
    previewGroup: preview?.debtorGroup ?? '',
    previewGstin: preview?.gstin ?? '',
  }
})

const report = {
  sourceVoucher: SOURCE_VOUCHER,
  sourceInsurance: SOURCE_INSURANCE,
  generatedVoucher: voucherPath,
  generatedParty: partyPath,
  distinctInvoiceCount: rereadByBill.size,
  invoicesMissingRoundOff: missingRoundOff,
  invoicesWithUnexpectedRoundOffOnWhole: unexpectedRoundOffOnWhole,
  invoicesWithDuplicateRoundOff: duplicateRoundOff,
  invoicesWhoseFinalTotalIsNotWholeRupee: notWholeRupee,
  invoicesMissingParts18: missingParts18,
  invoicesMissingLabour: missingLabour,
  invoicesWithUnexpectedParts5: unexpectedParts5,
  invoicesWithSignedRoundOffMismatch: signedMismatch,
  sourceInvoiceCount: byBill.size,
  sourceRowCount: sourceRows.length,
  correctedRowCount: rereadRows.length,
  bodyshopPartiesWithoutMappedInsurer: transform.summary.unmappedBodyshop,
  mappingExamples,
  partyExportRows: partyReread,
}

assert.equal(report.distinctInvoiceCount, 102)
assert.equal(report.invoicesMissingRoundOff, 0)
assert.equal(report.invoicesWithUnexpectedRoundOffOnWhole, 0)
assert.equal(report.invoicesWithDuplicateRoundOff, 0)
assert.equal(report.invoicesWhoseFinalTotalIsNotWholeRupee, 0)
assert.equal(report.invoicesMissingParts18, 0)
assert.equal(report.invoicesMissingLabour, 0)
assert.equal(report.invoicesWithUnexpectedParts5, 0)
assert.equal(report.invoicesWithSignedRoundOffMismatch, 0)
assert.equal(report.bodyshopPartiesWithoutMappedInsurer, 1)
assert.equal(partyReread.length, 7)
assert.equal(partyReread.every((row) => Object.prototype.hasOwnProperty.call(row, 'GSTIN')), true)

const reportPath = join(OUT_DIR, 'busy_corrections_report.json')
writeFileSync(reportPath, JSON.stringify(report, null, 2))

console.log('PASS  practical workbook re-read')
console.log(JSON.stringify({
  distinctInvoiceCount: report.distinctInvoiceCount,
  invoicesMissingRoundOff: report.invoicesMissingRoundOff,
  invoicesWithUnexpectedRoundOffOnWhole: report.invoicesWithUnexpectedRoundOffOnWhole,
  invoicesWithDuplicateRoundOff: report.invoicesWithDuplicateRoundOff,
  invoicesWhoseFinalTotalIsNotWholeRupee: report.invoicesWhoseFinalTotalIsNotWholeRupee,
  bodyshopPartiesWithoutMappedInsurer: report.bodyshopPartiesWithoutMappedInsurer,
  generatedVoucher: report.generatedVoucher,
  generatedParty: report.generatedParty,
  reportPath,
}, null, 2))
console.log('\nInsurance mapping examples:')
for (const example of mappingExamples) {
  console.log(`  ${example.mapped ? 'MAPPED' : 'UNMAPPED'}  ${example.partyName}`)
  console.log(`    Group=${example.busyGroup ?? '—'}  GSTIN=${example.gstin ?? '—'}`)
}
