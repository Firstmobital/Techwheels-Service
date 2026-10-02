import { supabase } from '../supabase'
import { fail, ok, type ApiResult } from './types'

export type LinkedEmployeeContext = {
  employeeCode: string
  employeeName: string | null
  employeeRole: string | null
  dealerCode: string | null
}

export async function getLinkedEmployeeContext(): Promise<ApiResult<LinkedEmployeeContext>> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr) return fail(authErr.message)
  if (!user) return fail('Not signed in')

  const { data: link, error: linkErr } = await supabase
    .from('user_employee_links')
    .select('employee_code, dealer_code, employee_master(employee_name, role)')
    .eq('user_id', user.id)
    .eq('is_primary', true)
    .eq('is_active', true)
    .maybeSingle()
  if (linkErr) return fail(linkErr.message)

  const code = String(link?.employee_code ?? '').trim().toUpperCase()
  if (!code) {
    return fail('No employee linked to your login. Ask admin to map user → employee code in Admin.')
  }

  const em = link?.employee_master as { employee_name?: string | null; role?: string | null } | null
  return ok({
    employeeCode: code,
    employeeName: String(em?.employee_name ?? '').trim() || null,
    employeeRole: String(em?.role ?? '').trim() || null,
    dealerCode: String(link?.dealer_code ?? '').trim() || null,
  })
}
