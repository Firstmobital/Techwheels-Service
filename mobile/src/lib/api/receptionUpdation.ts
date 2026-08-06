import { supabase } from '../supabase'

export type ReceptionUpdationContext = {
  has_updation_available: boolean
  updation_code?: string | null
  updation_name?: string | null
  portal?: string | null
}

function parseReceptionUpdationContext(raw: unknown): ReceptionUpdationContext {
  if (!raw || typeof raw !== 'object') {
    return { has_updation_available: false }
  }

  const payload = raw as {
    has_updation_available?: boolean
    updation_code?: string | null
    updation_name?: string | null
    portal?: string | null
  }

  if (!payload.has_updation_available) {
    return { has_updation_available: false }
  }

  return {
    has_updation_available: true,
    updation_code: payload.updation_code ?? null,
    updation_name: payload.updation_name ?? null,
    portal: payload.portal ?? null,
  }
}

export async function getReceptionUpdationContext(
  regNumber: string,
  portal?: string | null,
): Promise<{ data: ReceptionUpdationContext | null; error: string | null }> {
  const normalizedReg = regNumber.trim().toUpperCase()
  if (!normalizedReg) {
    return { data: { has_updation_available: false }, error: null }
  }

  const { data, error } = await supabase.rpc('get_reception_updation_context', {
    p_reg_number: normalizedReg,
    p_portal: portal?.trim() || null,
  })

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: parseReceptionUpdationContext(data), error: null }
}
