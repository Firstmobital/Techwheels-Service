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

export type HelpdeskContactGroup = 'dealership' | 'tata_motors'
export type HelpdeskBadgeVariant = 'blue' | 'amber' | 'rose' | 'indigo' | 'emerald'

export interface CustomerHelpdeskContact {
  id: number
  group_key: HelpdeskContactGroup
  sort_order: number
  level_label: string
  contact_name: string
  role_title: string
  description: string | null
  phone: string
  email: string | null
  icon_emoji: string | null
  badge_variant: HelpdeskBadgeVariant
  chat_contact_key: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type FuelPowertrainType = 'EV' | 'CNG' | 'DIESEL' | 'PETROL'

export interface FuelQueueItem {
  product_line: string
  unknown_rows: number
  sample_model: string | null
  sample_last_service_type: string | null
  signals: {
    contains_ev: boolean
    contains_cng: boolean
    diesel_markers: string[]
    petrol_markers: string[]
  }
  existing_override: {
    id: number
    match_pattern: string
    powertrain_type: FuelPowertrainType | 'UNKNOWN'
    priority: number
    is_active: boolean
    notes: string | null
    updated_at: string
  } | null
  suggested_powertrain_type: FuelPowertrainType | null
}

export interface FuelQueueResponse {
  items: FuelQueueItem[]
  limit: number
  remaining_unknown_groups: number
  as_of: string
}

export interface FuelResolveResponse {
  resolved: {
    product_line: string
    powertrain_type: FuelPowertrainType
    affected_rows: number
  }
  queue: FuelQueueResponse
}

export interface FuelOverrideRow {
  id: number
  match_pattern: string
  powertrain_type: FuelPowertrainType | 'UNKNOWN'
  priority: number
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

function normalizeModelName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

const GLOBAL_MODEL_DEALER_CODE = 'GLOBAL'

type ModelOptionRow = ModelOption & { dealer_code?: string }

function dedupeModelOptionRows(rows: ModelOptionRow[]): ModelOption[] {
  const bestByKey = new Map<string, ModelOptionRow>()

  for (const row of rows) {
    const key = normalizeModelName(row.model_name).toLowerCase()
    if (!key) continue

    const existing = bestByKey.get(key)
    if (!existing) {
      bestByKey.set(key, row)
      continue
    }

    const rowIsGlobal = row.dealer_code === GLOBAL_MODEL_DEALER_CODE
    const existingIsGlobal = existing.dealer_code === GLOBAL_MODEL_DEALER_CODE
    if (rowIsGlobal && !existingIsGlobal) {
      bestByKey.set(key, row)
      continue
    }
    if (!rowIsGlobal && existingIsGlobal) continue

    if (row.sort_order < existing.sort_order || (row.sort_order === existing.sort_order && row.id < existing.id)) {
      bestByKey.set(key, row)
    }
  }

  return Array.from(bestByKey.values())
    .sort((a, b) => a.sort_order - b.sort_order || a.model_name.localeCompare(b.model_name))
    .map(({ id, model_name, sort_order, is_active, created_at, updated_at }) => ({
      id,
      model_name,
      sort_order,
      is_active,
      created_at,
      updated_at,
    }))
}

export async function listModelOptions(): Promise<ApiResult<ModelOption[]>> {
  const { data, error } = await supabase
    .from('settings_model_options')
    .select('id, model_name, sort_order, is_active, created_at, updated_at, dealer_code')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('model_name', { ascending: true })

  if (error) return fail(error)
  return ok(dedupeModelOptionRows((data ?? []) as ModelOptionRow[]))
}

export async function createModelOption(modelName: string, sortOrder?: number): Promise<ApiResult<ModelOption>> {
  const normalized = normalizeModelName(modelName)
  if (!normalized) return fail('Model name is required')

  const { data, error } = await supabase
    .from('settings_model_options')
    .insert({
      model_name: normalized,
      dealer_code: GLOBAL_MODEL_DEALER_CODE,
      sort_order: sortOrder ?? 0,
      is_active: true,
    })
    .select('id, model_name, sort_order, is_active, created_at, updated_at')
    .single()

  if (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return fail(`Model '${normalized}' already exists`)
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
    const normalized = normalizeModelName(updates.modelName)
    if (!normalized) return fail('Model name is required')
    payload.model_name = normalized
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
  const rpcResult = await supabase.rpc('get_canonical_model_names')
  if (!rpcResult.error && Array.isArray(rpcResult.data)) {
    return ok((rpcResult.data as { model_name: string }[]).map((row) => row.model_name))
  }

  const listResult = await listModelOptions()
  if (listResult.error) return fail(rpcResult.error ?? listResult.error)
  return ok((listResult.data ?? []).map((row) => row.model_name))
}

export async function listBodyshopSurveyors(): Promise<ApiResult<BodyshopSurveyor[]>> {
  const { data, error } = await supabase
    .from('settings_bodyshop_surveyors')
    .select('id, surveyor_name, surveyor_contact_number, surveyor_email, created_at, updated_at')
    .order('surveyor_name', { ascending: true })

  const directRows = (data ?? []) as BodyshopSurveyor[]
  if (!error && directRows.length > 0) return ok(directRows)

  const rpcResult = await supabase.rpc('get_bodyshop_surveyor_options')
  if (rpcResult.error) {
    if (error) return fail(error)
    return ok(directRows)
  }

  const rpcRows = ((rpcResult.data ?? []) as BodyshopSurveyor[]).map((row) => ({
    ...row,
    id: Number(row.id),
  }))

  if (rpcRows.length > 0) return ok(rpcRows)
  return ok(directRows)
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

const HELPDESK_CONTACT_SELECT =
  'id, group_key, sort_order, level_label, contact_name, role_title, description, phone, email, icon_emoji, badge_variant, chat_contact_key, is_active, created_at, updated_at'

export async function listCustomerHelpdeskContacts(): Promise<ApiResult<CustomerHelpdeskContact[]>> {
  const { data, error } = await supabase
    .from('settings_customer_helpdesk_contacts')
    .select(HELPDESK_CONTACT_SELECT)
    .order('group_key', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })

  if (error) return fail(error)
  return ok((data ?? []) as CustomerHelpdeskContact[])
}

export async function createCustomerHelpdeskContact(input: {
  groupKey: HelpdeskContactGroup
  sortOrder?: number
  levelLabel: string
  contactName: string
  roleTitle: string
  description?: string | null
  phone: string
  email?: string | null
  iconEmoji?: string | null
  badgeVariant?: HelpdeskBadgeVariant
  chatContactKey?: string | null
  isActive?: boolean
}): Promise<ApiResult<CustomerHelpdeskContact>> {
  const levelLabel = input.levelLabel.trim()
  const contactName = input.contactName.trim()
  const roleTitle = input.roleTitle.trim()
  const phone = input.phone.trim()
  if (!levelLabel || !contactName || !roleTitle || !phone) {
    return fail('Level label, name, role, and phone are required.')
  }

  const { data, error } = await supabase
    .from('settings_customer_helpdesk_contacts')
    .insert({
      group_key: input.groupKey,
      sort_order: input.sortOrder ?? 0,
      level_label: levelLabel,
      contact_name: contactName,
      role_title: roleTitle,
      description: input.description?.trim() || null,
      phone,
      email: input.email?.trim() || null,
      icon_emoji: input.iconEmoji?.trim() || '👤',
      badge_variant: input.badgeVariant ?? 'blue',
      chat_contact_key: input.chatContactKey?.trim() || null,
      is_active: input.isActive ?? true,
    })
    .select(HELPDESK_CONTACT_SELECT)
    .single()

  if (error) return fail(error)
  return ok(data as CustomerHelpdeskContact)
}

export async function updateCustomerHelpdeskContact(
  id: number,
  updates: Partial<{
    groupKey: HelpdeskContactGroup
    sortOrder: number
    levelLabel: string
    contactName: string
    roleTitle: string
    description: string | null
    phone: string
    email: string | null
    iconEmoji: string | null
    badgeVariant: HelpdeskBadgeVariant
    chatContactKey: string | null
    isActive: boolean
  }>,
): Promise<ApiResult<CustomerHelpdeskContact>> {
  const payload: Record<string, unknown> = {}
  if (updates.groupKey !== undefined) payload.group_key = updates.groupKey
  if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder
  if (updates.levelLabel !== undefined) payload.level_label = updates.levelLabel.trim()
  if (updates.contactName !== undefined) payload.contact_name = updates.contactName.trim()
  if (updates.roleTitle !== undefined) payload.role_title = updates.roleTitle.trim()
  if (updates.description !== undefined) payload.description = updates.description?.trim() || null
  if (updates.phone !== undefined) payload.phone = updates.phone.trim()
  if (updates.email !== undefined) payload.email = updates.email?.trim() || null
  if (updates.iconEmoji !== undefined) payload.icon_emoji = updates.iconEmoji?.trim() || '👤'
  if (updates.badgeVariant !== undefined) payload.badge_variant = updates.badgeVariant
  if (updates.chatContactKey !== undefined) payload.chat_contact_key = updates.chatContactKey?.trim() || null
  if (updates.isActive !== undefined) payload.is_active = updates.isActive

  if (Object.keys(payload).length === 0) return fail('No updates provided.')

  const { data, error } = await supabase
    .from('settings_customer_helpdesk_contacts')
    .update(payload)
    .eq('id', id)
    .select(HELPDESK_CONTACT_SELECT)
    .single()

  if (error) return fail(error)
  return ok(data as CustomerHelpdeskContact)
}

export async function deleteCustomerHelpdeskContact(id: number): Promise<ApiResult<null>> {
  const { error } = await supabase.from('settings_customer_helpdesk_contacts').delete().eq('id', id)
  if (error) return fail(error)
  return ok(null)
}

export async function listFuelQueue(limit = 5): Promise<ApiResult<FuelQueueResponse>> {
  const { data, error } = await supabase.rpc('rpc_fuel_queue', {
    p_limit: limit,
  })

  if (error) return fail(error)

  const payload = (data ?? {
    items: [],
    limit,
    remaining_unknown_groups: 0,
    as_of: new Date().toISOString(),
  }) as FuelQueueResponse

  return ok(payload)
}

export async function resolveFuelQueueItem(input: {
  productLine: string
  powertrainType: FuelPowertrainType
  priority?: number
  notes?: string | null
  limit?: number
}): Promise<ApiResult<FuelResolveResponse>> {
  const productLine = input.productLine.trim()
  if (!productLine) return fail('Product line is required')

  const { data, error } = await supabase.rpc('rpc_fuel_resolve', {
    p_product_line: productLine,
    p_powertrain_type: input.powertrainType,
    p_priority: input.priority ?? 10,
    p_notes: input.notes ?? null,
    p_limit: input.limit ?? 5,
  })

  if (error) return fail(error)
  return ok(data as FuelResolveResponse)
}

export async function listFuelOverrides(options?: {
  onlyActive?: boolean
  limit?: number
  offset?: number
}): Promise<ApiResult<FuelOverrideRow[]>> {
  const { data, error } = await supabase.rpc('rpc_fuel_overrides', {
    p_only_active: options?.onlyActive ?? true,
    p_limit: options?.limit ?? 100,
    p_offset: options?.offset ?? 0,
  })

  if (error) return fail(error)
  return ok((data ?? []) as FuelOverrideRow[])
}
