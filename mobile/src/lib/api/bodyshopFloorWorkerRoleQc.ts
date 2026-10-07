import { supabase } from '../supabase'
import { arePipelineWorkStepsFinished } from '../bodyshopFloorWork/pipeline'
import {
  areAllWorkerSelfQcsPassed,
  anyWorkerSelfQcFailed,
  buildWorkerRoleQcMap,
  type WorkerRoleQcMap,
  type WorkerRoleQcRecord,
  type WorkerSelfQcRole,
} from '../bodyshopFloorWork/workerRoleQc'

export type WorkerQcDecision = 'pass' | 'fail'

function normJc(raw: string): string {
  return String(raw ?? '').trim().toUpperCase()
}

export async function fetchWorkerRoleQcForJobCards(
  jobCardNumbers: string[],
): Promise<Record<string, WorkerRoleQcMap>> {
  const keys = [...new Set(jobCardNumbers.map(normJc).filter(Boolean))]
  if (keys.length === 0) return {}

  const { data, error } = await supabase
    .from('bodyshop_floor_worker_role_qc')
    .select('job_card_number, floor_role, qc_status, fail_reason, employee_code, checked_at')
    .in('job_card_number', keys)

  if (error) throw new Error(error.message)

  const grouped: Record<string, WorkerRoleQcRecord[]> = {}
  for (const row of data ?? []) {
    const jc = normJc(String(row.job_card_number ?? ''))
    if (!jc) continue
    const list = grouped[jc] ?? []
    list.push({
      floor_role: row.floor_role as WorkerSelfQcRole,
      qc_status: row.qc_status as WorkerRoleQcRecord['qc_status'],
      fail_reason: row.fail_reason,
      employee_code: row.employee_code,
      checked_at: row.checked_at,
    })
    grouped[jc] = list
  }
  const result: Record<string, WorkerRoleQcMap> = {}
  for (const [jc, list] of Object.entries(grouped)) {
    result[jc] = buildWorkerRoleQcMap(list)
  }
  return result
}

async function syncRepairCardFromWorkerRoleQc(input: {
  repairCardId: number
  assignmentRow: Record<string, unknown>
  roleQcMap: WorkerRoleQcMap
  checkerName: string
  now: string
  actorEmail?: string | null
}): Promise<string> {
  const checker = String(input.checkerName ?? '').trim()
  const now = input.now
  const cardPayload: Record<string, unknown> = {
    qc_fail_reason: null,
    qc_checked_by: null,
    qc_checked_at: null,
    qc_passed_by: null,
    qc_passed_at: null,
  }

  if (anyWorkerSelfQcFailed(input.roleQcMap)) {
    const failed = Object.values(input.roleQcMap).find((r) => r?.qc_status === 'fail')
    cardPayload.qc_status = 'fail'
    cardPayload.qc_fail_reason = failed?.fail_reason ?? 'Worker QC failed'
    cardPayload.qc_checked_by = checker
    cardPayload.qc_checked_at = now
    cardPayload.current_stage = 13
    cardPayload.current_stage_name = 'Quality Check'
  } else if (
    areAllWorkerSelfQcsPassed(input.assignmentRow, input.roleQcMap)
    && arePipelineWorkStepsFinished(input.assignmentRow)
  ) {
    cardPayload.qc_status = 'pass'
    cardPayload.qc_passed_by = checker
    cardPayload.qc_passed_at = now
    cardPayload.qc_checked_by = checker
    cardPayload.qc_checked_at = now
    cardPayload.current_stage = 14
    cardPayload.current_stage_name = 'Re-Inspection'

    const { data: { user } } = await supabase.auth.getUser()
    const actor = String(input.actorEmail ?? user?.email ?? '').trim() || null
    await supabase
      .from('bodyshop_assignments')
      .update({
        bs_floor_completed_at: now,
        bs_floor_completed_by: actor,
      })
      .eq('id', Number(input.assignmentRow.id))
  } else {
    cardPayload.qc_status = 'pending'
    cardPayload.current_stage = 13
    cardPayload.current_stage_name = 'Quality Check'
  }

  const cardRes = await supabase
    .from('bodyshop_repair_cards')
    .update(cardPayload)
    .eq('id', input.repairCardId)
    .select('qc_status')
    .single()
  if (cardRes.error) throw new Error(cardRes.error.message)
  return String(cardRes.data?.qc_status ?? cardPayload.qc_status ?? 'pending')
}

export async function saveWorkerRoleQcFromFloorWork(input: {
  repairCardId: number
  jobCardNumber: string
  assignmentRow: Record<string, unknown>
  floorRole: WorkerSelfQcRole
  decision: WorkerQcDecision
  employeeCode: string
  checkerName: string
  failReason?: string
  actorEmail?: string | null
}): Promise<{ repairCardQcStatus: string; roleQcMap: WorkerRoleQcMap }> {
  const jc = normJc(input.jobCardNumber)
  const employeeCode = String(input.employeeCode ?? '').trim().toUpperCase()
  const checker = String(input.checkerName ?? '').trim()
  const dealerCode = String(input.assignmentRow.dealer_code ?? '3000840').trim()
  if (!input.repairCardId || !jc) throw new Error('Vehicle record missing')
  if (!employeeCode) throw new Error('Employee code required')
  if (!checker) throw new Error('Employee name required for QC')
  if (input.decision === 'fail' && !String(input.failReason ?? '').trim()) {
    throw new Error('Fail reason is required')
  }

  const now = new Date().toISOString()
  const status = input.decision
  const rowPayload = {
    job_card_number: jc,
    repair_card_id: input.repairCardId,
    dealer_code: dealerCode,
    floor_role: input.floorRole,
    employee_code: employeeCode,
    qc_status: status,
    fail_reason: status === 'fail' ? String(input.failReason ?? '').trim() : null,
    checked_by_name: checker,
    checked_at: now,
    updated_at: now,
  }

  const existing = await supabase
    .from('bodyshop_floor_worker_role_qc')
    .select('id')
    .eq('job_card_number', jc)
    .eq('floor_role', input.floorRole)
    .maybeSingle()

  if (existing.error) throw new Error(existing.error.message)
  if (existing.data?.id) {
    const upd = await supabase
      .from('bodyshop_floor_worker_role_qc')
      .update(rowPayload)
      .eq('id', existing.data.id)
    if (upd.error) throw new Error(upd.error.message)
  } else {
    const ins = await supabase.from('bodyshop_floor_worker_role_qc').insert(rowPayload)
    if (ins.error) throw new Error(ins.error.message)
  }

  const maps = await fetchWorkerRoleQcForJobCards([jc])
  const roleQcMap = maps[jc] ?? {}
  const repairCardQcStatus = await syncRepairCardFromWorkerRoleQc({
    repairCardId: input.repairCardId,
    assignmentRow: input.assignmentRow,
    roleQcMap,
    checkerName: checker,
    now,
    actorEmail: input.actorEmail,
  })

  return { repairCardQcStatus, roleQcMap }
}
