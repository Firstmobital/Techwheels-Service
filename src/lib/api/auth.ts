import { supabase } from '../supabase'
import { fail, ok, type ApiResult } from './types'

export type DealerContext = {
  dealerCode: string
  dealerName: string | null
}

async function resolveDealerFromMappings(userId: string): Promise<DealerContext | null> {
  const mappingRes = await supabase
    .from('user_employee_links')
    .select('dealer_code, is_primary, updated_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)

  if (mappingRes.error) {
    return null
  }

  const mappingRow = (mappingRes.data ?? [])[0] as { dealer_code?: string | null } | undefined
  const mappedDealerCode = String(mappingRow?.dealer_code ?? '').trim().toUpperCase()
  if (!mappedDealerCode) {
    return null
  }

  return { dealerCode: mappedDealerCode, dealerName: null }
}

async function resolveDealerFromUsersTable(userId: string): Promise<DealerContext | null> {
  const usersRes = await supabase
    .from('users')
    .select('dealer_code, dealer_name')
    .eq('id', userId)
    .maybeSingle()

  if (usersRes.error) {
    return null
  }

  const row = usersRes.data as { dealer_code?: string | null; dealer_name?: string | null } | null
  const tableDealerCode = String(row?.dealer_code ?? '').trim().toUpperCase()
  if (!tableDealerCode) {
    return null
  }

  const tableDealerName = String(row?.dealer_name ?? '').trim()
  return {
    dealerCode: tableDealerCode,
    dealerName: tableDealerName || null,
  }
}

export async function getDealerContext(): Promise<ApiResult<DealerContext>> {
  const { data, error } = await supabase.auth.getSession()
  if (error) return fail(error)

  const user = data.session?.user
  const userMetadata = (user?.user_metadata ?? {}) as Record<string, unknown>
  const appMetadata = (user?.app_metadata ?? {}) as Record<string, unknown>

  const rawDealerCode = userMetadata.dealer_code ?? appMetadata.dealer_code
  const rawDealerName = userMetadata.dealer_name ?? appMetadata.dealer_name

  const dealerCode = typeof rawDealerCode === 'string' ? rawDealerCode.trim().toUpperCase() : ''
  const dealerName = typeof rawDealerName === 'string' ? rawDealerName.trim() : null

  if (!dealerCode) {
    const userId = user?.id
    if (userId) {
      const fromMappings = await resolveDealerFromMappings(userId)
      if (fromMappings?.dealerCode) {
        return ok(fromMappings)
      }

      const fromUsersTable = await resolveDealerFromUsersTable(userId)
      if (fromUsersTable?.dealerCode) {
        return ok(fromUsersTable)
      }
    }

    return fail('No dealer code found in metadata, mapping, or users table. Contact admin to assign dealer data in at least one source.')
  }

  return ok({ dealerCode, dealerName: dealerName || null })
}
