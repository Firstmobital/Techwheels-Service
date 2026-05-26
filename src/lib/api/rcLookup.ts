import { supabase } from '../supabase'
import { fail, normalizeRegNumber, ok, type ApiResult } from './types'

export type RtoCacheLookupRow = {
  registration_no?: string | null
  api_rc_reg_no?: string | null
  api_rc_vehicle_number?: string | null
  api_rc_chassis?: string | null
  api_rc_chassis_number?: string | null
  api_rc_model?: string | null
  api_rc_vehicle_class?: string | null
  api_rc_vehicle_manufacturer_name?: string | null
  api_rc_vehicle_colour?: string | null
  api_rc_owner?: string | null
  api_rc_mobile_number?: string | null
  api_rc_reg_authority?: string | null
  api_rc_reg_date?: string | null
  api_rc_vehicle_manufacturing_month_year?: string | null
}

const RC_LOOKUP_REQUIRED_KEYS = [
  'registration_no',
  'api_rc_reg_no',
  'api_rc_vehicle_number',
  'api_rc_chassis',
  'api_rc_chassis_number',
  'api_rc_model',
  'api_rc_owner',
] as const

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function hasRtoKeys(value: unknown): value is RtoCacheLookupRow {
  const obj = asObject(value)
  if (!obj) return false
  return RC_LOOKUP_REQUIRED_KEYS.some((key) => key in obj)
}

function findRtoCacheRecord(value: unknown, depth = 0): RtoCacheLookupRow | null {
  if (depth > 4 || value == null) return null

  if (hasRtoKeys(value)) return value

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRtoCacheRecord(item, depth + 1)
      if (found) return found
    }
    return null
  }

  const obj = asObject(value)
  if (!obj) return null

  const likelyChildren = [
    obj.data,
    obj.result,
    obj.record,
    obj.cache,
    obj.cache_record,
    obj.cacheRecord,
    obj.rto_cache,
    obj.rtoCache,
    obj.response,
    obj.payload,
  ]

  for (const child of likelyChildren) {
    const found = findRtoCacheRecord(child, depth + 1)
    if (found) return found
  }

  return null
}

export async function fetchVehicleFromRcLookup(reference: string): Promise<ApiResult<RtoCacheLookupRow | null>> {
  const normalizedVehicleNumber = normalizeRegNumber(reference)
  if (!normalizedVehicleNumber) return fail('Registration number is required for RC lookup')

  const rcLookupFunctionName = ((import.meta.env.VITE_RC_LOOKUP_FUNCTION_NAME as string | undefined) || 'invoke-ocean025').trim()

  try {
    const { data: payload, error } = await supabase.functions.invoke(rcLookupFunctionName, {
      body: { vehicleNumber: normalizedVehicleNumber, consent: 'Y' },
    })

    if (error) {
      return fail(error.message || 'RC lookup failed')
    }

    const rtoRecord = findRtoCacheRecord(payload)
    if (!rtoRecord) return ok(null)
    return ok(rtoRecord)
  } catch (error) {
    return fail(error, 'Unable to call RC lookup service')
  }
  export async function fetchVehicleFromRcLookup(reference: string): Promise<ApiResult<RtoCacheLookupRow | null>> {
    const normalizedVehicleNumber = normalizeRegNumber(reference)
    console.log('[RC-LOOKUP] normalized input:', reference, 'result:', normalizedVehicleNumber)
    if (!normalizedVehicleNumber) return fail('Registration number is required for RC lookup')

    const rcLookupFunctionName = ((import.meta.env.VITE_RC_LOOKUP_FUNCTION_NAME as string | undefined) || 'invoke-ocean025').trim()
    console.log('[RC-LOOKUP] Calling edge function:', rcLookupFunctionName)

    try {
      console.log('[RC-LOOKUP] Invoking with body:', { vehicleNumber: normalizedVehicleNumber, consent: 'Y' })
      const { data: payload, error } = await supabase.functions.invoke(rcLookupFunctionName, {
        body: { vehicleNumber: normalizedVehicleNumber, consent: 'Y' },
      })
      console.log('[RC-LOOKUP] Response received:', { error: error?.message, payloadType: typeof payload, payload })

      if (error) {
        console.error('[RC-LOOKUP] Function error:', error)
        return fail(error.message || 'RC lookup failed')
      }

      const rtoRecord = findRtoCacheRecord(payload)
      console.log('[RC-LOOKUP] RTO record found?', !!rtoRecord, rtoRecord)
      if (!rtoRecord) return ok(null)
      return ok(rtoRecord)
    } catch (error) {
      console.error('[RC-LOOKUP] Exception caught:', error)
      return fail(error, 'Unable to call RC lookup service')
    }
  }
}