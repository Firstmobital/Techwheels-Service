#!/usr/bin/env node
/** Mirrors src/lib/payroll/excelUtils.ts earned-base bank payout helpers. */

const EARNED_BASE_COMPANY_ACCOUNT = '39169685030'
const TECHNICIAN_COMPANY_ACCOUNT = '39171760445'

function isSbiBank(bank) {
  const bankName = String(bank?.bankName ?? '').trim().toUpperCase()
  const ifsc = String(bank?.ifsc ?? '').trim().toUpperCase()
  return bankName.includes('STATE BANK OF INDIA') || bankName === 'SBI' || ifsc.startsWith('SBIN')
}

function buildEarnedBaseBankPayoutRows(rows) {
  return rows.map((row, index) => {
    const earnedBase = Number(row.earnedBase)
    const amount = Number.isFinite(earnedBase) ? earnedBase : 0
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
  { employeeName: 'A', bankName: 'HDFC', accountNumber: '001234', ifsc: 'HDFC0001234', earnedBase: 16000, netPayable: 9000, baseSalary: 28000 },
  { employeeName: 'B', bankName: 'SBI', accountNumber: '00000039975234227', ifsc: 'sbin0032155', earnedBase: 0, netPayable: 5000, baseSalary: 22000 },
  { employeeName: 'C', bankName: null, accountNumber: null, ifsc: null, earnedBase: 27067, netPayable: 0, baseSalary: 27067 },
]

const cardTotal = scopedEntries.reduce((sum, row) => sum + Number(row.earnedBase), 0)
const rows = buildEarnedBaseBankPayoutRows(scopedEntries)
const exportedSum = rows.reduce((sum, row) => sum + Number(row[7]), 0)

const tests = [
  { name: 'SBI by exact bank name', got: isSbiBank({ bankName: 'SBI', ifsc: 'HDFC0001234' }), want: true },
  { name: 'SBI by full bank name', got: isSbiBank({ bankName: 'State Bank of India - Sitapura', ifsc: '' }), want: true },
  { name: 'SBI by IFSC prefix', got: isSbiBank({ bankName: 'Other', ifsc: 'SBIN0061319' }), want: true },
  { name: 'non-SBI is NEFT', got: isSbiBank({ bankName: 'PNB', ifsc: 'PUNB0113310' }), want: false },
  { name: 'row0 Type NEFT', got: rows[0][3], want: 'NEFT' },
  { name: 'row1 Type DCR', got: rows[1][3], want: 'DCR' },
  { name: 'company account is base-salary account', got: rows[0][2], want: EARNED_BASE_COMPANY_ACCOUNT },
  { name: 'does not reuse technician account', got: rows.every((row) => row[2] !== TECHNICIAN_COMPANY_ACCOUNT), want: true },
  { name: 'Amount uses earned_base not net or configured salary', got: rows[0][7], want: 16000 },
  { name: 'zero earned_base row is kept', got: rows[1][7], want: 0 },
  { name: 'missing bank fields stay as empty strings', got: rows[2][5] === '' && rows[2][6] === '', want: true },
  { name: 'leading zeros preserved as text value', got: rows[1][5], want: '00000039975234227' },
  { name: 'IFSC uppercased', got: rows[1][6], want: 'SBIN0032155' },
  { name: 'ID sequence restarts at SALARY1', got: rows.map((row) => row[8]), want: ['SALARY1', 'SALARY2', 'SALARY3'] },
  { name: 'SUM(Amount) == Earned Base Total', got: exportedSum, want: cardTotal },
  { name: 'row count matches scoped card rows', got: rows.length, want: scopedEntries.length },
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
