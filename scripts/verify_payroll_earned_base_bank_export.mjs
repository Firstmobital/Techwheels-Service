#!/usr/bin/env node
/** Mirrors src/lib/payroll/excelUtils.ts earned-base card bank payout helpers. */

const EARNED_BASE_COMPANY_ACCOUNT = '39169685030'
const TECHNICIAN_COMPANY_ACCOUNT = '39171760445'

function isSbiBank(bank) {
  const bankName = String(bank?.bankName ?? '').trim().toUpperCase()
  const ifsc = String(bank?.ifsc ?? '').trim().toUpperCase()
  return bankName.includes('STATE BANK OF INDIA') || bankName === 'SBI' || ifsc.startsWith('SBIN')
}

function isEligibleEarnedBaseBankPayoutRow(row) {
  const amount = Number(row.netPayable)
  return row.salaryType === 'base' && Number.isFinite(amount) && amount > 0
}

function buildEarnedBaseBankPayoutRows(rows) {
  return rows
    .filter((row) => isEligibleEarnedBaseBankPayoutRow(row))
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

const allSalaryTypesScope = [
  { employeeName: 'A', salaryType: 'base', bankName: 'HDFC', accountNumber: '001234', ifsc: 'HDFC0001234', earnedBase: 16500, netPayable: 16500 },
  { employeeName: 'B', salaryType: 'variable', bankName: null, accountNumber: null, ifsc: null, earnedBase: 0, netPayable: 12899 },
  { employeeName: 'C', salaryType: 'base', bankName: 'SBI', accountNumber: '00000039975234227', ifsc: 'sbin0032155', earnedBase: 20000, netPayable: 18000 },
  { employeeName: 'D', salaryType: 'base', bankName: 'PNB', accountNumber: '2', ifsc: 'PUNB0113310', earnedBase: 20150, netPayable: 0 },
  { employeeName: 'E', salaryType: 'variable', bankName: 'SBI', accountNumber: '', ifsc: '', earnedBase: 0, netPayable: 6284 },
  { employeeName: 'F', salaryType: 'both', bankName: 'HDFC', accountNumber: '99', ifsc: 'HDFC0001234', earnedBase: 10000, netPayable: 9000 },
]

const rows = buildEarnedBaseBankPayoutRows(allSalaryTypesScope)
const exportedSum = rows.reduce((sum, row) => sum + Number(row[7]), 0)
const eligibleNetSum = allSalaryTypesScope
  .filter((row) => isEligibleEarnedBaseBankPayoutRow(row))
  .reduce((sum, row) => sum + Number(row.netPayable), 0)

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
