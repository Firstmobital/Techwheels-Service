import { supabase } from '../supabase'

export type WorkerQcDecision = 'pass' | 'fail'

export async function saveWorkerQcFromFloorWork(input: {
  repairCardId: number
  jobCardNumber: string
  assignmentRowId: number
  decision: WorkerQcDecision
  checkerName: string
  failReason?: string
  actorEmail?: string | null
}): Promise<{ qc_status: string }> {
  const repairCardId = input.repairCardId
  const jc = String(input.jobCardNumber ?? '').trim().toUpperCase()
  const checker = String(input.checkerName ?? '').trim()
  if (!repairCardId || !jc) throw new Error('Vehicle record missing')
  if (!input.assignmentRowId || input.assignmentRowId <= 0) {
    throw new Error('Assignment row missing — refresh and try again')
  }
  if (!checker) throw new Error('Employee name required for QC')
  if (input.decision === 'fail' && !String(input.failReason ?? '').trim()) {
    throw new Error('Fail reason is required')
  }

  const now = new Date().toISOString()
  const status = input.decision
  const payload: Record<string, unknown> = {
    qc_status: status,
    qc_fail_reason: status === 'fail' ? String(input.failReason ?? '').trim() : null,
    qc_checked_by: checker,
    qc_checked_at: now,
    qc_passed_by: status === 'pass' ? checker : null,
    qc_passed_at: status === 'pass' ? now : null,
    current_stage: status === 'pass' ? 14 : 13,
    current_stage_name: status === 'pass' ? 'Re-Inspection' : 'Quality Check',
  }

  const cardRes = await supabase
    .from('bodyshop_repair_cards')
    .update(payload)
    .eq('id', repairCardId)
    .select('id, qc_status')
    .single()
  if (cardRes.error) throw new Error(cardRes.error.message)

  if (status === 'pass') {
    const { data: { user } } = await supabase.auth.getUser()
    const actor = String(input.actorEmail ?? user?.email ?? '').trim() || null
    const floorRes = await supabase
      .from('bodyshop_assignments')
      .update({
        bs_floor_completed_at: now,
        bs_floor_completed_by: actor,
      })
      .eq('id', input.assignmentRowId)
      .select('bs_floor_completed_at')
      .single()
    if (floorRes.error) throw new Error(floorRes.error.message)
  }

  return { qc_status: String(cardRes.data?.qc_status ?? status) }
}
