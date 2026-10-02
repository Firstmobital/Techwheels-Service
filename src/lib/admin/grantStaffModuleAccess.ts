import { supabase } from '../supabase'
import { staffSignupAdminHint } from '../staffSignUpRoles'

export async function grantModulesToUser(
  userId: string,
  moduleNames: string[],
  mode: 'view_modify' | 'full' = 'view_modify',
): Promise<{ error?: string }> {
  const names = Array.from(new Set(moduleNames.map((n) => n.trim().toLowerCase()).filter(Boolean)))
  if (!userId || names.length === 0) return { error: 'User and module names required' }

  const { data: mods, error: modErr } = await supabase.from('modules').select('id, name').in('name', names).eq('is_active', true)
  if (modErr) return { error: modErr.message }
  if (!mods?.length) return { error: `No active modules found for: ${names.join(', ')}` }

  const full = mode === 'full'
  const upserts = mods.map((m) => ({
    user_id: userId,
    module_id: m.id,
    can_view: true,
    can_modify: full || mode === 'view_modify',
    can_delete: full,
  }))

  const { error } = await supabase.from('user_module_permissions').upsert(upserts, { onConflict: 'user_id,module_id' })
  if (error) return { error: error.message }
  return {}
}

/** Apply signup-hint modules (e.g. bodyshop_floor_work for painters). */
export async function grantSuggestedModulesFromSignupRole(
  userId: string,
  requestedAccessRole: string | null | undefined,
): Promise<{ error?: string; granted?: string[] }> {
  const hint = staffSignupAdminHint(requestedAccessRole)
  if (!hint?.modules.length) return { error: 'No suggested modules for this signup role' }
  const res = await grantModulesToUser(userId, hint.modules, 'view_modify')
  if (res.error) return res
  return { granted: hint.modules }
}
