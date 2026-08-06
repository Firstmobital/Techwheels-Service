import { supabase } from '../supabase'
import { fail, ok, type ApiResult } from './types'

export type ReceptionRevisitPriorEntry = {
  id: number
  sa_employee_code: string | null
  sa_name: string | null
  jc_number: string | null
  service_type: string | null
  created_at: string
}

export type ReceptionRevisitContext = {
  is_revisit: boolean
  prior_entry?: ReceptionRevisitPriorEntry
  suggested_technician?: {
    code: string
    name: string | null
  } | null
}

function parseReceptionRevisitContext(raw: unknown): ReceptionRevisitContext {
  if (!raw || typeof raw !== 'object') {
    return { is_revisit: false }
  }

  const payload = raw as {
    is_revisit?: boolean
    prior_entry?: Record<string, unknown>
    suggested_technician?: Record<string, unknown> | null
  }

  if (!payload.is_revisit) {
    return { is_revisit: false }
  }

  const priorRaw = payload.prior_entry
  const priorEntry = priorRaw && typeof priorRaw === 'object'
    ? {
        id: Number(priorRaw.id),
        sa_employee_code: priorRaw.sa_employee_code != null ? String(priorRaw.sa_employee_code) : null,
        sa_name: priorRaw.sa_name != null ? String(priorRaw.sa_name) : null,
        jc_number: priorRaw.jc_number != null ? String(priorRaw.jc_number) : null,
        service_type: priorRaw.service_type != null ? String(priorRaw.service_type) : null,
        created_at: priorRaw.created_at != null ? String(priorRaw.created_at) : '',
      }
    : undefined

  const techRaw = payload.suggested_technician
  const suggestedTechnician =
    techRaw && typeof techRaw === 'object' && techRaw.code
      ? {
          code: String(techRaw.code),
          name: techRaw.name != null ? String(techRaw.name) : null,
        }
      : null

  return {
    is_revisit: true,
    prior_entry: priorEntry && Number.isFinite(priorEntry.id) ? priorEntry : undefined,
    suggested_technician: suggestedTechnician,
  }
}

export async function getReceptionRevisitContext(
  regNumber: string,
  serviceType: string | null | undefined,
  excludeEntryId?: number | null,
): Promise<ApiResult<ReceptionRevisitContext>> {
  const normalizedReg = regNumber.trim().toUpperCase()
  const normalizedServiceType = String(serviceType ?? '').trim()
  const floorTypes = [
    'Running Repairs',
    'First Free Service',
    'Second Free Service',
    'Third Free Service',
    'Paid Service',
    'Updation',
    'E Breakdown',
    'Campaign',
  ]

  if (!normalizedReg || !floorTypes.includes(normalizedServiceType)) {
    return ok({ is_revisit: false })
  }

  const { data, error } = await supabase.rpc('get_reception_revisit_context', {
    p_reg_number: normalizedReg,
    p_exclude_entry_id: excludeEntryId ?? null,
    p_service_type: normalizedServiceType,
  })

  if (error) return fail(error)
  return ok(parseReceptionRevisitContext(data))
}
