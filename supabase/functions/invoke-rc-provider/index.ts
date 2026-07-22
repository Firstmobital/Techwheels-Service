import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  asObject,
  extractIdspayDataForResponse,
  isIdspayVerificationFailure,
  isIdspayVerificationSuccess,
  mapIdspayDataToColumns,
  pickIdspayDataPayload,
} from '../_shared/idspayRcFields.ts'

const PROVIDER_SLUG = 'idspay'
const RTO_IDSPAY_TABLE = 'rto_idspay'

type JsonRecord = Record<string, unknown>

function normalizeRegNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function resolveRegistration(body: JsonRecord): string {
  const fromVehicle = normalizeRegNumber(String(body.vehicleNumber ?? ''))
  if (fromVehicle) return fromVehicle
  return normalizeRegNumber(String(body.reg_no ?? ''))
}

function idspayBaseUrl(env: string): string {
  const normalized = env.trim().toLowerCase()
  if (normalized === 'uat') return 'https://javabackend.idspay.in/api/v1/uat'
  return 'https://javabackend.idspay.in/api/v1/prod'
}

function buildCacheRow(
  registrationNo: string,
  upstreamJson: unknown,
  data: Record<string, unknown>,
  ttlHours: number,
  durationMs: number,
): JsonRecord {
  const ttl = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 24
  const now = new Date()
  const expires = new Date(now.getTime() + ttl * 60 * 60 * 1000)
  return {
    registration_no: registrationNo,
    source: PROVIDER_SLUG,
    provider_response: upstreamJson,
    verified: true,
    verified_at: now.toISOString(),
    cached_at: now.toISOString(),
    expires_at: expires.toISOString(),
    cache_ttl_hours: ttl,
    last_accessed_at: now.toISOString(),
    access_count: 1,
    last_api_call_duration_ms: Math.max(0, Math.round(durationMs)),
    ...mapIdspayDataToColumns(data),
  }
}

function providerErrorResponse(message: string, extra: JsonRecord = {}, status = 502): Response {
  return new Response(
    JSON.stringify({
      error: message,
      provider: PROVIDER_SLUG,
      ...extra,
    }),
    { status, headers: corsHeaders },
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const apiId = Deno.env.get('IDSPAY_API_ID')
    const apiKey = Deno.env.get('IDSPAY_API_KEY')
    const tokenId = Deno.env.get('IDSPAY_TOKEN_ID')
    const idspayEnv = Deno.env.get('IDSPAY_ENV') ?? 'prod'
    const cacheTtlHours = Number(Deno.env.get('RTO_CACHE_TTL_HOURS') ?? '24')

    if (!supabaseUrl || !serviceRoleKey) {
      return providerErrorResponse('Missing Supabase server configuration', {}, 500)
    }
    if (!apiId || !apiKey || !tokenId) {
      return providerErrorResponse('Missing IDSPay credentials (IDSPAY_API_ID, IDSPAY_API_KEY, IDSPAY_TOKEN_ID)', {}, 500)
    }

    const body = (await req.json().catch(() => ({}))) as JsonRecord
    const registrationNo = resolveRegistration(body)
    if (!registrationNo) {
      return new Response(JSON.stringify({ error: 'vehicleNumber or reg_no is required' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const nowMs = Date.now()

    const { data: cachedRows, error: cacheReadError } = await supabase
      .from(RTO_IDSPAY_TABLE)
      .select('*')
      .eq('registration_no', registrationNo)
      .order('cached_at', { ascending: false })
      .limit(1)

    if (cacheReadError) {
      return providerErrorResponse(`Cache read failed: ${cacheReadError.message}`, {}, 500)
    }

    let cached = (cachedRows?.[0] as JsonRecord | undefined) ?? null
    const cacheValid = Boolean(
      cached?.expires_at && new Date(String(cached.expires_at)).getTime() > nowMs,
    )

    if (cached && cacheValid) {
      const nextAccessCount = Number(cached.access_count ?? 0) + 1
      const { data: touched, error: touchError } = await supabase
        .from(RTO_IDSPAY_TABLE)
        .update({
          access_count: nextAccessCount,
          last_accessed_at: new Date().toISOString(),
        })
        .eq('id', cached.id)
        .select('*')
        .single()

      if (touchError) {
        return providerErrorResponse(`Cache touch failed: ${touchError.message}`, {}, 500)
      }

      const row = (touched ?? cached) as JsonRecord
      const data = extractIdspayDataForResponse(row)
      return new Response(
        JSON.stringify({
          success: true,
          source: 'rto_idspay',
          fromCache: true,
          provider: PROVIDER_SLUG,
          vehicle_no_field_used: 'reg_no',
          data_path_used: 'data',
          data,
          rto_idspay: row,
        }),
        { status: 200, headers: corsHeaders },
      )
    }

    const url = `${idspayBaseUrl(idspayEnv).replace(/\/$/, '')}/srv2/validation/rc`
    const upstreamBody = {
      api_id: apiId,
      api_key: apiKey,
      token_id: tokenId,
      reg_no: registrationNo,
    }

    const startedAt = performance.now()
    const apiResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(25000),
    })
    const durationMs = performance.now() - startedAt
    const upstreamJson = await apiResponse.json().catch(() => ({}))

    if (!apiResponse.ok) {
      const msg = String(asObject(upstreamJson)?.message ?? `IDSPay HTTP ${apiResponse.status}`)
      return providerErrorResponse(msg, { provider_status: apiResponse.status })
    }

    if (isIdspayVerificationFailure(upstreamJson)) {
      const root = asObject(upstreamJson)
      return providerErrorResponse(
        String(root?.message ?? 'Verification Failed.'),
        {
          message_code: root?.message_code ?? 'verification_failed',
          status_code: root?.status_code ?? 422,
          upstream: upstreamJson,
        },
        422,
      )
    }

    if (!isIdspayVerificationSuccess(upstreamJson)) {
      return providerErrorResponse('Unexpected IDSPay response shape', { upstream: upstreamJson })
    }

    const data = pickIdspayDataPayload(upstreamJson)
    if (!data.reg_no) {
      data.reg_no = registrationNo
    }

    const cachePayload = buildCacheRow(
      registrationNo,
      upstreamJson,
      data,
      cacheTtlHours,
      durationMs,
    )

    const { data: anyRegRows } = await supabase
      .from(RTO_IDSPAY_TABLE)
      .select('id, access_count')
      .eq('registration_no', registrationNo)
      .limit(1)

    const existingByReg = (anyRegRows?.[0] as JsonRecord | undefined) ?? null

    let savedRow: JsonRecord | null = null

    if (existingByReg?.id) {
      const { data: updated, error: updateError } = await supabase
        .from(RTO_IDSPAY_TABLE)
        .update({
          ...cachePayload,
          access_count: Number(existingByReg.access_count ?? cached?.access_count ?? 0) + 1,
        })
        .eq('id', existingByReg.id)
        .select('*')
        .single()
      if (updateError) {
        return providerErrorResponse(`Cache update failed: ${updateError.message}`, {}, 500)
      }
      savedRow = updated as JsonRecord
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from(RTO_IDSPAY_TABLE)
        .insert(cachePayload)
        .select('*')
        .single()
      if (insertError) {
        return providerErrorResponse(`Cache insert failed: ${insertError.message}`, {}, 500)
      }
      savedRow = inserted as JsonRecord
    }

    const responseData = extractIdspayDataForResponse(savedRow ?? mapIdspayDataToColumns(data))

    return new Response(
      JSON.stringify({
        success: true,
        source: 'live',
        fromCache: false,
        provider: PROVIDER_SLUG,
        vehicle_no_field_used: 'reg_no',
        data_path_used: 'data',
        data: responseData,
        rto_idspay: savedRow,
      }),
      { status: 200, headers: corsHeaders },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        provider: PROVIDER_SLUG,
      }),
      { status: 500, headers: corsHeaders },
    )
  }
})
