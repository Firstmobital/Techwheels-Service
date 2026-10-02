import { supabase } from '../supabase'

export type LinkedEmployeeContext = {
  employeeCode: string
  employeeName: string | null
  employeeRole: string | null
  dealerCode: string | null
  isAdminOverview?: boolean
}

const ADMIN_FLOOR_WORK_ROLE =
  'ADMIN,EDP,DENTOR,PAINTER,TECHNICIAN,RUBBING,DENTOR_HELPER,PAINTER_HELPER'

async function userHasAdminAccess(
  userId: string,
  user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> },
): Promise<boolean> {
  const metaRole = String(
    user.user_metadata?.role ?? user.app_metadata?.role ?? user.user_metadata?.staff_role ?? '',
  ).trim().toLowerCase()
  if (metaRole === 'admin') return true

  const [{ data: profile }, { data: permissionRows }] = await Promise.all([
    supabase.from('users').select('role').eq('id', userId).maybeSingle(),
    supabase.rpc('get_all_my_permissions'),
  ])
  const role = String(profile?.role ?? metaRole).trim().toLowerCase()
  if (role === 'admin') return true
  return ((permissionRows ?? []) as Array<{ module_name?: string }>).some((row) => row.module_name === 'admin')
}

export async function getLinkedEmployeeContext(): Promise<LinkedEmployeeContext> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr) throw new Error(authErr.message)
  if (!user) throw new Error('Not signed in')

  let { data: linkRows, error: linkErr } = await supabase
    .from('user_employee_links')
    .select('employee_code, dealer_code, employee_master(employee_name, role)')
    .eq('user_id', user.id)
    .eq('is_primary', true)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (linkErr) throw new Error(linkErr.message)
  let link = linkRows?.[0] ?? null

  if (!link?.employee_code && (await userHasAdminAccess(user.id, user))) {
    const inactive = await supabase
      .from('user_employee_links')
      .select('employee_code, dealer_code, employee_master(employee_name, role)')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!inactive.error && inactive.data?.employee_code) {
      link = inactive.data
    }
  }

  const code = String(link?.employee_code ?? '').trim().toUpperCase()
  if (!code) {
    if (await userHasAdminAccess(user.id, user)) {
      const displayName =
        String(user.user_metadata?.full_name ?? user.email ?? 'Admin').trim() || 'Admin'
      return {
        employeeCode: '',
        employeeName: displayName,
        employeeRole: ADMIN_FLOOR_WORK_ROLE,
        dealerCode: null,
        isAdminOverview: true,
      }
    }
    throw new Error('No employee linked to your login. Ask admin: Admin → Mappings.')
  }

  const em = link?.employee_master as { employee_name?: string | null; role?: string | null } | null
  const ctx: LinkedEmployeeContext = {
    employeeCode: code,
    employeeName: String(em?.employee_name ?? '').trim() || null,
    employeeRole: String(em?.role ?? '').trim() || null,
    dealerCode: String(link?.dealer_code ?? '').trim() || null,
  }
  if (await userHasAdminAccess(user.id, user)) {
    ctx.isAdminOverview = true
    ctx.employeeRole = [ctx.employeeRole, ADMIN_FLOOR_WORK_ROLE].filter(Boolean).join(',')
  }
  return ctx
}
