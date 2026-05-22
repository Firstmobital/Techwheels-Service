import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type AuditEvent = {
  actor_id: string
  action: string
  resource_type: string
  resource_id: string | null
  details: Record<string, unknown>
  timestamp: string
}

/**
 * Log admin action for compliance and debugging.
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const supabase = createClient(supabaseUrl, supabaseServiceRole)

  // Insert into audit_logs table (create if not exists)
  const { error } = await supabase
    .from('audit_logs')
    .insert([event])

  if (error) {
    console.error('Audit log failed:', error)
    // Log to stderr but don't fail the main operation
  }
}
