import { supabase } from '../supabase'

export type ReopenBodyshopFloorResult = {
  ok: boolean
  assignment_id?: number
  job_card_number?: string
  roles_reset_to_in_process?: number
}

export async function reopenBodyshopFloorForRework(input: {
  jobCardNumber: string
  reason?: string | null
  resetWorkerRoles?: boolean
}): Promise<ReopenBodyshopFloorResult> {
  const jc = String(input.jobCardNumber ?? '').trim()
  if (!jc) throw new Error('Job card number is required')

  const { data, error } = await supabase.rpc('reopen_bodyshop_floor_for_rework', {
    p_job_card_number: jc,
    p_reason: String(input.reason ?? '').trim() || null,
    p_reset_worker_roles: input.resetWorkerRoles !== false,
  })

  if (error) throw new Error(error.message)

  const payload = (data ?? {}) as Record<string, unknown>
  if (payload.error) {
    throw new Error(String(payload.error))
  }

  return {
    ok: Boolean(payload.ok),
    assignment_id: typeof payload.assignment_id === 'number' ? payload.assignment_id : undefined,
    job_card_number: typeof payload.job_card_number === 'string' ? payload.job_card_number : undefined,
    roles_reset_to_in_process:
      typeof payload.roles_reset_to_in_process === 'number' ? payload.roles_reset_to_in_process : undefined,
  }
}