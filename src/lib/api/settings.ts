import { supabase } from '../supabase'
import { fail, ok, type ApiResult } from './types'

export interface ModelOption {
  id: number
  model_name: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface BodyshopSurveyor {
  id: number
  surveyor_name: string
  surveyor_contact_number: string
  surveyor_email: string | null
  created_at: string
  updated_at: string
}

export async function listModelOptions(): Promise<ApiResult<ModelOption[]>> {
  const { data, error } = await supabase
    .from('settings_model_options')
    .select('id, model_name, sort_order, is_active, created_at, updated_at')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('model_name', { ascending: true })

  if (error) return fail(error)
  return ok((data ?? []) as ModelOption[])
}

export async function createModelOption(modelName: string, sortOrder?: number): Promise<ApiResult<ModelOption>> {
  const trimmed = modelName.trim()
  if (!trimmed) return fail('Model name is required')

  const { data, error } = await supabase
    .from('settings_model_options')
    .insert({
      model_name: trimmed,
      sort_order: sortOrder ?? 0,
      is_active: true,
    })
    .select('id, model_name, sort_order, is_active, created_at, updated_at')
    .single()

  if (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return fail(`Model '${trimmed}' already exists`)
    }
    return fail(error)
  }

  return ok(data as ModelOption)
}

export async function updateModelOption(
  id: number,
  updates: { modelName?: string; sortOrder?: number; isActive?: boolean },
): Promise<ApiResult<ModelOption>> {
  const payload: Record<string, unknown> = {}

  if (updates.modelName !== undefined) {
    const trimmed = updates.modelName.trim()
    if (!trimmed) return fail('Model name is required')
    payload.model_name = trimmed
  }

  if (updates.sortOrder !== undefined) {
    payload.sort_order = updates.sortOrder
  }

  if (updates.isActive !== undefined) {
    payload.is_active = updates.isActive
  }

  if (Object.keys(payload).length === 0) {
    return fail('No updates provided')
  }

  const { data, error } = await supabase
    .from('settings_model_options')
    .update(payload)
    .eq('id', id)
    .select('id, model_name, sort_order, is_active, created_at, updated_at')
    .single()

  if (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return fail(`Model name already exists`)
    }
    return fail(error)
  }

  return ok(data as ModelOption)
}

export async function deleteModelOption(id: number): Promise<ApiResult<null>> {
  const { error } = await supabase.from('settings_model_options').delete().eq('id', id)

  if (error) return fail(error)
  return ok(null)
}

export async function getModelNames(): Promise<ApiResult<string[]>> {
  const { data, error } = await supabase
    .from('settings_model_options')
    .select('model_name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('model_name', { ascending: true })

  if (error) return fail(error)
  return ok((data ?? []).map((row: { model_name: string }) => row.model_name))
}

export async function listBodyshopSurveyors(): Promise<ApiResult<BodyshopSurveyor[]>> {
  const { data, error } = await supabase
    .from('settings_bodyshop_surveyors')
    .select('id, surveyor_name, surveyor_contact_number, surveyor_email, created_at, updated_at')
    .order('surveyor_name', { ascending: true })

  if (error) return fail(error)
  return ok((data ?? []) as BodyshopSurveyor[])
}

export async function createBodyshopSurveyor(input: {
  surveyorName: string
  surveyorContactNumber: string
  surveyorEmail?: string | null
}): Promise<ApiResult<BodyshopSurveyor>> {
  const surveyorName = input.surveyorName.trim()
  const surveyorContactNumber = input.surveyorContactNumber.trim()
  const surveyorEmail = input.surveyorEmail?.trim() || null

  if (!surveyorName) return fail('Surveyor name is required')
  if (!surveyorContactNumber) return fail('Surveyor contact number is required')

  const { data, error } = await supabase
    .from('settings_bodyshop_surveyors')
    .insert({
      surveyor_name: surveyorName,
      surveyor_contact_number: surveyorContactNumber,
      surveyor_email: surveyorEmail,
    })
    .select('id, surveyor_name, surveyor_contact_number, surveyor_email, created_at, updated_at')
    .single()

  if (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return fail(`Surveyor '${surveyorName}' with contact '${surveyorContactNumber}' already exists`)
    }
    return fail(error)
  }

  return ok(data as BodyshopSurveyor)
}

export async function updateBodyshopSurveyor(
  id: number,
  updates: {
    surveyorName?: string
    surveyorContactNumber?: string
    surveyorEmail?: string | null
  },
): Promise<ApiResult<BodyshopSurveyor>> {
  const payload: Record<string, unknown> = {}

  if (updates.surveyorName !== undefined) {
    const surveyorName = updates.surveyorName.trim()
    if (!surveyorName) return fail('Surveyor name is required')
    payload.surveyor_name = surveyorName
  }

  if (updates.surveyorContactNumber !== undefined) {
    const surveyorContactNumber = updates.surveyorContactNumber.trim()
    if (!surveyorContactNumber) return fail('Surveyor contact number is required')
    payload.surveyor_contact_number = surveyorContactNumber
  }

  if (updates.surveyorEmail !== undefined) {
    payload.surveyor_email = updates.surveyorEmail?.trim() || null
  }

  if (Object.keys(payload).length === 0) {
    return fail('No updates provided')
  }

  const { data, error } = await supabase
    .from('settings_bodyshop_surveyors')
    .update(payload)
    .eq('id', id)
    .select('id, surveyor_name, surveyor_contact_number, surveyor_email, created_at, updated_at')
    .single()

  if (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return fail('Surveyor with the same name and contact already exists')
    }
    return fail(error)
  }

  return ok(data as BodyshopSurveyor)
}

export async function deleteBodyshopSurveyor(id: number): Promise<ApiResult<null>> {
  const { error } = await supabase.from('settings_bodyshop_surveyors').delete().eq('id', id)

  if (error) return fail(error)
  return ok(null)
}
