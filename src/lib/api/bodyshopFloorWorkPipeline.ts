import { supabase } from '../supabase'
import type { BodyshopFloorWorkLogRole } from '../bodyshopFloorWork/roles'
import { fail, ok, type ApiResult } from './types'

/** Mark assignment role completed after worker submits today's floor work (pipeline advance). */
export async function completeBodyshopFloorWorkRoleOnAssignment(input: {
  jobCardNumber: string
  floorRole: BodyshopFloorWorkLogRole
  actorEmail?: string | null
}): Promise<ApiResult<null>> {
  const jc = String(input.jobCardNumber ?? '').trim().toUpperCase()
  const role = String(input.floorRole ?? '').trim().toUpperCase()
  if (!jc || !role) return fail('Job card and role are required')

  const { data, error } = await supabase.rpc('complete_bodyshop_floor_work_role', {
    p_job_card_number: jc,
    p_floor_role: role,
    p_actor_email: String(input.actorEmail ?? '').trim() || null,
  })
  if (error) return fail(error.message)
  if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)) {
    const msg = String((data as Record<string, unknown>).error ?? 'Complete failed')
    return fail(msg)
  }
  return ok(null)
}
