import { supabase } from '../supabase'
import { fail, ok, type ApiResult } from './types'

export type DealerContext = {
  dealerCode: string
  dealerName: string | null
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
    return fail('No dealer code found in your account metadata. Contact admin to assign a dealer code.')
  }

  return ok({ dealerCode, dealerName: dealerName || null })
}
