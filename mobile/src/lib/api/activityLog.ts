import { supabase } from '../supabase'
import { fail, ok, type ApiResult } from './types'

export interface ActivityLogEntry {
  id: number
  actor_id: string
  action: string
  resource_type: string | null
  resource_id: string | null
  details: Record<string, unknown> | null
  timestamp: string
}

/**
 * Log an activity to the audit_logs table
 */
export async function logActivity(
  action: string,
  options: {
    resourceType?: string
    resourceId?: string
    details?: Record<string, unknown>
  } = {},
): Promise<ApiResult<void>> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('User not authenticated')

  const { error } = await supabase.from('audit_logs').insert({
    actor_id: user.id,
    action,
    resource_type: options.resourceType ?? null,
    resource_id: options.resourceId ?? null,
    details: options.details ?? null,
  })

  if (error) return fail(error)
  return ok(void 0)
}

/**
 * Fetch activity logs for a job card (via resource_id filter)
 */
export async function fetchActivityLogsForJobCard(
  jobCardId: string,
): Promise<ApiResult<ActivityLogEntry[]>> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('resource_type', 'job_card')
    .eq('resource_id', jobCardId)
    .order('timestamp', { ascending: false })
    .returns<ActivityLogEntry[]>()

  if (error) return fail(error)
  return ok(data ?? [])
}
