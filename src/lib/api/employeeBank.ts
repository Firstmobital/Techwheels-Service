import { supabase } from '../supabase'

export interface EmployeeBankDetails {
  employee_code: string
  bank_name: string | null
  account_number: string | null
  ifsc: string | null
}

export type EmployeeBankFields = Pick<EmployeeBankDetails, 'bank_name' | 'account_number' | 'ifsc'>

function bankKey(code: string | null | undefined): string {
  return String(code ?? '').trim().toUpperCase()
}

/**
 * Employee bank fields are not selectable from `employee_master` (ACCOUNTS-002 PD-19). This RPC is the only
 * read path and is limited to payroll, employees (Settings), sa_tracker users and admin.
 */
export async function fetchEmployeeBankDetails(employeeCodes?: string[]): Promise<Map<string, EmployeeBankDetails>> {
  const { data, error } = await supabase.rpc('get_employee_bank_details', {
    p_employee_codes: employeeCodes && employeeCodes.length > 0 ? employeeCodes : null,
  })
  if (error) throw new Error(error.message)
  const map = new Map<string, EmployeeBankDetails>()
  for (const row of (data ?? []) as EmployeeBankDetails[]) {
    map.set(bankKey(row.employee_code), row)
  }
  return map
}

/** Adds bank fields (null when no details exist) to rows loaded without them. */
export function withBankDetails<T extends { employee_code?: string | null }>(
  rows: T[],
  bank: Map<string, EmployeeBankDetails>,
): Array<T & EmployeeBankFields> {
  return rows.map((row) => {
    const details = bank.get(bankKey(row.employee_code))
    return {
      ...row,
      bank_name: details?.bank_name ?? null,
      account_number: details?.account_number ?? null,
      ifsc: details?.ifsc ?? null,
    }
  })
}

/** Admin-only batch write of bank fields (Settings employee CSV import). Returns rows updated. */
export async function setEmployeeBankDetails(rows: EmployeeBankDetails[]): Promise<number> {
  if (rows.length === 0) return 0
  const { data, error } = await supabase.rpc('set_employee_bank_details', { p_rows: rows })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}
