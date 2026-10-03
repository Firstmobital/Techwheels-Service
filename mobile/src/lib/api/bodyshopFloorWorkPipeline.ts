import { supabase } from '../supabase'
import type { BodyshopFloorWorkLogRole } from '../bodyshopFloorWork/roles'

export async function completeBodyshopFloorWorkRoleOnAssignment(input: {
  jobCardNumber: string
  floorRole: BodyshopFloorWorkLogRole
  actorEmail?: string | null
}): Promise<void> {
  const jc = String(input.jobCardNumber ?? '').trim().toUpperCase()
  const role = String(input.floorRole ?? '').trim().toUpperCase()
  if (!jc || !role) throw new Error('Job card and role are required')

  const { data, error } = await supabase.rpc('complete_bodyshop_floor_work_role', {
    p_job_card_number: jc,
    p_floor_role: role,
    p_actor_email: String(input.actorEmail ?? '').trim() || null,
  })
  if (error) throw new Error(error.message)
  if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)) {
    throw new Error(String((data as Record<string, unknown>).error ?? 'Complete failed'))
  }
}
