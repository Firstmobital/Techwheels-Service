import { supabase } from '../supabase'

export type LinkedEmployeeContext = {
  employeeCode: string
  employeeName: string | null
  employeeRole: string | null
  dealerCode: string | null
}

export async function getLinkedEmployeeContext(): Promise<LinkedEmployeeContext> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr) throw new Error(authErr.message)
  if (!user) throw new Error('Not signed in')

  const { data: link, error: linkErr } = await supabase
    .from('user_employee_links')
    .select('employee_code, dealer_code, employee_master(employee_name, role)')
    .eq('user_id', user.id)
    .eq('is_primary', true)
    .eq('is_active', true)
    .maybeSingle()
  if (linkErr) throw new Error(linkErr.message)

  const code = String(link?.employee_code ?? '').trim().toUpperCase()
  if (!code) {
    throw new Error('No employee linked to your login. Ask admin: Admin → Mappings.')
  }

  const em = link?.employee_master as { employee_name?: string | null; role?: string | null } | null
  return {
    employeeCode: code,
    employeeName: String(em?.employee_name ?? '').trim() || null,
    employeeRole: String(em?.role ?? '').trim() || null,
    dealerCode: String(link?.dealer_code ?? '').trim() || null,
  }
}
