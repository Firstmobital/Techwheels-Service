/**
 * receptionPrefill.ts
 *
 * Fetches the most-recent service_reception_entries row for a given
 * registration number and returns the fields useful for prefilling
 * the mobile "New Job Card" form.
 */
import { supabase } from '../supabase'
import { normalizeRegNumber, ok, fail, type ApiResult } from './types'

export interface ReceptionPrefillData {
  ownerName: string | null
  ownerPhone: string | null
  model: string | null
  kmReading: number | null
  jcNumber: string | null
  saName: string | null
  serviceType: string | null
  branch: string | null
}

/**
 * Looks up the most-recent reception entry for this reg number.
 * Returns null data (not an error) when no entry is found.
 */
export async function fetchReceptionPrefillByReg(
  regNumber: string,
): Promise<ApiResult<ReceptionPrefillData | null>> {
  const normalized = normalizeRegNumber(regNumber)
  if (!normalized) return fail('Registration number is required')

  // Try normalized first, then raw-upper as fallback
  const candidates = Array.from(new Set([normalized, regNumber.trim().toUpperCase()]))

  for (const regKey of candidates) {
    const { data, error } = await supabase
      .from('service_reception_entries')
      .select(
        'owner_name, owner_phone, model, km_reading, jc_number, sa_name, service_type, branch',
      )
      .eq('reg_number', regKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      // Suppress 406/not found - treat as not found
      if (
        typeof error === 'object' &&
        (String((error as { code?: string }).code ?? '') === 'PGRST116' ||
          (error as { message?: string }).message?.includes('0 rows'))
      ) {
        continue
      }
      return fail(error)
    }

    if (data) {
      return ok({
        ownerName: (data as { owner_name?: string | null }).owner_name ?? null,
        ownerPhone: (data as { owner_phone?: string | null }).owner_phone ?? null,
        model: (data as { model?: string | null }).model ?? null,
        kmReading:
          (data as { km_reading?: number | null }).km_reading != null
            ? Number((data as { km_reading?: number | null }).km_reading)
            : null,
        jcNumber: (data as { jc_number?: string | null }).jc_number ?? null,
        saName: (data as { sa_name?: string | null }).sa_name ?? null,
        serviceType: (data as { service_type?: string | null }).service_type ?? null,
        branch: (data as { branch?: string | null }).branch ?? null,
      })
    }
  }

  return ok(null) // not found — not an error
}
