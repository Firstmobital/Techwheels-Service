export interface EmployeeRecord {
  employee_code: string
  employee_name: string
  location: string | null
  department: string | null
}

export interface EmployeeLookupIndex {
  byCode: Map<string, EmployeeRecord>
  byName: Map<string, EmployeeRecord>
}

export interface EmployeeMatchResult {
  employeeCode: string | null
  employeeBranch: string | null
  reason: 'matched_by_code' | 'matched_by_name' | 'sr_assigned_to_empty' | 'no_employee_match'
}

export function normalizeEmployeeCode(value: string): string {
  return value.trim().toUpperCase()
}

export function normalizeEmployeeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function normalizeEmployeeBranch(value: string | null | undefined): string | null {
  if (!value) return null
  return value.trim() || null
}

export function buildEmployeeLookupIndex(employees: EmployeeRecord[]): EmployeeLookupIndex {
  const byCode = new Map<string, EmployeeRecord>()
  const byName = new Map<string, EmployeeRecord>()

  for (const employee of employees) {
    const normalizedCode = normalizeEmployeeCode(employee.employee_code)
    const normalizedName = normalizeEmployeeName(employee.employee_name)

    if (normalizedCode) {
      byCode.set(normalizedCode, employee)
    }

    if (normalizedName && !byName.has(normalizedName)) {
      byName.set(normalizedName, employee)
    }
  }

  return { byCode, byName }
}

function extractCodeCandidates(srAssignedTo: string): string[] {
  const trimmed = srAssignedTo.trim()
  if (!trimmed) return []

  const tokens = trimmed.split(/[^a-zA-Z0-9_]+/).filter(Boolean)
  const candidates = [trimmed, ...tokens]
  return Array.from(new Set(candidates.map(normalizeEmployeeCode)))
}

export function resolveEmployeeForSr(
  srAssignedTo: unknown,
  employeeIndex: EmployeeLookupIndex,
): EmployeeMatchResult {
  if (srAssignedTo === null || srAssignedTo === undefined) {
    return { employeeCode: null, employeeBranch: null, reason: 'sr_assigned_to_empty' }
  }

  const raw = String(srAssignedTo).trim()
  if (!raw) {
    return { employeeCode: null, employeeBranch: null, reason: 'sr_assigned_to_empty' }
  }

  for (const candidateCode of extractCodeCandidates(raw)) {
    const byCodeMatch = employeeIndex.byCode.get(candidateCode)
    if (byCodeMatch) {
      return {
        employeeCode: byCodeMatch.employee_code,
        employeeBranch: normalizeEmployeeBranch(byCodeMatch.location),
        reason: 'matched_by_code',
      }
    }
  }

  const normalizedName = normalizeEmployeeName(raw)
  const byNameMatch = employeeIndex.byName.get(normalizedName)

  if (byNameMatch) {
    return {
      employeeCode: byNameMatch.employee_code,
      employeeBranch: normalizeEmployeeBranch(byNameMatch.location),
      reason: 'matched_by_name',
    }
  }

  return {
    employeeCode: null,
    employeeBranch: null,
    reason: 'no_employee_match',
  }
}
