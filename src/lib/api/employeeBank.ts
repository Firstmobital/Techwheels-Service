import { supabase } from '../supabase'

export interface EmployeeBankDetails {
  employee_code: string
  bank_name: string | null
  account_number: string | null
  ifsc: string | null
}

export type EmployeeBankFields = Pick<EmployeeBankDetails, 'bank_name' | 'account_number' | 'ifsc'>

/**
 * Release-order compatibility: until DBL-0101 is applied the RPCs below do not exist and the bank columns are still
 * selectable. When PostgREST reports the function as missing, fall back to the previous direct column access so the
 * application can be deployed before the database change. Once the RPCs exist this path is never taken.
 */
function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const msg = String(error.message ?? '')
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(msg)
}

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
  let rows = (data ?? []) as EmployeeBankDetails[]
  if (isMissingRpc(error)) {
    let query = supabase.from('employee_master').select('employee_code, bank_name, account_number, ifsc')
    if (employeeCodes && employeeCodes.length > 0) query = query.in('employee_code', employeeCodes)
    const legacy = await query
    if (legacy.error) throw new Error(legacy.error.message)
    rows = (legacy.data ?? []) as EmployeeBankDetails[]
  } else if (error) {
    throw new Error(error.message)
  }
  const map = new Map<string, EmployeeBankDetails>()
  for (const row of rows) {
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
  if (isMissingRpc(error)) {
    let updated = 0
    for (const row of rows) {
      const { error: updateError } = await supabase
        .from('employee_master')
        .update({ bank_name: row.bank_name, account_number: row.account_number, ifsc: row.ifsc })
        .eq('employee_code', row.employee_code)
      if (updateError) throw new Error(updateError.message)
      updated += 1
    }
    return updated
  }
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}
