import { supabase } from '../supabase'
import { fail, ok, type ApiResult } from './types'
import {
  fetchBodyshopAssignmentsForEmployee,
  fetchBodyshopSupportAssignmentsForEmployee,
} from './bodyshopFloorWorkAssignments'
import { listWorkTasksForEmployee } from '../bodyshopFloorWork/roles'
import { buildAssignmentRowByJobCard, isFloorWorkTaskStepCompleted } from '../bodyshopFloorWork/pipeline'
import { istYearMonthFromIso, formatFloorWorkMonthLabel, type FloorWorkVehicleMeta } from '../bodyshopFloorWork/display'
import { isFloorWorkJobCardEligible } from '../bodyshopFloorWork/eligibility'
import type { BodyshopSupportRow } from '../bodyshopEarnings'
import { hasBusinessRole } from '../businessRoles'
import { fetchActiveTableRowsLegacyFull } from '../staff/staffListLoadLegacy'

export function isBodyshopFloorWorkerBusinessRole(roleRaw: string | null | undefined): boolean {
  return (
    hasBusinessRole(roleRaw, 'DENTOR')
    || hasBusinessRole(roleRaw, 'DENTOR_HELPER')
    || hasBusinessRole(roleRaw, 'PAINTER')
    || hasBusinessRole(roleRaw, 'PAINTER_HELPER')
  )
}

export type BodyshopFloorWorkerHomeMetrics = {
  vehiclesTotal: number
  vehiclesDone: number
  vehiclesPending: number
  monthLabel: string
  monthKey: string
}

function floorSinceMetaFromByJc(floorSinceByJc: Record<string, string | null>): Record<string, FloorWorkVehicleMeta> {
  const out: Record<string, FloorWorkVehicleMeta> = {}
  for (const [jc, at] of Object.entries(floorSinceByJc)) {
    out[jc] = { reg: null, customer: null, floorSinceAt: at }
  }
  return out
}

function taskMonthKey(
  task: { jobCardNumber: string; assignedAt: string | null },
  assignmentByJc: Record<string, Record<string, unknown>>,
  floorSinceByJc: Record<string, string | null | undefined>,
): string | null {
  return (
    istYearMonthFromIso(floorSinceByJc[task.jobCardNumber])
    ?? istYearMonthFromIso(String(assignmentByJc[task.jobCardNumber]?.created_at ?? ''))
    ?? istYearMonthFromIso(task.assignedAt)
  )
}

export async function fetchBodyshopFloorWorkerHomeMetrics(
  employeeCode: string,
  monthKey: string,
): Promise<ApiResult<BodyshopFloorWorkerHomeMetrics>> {
  const code = String(employeeCode ?? '').trim().toUpperCase()
  if (!code) return fail('Employee code missing')

  try {
    const [primaryRows, supportRows] = await Promise.all([
      fetchBodyshopAssignmentsForEmployee(code),
      fetchBodyshopSupportAssignmentsForEmployee(code),
    ])
    const assignmentByJc = buildAssignmentRowByJobCard(primaryRows)
    const floorSinceByJc: Record<string, string | null> = {}
    for (const row of primaryRows) {
      const jc = String(row.job_card_number ?? '').trim().toUpperCase()
      if (!jc) continue
      floorSinceByJc[jc] = String(row.created_at ?? '').trim() || null
    }

    const floorMeta = floorSinceMetaFromByJc(floorSinceByJc)
    const tasksEligible = listWorkTasksForEmployee(code, primaryRows, supportRows as BodyshopSupportRow[]).filter((t) =>
      isFloorWorkJobCardEligible(t.jobCardNumber, floorMeta, assignmentByJc, t.assignedAt),
    )
    const monthTasks =
      monthKey === 'all'
        ? tasksEligible
        : tasksEligible.filter((t) => taskMonthKey(t, assignmentByJc, floorSinceByJc) === monthKey)

    let vehiclesDone = 0
    let vehiclesPending = 0
    for (const t of monthTasks) {
      const row = assignmentByJc[t.jobCardNumber]
      if (isFloorWorkTaskStepCompleted(t, row)) vehiclesDone += 1
      else vehiclesPending += 1
    }

    return ok({
      vehiclesTotal: monthTasks.length,
      vehiclesDone,
      vehiclesPending,
      monthLabel: monthKey === 'all' ? 'All months' : formatFloorWorkMonthLabel(monthKey),
      monthKey,
    })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Failed to load floor worker dashboard')
  }
}

export type AdminFloorWorkerCard = BodyshopFloorWorkerHomeMetrics & {
  employeeCode: string
  employeeName: string
  roleLabel: string
  groupLabel: 'Denters' | 'Painters'
}

const ROSTER_ROLE_ORDER = [
  { token: 'DENTOR', roleLabel: 'Denter', groupLabel: 'Denters' as const },
  { token: 'DENTOR_HELPER', roleLabel: 'Denter helper', groupLabel: 'Denters' as const },
  { token: 'PAINTER', roleLabel: 'Painter', groupLabel: 'Painters' as const },
  { token: 'PAINTER_HELPER', roleLabel: 'Painter helper', groupLabel: 'Painters' as const },
]

async function fetchActiveEmployees() {
  const pageSize = 1000
  const rows: Array<{ employee_code: string; employee_name: string; role: string | null }> = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('employee_master')
      .select('employee_code, employee_name, role')
      .eq('is_active', true)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}

async function fetchAllActiveRows(table: 'bodyshop_assignments' | 'bodyshop_floor_support_assignments') {
  return fetchActiveTableRowsLegacyFull(table)
}

function metricsForEmployee(
  employeeCode: string,
  monthKey: string,
  primaryRows: Record<string, unknown>[],
  supportRows: Record<string, unknown>[],
  assignmentByJc: Record<string, Record<string, unknown>>,
  floorSinceByJc: Record<string, string | null>,
): BodyshopFloorWorkerHomeMetrics {
  const floorMeta = floorSinceMetaFromByJc(floorSinceByJc)
  const tasks = listWorkTasksForEmployee(employeeCode, primaryRows, supportRows as BodyshopSupportRow[]).filter((t) =>
    isFloorWorkJobCardEligible(t.jobCardNumber, floorMeta, assignmentByJc, t.assignedAt),
  )
  const monthTasks =
    monthKey === 'all'
      ? tasks
      : tasks.filter((t) => taskMonthKey(t, assignmentByJc, floorSinceByJc) === monthKey)
  let vehiclesDone = 0
  let vehiclesPending = 0
  for (const t of monthTasks) {
    const row = assignmentByJc[t.jobCardNumber]
    if (isFloorWorkTaskStepCompleted(t, row)) vehiclesDone += 1
    else vehiclesPending += 1
  }
  return {
    vehiclesTotal: monthTasks.length,
    vehiclesDone,
    vehiclesPending,
    monthLabel: monthKey === 'all' ? 'All months' : formatFloorWorkMonthLabel(monthKey),
    monthKey,
  }
}

export type AdminRosterPerson = { employee_code: string; employee_name: string; role: string | null }

/** Paginated — use once per screen load, then reuse rows for roster. */
export async function fetchAllActiveBodyshopAssignmentRows(): Promise<{
  primaryRows: Record<string, unknown>[]
  supportRows: Record<string, unknown>[]
}> {
  const [primaryRows, supportRows] = await Promise.all([
    fetchAllActiveRows('bodyshop_assignments'),
    fetchAllActiveRows('bodyshop_floor_support_assignments'),
  ])
  return { primaryRows, supportRows }
}

export async function fetchAdminRosterPeople(): Promise<AdminRosterPerson[]> {
  return fetchActiveEmployees()
}

export function buildAdminFloorWorkerRoster(
  monthKey: string,
  people: AdminRosterPerson[],
  primaryRows: Record<string, unknown>[],
  supportRows: Record<string, unknown>[],
): AdminFloorWorkerCard[] {
  const assignmentByJc = buildAssignmentRowByJobCard(primaryRows)
  const floorSinceByJc: Record<string, string | null> = {}
  for (const row of primaryRows) {
    const jc = String(row.job_card_number ?? '').trim().toUpperCase()
    if (!jc) continue
    floorSinceByJc[jc] = String(row.created_at ?? '').trim() || null
  }

  const cards: AdminFloorWorkerCard[] = []
  for (const person of people) {
    const roleRaw = String(person.role ?? '')
    const match = ROSTER_ROLE_ORDER.find((role) => hasBusinessRole(roleRaw, role.token))
    if (!match) continue
    const employeeCode = String(person.employee_code ?? '').trim().toUpperCase()
    if (!employeeCode) continue
    cards.push({
      ...metricsForEmployee(employeeCode, monthKey, primaryRows, supportRows, assignmentByJc, floorSinceByJc),
      employeeCode,
      employeeName: String(person.employee_name ?? '').trim() || employeeCode,
      roleLabel: match.roleLabel,
      groupLabel: match.groupLabel,
    })
  }

  cards.sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'en', { sensitivity: 'base' }))
  return cards
}

/** Loads assignments from DB — prefer `fetchAllActiveBodyshopAssignmentRows` + `buildAdminFloorWorkerRoster` on Floor Work screen. */
export async function fetchAdminFloorWorkerRoster(monthKey: string): Promise<AdminFloorWorkerCard[]> {
  const [{ primaryRows, supportRows }, people] = await Promise.all([
    fetchAllActiveBodyshopAssignmentRows(),
    fetchAdminRosterPeople(),
  ])
  return buildAdminFloorWorkerRoster(monthKey, people, primaryRows, supportRows)
}
