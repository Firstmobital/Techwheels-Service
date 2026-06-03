import { supabase } from '../supabase'
import { fail, ok, type ApiResult } from './types'

export type DealerContext = {
  dealerCode: string
  dealerName: string | null
}

export type DealerScopeContext = {
  dealerCode: string
  dealerCodes: string[]
  dealerName: string | null
  source: 'admin' | 'mapping' | 'metadata' | 'users_table'
}

async function isActiveAdmin(userId: string): Promise<boolean> {
  const roleRes = await supabase
    .from('users')
    .select('role, is_active')
    .eq('id', userId)
    .maybeSingle()

  if (roleRes.error) return false

  const row = roleRes.data as { role?: string | null; is_active?: boolean | null } | null
  const role = String(row?.role ?? '').trim().toLowerCase()
  return role === 'admin' && row?.is_active === true
}

async function resolveGlobalDealerCodesForAdmin(userId: string): Promise<string[]> {
  const mappingRes = await supabase
    .from('user_employee_links')
    .select('dealer_code')
    .eq('user_id', userId)

  if (mappingRes.error) return []

  return Array.from(
    new Set(
      (mappingRes.data ?? [])
        .map((row) => String((row as { dealer_code?: string | null }).dealer_code ?? '').trim().toUpperCase())
        .filter(Boolean),
    ),
  )
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

async function resolveDealerScopeFromMappings(userId: string): Promise<DealerScopeContext | null> {
  const mappingRes = await supabase
    .from('user_employee_links')
    .select('dealer_code, is_primary, updated_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false })

  if (mappingRes.error) {
    return null
  }

  const uniqueDealerCodes = Array.from(
    new Set(
      (mappingRes.data ?? [])
        .map((row) => String((row as { dealer_code?: string | null }).dealer_code ?? '').trim().toUpperCase())
        .filter(Boolean),
    ),
  )

  if (uniqueDealerCodes.length === 0) {
    return null
  }

  return {
    dealerCode: uniqueDealerCodes[0],
    dealerCodes: uniqueDealerCodes,
    dealerName: null,
    source: 'mapping',
  }
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
  const scoped = await getDealerScopeContext()
  if (scoped.data) {
    return ok({ dealerCode: scoped.data.dealerCode, dealerName: scoped.data.dealerName })
  }
  return fail(scoped.error ?? 'No dealer code found in mapping, metadata, or users table. Contact admin to assign dealer data in at least one source.')
}

export async function getDealerScopeContext(): Promise<ApiResult<DealerScopeContext>> {
  const { data, error } = await supabase.auth.getSession()
  if (error) return fail(error)

  const user = data.session?.user
  const userId = user?.id

  const userMetadata = (user?.user_metadata ?? {}) as Record<string, unknown>
  const appMetadata = (user?.app_metadata ?? {}) as Record<string, unknown>

  const rawDealerCode = userMetadata.dealer_code ?? appMetadata.dealer_code
  const rawDealerName = userMetadata.dealer_name ?? appMetadata.dealer_name
  const rawDealerCodes = userMetadata.dealer_codes ?? appMetadata.dealer_codes

  const dealerCode = typeof rawDealerCode === 'string' ? rawDealerCode.trim().toUpperCase() : ''
  const dealerName = typeof rawDealerName === 'string' ? rawDealerName.trim() : null
  const dealerCodesFromMeta = Array.isArray(rawDealerCodes)
    ? rawDealerCodes
        .map((value) => String(value ?? '').trim().toUpperCase())
        .filter(Boolean)
    : []

  if (userId && await isActiveAdmin(userId)) {
    const [globalMappedDealerCodes, usersTableDealer] = await Promise.all([
      resolveGlobalDealerCodesForAdmin(userId),
      resolveDealerFromUsersTable(userId),
    ])

    const mergedDealerCodes = Array.from(
      new Set([
        ...globalMappedDealerCodes,
        ...dealerCodesFromMeta,
        dealerCode,
        String(usersTableDealer?.dealerCode ?? '').trim().toUpperCase(),
      ].filter(Boolean)),
    )

    if (mergedDealerCodes.length > 0) {
      return ok({
        dealerCode: mergedDealerCodes[0],
        dealerCodes: mergedDealerCodes,
        dealerName: dealerName || usersTableDealer?.dealerName || null,
        source: 'admin',
      })
    }
  }

  if (userId) {
    const fromMappingsScope = await resolveDealerScopeFromMappings(userId)
    if (fromMappingsScope) {
      return ok(fromMappingsScope)
    }
  }

  if (dealerCode) {
    return ok({
      dealerCode,
      dealerCodes: Array.from(new Set([dealerCode, ...dealerCodesFromMeta])),
      dealerName: dealerName || null,
      source: 'metadata',
    })
  }

  if (dealerCodesFromMeta.length > 0) {
    return ok({
      dealerCode: dealerCodesFromMeta[0],
      dealerCodes: Array.from(new Set(dealerCodesFromMeta)),
      dealerName: dealerName || null,
      source: 'metadata',
    })
  }

  if (userId) {
    const fromMappings = await resolveDealerFromMappings(userId)
    if (fromMappings?.dealerCode) {
      return ok({
        dealerCode: fromMappings.dealerCode,
        dealerCodes: [fromMappings.dealerCode],
        dealerName: fromMappings.dealerName,
        source: 'mapping',
      })
    }

    const fromUsersTable = await resolveDealerFromUsersTable(userId)
    if (fromUsersTable?.dealerCode) {
      return ok({
        dealerCode: fromUsersTable.dealerCode,
        dealerCodes: [fromUsersTable.dealerCode],
        dealerName: fromUsersTable.dealerName,
        source: 'users_table',
      })
    }
  }

  return fail('No dealer code found in mapping, metadata, or users table. Contact admin to assign dealer data in at least one source.')
}
