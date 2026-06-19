function normalizedText(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

export function departmentKey(value: string | null | undefined): string {
  return normalizedText(value).toUpperCase().replace(/[^A-Z]/g, '')
}

export function isBodyshopDepartment(value: string | null | undefined): boolean {
  return departmentKey(value) === 'BODYSHOP'
}

export function normalizeDepartmentDisplay(value: string | null | undefined): string {
  const trimmed = normalizedText(value)
  if (!trimmed) return ''
  return isBodyshopDepartment(trimmed) ? 'BODY SHOP' : trimmed
}

export function isServiceDepartment(value: string | null | undefined): boolean {
  return departmentKey(value) === 'SERVICE'
}
