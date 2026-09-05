#!/usr/bin/env node
/** Mirrors src/lib/payroll/excelUtils.ts payroll card bank payout helpers. */

const EARNED_BASE_COMPANY_ACCOUNT = '39169685030'
const TECHNICIAN_COMPANY_ACCOUNT = '39171760445'

const EARNED_BASE_BANK_PAYOUT_HEADERS = [
  'Code',
  'Dealer Name',
  'Account',
  'Type',
  'Employee Name',
  'Bank Account Number',
  'IFSC Code',
  'Amount',
  'ID',
  'Currency',
  'City',
  'Contact',
  'Contact Code',
]

function isSbiBank(bank) {
  const bankName = String(bank?.bankName ?? '').trim().toUpperCase()
  const ifsc = String(bank?.ifsc ?? '').trim().toUpperCase()
  return bankName.includes('STATE BANK OF INDIA') || bankName === 'SBI' || ifsc.startsWith('SBIN')
}

function formatPayrollBankPayoutRow(row, index) {
  return [
    '300971',
    'FIRST MOBITAL PRIVATE LIMITED',
    EARNED_BASE_COMPANY_ACCOUNT,
    isSbiBank({ bankName: row.bankName, ifsc: row.ifsc }) ? 'DCR' : 'NEFT',
    row.employeeName,
    String(row.accountNumber ?? '').trim(),
    String(row.ifsc ?? '').trim().toUpperCase(),
    row.amount,
    `SALARY${index + 1}`,
    'INR',
    'JAIPUR',
    'SHRUTI@INDIRASWITCH.COM',
    'E',
  ]
}

function buildPayrollBankPayoutRows(rows) {
  return rows
    .filter((row) => {
      const amount = Number(row.amount)
      return Number.isFinite(amount) && amount > 0
    })
    .map((row, index) => formatPayrollBankPayoutRow({
      employeeName: row.employeeName,
      bankName: row.bankName,
      accountNumber: row.accountNumber,
      ifsc: row.ifsc,
      amount: Number(row.amount),
    }, index))
}

function isEligibleEarnedBaseBankPayoutRow(row) {
  const amount = Number(row.netPayable)
  return row.salaryType === 'base' && Number.isFinite(amount) && amount > 0
}

function buildEarnedBaseBankPayoutRows(rows) {
  return buildPayrollBankPayoutRows(
    rows
      .filter((row) => isEligibleEarnedBaseBankPayoutRow(row))
      .map((row) => ({
        employeeName: row.employeeName,
        bankName: row.bankName,
        accountNumber: row.accountNumber,
        ifsc: row.ifsc,
        amount: Number(row.netPayable),
      })),
  )
}

function exportPayrollBankCsv({ entries, amountSelector, rowPredicate, resolvePayee }) {
  return buildPayrollBankPayoutRows(
    entries
      .filter((entry) => (rowPredicate ? rowPredicate(entry) : true))
      .map((entry) => ({
        ...resolvePayee(entry),
        amount: Number(amountSelector(entry)),
      })),
  )
}

const BANK_BASE_SALARY_MONTH_ABBREV = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
]

function bankBaseSalaryFilename(monthInput) {
  const [yearRaw, monthRaw] = String(monthInput ?? '').split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || month < 1 || month > 12) {
    return `Bank_BaseSalary_${monthInput || 'unknown'}.xlsx`
  }
  return `Bank_BaseSalary_${BANK_BASE_SALARY_MONTH_ABBREV[month - 1]}${year}.xlsx`
}

function payrollCardExportFilename(slug, monthInput) {
  const [yearRaw, monthRaw] = String(monthInput ?? '').split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || month < 1 || month > 12) {
    return `payroll-${slug}-${monthInput || 'unknown'}.xlsx`
  }
  return `payroll-${slug}-${yearRaw}-${String(month).padStart(2, '0')}.xlsx`
}

function resolvePayee(entry) {
  return {
    employeeName: entry.employeeName,
    bankName: entry.bankName,
    accountNumber: entry.accountNumber,
    ifsc: entry.ifsc,
  }
}

const allSalaryTypesScope = [
  { employeeName: 'A', salaryType: 'base', bankName: 'HDFC', accountNumber: '001234', ifsc: 'HDFC0001234', earnedBase: 16500, netPayable: 16500, grossPayout: 17000, advanceDeduction: 500, saVariable: 0, technicianVariable: 0, bodyshopVariable: 0 },
  { employeeName: 'B', salaryType: 'variable', bankName: null, accountNumber: null, ifsc: null, earnedBase: 0, netPayable: 12899, grossPayout: 12899, advanceDeduction: 0, saVariable: 8000, technicianVariable: 0, bodyshopVariable: 4899 },
  { employeeName: 'C', salaryType: 'base', bankName: 'SBI', accountNumber: '00000039975234227', ifsc: 'sbin0032155', earnedBase: 20000, netPayable: 18000, grossPayout: 20000, advanceDeduction: 2000, saVariable: 0, technicianVariable: 0, bodyshopVariable: 0 },
  { employeeName: 'D', salaryType: 'base', bankName: 'PNB', accountNumber: '2', ifsc: 'PUNB0113310', earnedBase: 20150, netPayable: 0, grossPayout: 0, advanceDeduction: 0, saVariable: 0, technicianVariable: 0, bodyshopVariable: 0 },
  { employeeName: 'E', salaryType: 'variable', bankName: 'SBI', accountNumber: '', ifsc: '', earnedBase: 0, netPayable: 6284, grossPayout: 6284, advanceDeduction: 0, saVariable: 0, technicianVariable: 6284, bodyshopVariable: 0 },
  { employeeName: 'F', salaryType: 'both', bankName: 'HDFC', accountNumber: '99', ifsc: 'HDFC0001234', earnedBase: 10000, netPayable: 9000, grossPayout: 11000, advanceDeduction: 2000, saVariable: 1000, technicianVariable: 0, bodyshopVariable: 0 },
]

const rows = buildEarnedBaseBankPayoutRows(allSalaryTypesScope)
const exportedSum = rows.reduce((sum, row) => sum + Number(row[7]), 0)
const eligibleNetSum = allSalaryTypesScope
  .filter((row) => isEligibleEarnedBaseBankPayoutRow(row))
  .reduce((sum, row) => sum + Number(row.netPayable), 0)

const employeesExport = exportPayrollBankCsv({
  entries: allSalaryTypesScope,
  amountSelector: (entry) => Number(entry.netPayable),
  resolvePayee,
})
const grossExport = exportPayrollBankCsv({
  entries: allSalaryTypesScope,
  amountSelector: (entry) => Number(entry.grossPayout),
  resolvePayee,
})
const advanceExport = exportPayrollBankCsv({
  entries: allSalaryTypesScope,
  amountSelector: (entry) => Number(entry.advanceDeduction),
  resolvePayee,
})
const bodyshopExport = exportPayrollBankCsv({
  entries: allSalaryTypesScope,
  amountSelector: (entry) => Number(entry.bodyshopVariable),
  resolvePayee,
})
const saExport = exportPayrollBankCsv({
  entries: allSalaryTypesScope,
  amountSelector: (entry) => Number(entry.saVariable),
  resolvePayee,
})
const technicianExport = exportPayrollBankCsv({
  entries: allSalaryTypesScope,
  amountSelector: (entry) => Number(entry.technicianVariable),
  resolvePayee,
})
const netExport = exportPayrollBankCsv({
  entries: allSalaryTypesScope,
  amountSelector: (entry) => Number(entry.netPayable),
  resolvePayee,
})
const earnedBaseViaShared = exportPayrollBankCsv({
  entries: allSalaryTypesScope,
  amountSelector: (entry) => Number(entry.netPayable),
  rowPredicate: (entry) => isEligibleEarnedBaseBankPayoutRow(entry),
  resolvePayee,
})

const bodyshopTrackerTotal = 15000
const bodyshopMappedPayroll = allSalaryTypesScope.reduce((sum, row) => sum + Number(row.bodyshopVariable), 0)
const bodyshopUnmapped = Math.round((bodyshopTrackerTotal - bodyshopMappedPayroll) * 100) / 100
const bodyshopExportTotal = bodyshopExport.reduce((sum, row) => sum + Number(row[7]), 0)

function amountSum(exportRows) {
  return exportRows.reduce((sum, row) => sum + Number(row[7]), 0)
}

function names(exportRows) {
  return exportRows.map((row) => row[4])
}

function sameSchema(exportRows) {
  return exportRows.every((row) => (
    row.length === EARNED_BASE_BANK_PAYOUT_HEADERS.length
    && row[0] === '300971'
    && row[1] === 'FIRST MOBITAL PRIVATE LIMITED'
    && row[2] === EARNED_BASE_COMPANY_ACCOUNT
    && row[9] === 'INR'
    && row[10] === 'JAIPUR'
    && row[11] === 'SHRUTI@INDIRASWITCH.COM'
    && row[12] === 'E'
  ))
}

const tests = [
  { name: 'SBI by exact bank name', got: isSbiBank({ bankName: 'SBI', ifsc: 'HDFC0001234' }), want: true },
  { name: 'SBI by IFSC prefix', got: isSbiBank({ bankName: 'Other', ifsc: 'SBIN0061319' }), want: true },
  { name: 'non-SBI is NEFT', got: isSbiBank({ bankName: 'PNB', ifsc: 'PUNB0113310' }), want: false },
  { name: 'base + net 16500 included with Amount 16500', got: rows[0][4] === 'A' && rows[0][7] === 16500, want: true },
  { name: 'base + earned 20000 net 18000 Amount is net', got: rows.find((row) => row[4] === 'C')?.[7], want: 18000 },
  { name: 'variable + net 12899 excluded', got: rows.some((row) => row[4] === 'B'), want: false },
  { name: 'variable + net 6284 excluded', got: rows.some((row) => row[4] === 'E'), want: false },
  { name: 'both + net 9000 excluded', got: rows.some((row) => row[4] === 'F'), want: false },
  { name: 'base + net 0 excluded', got: rows.some((row) => row[4] === 'D'), want: false },
  { name: 'All salary types still exports only base', got: rows.map((row) => row[4]), want: ['A', 'C'] },
  { name: 'SALARY IDs continuous after mixed filter', got: rows.map((row) => [row[4], row[8]]), want: [['A', 'SALARY1'], ['C', 'SALARY2']] },
  { name: 'SBI eligible is DCR', got: rows.find((row) => row[4] === 'C')?.[3], want: 'DCR' },
  { name: 'non-SBI eligible is NEFT', got: rows.find((row) => row[4] === 'A')?.[3], want: 'NEFT' },
  { name: 'company account is base-salary account', got: rows[0][2], want: EARNED_BASE_COMPANY_ACCOUNT },
  { name: 'does not reuse technician account', got: rows.every((row) => row[2] !== TECHNICIAN_COMPANY_ACCOUNT), want: true },
  { name: 'leading zeros preserved as text value', got: rows.find((row) => row[4] === 'C')?.[5], want: '00000039975234227' },
  { name: 'variable missing bank does not appear or block', got: rows.length === 2, want: true },
  { name: 'SUM(Amount) == SUM(eligible base net_payable)', got: exportedSum, want: eligibleNetSum },
  { name: 'filename Sept2026', got: bankBaseSalaryFilename('2026-09'), want: 'Bank_BaseSalary_Sept2026.xlsx' },
  { name: 'static Code', got: rows[0][0], want: '300971' },
  { name: 'shared exporter preserves earned-base rows', got: earnedBaseViaShared, want: rows },
  { name: 'header field order unchanged', got: EARNED_BASE_BANK_PAYOUT_HEADERS, want: [
    'Code', 'Dealer Name', 'Account', 'Type', 'Employee Name', 'Bank Account Number',
    'IFSC Code', 'Amount', 'ID', 'Currency', 'City', 'Contact', 'Contact Code',
  ] },
  { name: 'Total Employees excludes net 0', got: names(employeesExport), want: ['A', 'B', 'C', 'E', 'F'] },
  { name: 'Total Employees Amount is net', got: employeesExport.find((row) => row[4] === 'C')?.[7], want: 18000 },
  { name: 'Total Employees amount sum', got: amountSum(employeesExport), want: 16500 + 12899 + 18000 + 6284 + 9000 },
  { name: 'Total Gross excludes 0', got: names(grossExport), want: ['A', 'B', 'C', 'E', 'F'] },
  { name: 'Total Gross amount sum', got: amountSum(grossExport), want: 17000 + 12899 + 20000 + 6284 + 11000 },
  { name: 'Advance excludes 0', got: names(advanceExport), want: ['A', 'C', 'F'] },
  { name: 'Advance amount sum', got: amountSum(advanceExport), want: 500 + 2000 + 2000 },
  { name: 'Bodyshop exports only mapped > 0', got: names(bodyshopExport), want: ['B'] },
  { name: 'Bodyshop Amount is payroll snapshot', got: bodyshopExport[0]?.[7], want: 4899 },
  { name: 'Bodyshop export does not include unmapped', got: bodyshopExportTotal, want: bodyshopMappedPayroll },
  { name: 'Bodyshop tracker exceeds export when unmapped exists', got: bodyshopTrackerTotal > bodyshopExportTotal && bodyshopUnmapped === 10101, want: true },
  { name: 'SA Variable excludes 0', got: names(saExport), want: ['B', 'F'] },
  { name: 'SA Variable amount sum', got: amountSum(saExport), want: 8000 + 1000 },
  { name: 'Technician Variable excludes 0', got: names(technicianExport), want: ['E'] },
  { name: 'Technician Variable amount sum', got: amountSum(technicianExport), want: 6284 },
  { name: 'Net Payable excludes 0', got: names(netExport), want: ['A', 'B', 'C', 'E', 'F'] },
  { name: 'Net Payable amount sum', got: amountSum(netExport), want: 16500 + 12899 + 18000 + 6284 + 9000 },
  { name: 'zero amounts never exported', got: [
    ...employeesExport, ...grossExport, ...advanceExport, ...bodyshopExport,
    ...saExport, ...technicianExport, ...netExport, ...rows,
  ].every((row) => Number(row[7]) > 0), want: true },
  { name: 'all card exports share schema', got: [
    employeesExport, grossExport, advanceExport, bodyshopExport,
    saExport, technicianExport, netExport, rows,
  ].every(sameSchema), want: true },
  { name: 'employee appears once in Gross', got: new Set(names(grossExport)).size, want: grossExport.length },
  { name: 'filename total-gross', got: payrollCardExportFilename('total-gross', '2026-09'), want: 'payroll-total-gross-2026-09.xlsx' },
  { name: 'filename advance-deducted', got: payrollCardExportFilename('advance-deducted', '2026-09'), want: 'payroll-advance-deducted-2026-09.xlsx' },
  { name: 'filename bodyshop-variable', got: payrollCardExportFilename('bodyshop-variable', '2026-09'), want: 'payroll-bodyshop-variable-2026-09.xlsx' },
  { name: 'filename sa-variable', got: payrollCardExportFilename('sa-variable', '2026-09'), want: 'payroll-sa-variable-2026-09.xlsx' },
  { name: 'filename technician-variable', got: payrollCardExportFilename('technician-variable', '2026-09'), want: 'payroll-technician-variable-2026-09.xlsx' },
  { name: 'filename net-payable', got: payrollCardExportFilename('net-payable', '2026-09'), want: 'payroll-net-payable-2026-09.xlsx' },
  { name: 'filename total-employees', got: payrollCardExportFilename('total-employees', '2026-09'), want: 'payroll-total-employees-2026-09.xlsx' },
]

let failed = 0
for (const t of tests) {
  const ok = JSON.stringify(t.got) === JSON.stringify(t.want)
  if (!ok) {
    console.error(`FAIL ${t.name}`)
    console.error(' got ', t.got)
    console.error(' want', t.want)
    failed += 1
  } else {
    console.log(`PASS ${t.name}`)
  }
}

console.log(`Bodyshop Tracker total: ${bodyshopTrackerTotal}`)
console.log(`Mapped payroll Bodyshop amount: ${bodyshopMappedPayroll}`)
console.log(`Unmapped amount: ${bodyshopUnmapped}`)
console.log(`Export amount: ${bodyshopExportTotal}`)

process.exit(failed > 0 ? 1 : 0)
