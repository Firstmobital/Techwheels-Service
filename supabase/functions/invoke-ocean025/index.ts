import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type JsonRecord = Record<string, unknown>

type RtoCacheRow = {
  id: string
  registration_no: string
  expires_at: string | null
  access_count: number | null
  cached_at: string | null
  [key: string]: unknown
}

function normalizeRegNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function asObject(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as JsonRecord
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed.length > 0) return trimmed
  }
  return null
}

function pickBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (['true', 'yes', 'y', '1'].includes(normalized)) return true
      if (['false', 'no', 'n', '0'].includes(normalized)) return false
    }
  }
  return null
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function findPayloadRoot(payload: unknown): JsonRecord {
  const root = asObject(payload)
  if (!root) return {}
  const candidates = [
    root.data,
    asObject(root.result)?.data || root.result,
    asObject(root.response)?.data || root.response,
    asObject(root.payload)?.data || root.payload,
    root.vehicle,
  ]
  for (const candidate of candidates) {
    const obj = asObject(candidate)
    if (obj) return obj
  }
  return root
}

function buildCachePayload(registrationNo: string, apiResponse: unknown, ttlHours: number, durationMs: number): JsonRecord {
  const root = findPayloadRoot(apiResponse)

  const rcRegNo = pickString(
    root.api_rc_reg_no,
    root.reg_no,
    root.registration_no,
    root.vehicle_number,
    root.rc_number,
    registrationNo,
  )

  const rcChassis = pickString(root.api_rc_chassis, root.chassis, root.chassis_number)
  const rcEngine = pickString(root.api_rc_engine, root.engine, root.engine_number)

  const payload: JsonRecord = {
    registration_no: registrationNo,
    api_rc_response: apiResponse,
    api_rc_verified: Boolean(rcRegNo || rcChassis),
    api_rc_verified_at: new Date().toISOString(),
    api_rc_reg_no: rcRegNo,
    api_rc_vehicle_number: pickString(root.api_rc_vehicle_number, root.vehicle_number, root.vehicleNumber),
    api_rc_chassis: rcChassis,
    api_rc_chassis_number: pickString(root.api_rc_chassis_number, root.chassis_number),
    api_rc_engine: rcEngine,
    api_rc_engine_number: pickString(root.api_rc_engine_number, root.engine_number),
    api_rc_vehicle_manufacturer_name: pickString(root.api_rc_vehicle_manufacturer_name, root.vehicle_manufacturer_name, root.vehicleManufacturerName),
    api_rc_model: pickString(root.api_rc_model, root.model),
    api_rc_vehicle_colour: pickString(root.api_rc_vehicle_colour, root.vehicle_colour, root.colour, root.vehicleColour),
    api_rc_type: pickString(root.api_rc_type, root.type),
    api_rc_norms_type: pickString(root.api_rc_norms_type, root.norms_type, root.normsType),
    api_rc_body_type: pickString(root.api_rc_body_type, root.body_type, root.bodyType),
    api_rc_owner_count: pickNumber(root.api_rc_owner_count, root.owner_count, root.ownerCount),
    api_rc_owner: pickString(root.api_rc_owner, root.owner_name, root.owner),
    api_rc_owner_father_name: pickString(root.api_rc_owner_father_name, root.owner_father_name, root.ownerFatherName),
    api_rc_mobile_number: pickString(root.api_rc_mobile_number, root.mobile_number, root.phone_number, root.mobileNumber),
    api_rc_status: pickString(root.api_rc_status, root.status),
    api_rc_status_as_on: pickString(root.api_rc_status_as_on, root.status_as_on, root.statusAsOn),
    api_rc_reg_authority: pickString(root.api_rc_reg_authority, root.reg_authority, root.regAuthority),
    api_rc_reg_date: pickString(root.api_rc_reg_date, root.reg_date, root.regDate),
    api_rc_vehicle_manufacturing_month_year: pickString(root.api_rc_vehicle_manufacturing_month_year, root.vehicle_manufacturing_month_year, root.vehicleManufacturingMonthYear),
    api_rc_rc_expiry_date: pickString(root.api_rc_rc_expiry_date, root.rc_expiry_date, root.rcExpiryDate),
    api_rc_vehicle_tax_upto: pickString(root.api_rc_vehicle_tax_upto, root.vehicle_tax_upto, root.vehicleTaxUpto),
    api_rc_vehicle_insurance_company_name: pickString(root.api_rc_vehicle_insurance_company_name, root.vehicle_insurance_company_name, root.vehicleInsuranceCompanyName),
    api_rc_vehicle_insurance_upto: pickString(root.api_rc_vehicle_insurance_upto, root.vehicle_insurance_upto, root.vehicleInsuranceUpto),
    api_rc_vehicle_insurance_policy_number: pickString(root.api_rc_vehicle_insurance_policy_number, root.vehicle_insurance_policy_number, root.vehicleInsurancePolicyNumber),
    api_rc_rc_financer: pickString(root.api_rc_rc_financer, root.rc_financer, root.rcFinancer),
    api_rc_present_address: pickString(root.api_rc_present_address, root.present_address, root.presentAddress),
    api_rc_permanent_address: pickString(root.api_rc_permanent_address, root.permanent_address, root.permanentAddress),
    api_rc_vehicle_cubic_capacity: pickString(root.api_rc_vehicle_cubic_capacity, root.vehicle_cubic_capacity, root.vehicleCubicCapacity),
    api_rc_gross_vehicle_weight: pickString(root.api_rc_gross_vehicle_weight, root.gross_vehicle_weight, root.grossVehicleWeight),
    api_rc_unladen_weight: pickString(root.api_rc_unladen_weight, root.unladen_weight, root.unladenWeight),
    api_rc_vehicle_category: pickString(root.api_rc_vehicle_category, root.vehicle_category, root.vehicleCategory),
    api_rc_rc_standard_cap: pickString(root.api_rc_rc_standard_cap, root.rc_standard_cap, root.rcStandardCap),
    api_rc_vehicle_cylinders_no: pickString(root.api_rc_vehicle_cylinders_no, root.vehicle_cylinders_no, root.vehicleCylindersNo),
    api_rc_vehicle_seat_capacity: pickString(root.api_rc_vehicle_seat_capacity, root.vehicle_seat_capacity, root.vehicleSeatCapacity),
    api_rc_vehicle_sleeper_capacity: pickString(root.api_rc_vehicle_sleeper_capacity, root.vehicle_sleeper_capacity, root.vehicleSleeperCapacity),
    api_rc_vehicle_standing_capacity: pickString(root.api_rc_vehicle_standing_capacity, root.vehicle_standing_capacity, root.vehicleStandingCapacity),
    api_rc_wheelbase: pickString(root.api_rc_wheelbase, root.wheelbase),
    api_rc_vehicle_number: pickString(root.api_rc_vehicle_number, root.vehicle_number, root.vehicleNumber),
    api_rc_pucc_number: pickString(root.api_rc_pucc_number, root.pucc_number, root.puccNumber),
    api_rc_pucc_upto: pickString(root.api_rc_pucc_upto, root.pucc_upto, root.puccUpto),
    api_rc_blacklist_status: pickString(root.api_rc_blacklist_status, root.blacklist_status, root.blacklistStatus),
    api_rc_blacklist_status_bool: pickBoolean(root.api_rc_blacklist_status_bool, root.blacklist_status_bool, root.blacklistStatus),
    api_rc_blacklist_details: asObject(root.api_rc_blacklist_details) ?? asObject(root.blacklistDetails) ?? root.api_rc_blacklist_details ?? null,
    api_rc_permit_issue_date: pickString(root.api_rc_permit_issue_date, root.permit_issue_date, root.permitIssueDate),
    api_rc_permit_number: pickString(root.api_rc_permit_number, root.permit_number, root.permitNumber),
    api_rc_permit_type: pickString(root.api_rc_permit_type, root.permit_type, root.permitType),
    api_rc_permit_type_full: pickString(root.api_rc_permit_type_full, root.permit_type_full, root.permitType),
    api_rc_permit_valid_from: pickString(root.api_rc_permit_valid_from, root.permit_valid_from, root.permitValidFrom),
    api_rc_permit_valid_upto: pickString(root.api_rc_permit_valid_upto, root.permit_valid_upto, root.permitValidUpto),
    api_rc_non_use_status: pickString(root.api_rc_non_use_status, root.non_use_status, root.nonUseStatus),
    api_rc_non_use_from: pickString(root.api_rc_non_use_from, root.non_use_from, root.nonUseFrom),
    api_rc_non_use_to: pickString(root.api_rc_non_use_to, root.non_use_to, root.nonUseTo),
    api_rc_national_permit_number: pickString(root.api_rc_national_permit_number, root.national_permit_number, root.nationalPermitNumber),
    api_rc_national_permit_upto: pickString(root.api_rc_national_permit_upto, root.national_permit_upto, root.nationalPermitUpto),
    api_rc_national_permit_issued_by: pickString(root.api_rc_national_permit_issued_by, root.national_permit_issued_by, root.nationalPermitIssuedBy),
    api_rc_is_commercial: pickBoolean(root.api_rc_is_commercial, root.is_commercial, root.isCommercial),
    api_rc_noc_details: pickString(root.api_rc_noc_details, root.noc_details, root.nocDetails),
    api_rc_db_result: pickBoolean(root.api_rc_db_result, root.db_result, root.dbResult),
    api_rc_partial_data: pickBoolean(root.api_rc_partial_data, root.partial_data, root.partialData),
    api_rc_mmv_response: pickString(root.api_rc_mmv_response, root.mmv_response, root.mmvResponse),
    api_rc_financed: pickBoolean(root.api_rc_financed, root.financed),
    api_rc_vehicle_class: pickString(root.api_rc_vehicle_class, root.vehicle_class, root.class),
    api_rc_police_complaint: pickBoolean(root.api_rc_police_complaint, root.police_complaint),
    api_rc_theft_record: pickBoolean(root.api_rc_theft_record, root.theft_record),
    source: 'all_rto_data',
    cached_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString(),
    cache_ttl_hours: ttlHours,
    last_accessed_at: new Date().toISOString(),
    access_count: 1,
    last_api_call_duration_ms: Math.max(0, Math.round(durationMs)),
  }

  return payload
}

function hasSparseMappedColumns(row: RtoCacheRow): boolean {
  const keyFields = [
    'api_rc_chassis',
    'api_rc_engine',
    'api_rc_model',
    'api_rc_vehicle_colour',
    'api_rc_owner',
    'api_rc_reg_authority',
    'api_rc_reg_date',
  ]

  return keyFields.every((field) => {
    const value = row[field]
    if (typeof value === 'string') return value.trim().length === 0
    return value == null
  })
}

function buildHydrationPatchFromRawResponse(row: RtoCacheRow): JsonRecord {
  const rawResponse = row.api_rc_response
  if (rawResponse == null) return {}

  const ttlHours = Number(row.cache_ttl_hours ?? 24)
  const durationMs = Number(row.last_api_call_duration_ms ?? 0)
  const rebuilt = buildCachePayload(
    row.registration_no,
    rawResponse,
    Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 24,
    Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0,
  )

  const patch: JsonRecord = {
    api_rc_verified: rebuilt.api_rc_verified,
    api_rc_verified_at: rebuilt.api_rc_verified_at,
    api_rc_reg_no: rebuilt.api_rc_reg_no,
    api_rc_vehicle_number: rebuilt.api_rc_vehicle_number,
    api_rc_chassis: rebuilt.api_rc_chassis,
    api_rc_chassis_number: rebuilt.api_rc_chassis_number,
    api_rc_engine: rebuilt.api_rc_engine,
    api_rc_engine_number: rebuilt.api_rc_engine_number,
    api_rc_vehicle_manufacturer_name: rebuilt.api_rc_vehicle_manufacturer_name,
    api_rc_model: rebuilt.api_rc_model,
    api_rc_vehicle_colour: rebuilt.api_rc_vehicle_colour,
    api_rc_type: rebuilt.api_rc_type,
    api_rc_norms_type: rebuilt.api_rc_norms_type,
    api_rc_body_type: rebuilt.api_rc_body_type,
    api_rc_owner_count: rebuilt.api_rc_owner_count,
    api_rc_owner: rebuilt.api_rc_owner,
    api_rc_owner_father_name: rebuilt.api_rc_owner_father_name,
    api_rc_mobile_number: rebuilt.api_rc_mobile_number,
    api_rc_status: rebuilt.api_rc_status,
    api_rc_status_as_on: rebuilt.api_rc_status_as_on,
    api_rc_reg_authority: rebuilt.api_rc_reg_authority,
    api_rc_reg_date: rebuilt.api_rc_reg_date,
    api_rc_vehicle_manufacturing_month_year: rebuilt.api_rc_vehicle_manufacturing_month_year,
    api_rc_rc_expiry_date: rebuilt.api_rc_rc_expiry_date,
    api_rc_vehicle_tax_upto: rebuilt.api_rc_vehicle_tax_upto,
    api_rc_vehicle_insurance_company_name: rebuilt.api_rc_vehicle_insurance_company_name,
    api_rc_vehicle_insurance_upto: rebuilt.api_rc_vehicle_insurance_upto,
    api_rc_vehicle_insurance_policy_number: rebuilt.api_rc_vehicle_insurance_policy_number,
    api_rc_rc_financer: rebuilt.api_rc_rc_financer,
    api_rc_present_address: rebuilt.api_rc_present_address,
    api_rc_permanent_address: rebuilt.api_rc_permanent_address,
    api_rc_vehicle_cubic_capacity: rebuilt.api_rc_vehicle_cubic_capacity,
    api_rc_gross_vehicle_weight: rebuilt.api_rc_gross_vehicle_weight,
    api_rc_unladen_weight: rebuilt.api_rc_unladen_weight,
    api_rc_vehicle_category: rebuilt.api_rc_vehicle_category,
    api_rc_rc_standard_cap: rebuilt.api_rc_rc_standard_cap,
    api_rc_vehicle_cylinders_no: rebuilt.api_rc_vehicle_cylinders_no,
    api_rc_vehicle_seat_capacity: rebuilt.api_rc_vehicle_seat_capacity,
    api_rc_vehicle_sleeper_capacity: rebuilt.api_rc_vehicle_sleeper_capacity,
    api_rc_vehicle_standing_capacity: rebuilt.api_rc_vehicle_standing_capacity,
    api_rc_wheelbase: rebuilt.api_rc_wheelbase,
    api_rc_pucc_number: rebuilt.api_rc_pucc_number,
    api_rc_pucc_upto: rebuilt.api_rc_pucc_upto,
    api_rc_blacklist_status: rebuilt.api_rc_blacklist_status,
    api_rc_blacklist_status_bool: rebuilt.api_rc_blacklist_status_bool,
    api_rc_blacklist_details: rebuilt.api_rc_blacklist_details,
    api_rc_permit_issue_date: rebuilt.api_rc_permit_issue_date,
    api_rc_permit_number: rebuilt.api_rc_permit_number,
    api_rc_permit_type: rebuilt.api_rc_permit_type,
    api_rc_permit_type_full: rebuilt.api_rc_permit_type_full,
    api_rc_permit_valid_from: rebuilt.api_rc_permit_valid_from,
    api_rc_permit_valid_upto: rebuilt.api_rc_permit_valid_upto,
    api_rc_non_use_status: rebuilt.api_rc_non_use_status,
    api_rc_non_use_from: rebuilt.api_rc_non_use_from,
    api_rc_non_use_to: rebuilt.api_rc_non_use_to,
    api_rc_national_permit_number: rebuilt.api_rc_national_permit_number,
    api_rc_national_permit_upto: rebuilt.api_rc_national_permit_upto,
    api_rc_national_permit_issued_by: rebuilt.api_rc_national_permit_issued_by,
    api_rc_is_commercial: rebuilt.api_rc_is_commercial,
    api_rc_noc_details: rebuilt.api_rc_noc_details,
    api_rc_db_result: rebuilt.api_rc_db_result,
    api_rc_partial_data: rebuilt.api_rc_partial_data,
    api_rc_mmv_response: rebuilt.api_rc_mmv_response,
    api_rc_financed: rebuilt.api_rc_financed,
    api_rc_vehicle_class: rebuilt.api_rc_vehicle_class,
    api_rc_police_complaint: rebuilt.api_rc_police_complaint,
    api_rc_theft_record: rebuilt.api_rc_theft_record,
  }

  return patch
}

function makeHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  }
}

Deno.serve(async (req) => {
  const headers = makeHeaders()

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const oceanClientId = Deno.env.get('INVINCIBLE_OCEAN_CLIENT_ID')
    const oceanSecretKey = Deno.env.get('INVINCIBLE_OCEAN_SECRET_KEY')
    const oceanBaseUrl = (Deno.env.get('INVINCIBLE_OCEAN_BASE_URL') ?? 'https://api.invincibleocean.com/invincible').replace(/\/$/, '')
    const cacheTtlHours = Number(Deno.env.get('RTO_CACHE_TTL_HOURS') ?? '24')

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase server configuration' }), { status: 500, headers })
    }

    if (!oceanClientId || !oceanSecretKey) {
      return new Response(JSON.stringify({ error: 'Missing RC provider credentials' }), { status: 500, headers })
    }

    const body = await req.json().catch(() => ({})) as { vehicleNumber?: string; consent?: string }
    const vehicleNumber = normalizeRegNumber(String(body.vehicleNumber ?? ''))
    const consent = String(body.consent ?? 'Y').toUpperCase()

    if (!vehicleNumber) {
      return new Response(JSON.stringify({ error: 'vehicleNumber is required' }), { status: 400, headers })
    }

    if (consent !== 'Y') {
      return new Response(JSON.stringify({ error: 'consent must be Y' }), { status: 400, headers })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: cachedRows, error: cacheReadError } = await supabase
      .from('rto_cache')
      .select('*')
      .eq('registration_no', vehicleNumber)
      .order('cached_at', { ascending: false })
      .limit(1)

    if (cacheReadError) {
      return new Response(JSON.stringify({ error: `Cache read failed: ${cacheReadError.message}` }), { status: 500, headers })
    }

    const cached = (cachedRows?.[0] as RtoCacheRow | undefined) ?? null
    const nowMs = Date.now()
    const cacheValid = Boolean(cached && cached.expires_at && new Date(cached.expires_at).getTime() > nowMs)

    if (cached && cacheValid) {
      const nextAccessCount = (cached.access_count ?? 0) + 1
      const shouldHydrate = hasSparseMappedColumns(cached) && cached.api_rc_response != null
      const hydrationPatch = shouldHydrate ? buildHydrationPatchFromRawResponse(cached) : {}
      const { data: touched, error: touchError } = await supabase
        .from('rto_cache')
        .update({
          ...hydrationPatch,
          access_count: nextAccessCount,
          last_accessed_at: new Date().toISOString(),
        })
        .eq('id', cached.id)
        .select('*')
        .single()

      if (touchError) {
        return new Response(JSON.stringify({ error: `Cache touch failed: ${touchError.message}` }), { status: 500, headers })
      }

      return new Response(JSON.stringify({
        success: true,
        source: 'rto_cache',
        fromCache: true,
        data: touched,
      }), { status: 200, headers })
    }

    const startedAt = performance.now()
    const apiUrl = `${oceanBaseUrl}/vehicleRcV6`
    const consentText = 'I explicitly consent to the collection, processing, and verification of my data for authentication, KYC, and compliance purposes.'
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'secretKey': oceanSecretKey,
        'clientId': oceanClientId,
      },
      body: JSON.stringify({ vehicleNumber, consent: consentText }),
      signal: AbortSignal.timeout(20000),
    })
    const durationMs = performance.now() - startedAt

    const apiPayload = await apiResponse.json().catch(() => ({}))

    if (!apiResponse.ok) {
      const providerMessage = pickString(
        asObject(apiPayload)?.error,
        asObject(apiPayload)?.message,
      )

      if (cached) {
        return new Response(JSON.stringify({
          success: true,
          source: 'rto_cache_stale',
          fromCache: true,
          stale: true,
          warning: providerMessage ?? `Provider request failed with HTTP ${apiResponse.status}`,
          data: cached,
        }), { status: 200, headers })
      }

      return new Response(JSON.stringify({
        error: providerMessage ?? `Provider request failed with HTTP ${apiResponse.status}`,
        provider_status: apiResponse.status,
      }), { status: 502, headers })
    }

    const cachePayload = buildCachePayload(vehicleNumber, apiPayload, Number.isFinite(cacheTtlHours) && cacheTtlHours > 0 ? cacheTtlHours : 24, durationMs)

    let savedRow: RtoCacheRow | null = null

    if (cached) {
      const { data: updated, error: updateError } = await supabase
        .from('rto_cache')
        .update(cachePayload)
        .eq('id', cached.id)
        .select('*')
        .single()

      if (updateError) {
        return new Response(JSON.stringify({ error: `Cache update failed: ${updateError.message}` }), { status: 500, headers })
      }

      savedRow = updated as RtoCacheRow
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('rto_cache')
        .insert(cachePayload)
        .select('*')
        .single()

      if (insertError) {
        return new Response(JSON.stringify({ error: `Cache insert failed: ${insertError.message}` }), { status: 500, headers })
      }

      savedRow = inserted as RtoCacheRow
    }

    return new Response(JSON.stringify({
      success: true,
      source: 'provider_api',
      fromCache: false,
      data: savedRow,
    }), { status: 200, headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers,
    })
  }
})
