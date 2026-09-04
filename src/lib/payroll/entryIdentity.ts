import type { PayrollEmployee, PayrollEntry } from './types'

export interface PayrollEntryIdentity {
  employeeCode: string
  employeeName: string
  department: string | null
  branch: string | null
  role: string | null
  bankName: string | null
  accountNumber: string | null
  ifsc: string | null
}

function snapshotOrLegacyLive(
  snapshot: string | null | undefined,
  live: string | null | undefined,
): string | null {
  if (snapshot !== null && snapshot !== undefined) return snapshot
  if (live !== null && live !== undefined) return live
  return null
}

/** Snapshot is authoritative when present. Live master is used only for legacy NULL snapshots. */
export function resolvePayrollEntryIdentity(
  entry: Pick<
    PayrollEntry,
    | 'employee_code'
    | 'employee_name_snapshot'
    | 'department_snapshot'
    | 'branch_snapshot'
    | 'role_snapshot'
    | 'bank_name_snapshot'
    | 'account_number_snapshot'
    | 'ifsc_snapshot'
  >,
  live?: PayrollEmployee | null,
): PayrollEntryIdentity {
  const snapshotName = snapshotOrLegacyLive(entry.employee_name_snapshot, live?.employee_name)
  const employeeName = snapshotName?.trim() ? snapshotName : entry.employee_code
  return {
    employeeCode: entry.employee_code,
    employeeName,
    department: snapshotOrLegacyLive(entry.department_snapshot, live?.department),
    branch: snapshotOrLegacyLive(entry.branch_snapshot, live?.location),
    role: snapshotOrLegacyLive(entry.role_snapshot, live?.role),
    bankName: snapshotOrLegacyLive(entry.bank_name_snapshot, live?.bank_name),
    accountNumber: snapshotOrLegacyLive(entry.account_number_snapshot, live?.account_number),
    ifsc: snapshotOrLegacyLive(entry.ifsc_snapshot, live?.ifsc),
  }
}

export function displayOptional(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return trimmed || '—'
}
