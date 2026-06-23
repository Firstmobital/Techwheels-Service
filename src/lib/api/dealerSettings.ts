/**
 * dealerSettings.ts (web)
 * Read and write dealer-level settings from dealer_settings table.
 */
import { supabase } from '../supabase'

const DEALER_CODE = '3000840'

export interface DealerSettings {
  reportEmail: string | null
}

export async function getDealerSettings(): Promise<DealerSettings> {
  const { data, error } = await supabase
    .from('dealer_settings')
    .select('setting_key, setting_value')
    .eq('dealer_code', DEALER_CODE)

  if (error || !data) {
    console.warn('[dealerSettings] fetch failed:', error?.message)
    return { reportEmail: null }
  }

  const map: Record<string, string | null> = {}
  for (const row of data as Array<{ setting_key: string; setting_value: string | null }>) {
    map[row.setting_key] = row.setting_value
  }

  return { reportEmail: map['report_email'] ?? null }
}

export async function saveDealerSetting(
  key: string,
  value: string,
  updatedBy?: string,
): Promise<{ error: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const email = sessionData.session?.user?.email ?? updatedBy ?? 'unknown'

  const { error } = await supabase
    .from('dealer_settings')
    .upsert(
      {
        dealer_code: DEALER_CODE,
        setting_key: key,
        setting_value: value.trim(),
        updated_by: email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'dealer_code,setting_key' },
    )

  return { error: error?.message ?? null }
}
