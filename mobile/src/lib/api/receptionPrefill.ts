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
    const { data, error } = await supabase.rpc('get_reception_entry_latest_by_reg', {
      p_reg_number: regKey,
    })

    if (error) {
      return fail(error)
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          owner_name?: string | null
          owner_phone?: string | null
          model?: string | null
          km_reading?: number | null
          jc_number?: string | null
          sa_name?: string | null
          service_type?: string | null
          branch?: string | null
        }
      | undefined

    if (row) {
      return ok({
        ownerName: row.owner_name ?? null,
        ownerPhone: row.owner_phone ?? null,
        model: row.model ?? null,
        kmReading: row.km_reading != null ? Number(row.km_reading) : null,
        jcNumber: row.jc_number ?? null,
        saName: row.sa_name ?? null,
        serviceType: row.service_type ?? null,
        branch: row.branch ?? null,
      })
    }
  }

  return ok(null) // not found — not an error
}
