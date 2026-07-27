/**
 * RBAC-003: comma-separated Business Roles in employee_master.role
 * Single source of truth for parse / normalize / match (web).
 */

export const MAX_BUSINESS_ROLES = 5

/** Canonical tokens allowed in Employee Master Business Role column */
export const KNOWN_BUSINESS_ROLES = new Set([
  'SA',
  'CRM',
  'SM',
  'GM',
  'TECHNICIAN',
  'FLOOR_INCHARGE',
  'CRE',
  'DRIVER',
  'EDP',
  'SURVEY',
  'DENTOR',
  'DENTOR_HELPER',
  'PAINTER',
  'PAINTER_HELPER',
  'RUBBING',
  'PARTS_INCHARGE',
  'ELECTRICIAN',
  'ALIGNMENT',
  'DET',
])

const ALIAS_TO_CANONICAL: Record<string, string> = {
  SA: 'SA',
  'SERVICE ADVISOR': 'SA',
  SERVICE_ADVISOR: 'SA',
  CRM: 'CRM',
  SM: 'SM',
  GM: 'GM',
  TECHNICIAN: 'TECHNICIAN',
  'FLOOR INCHARGE': 'FLOOR_INCHARGE',
  FLOOR_INCHARGE: 'FLOOR_INCHARGE',
  CRE: 'CRE',
  DRIVER: 'DRIVER',
  EDP: 'EDP',
  SSA: 'EDP',
  'SENIOR SERVICE ADVISOR': 'EDP',
  SENIOR_SERVICE_ADVISOR: 'EDP',
  SURVEY: 'SURVEY',
  SURVEYOR: 'SURVEY',
  DENTOR: 'DENTOR',
  DENTER: 'DENTOR',
  'DENTOR HELPER': 'DENTOR_HELPER',
  DENTOR_HELPER: 'DENTOR_HELPER',
  PAINTER: 'PAINTER',
  'PAINTER HELPER': 'PAINTER_HELPER',
  PAINTER_HELPER: 'PAINTER_HELPER',
  RUBBING: 'RUBBING',
  'PARTS INCHARGE': 'PARTS_INCHARGE',
  PARTS_INCHARGE: 'PARTS_INCHARGE',
  ELECTRICIAN: 'ELECTRICIAN',
  ALIGNMENT: 'ALIGNMENT',
  DET: 'DET',
}

function normalizeLookupKey(token: string): string {
  return String(token ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

export function normalizeRoleToken(token: string): string | null {
  const trimmed = String(token ?? '').trim()
  if (!trimmed) return null

  const spaced = normalizeLookupKey(trimmed)
  const underscored = spaced.replace(/ /g, '_')

  const canonical = ALIAS_TO_CANONICAL[spaced] ?? ALIAS_TO_CANONICAL[underscored] ?? underscored
  if (!KNOWN_BUSINESS_ROLES.has(canonical)) return null
  return canonical
}

export function parseBusinessRoles(raw: string | null | undefined): string[] {
  const text = String(raw ?? '').trim()
  if (!text) return []

  if (/[;/|]/.test(text)) {
    return []
  }

  const seen = new Set<string>()
  const result: string[] = []

  for (const part of text.split(',')) {
    const canonical = normalizeRoleToken(part)
    if (!canonical || seen.has(canonical)) continue
    seen.add(canonical)
    result.push(canonical)
    if (result.length >= MAX_BUSINESS_ROLES) break
  }

  return result
}

export function formatBusinessRoles(raw: string | null | undefined): string {
  return parseBusinessRoles(raw).join(', ')
}

export function hasBusinessRole(raw: string | null | undefined, target: string): boolean {
  const canonicalTarget = normalizeRoleToken(target)
  if (!canonicalTarget) return false
  return parseBusinessRoles(raw).includes(canonicalTarget)
}

export function hasAnyBusinessRole(raw: string | null | undefined, targets: string[]): boolean {
  const parsed = parseBusinessRoles(raw)
  if (parsed.length === 0) return false
  const wanted = new Set(
    targets.map((t) => normalizeRoleToken(t)).filter((t): t is string => Boolean(t)),
  )
  return parsed.some((role) => wanted.has(role))
}

export type ValidateBusinessRolesResult =
  | { ok: true; canonical: string | null }
  | { ok: false; errors: string[] }

export function validateAndCanonicalizeRoles(raw: string | null | undefined): ValidateBusinessRolesResult {
  const text = String(raw ?? '').trim()
  if (!text) {
    return { ok: true, canonical: null }
  }

  if (/[;/|]/.test(text)) {
    return { ok: false, errors: ['Use comma only to separate roles (example: PAINTER, RUBBING).'] }
  }

  const errors: string[] = []
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean)

  if (parts.length === 0) {
    return { ok: true, canonical: null }
  }

  if (parts.length > MAX_BUSINESS_ROLES) {
    errors.push(`Maximum ${MAX_BUSINESS_ROLES} business roles allowed.`)
  }

  const canonicals: string[] = []
  const seen = new Set<string>()

  for (const part of parts) {
    const canonical = normalizeRoleToken(part)
    if (!canonical) {
      errors.push(`Unknown business role: "${part}".`)
      continue
    }
    if (seen.has(canonical)) continue
    seen.add(canonical)
    canonicals.push(canonical)
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, canonical: canonicals.join(', ') }
}

// ── Domain helpers (replace page-local copies) ─────────────────────────────

export function normalizeAccessToken(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase().replace(/[_\s]+/g, ' ')
}

export function isBodyshopSaRole(value: string | null | undefined): boolean {
  return hasAnyBusinessRole(value, ['SA', 'SERVICE ADVISOR', 'SERVICE_ADVISOR'])
}

export function isBodyshopSsaRole(value: string | null | undefined): boolean {
  return hasAnyBusinessRole(value, ['EDP', 'SSA', 'SENIOR SERVICE ADVISOR'])
}

export function isBodyshopSurveyRole(value: string | null | undefined): boolean {
  return hasAnyBusinessRole(value, ['SURVEY', 'SURVEYOR'])
}

export function isBodyshopFloorInchargeRole(value: string | null | undefined): boolean {
  return hasBusinessRole(value, 'FLOOR_INCHARGE')
}

export function isServiceAdvisorRole(value: string | null | undefined): boolean {
  return hasAnyBusinessRole(value, ['SA', 'SERVICE ADVISOR', 'SERVICE_ADVISOR'])
}

export function isTechnicianBusinessRole(value: string | null | undefined): boolean {
  return hasBusinessRole(value, 'TECHNICIAN')
}

export function isCrmBusinessRole(value: string | null | undefined): boolean {
  return hasBusinessRole(value, 'CRM')
}

export function isManagerBusinessRole(value: string | null | undefined): boolean {
  return hasAnyBusinessRole(value, ['CRM', 'GM', 'SM'])
}

export type BodyshopFloorRole =
  | 'DENTOR'
  | 'PAINTER'
  | 'TECHNICIAN'
  | 'FLOOR_INCHARGE'
  | 'DENTOR_HELPER'
  | 'PAINTER_HELPER'
  | 'RUBBING'
  | 'EDP'
  | 'PARTS_INCHARGE'

const BODYSHOP_FLOOR_ROLE_SET = new Set<string>([
  'DENTOR',
  'PAINTER',
  'TECHNICIAN',
  'FLOOR_INCHARGE',
  'DENTOR_HELPER',
  'PAINTER_HELPER',
  'RUBBING',
  'EDP',
  'PARTS_INCHARGE',
])

/** All bodyshop floor assignment buckets for one employee (supports CSV roles). */
export function parseBodyshopFloorRoles(raw: string | null | undefined): BodyshopFloorRole[] {
  return parseBusinessRoles(raw).filter((role): role is BodyshopFloorRole =>
    BODYSHOP_FLOOR_ROLE_SET.has(role),
  )
}

export type FloorInchargeSupportRole = 'DET' | 'ELECTRICIAN' | 'DENTOR' | 'TECHNICIAN' | 'ALIGNMENT'

const SUPPORT_ROLE_MAP: Record<string, FloorInchargeSupportRole> = {
  TECHNICIAN: 'TECHNICIAN',
  ELECTRICIAN: 'ELECTRICIAN',
  DENTOR: 'DENTOR',
  DENTER: 'DENTOR',
  ALIGNMENT: 'ALIGNMENT',
  DET: 'DET',
}

/** Support-staff buckets from employee_master.role (first matching support token). */
export function normalizeEmployeeSupportRole(
  value: string | null | undefined,
): FloorInchargeSupportRole | null {
  for (const token of parseBusinessRoles(value)) {
    const support = SUPPORT_ROLE_MAP[token]
    if (support) return support
  }
  return null
}

/** Collect unique support roles for grouping (employee may appear in multiple groups). */
export function parseEmployeeSupportRoles(
  value: string | null | undefined,
): FloorInchargeSupportRole[] {
  const seen = new Set<FloorInchargeSupportRole>()
  const result: FloorInchargeSupportRole[] = []
  for (const token of parseBusinessRoles(value)) {
    const support = SUPPORT_ROLE_MAP[token]
    if (support && !seen.has(support)) {
      seen.add(support)
      result.push(support)
    }
  }
  return result
}

export function collectBusinessRolesFromMappings(
  roleStrings: Array<string | null | undefined>,
): string[] {
  const merged = new Set<string>()
  for (const raw of roleStrings) {
    for (const role of parseBusinessRoles(raw)) {
      merged.add(role)
    }
  }
  return Array.from(merged).sort((a, b) => a.localeCompare(b))
}
