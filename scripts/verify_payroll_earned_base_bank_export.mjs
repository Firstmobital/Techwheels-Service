#!/usr/bin/env node
/** Mirrors src/lib/payroll/excelUtils.ts earned-base card bank payout helpers. */

const EARNED_BASE_COMPANY_ACCOUNT = '39169685030'
const TECHNICIAN_COMPANY_ACCOUNT = '39171760445'

function isSbiBank(bank) {
  const bankName = String(bank?.bankName ?? '').trim().toUpperCase()
  const ifsc = String(bank?.ifsc ?? '').trim().toUpperCase()
  return bankName.includes('STATE BANK OF INDIA') || bankName === 'SBI' || ifsc.startsWith('SBIN')
}

function isExportableNetPayable(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount !== 0
}

function buildEarnedBaseBankPayoutRows(rows) {
  return rows
    .filter((row) => isExportableNetPayable(row.netPayable))
    .map((row, index) => {
      const amount = Number(row.netPayable)
      return [
        '300971',
        'FIRST MOBITAL PRIVATE LIMITED',
        EARNED_BASE_COMPANY_ACCOUNT,
        isSbiBank({ bankName: row.bankName, ifsc: row.ifsc }) ? 'DCR' : 'NEFT',
        row.employeeName,
        String(row.accountNumber ?? '').trim(),
        String(row.ifsc ?? '').trim().toUpperCase(),
        amount,
        `SALARY${index + 1}`,
        'INR',
        'JAIPUR',
        'SHRUTI@INDIRASWITCH.COM',
        'E',
      ]
    })
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

const scopedEntries = [
  { employeeName: 'A', bankName: 'HDFC', accountNumber: '001234', ifsc: 'HDFC0001234', earnedBase: 16000, netPayable: 15000 },
  { employeeName: 'B', bankName: null, accountNumber: null, ifsc: null, earnedBase: 16000, netPayable: 0 },
  { employeeName: 'C', bankName: 'SBI', accountNumber: '00000039975234227', ifsc: 'sbin0032155', earnedBase: 16000, netPayable: 12000 },
]

const cardEarnedBaseTotal = scopedEntries.reduce((sum, row) => sum + Number(row.earnedBase), 0)
const rows = buildEarnedBaseBankPayoutRows(scopedEntries)
const exportedSum = rows.reduce((sum, row) => sum + Number(row[7]), 0)
const eligibleNetSum = scopedEntries
  .filter((row) => isExportableNetPayable(row.netPayable))
  .reduce((sum, row) => sum + Number(row.netPayable), 0)

const gapCase = buildEarnedBaseBankPayoutRows([
  { employeeName: 'A', bankName: 'PNB', accountNumber: '1', ifsc: 'PUNB0113310', netPayable: 10000 },
  { employeeName: 'B', bankName: 'SBI', accountNumber: '', ifsc: '', netPayable: 0 },
  { employeeName: 'C', bankName: 'PNB', accountNumber: '2', ifsc: 'PUNB0113310', netPayable: 12000 },
])

const tests = [
  { name: 'SBI by exact bank name', got: isSbiBank({ bankName: 'SBI', ifsc: 'HDFC0001234' }), want: true },
  { name: 'SBI by full bank name', got: isSbiBank({ bankName: 'State Bank of India - Sitapura', ifsc: '' }), want: true },
  { name: 'SBI by IFSC prefix', got: isSbiBank({ bankName: 'Other', ifsc: 'SBIN0061319' }), want: true },
  { name: 'non-SBI is NEFT', got: isSbiBank({ bankName: 'PNB', ifsc: 'PUNB0113310' }), want: false },
  { name: 'Amount uses net_payable not earned_base', got: rows[0][7], want: 15000 },
  { name: 'zero net_payable row is excluded', got: rows.map((row) => row[4]), want: ['A', 'C'] },
  { name: 'zero-net missing bank does not appear', got: rows.some((row) => row[4] === 'B'), want: false },
  { name: 'SBI non-zero is DCR', got: rows[1][3], want: 'DCR' },
  { name: 'non-SBI non-zero is NEFT', got: rows[0][3], want: 'NEFT' },
  { name: 'company account is base-salary account', got: rows[0][2], want: EARNED_BASE_COMPANY_ACCOUNT },
  { name: 'does not reuse technician account', got: rows.every((row) => row[2] !== TECHNICIAN_COMPANY_ACCOUNT), want: true },
  { name: 'leading zeros preserved as text value', got: rows[1][5], want: '00000039975234227' },
  { name: 'IFSC uppercased', got: rows[1][6], want: 'SBIN0032155' },
  { name: 'SALARY IDs assigned after zero filter with no gap', got: gapCase.map((row) => [row[4], row[8]]), want: [['A', 'SALARY1'], ['C', 'SALARY2']] },
  { name: 'SUM(Amount) == SUM(eligible net_payable)', got: exportedSum, want: eligibleNetSum },
  { name: 'SUM(Amount) is not required to equal Earned Base Total', got: exportedSum === cardEarnedBaseTotal, want: false },
  { name: 'filename Sept2026', got: bankBaseSalaryFilename('2026-09'), want: 'Bank_BaseSalary_Sept2026.xlsx' },
  { name: 'filename Aug2026', got: bankBaseSalaryFilename('2026-08'), want: 'Bank_BaseSalary_Aug2026.xlsx' },
  { name: 'static Code', got: rows[0][0], want: '300971' },
  { name: 'static Currency City Contact', got: [rows[0][9], rows[0][10], rows[0][11], rows[0][12]], want: ['INR', 'JAIPUR', 'SHRUTI@INDIRASWITCH.COM', 'E'] },
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
process.exit(failed > 0 ? 1 : 0)
