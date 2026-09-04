import * as XLSX from 'xlsx'
import type { ImportPreviewResult, ImportPreviewRow, SalaryType } from './types'
import { isValidPayableDays, isValidSalaryType, normalizeSalaryTypeInput, parsePayrollMonthInput } from './calculations'

export function normalizeHeader(value: string): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export function readWorkbookRows(file: File): Promise<Array<Record<string, string>>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: false, raw: false })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
        const rows = json.map((row) => {
          const out: Record<string, string> = {}
          Object.entries(row).forEach(([key, val]) => {
            out[normalizeHeader(key)] = String(val ?? '').trim()
          })
          return out
        })
        resolve(rows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

export function exportWorkbook(sheetName: string, headers: string[], rows: unknown[][], filename: string) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  if (headers.some((h) => /account|bank/i.test(h))) {
    ws['!cols'] = headers.map(() => ({ wch: 22 }))
  }
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

export const EARNED_BASE_BANK_PAYOUT_HEADERS = [
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
] as const

export const EARNED_BASE_BANK_PAYOUT_TEXT_COLUMNS = [0, 2, 5, 6]

/** Company payout account for base-salary bank import. Do not reuse technician earnings account 39171760445. */
export const EARNED_BASE_COMPANY_ACCOUNT = '39169685030'

export type SbiBankInput = {
  bankName?: string | null
  ifsc?: string | null
}

/** Same SBI rule as supabase/functions/_shared/bankPayoutExcel.ts isSbiBank. */
export function isSbiBank(bank: SbiBankInput | undefined): boolean {
  const bankName = String(bank?.bankName ?? '').trim().toUpperCase()
  const ifsc = String(bank?.ifsc ?? '').trim().toUpperCase()
  return bankName.includes('STATE BANK OF INDIA') || bankName === 'SBI' || ifsc.startsWith('SBIN')
}

export type EarnedBaseBankPayoutInput = {
  employeeName: string
  bankName?: string | null
  accountNumber?: string | null
  ifsc?: string | null
  netPayable: number
  salaryType: SalaryType
}

/** Base Salary payout only. Do not use salaryTypeIncludesBase. */
export function isEligibleEarnedBaseBankPayoutRow(row: {
  salaryType?: string | null
  netPayable: unknown
}): boolean {
  const amount = Number(row.netPayable)
  return row.salaryType === 'base' && Number.isFinite(amount) && amount > 0
}

export function buildEarnedBaseBankPayoutRows(
  rows: EarnedBaseBankPayoutInput[],
): Array<Array<string | number>> {
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
] as const

export function bankBaseSalaryFilename(monthInput: string): string {
  const [yearRaw, monthRaw] = String(monthInput ?? '').split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || month < 1 || month > 12) {
    return `Bank_BaseSalary_${monthInput || 'unknown'}.xlsx`
  }
  return `Bank_BaseSalary_${BANK_BASE_SALARY_MONTH_ABBREV[month - 1]}${year}.xlsx`
}

/** Force text cells for bank account columns in export. */
export function exportWorkbookWithTextAccounts(
  sheetName: string,
  headers: string[],
  rows: unknown[][],
  filename: string,
  textColumnIndexes: number[],
) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let r = 1; r <= range.e.r; r += 1) {
    textColumnIndexes.forEach((c) => {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = ws[addr] ?? { t: 's', v: '' }
      cell.t = 's'
      cell.v = String(cell.v ?? '')
      cell.z = '@'
      ws[addr] = cell
    })
  }
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

export function isUnsafeBankAccount(value: string): boolean {
  if (!value) return false
  if (/e\+/i.test(value) || /e-/i.test(value)) return true
  if (/^\d+\.\d+$/.test(value)) return true
  return false
}

export function validateIfsc(value: string): boolean {
  const v = String(value ?? '').trim().toUpperCase()
  if (!v) return true
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v)
}

export interface AttendanceImportContext {
  payrollMonth: string
  knownCodes: Set<string>
  existing: Map<string, { payable_days: number; notes: string | null }>
}

export function previewAttendanceImport(
  rows: Array<Record<string, string>>,
  ctx: AttendanceImportContext,
): ImportPreviewResult {
  const previewRows: ImportPreviewRow[] = []
  const seenCodes = new Set<string>()
  let valid = 0
  let updates = 0
  let unchanged = 0
  let warnings = 0
  let rejected = 0

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2
    const code = String(row.employee_code ?? row.sa_code ?? '').trim().toUpperCase()
    const monthRaw = row.payroll_month ?? row.month ?? ctx.payrollMonth
    const month = parsePayrollMonthInput(monthRaw) ?? ctx.payrollMonth
    const payableRaw = row.payable_days ?? row.payable_days_ ?? row.days ?? ''
    const payableDays = Number(payableRaw)
    const notes = row.notes ?? null

    if (!code) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: '', status: 'rejected', message: 'Missing employee code' })
      return
    }
    if (seenCodes.has(code)) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: 'Duplicate employee code in file' })
      return
    }
    seenCodes.add(code)

    if (!ctx.knownCodes.has(code)) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: 'Unknown employee code' })
      return
    }
    if (month !== ctx.payrollMonth) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: `Payroll month mismatch: expected ${ctx.payrollMonth}` })
      return
    }
    if (!isValidPayableDays(payableDays)) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: 'Payable days must be 0–30 in 0.5 increments' })
      return
    }

    const existing = ctx.existing.get(code)
    if (existing && existing.payable_days === payableDays && (existing.notes ?? '') === (notes ?? '')) {
      unchanged += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'unchanged', message: 'No changes' })
      return
    }

    if (existing) updates += 1
    else valid += 1
    previewRows.push({
      rowNumber,
      employeeCode: code,
      status: 'valid',
      message: existing ? 'Update' : 'New row',
      data: { payable_days: payableDays, notes },
    })
  })

  return {
    totalRows: rows.length,
    valid,
    updates,
    unchanged,
    warnings,
    rejected,
    rows: previewRows,
  }
}

export interface SalaryTypeImportContext {
  knownCodes: Set<string>
  existing: Map<string, { base_salary: number; salary_type: SalaryType }>
}

export function previewSalaryTypeImport(
  rows: Array<Record<string, string>>,
  ctx: SalaryTypeImportContext,
): ImportPreviewResult {
  const previewRows: ImportPreviewRow[] = []
  const seenCodes = new Set<string>()
  let valid = 0
  let updates = 0
  let unchanged = 0
  let warnings = 0
  let rejected = 0

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2
    const code = String(row.employee_code ?? row.sa_code ?? '').trim().toUpperCase()
    const baseSalary = Number(row.base_salary ?? row.base ?? '')
    const salaryTypeRaw = row.salary_type ?? row.salarytype ?? ''
    const salaryType = normalizeSalaryTypeInput(salaryTypeRaw)
    const accountNumber = String(row.bank_account_number ?? row.account_number ?? '').trim()
    const ifsc = String(row.ifsc ?? row.ifsc_code ?? '').trim().toUpperCase()

    if (!code) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: '', status: 'rejected', message: 'Missing employee code' })
      return
    }
    if (seenCodes.has(code)) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: 'Duplicate employee code in file' })
      return
    }
    seenCodes.add(code)

    if (!ctx.knownCodes.has(code)) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: 'Unknown employee code' })
      return
    }
    if (!Number.isFinite(baseSalary) || baseSalary < 0) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: 'Invalid base salary' })
      return
    }
    if (!salaryType || !isValidSalaryType(salaryType)) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: 'Invalid salary type (base, variable, both)' })
      return
    }
    if (isUnsafeBankAccount(accountNumber)) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: 'Unsafe bank account format (scientific notation or decimal)' })
      return
    }
    if (ifsc && !validateIfsc(ifsc)) {
      warnings += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'warning', message: 'IFSC format may be invalid', data: { base_salary: baseSalary, salary_type: salaryType } })
      return
    }

    const existing = ctx.existing.get(code)
    if (existing && existing.base_salary === baseSalary && existing.salary_type === salaryType) {
      unchanged += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'unchanged', message: 'No compensation changes' })
      return
    }

    if (existing) updates += 1
    else valid += 1
    previewRows.push({
      rowNumber,
      employeeCode: code,
      status: 'valid',
      message: existing ? 'Update compensation' : 'New compensation profile',
      data: { base_salary: baseSalary, salary_type: salaryType, account_number: accountNumber, ifsc, bank_name: row.bank_name ?? '' },
    })
  })

  return {
    totalRows: rows.length,
    valid: valid + updates,
    updates,
    unchanged,
    warnings,
    rejected,
    rows: previewRows,
  }
}
