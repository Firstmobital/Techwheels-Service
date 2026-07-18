export type EmployeeBankRow = {
  employee_code: string | null
  bank_name: string | null
  account_number: string | null
  ifsc: string | null
}

export type BankPayoutInputRow = {
  employeeCode: string
  employeeName: string
  earnings: number
}

export const DEFAULT_TEST_RECIPIENTS = [
  'shruti@indiraswitch.com',
  'ritesh@indiraswitch.com',
  'vinodexodus@gmail.com',
  'deepak10361@gmail.com',
  'mohan.techwheels@gmail.com',
]

export function parseRecipients(value: string | null | undefined, fallback: string[]): string[] {
  const parsed = String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return parsed.length > 0 ? parsed : fallback
}

export function normalizeCode(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

export function isSbiBank(bank: EmployeeBankRow | undefined): boolean {
  const bankName = String(bank?.bank_name ?? '').trim().toUpperCase()
  const ifsc = String(bank?.ifsc ?? '').trim().toUpperCase()
  return bankName.includes('STATE BANK OF INDIA') || bankName === 'SBI' || ifsc.startsWith('SBIN')
}

export function chunk<T>(input: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < input.length; i += size) {
    out.push(input.slice(i, i + size))
  }
  return out
}

export function encodeStoragePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

/** 13-column bank import rows (A–M), no header row. */
export function buildBankPayoutWorksheetRows(
  rows: BankPayoutInputRow[],
  bankByCode: Map<string, EmployeeBankRow>,
): Array<Array<string | number>> {
  const worksheetRows: Array<Array<string | number>> = []
  let sequenceCounter = 1

  rows.forEach((row) => {
    const bank = bankByCode.get(normalizeCode(row.employeeCode))
    const paymentMode = isSbiBank(bank) ? 'DCR' : 'NEFT'
    worksheetRows.push([
      '300971',
      'FIRST MOBITAL PRIVATE LIMITED',
      '39171760445',
      paymentMode,
      row.employeeName,
      String(bank?.account_number ?? '').trim(),
      String(bank?.ifsc ?? '').trim().toUpperCase(),
      Number(row.earnings.toFixed(2)),
      `SALARY${sequenceCounter++}`,
      'INR',
      'JAIPUR',
      'SHRUTI@INDIRASWITCH.COM',
      'E',
    ])
  })

  return worksheetRows
}
