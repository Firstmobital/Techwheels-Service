#!/usr/bin/env node
/**
 * Mirrors payroll Business Role filter behaviour:
 * - src/lib/businessRoles.ts (canonical CSV matching)
 * - Attendance / Salary Type live employee_master.role
 * - Payroll Processing snapshot identity.role + aggregate cards
 */

const KNOWN_BUSINESS_ROLES = new Set([
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

const ALIAS_TO_CANONICAL = {
  SA: 'SA',
  'SERVICE ADVISOR': 'SA',
  SERVICE_ADVISOR: 'SA',
  CRM: 'CRM',
  TECHNICIAN: 'TECHNICIAN',
  PAINTER: 'PAINTER',
  RUBBING: 'RUBBING',
  DENTOR: 'DENTOR',
}

function normalizeLookupKey(token) {
  return String(token ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
}

function normalizeRoleToken(token) {
  const trimmed = String(token ?? '').trim()
  if (!trimmed) return null
  const spaced = normalizeLookupKey(trimmed)
  const underscored = spaced.replace(/ /g, '_')
  const canonical = ALIAS_TO_CANONICAL[spaced] ?? ALIAS_TO_CANONICAL[underscored] ?? underscored
  if (!KNOWN_BUSINESS_ROLES.has(canonical)) return null
  return canonical
}

function parseBusinessRoles(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return []
  const seen = new Set()
  const result = []
  for (const part of text.split(',')) {
    const canonical = normalizeRoleToken(part)
    if (!canonical || seen.has(canonical)) continue
    seen.add(canonical)
    result.push(canonical)
  }
  return result
}

function hasBusinessRole(raw, target) {
  const canonicalTarget = normalizeRoleToken(target)
  if (!canonicalTarget) return false
  return parseBusinessRoles(raw).includes(canonicalTarget)
}

function matchesBusinessRoleFilter(raw, selected) {
  const value = String(selected ?? '').trim()
  if (!value || value.toLowerCase() === 'all') return true
  return hasBusinessRole(raw, value)
}

function collectBusinessRolesFromMappings(roleStrings) {
  const merged = new Set()
  for (const raw of roleStrings) {
    for (const role of parseBusinessRoles(raw)) merged.add(role)
  }
  return Array.from(merged).sort((a, b) => a.localeCompare(b))
}

function snapshotOrLegacyLive(snapshot, live) {
  if (snapshot !== null && snapshot !== undefined) return snapshot
  if (live !== null && live !== undefined) return live
  return null
}

function resolvePayrollEntryIdentity(entry, live) {
  return {
    employeeCode: entry.employee_code,
    department: snapshotOrLegacyLive(entry.department_snapshot, live?.department),
    branch: snapshotOrLegacyLive(entry.branch_snapshot, live?.location),
    role: snapshotOrLegacyLive(entry.role_snapshot, live?.role),
  }
}

const employees = [
  { employee_code: 'E001', employee_name: 'Advisor One', department: 'SERVICE', location: 'Sitapura', role: 'SA', salary_type: 'variable' },
  { employee_code: 'E002', employee_name: 'Painter Two', department: 'SERVICE', location: 'Sitapura', role: 'PAINTER, RUBBING', salary_type: 'variable' },
  { employee_code: 'E003', employee_name: 'Tech Three', department: 'SERVICE', location: 'Ajmer Road', role: 'TECHNICIAN', salary_type: 'both' },
  { employee_code: 'E004', employee_name: 'Dentor Four', department: 'BODY SHOP', location: 'Sitapura', role: 'DENTOR', salary_type: 'base' },
  { employee_code: 'E005', employee_name: 'Other Five', department: 'BODY SHOP', location: 'Ajmer Road', role: null, salary_type: 'base' },
]

function filterEmployees({ dept = 'all', role = 'all', branch = 'all', salaryType = 'all', search = '' }) {
  return employees.filter((e) => {
    if (search && !`${e.employee_name} ${e.employee_code}`.toLowerCase().includes(search.toLowerCase())) return false
    if (dept !== 'all' && (e.department?.trim() ?? '') !== dept) return false
    if (!matchesBusinessRoleFilter(e.role, role)) return false
    if (branch !== 'all' && (e.location?.trim() ?? '') !== branch) return false
    if (salaryType !== 'all' && e.salary_type !== salaryType) return false
    return true
  }).map((e) => e.employee_code)
}

const processingEntries = [
  {
    employee_code: 'E001',
    salary_type_snapshot: 'variable',
    department_snapshot: 'SERVICE',
    branch_snapshot: 'Sitapura',
    role_snapshot: 'SA',
    gross_payout: 100,
    earned_base: 0,
    sa_variable_earning: 80,
    technician_variable_earning: 0,
    net_payable: 90,
  },
  {
    employee_code: 'E002',
    salary_type_snapshot: 'variable',
    department_snapshot: 'SERVICE',
    branch_snapshot: 'Sitapura',
    role_snapshot: 'PAINTER, RUBBING',
    gross_payout: 200,
    earned_base: 0,
    sa_variable_earning: 0,
    technician_variable_earning: 0,
    net_payable: 180,
  },
  {
    employee_code: 'E004',
    salary_type_snapshot: 'base',
    department_snapshot: 'BODY SHOP',
    branch_snapshot: 'Sitapura',
    role_snapshot: 'DENTOR',
    gross_payout: 50,
    earned_base: 50,
    sa_variable_earning: 0,
    technician_variable_earning: 0,
    net_payable: 40,
  },
]

const liveByCode = new Map(employees.map((e) => [e.employee_code, e]))

function processingScope({ dept = 'all', role = 'all', branch = 'all', salaryType = 'all', search = '' }) {
  const scoped = processingEntries.filter((entry) => {
    const identity = resolvePayrollEntryIdentity(entry, liveByCode.get(entry.employee_code))
    if (dept !== 'all' && (identity.department?.trim() ?? '') !== dept) return false
    if (!matchesBusinessRoleFilter(identity.role, role)) return false
    if (branch !== 'all' && (identity.branch?.trim() ?? '') !== branch) return false
    if (salaryType !== 'all' && entry.salary_type_snapshot !== salaryType) return false
    return true
  })
  const table = search
    ? scoped.filter((entry) => {
      const identity = resolvePayrollEntryIdentity(entry, liveByCode.get(entry.employee_code))
      return `${identity.employeeCode} ${liveByCode.get(entry.employee_code)?.employee_name ?? ''}`.toLowerCase().includes(search.toLowerCase())
    })
    : scoped
  const cards = scoped.reduce((acc, entry) => {
    acc.employeeCount += 1
    acc.gross += entry.gross_payout
    acc.net += entry.net_payable
    return acc
  }, { employeeCount: 0, gross: 0, net: 0 })
  return { codes: table.map((e) => e.employee_code), cards }
}

const historicalEntry = {
  employee_code: 'E001',
  department_snapshot: 'SERVICE',
  branch_snapshot: 'Sitapura',
  role_snapshot: 'SA',
}
const laterLive = { department: 'BODY SHOP', location: 'Ajmer Road', role: 'TECHNICIAN' }

const tests = [
  { name: 'all roles is a no-op', got: filterEmployees({}), want: ['E001', 'E002', 'E003', 'E004', 'E005'] },
  { name: 'SA only', got: filterEmployees({ role: 'SA' }), want: ['E001'] },
  { name: 'SERVICE_ADVISOR alias matches SA', got: filterEmployees({ role: 'SERVICE_ADVISOR' }), want: ['E001'] },
  { name: 'PAINTER matches CSV employee', got: filterEmployees({ role: 'PAINTER' }), want: ['E002'] },
  { name: 'RUBBING matches same CSV employee', got: filterEmployees({ role: 'RUBBING' }), want: ['E002'] },
  { name: 'TECHNICIAN only', got: filterEmployees({ role: 'TECHNICIAN' }), want: ['E003'] },
  { name: 'department + role intersection', got: filterEmployees({ dept: 'SERVICE', role: 'PAINTER' }), want: ['E002'] },
  { name: 'department + role + branch', got: filterEmployees({ dept: 'SERVICE', role: 'SA', branch: 'Sitapura' }), want: ['E001'] },
  { name: 'department + role + branch + salary type', got: filterEmployees({ dept: 'SERVICE', role: 'SA', branch: 'Sitapura', salaryType: 'variable' }), want: ['E001'] },
  { name: 'four-filter miss on salary type', got: filterEmployees({ dept: 'SERVICE', role: 'SA', branch: 'Sitapura', salaryType: 'base' }), want: [] },
  { name: 'search still combines with role', got: filterEmployees({ role: 'PAINTER', search: 'painter' }), want: ['E002'] },
  { name: 'search excludes other matching roles', got: filterEmployees({ role: 'SA', search: 'painter' }), want: [] },
  { name: 'dropdown options come from employee data', got: collectBusinessRolesFromMappings(employees.map((e) => e.role)), want: ['DENTOR', 'PAINTER', 'RUBBING', 'SA', 'TECHNICIAN'] },
  {
    name: 'processing all roles cards match full population',
    got: processingScope({}).cards,
    want: { employeeCount: 3, gross: 350, net: 310 },
  },
  {
    name: 'processing SA cards match SA rows',
    got: processingScope({ role: 'SA' }),
    want: { codes: ['E001'], cards: { employeeCount: 1, gross: 100, net: 90 } },
  },
  {
    name: 'processing PAINTER cards match CSV painter only',
    got: processingScope({ role: 'PAINTER' }),
    want: { codes: ['E002'], cards: { employeeCount: 1, gross: 200, net: 180 } },
  },
  {
    name: 'processing four-filter AND',
    got: processingScope({ dept: 'SERVICE', role: 'SA', branch: 'Sitapura', salaryType: 'variable' }).codes,
    want: ['E001'],
  },
  {
    name: 'processing search does not shrink cards',
    got: processingScope({ role: 'PAINTER', search: 'zzz' }),
    want: { codes: [], cards: { employeeCount: 1, gross: 200, net: 180 } },
  },
  {
    name: 'historical snapshot role wins over later live master',
    got: resolvePayrollEntryIdentity(historicalEntry, laterLive).role,
    want: 'SA',
  },
  {
    name: 'historical filter uses snapshot not later TECHNICIAN live role',
    got: matchesBusinessRoleFilter(resolvePayrollEntryIdentity(historicalEntry, laterLive).role, 'TECHNICIAN'),
    want: false,
  },
  {
    name: 'legacy NULL snapshot falls back to live role',
    got: resolvePayrollEntryIdentity({ employee_code: 'E001', role_snapshot: null, department_snapshot: null, branch_snapshot: null }, laterLive).role,
    want: 'TECHNICIAN',
  },
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
