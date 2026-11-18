import type { ReceptionEmployeeOption } from './api/reception'
import { normalizeDepartmentDisplay } from './department'

function normalizeDepartmentKey(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
  if (normalized === 'BODYSHOP') return 'BODY SHOP'
  return normalized
}

/** Accident reception: BODY SHOP department, no EV/PV filter (same as ReceptionPage). */
export function filterAccidentBodyshopAdvisors(
  employees: ReceptionEmployeeOption[],
  opts?: { location?: string | null; fuelType?: 'EV' | 'PV' | '' },
): ReceptionEmployeeOption[] {
  const requiredDepartment = 'BODY SHOP'
  const locationKey = String(opts?.location ?? '').trim()
  return employees
    .filter((employee) => {
      if (normalizeDepartmentKey(employee.department) !== requiredDepartment) return false
      if (locationKey) {
        const empLoc = String(employee.location ?? '').trim()
        if (empLoc && empLoc.toLowerCase() !== locationKey.toLowerCase()) return false
      }
      return true
    })
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name))
}

export function formatDmsAdvisorHint(code: string | null | undefined, employees: ReceptionEmployeeOption[]): string {
  const c = String(code ?? '').trim().toUpperCase()
  if (!c) return ''
  const row = employees.find((e) => String(e.employee_code ?? '').trim().toUpperCase() === c)
  const name = row?.employee_name?.trim()
  const dept = row?.department ? normalizeDepartmentDisplay(row.department) : null
  if (name) return `${name} (${c})${dept ? ` · ${dept}` : ''}`
  return c
}

/** Map DMS product_line / model hints to a configured reception model name. */
export function matchModelFromDmsHint(hint: string | null | undefined, models: string[]): string {
  const raw = String(hint ?? '').trim()
  if (!raw || models.length === 0) return ''

  const key = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!key) return ''

  const exact = models.find((m) => m.toUpperCase().replace(/[^A-Z0-9]/g, '') === key)
  if (exact) return exact

  const contained = models.find((m) => {
    const mk = m.toUpperCase().replace(/[^A-Z0-9]/g, '')
    return mk.length >= 3 && (key.includes(mk) || mk.includes(key))
  })
  return contained ?? ''
}

export function portalToFuel(portal: string | null | undefined): 'EV' | 'PV' | '' {
  const p = String(portal ?? '').trim().toUpperCase()
  if (p === 'EV') return 'EV'
  if (p === 'PV') return 'PV'
  return ''
}