import { supabase } from '../supabase'
import { fail, ok, type ApiResult } from './types'

export interface RateCardRow {
  id: string
  name: string
  city_category: string
  status: 'draft' | 'active' | 'archived'
  is_active: boolean
  effective_from: string | null
  effective_to: string | null
  notes: string | null
  created_at: string
}

export interface RateRowInput {
  modelName: string
  panelLabel: string
  ppRate: number | null
  pmRate: number | null
  psRate: number | null
}

export interface ModelPanelRate {
  panelKey: string
  panelLabel: string
  ppRate: number | null
  pmRate: number | null
  psRate: number | null
}

export interface ModelRatesSummary {
  card: RateCardRow
  modelName: string
  rows: ModelPanelRate[]
}

export interface AutoDocLookupOptions {
  modelOptions: string[]
  paintTypeOptions: string[]
  cityCategoryOptions: string[]
  claimTypeOptions: string[]
  yearOptions: string[]
}

export interface AutoDocWorkflowOptions {
  statusOptions: string[]
  photoStageOptions: string[]
  estimateActionOptions: string[]
}

export interface RateCardExportRow {
  modelName: string
  panelLabel: string
  ppRate: number | null
  pmRate: number | null
  psRate: number | null
}

function normalizeModelName(value: string): string {
  return value.trim().toUpperCase()
}

function normalizePanelLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeCityCategoryToken(value: string): string {
  const raw = value.trim().toUpperCase()
  if (!raw) return ''

  const letterMatch = raw.match(/(?:CATEGORY\s*)?([A-Z])$/)
  if (letterMatch?.[1]) return letterMatch[1]
  return raw
}

function cityCategoryCandidates(value: string): string[] {
  const trimmed = value.trim()
  const upper = trimmed.toUpperCase()
  const token = normalizeCityCategoryToken(value)
  const candidates = [trimmed, upper]

  if (token) {
    candidates.push(token, `Category ${token}`, `CATEGORY ${token}`)
  }

  return Array.from(new Set(candidates.filter(Boolean)))
}

function normalizeModelKey(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function modelKeyVariants(value: string): string[] {
  const base = normalizeModelKey(value)
  if (!base) return []

  const variants = new Set<string>([base])
  variants.add(base.replace(/EV$/, ''))
  variants.add(base.replace(/^NEW/, ''))

  return Array.from(variants).filter(Boolean)
}

export function panelKeyFromLabel(panelLabel: string): string {
  return panelLabel
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

async function ensurePanelMaster(panelLabel: string): Promise<ApiResult<string>> {
  const normalized = normalizePanelLabel(panelLabel)
  const panelKey = panelKeyFromLabel(normalized)

  const { error } = await supabase
    .from('autodoc_panel_master')
    .upsert({
      panel_key: panelKey,
      panel_label: normalized,
      is_active: true,
    }, { onConflict: 'panel_key' })

  if (error) return fail(error)
  return ok(panelKey)
}

export async function listRateCards(): Promise<ApiResult<RateCardRow[]>> {
  const { data, error } = await supabase
    .from('autodoc_rate_cards')
    .select('id, name, city_category, status, is_active, effective_from, effective_to, notes, created_at')
    .order('created_at', { ascending: false })

  if (error) return fail(error)
  return ok((data ?? []) as RateCardRow[])
}

export async function activateRateCard(cardId: string): Promise<ApiResult<true>> {
  const { data: card, error: cardError } = await supabase
    .from('autodoc_rate_cards')
    .select('id, city_category')
    .eq('id', cardId)
    .single<{ id: string; city_category: string }>()

  if (cardError || !card) return fail(cardError ?? 'Rate card not found')

  const deactivateRes = await supabase
    .from('autodoc_rate_cards')
    .update({ is_active: false, status: 'archived' })
    .eq('city_category', card.city_category)
    .eq('is_active', true)

  if (deactivateRes.error) return fail(deactivateRes.error)

  const activateRes = await supabase
    .from('autodoc_rate_cards')
    .update({ is_active: true, status: 'active' })
    .eq('id', cardId)

  if (activateRes.error) return fail(activateRes.error)
  return ok(true)
}

export async function createRateCardWithRows(input: {
  name: string
  cityCategory: string
  notes?: string
  rows: RateRowInput[]
  setActive?: boolean
}): Promise<ApiResult<RateCardRow>> {
  if (!input.rows.length) return fail('At least one rate row is required')

  const cityCategory = input.cityCategory.trim()

  // Prevent unique-active conflict: deactivate current active card before creating a new active card.
  if (input.setActive) {
    const deactivateRes = await supabase
      .from('autodoc_rate_cards')
      .update({ is_active: false, status: 'archived' })
      .eq('city_category', cityCategory)
      .eq('is_active', true)

    if (deactivateRes.error) return fail(deactivateRes.error)
  }

  const { data: card, error: cardError } = await supabase
    .from('autodoc_rate_cards')
    .insert({
      name: input.name.trim(),
      city_category: cityCategory,
      notes: input.notes?.trim() || null,
      status: input.setActive ? 'active' : 'draft',
      is_active: Boolean(input.setActive),
    })
    .select('id, name, city_category, status, is_active, effective_from, effective_to, notes, created_at')
    .single<RateCardRow>()

  if (cardError || !card) return fail(cardError ?? 'Unable to create rate card')

  const rateRowsPayload: Array<{
    rate_card_id: string
    model_name: string
    panel_key: string
    panel_label: string
    pp_rate: number | null
    pm_rate: number | null
    ps_rate: number | null
  }> = []

  for (const row of input.rows) {
    const panelRes = await ensurePanelMaster(row.panelLabel)
    if (panelRes.error || !panelRes.data) return fail(panelRes.error ?? 'Unable to ensure panel master')

    rateRowsPayload.push({
      rate_card_id: card.id,
      model_name: normalizeModelName(row.modelName),
      panel_key: panelRes.data,
      panel_label: normalizePanelLabel(row.panelLabel),
      pp_rate: row.ppRate,
      pm_rate: row.pmRate,
      ps_rate: row.psRate,
    })
  }

  const insertRatesRes = await supabase
    .from('autodoc_rate_rows')
    .insert(rateRowsPayload)

  if (insertRatesRes.error) return fail(insertRatesRes.error)
  return ok(card)
}

export async function getActiveModelRates(input: {
  cityCategory: string
  modelName: string
}): Promise<ApiResult<ModelRatesSummary | null>> {
  const cityCategory = input.cityCategory.trim()
  const modelName = normalizeModelName(input.modelName)

  if (!cityCategory || !modelName) return ok(null)

  let card: RateCardRow | null = null
  for (const candidate of cityCategoryCandidates(cityCategory)) {
    const cardRes = await supabase
      .from('autodoc_rate_cards')
      .select('id, name, city_category, status, is_active, effective_from, effective_to, notes, created_at')
      .eq('city_category', candidate)
      .eq('is_active', true)
      .maybeSingle<RateCardRow>()

    if (cardRes.error) return fail(cardRes.error)
    if (cardRes.data) {
      card = cardRes.data
      break
    }
  }

  if (!card) return ok(null)

  const rowShape = 'panel_key, panel_label, pp_rate, pm_rate, ps_rate'
  const exactRowsRes = await supabase
    .from('autodoc_rate_rows')
    .select(rowShape)
    .eq('rate_card_id', card.id)
    .eq('model_name', modelName)
    .order('panel_label', { ascending: true })

  if (exactRowsRes.error) return fail(exactRowsRes.error)

  let rows = (exactRowsRes.data ?? []) as Array<{
    panel_key: string
    panel_label: string
    pp_rate: number | null
    pm_rate: number | null
    ps_rate: number | null
  }>
  let matchedModelName = modelName

  if (rows.length === 0) {
    const modelRowsRes = await supabase
      .from('autodoc_rate_rows')
      .select('model_name')
      .eq('rate_card_id', card.id)

    if (modelRowsRes.error) return fail(modelRowsRes.error)

    const availableModels = Array.from(new Set(((modelRowsRes.data ?? []) as Array<{ model_name: string }>).map((r) => r.model_name)))
    const targetVariants = modelKeyVariants(input.modelName)
    const fallbackModel = availableModels.find((candidate) => {
      const candidateVariants = modelKeyVariants(candidate)
      return targetVariants.some((variant) => candidateVariants.includes(variant))
    })

    if (fallbackModel) {
      matchedModelName = fallbackModel
      const fallbackRowsRes = await supabase
        .from('autodoc_rate_rows')
        .select(rowShape)
        .eq('rate_card_id', card.id)
        .eq('model_name', fallbackModel)
        .order('panel_label', { ascending: true })

      if (fallbackRowsRes.error) return fail(fallbackRowsRes.error)
      rows = (fallbackRowsRes.data ?? []) as typeof rows
    }
  }

  return ok({
    card,
    modelName: matchedModelName,
    rows: rows.map((r) => ({
      panelKey: r.panel_key,
      panelLabel: r.panel_label,
      ppRate: r.pp_rate,
      pmRate: r.pm_rate,
      psRate: r.ps_rate,
    })),
  })
}

export async function getAutoDocLookupOptions(): Promise<ApiResult<AutoDocLookupOptions>> {
  const [cardsRes, ratesRes, vehiclesRes, jobCardsRes] = await Promise.all([
    supabase
      .from('autodoc_rate_cards')
      .select('city_category, is_active')
      .eq('is_active', true),
    supabase
      .from('autodoc_rate_rows')
      .select('model_name')
      .limit(5000),
    supabase
      .from('vehicles')
      .select('paint_type, year')
      .limit(5000),
    supabase
      .from('job_cards')
      .select('claim_type')
      .limit(5000),
  ])

  if (cardsRes.error) return fail(cardsRes.error)
  if (ratesRes.error) return fail(ratesRes.error)
  if (vehiclesRes.error) return fail(vehiclesRes.error)
  if (jobCardsRes.error) return fail(jobCardsRes.error)

  const modelSet = new Set<string>()
  const paintTypeSet = new Set<string>()
  const cityCategorySet = new Set<string>()
  const claimTypeSet = new Set<string>()
  const yearSet = new Set<string>()

  ;((ratesRes.data ?? []) as Array<{ model_name: string | null }>).forEach((row) => {
    const value = row.model_name?.trim()
    if (value) modelSet.add(value)
  })

  ;((cardsRes.data ?? []) as Array<{ city_category: string | null }>).forEach((row) => {
    const value = row.city_category?.trim()
    if (value) cityCategorySet.add(value)
  })

  ;((vehiclesRes.data ?? []) as Array<{ paint_type: string | null; year: number | null }>).forEach((row) => {
    const paintType = row.paint_type?.trim()

    if (paintType) paintTypeSet.add(paintType)
    if (typeof row.year === 'number' && Number.isFinite(row.year)) {
      yearSet.add(String(row.year))
    }
  })

  ;((jobCardsRes.data ?? []) as Array<{ claim_type: string | null }>).forEach((row) => {
    const value = row.claim_type?.trim()
    if (value) claimTypeSet.add(value)
  })

  const thisYear = new Date().getFullYear()
  for (let year = thisYear + 1; year >= thisYear - 20; year -= 1) {
    yearSet.add(String(year))
  }

  return ok({
    modelOptions: Array.from(modelSet).sort((a, b) => a.localeCompare(b)),
    paintTypeOptions: Array.from(paintTypeSet).sort((a, b) => a.localeCompare(b)),
    cityCategoryOptions: Array.from(cityCategorySet).sort((a, b) => a.localeCompare(b)),
    claimTypeOptions: Array.from(claimTypeSet).sort((a, b) => a.localeCompare(b)),
    yearOptions: Array.from(yearSet)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => b - a)
      .map((value) => String(value)),
  })
}

export async function getAutoDocWorkflowOptions(): Promise<ApiResult<AutoDocWorkflowOptions>> {
  const [jobCardsRes, photosRes, estimateRes] = await Promise.all([
    supabase
      .from('job_cards')
      .select('status')
      .limit(5000),
    supabase
      .from('panel_photos')
      .select('repair_stage')
      .limit(5000),
    supabase
      .from('estimate_rows')
      .select('action')
      .limit(5000),
  ])

  if (jobCardsRes.error) return fail(jobCardsRes.error)
  if (photosRes.error) return fail(photosRes.error)
  if (estimateRes.error) return fail(estimateRes.error)

  const statusOptions = Array.from(new Set(
    ((jobCardsRes.data ?? []) as Array<{ status: string | null }>)
      .map((row) => row.status?.trim())
      .filter((value): value is string => Boolean(value)),
  )).sort((a, b) => a.localeCompare(b))

  const photoStageOptions = Array.from(new Set(
    ((photosRes.data ?? []) as Array<{ repair_stage: string | null }>)
      .map((row) => row.repair_stage?.trim())
      .filter((value): value is string => Boolean(value)),
  )).sort((a, b) => a.localeCompare(b))
  ;['pre-repair', 'post-repair'].forEach((stage) => {
    if (!photoStageOptions.includes(stage)) photoStageOptions.push(stage)
  })
  photoStageOptions.sort((a, b) => a.localeCompare(b))

  const estimateActionOptions = Array.from(new Set(
    ((estimateRes.data ?? []) as Array<{ action: string | null }>)
      .map((row) => row.action?.trim())
      .filter((value): value is string => Boolean(value)),
  )).sort((a, b) => a.localeCompare(b))
  ;['repaint', 'replace'].forEach((action) => {
    if (!estimateActionOptions.includes(action)) estimateActionOptions.push(action)
  })
  estimateActionOptions.sort((a, b) => a.localeCompare(b))

  return ok({ statusOptions, photoStageOptions, estimateActionOptions })
}

export async function listActivePanelLabels(): Promise<ApiResult<string[]>> {
  const res = await supabase
    .from('autodoc_panel_master')
    .select('panel_label, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('panel_label', { ascending: true })

  if (res.error) return fail(res.error)

  const labels = Array.from(new Set(
    ((res.data ?? []) as Array<{ panel_label: string | null }>)
      .map((row) => row.panel_label?.trim())
      .filter((value): value is string => Boolean(value)),
  ))

  return ok(labels)
}

export async function exportActiveRateRowsByCityCategory(cityCategoryInput: string): Promise<ApiResult<RateCardExportRow[]>> {
  const cityCategory = cityCategoryInput.trim()
  if (!cityCategory) return fail('City category is required')

  let activeCardId: string | null = null

  for (const candidate of cityCategoryCandidates(cityCategory)) {
    const cardRes = await supabase
      .from('autodoc_rate_cards')
      .select('id')
      .eq('city_category', candidate)
      .eq('is_active', true)
      .maybeSingle<{ id: string }>()

    if (cardRes.error) return fail(cardRes.error)
    if (cardRes.data?.id) {
      activeCardId = cardRes.data.id
      break
    }
  }

  if (!activeCardId) return ok([])

  const rowsRes = await supabase
    .from('autodoc_rate_rows')
    .select('model_name, panel_label, pp_rate, pm_rate, ps_rate')
    .eq('rate_card_id', activeCardId)
    .order('model_name', { ascending: true })
    .order('panel_label', { ascending: true })

  if (rowsRes.error) return fail(rowsRes.error)

  const rows = ((rowsRes.data ?? []) as Array<{
    model_name: string | null
    panel_label: string | null
    pp_rate: number | null
    pm_rate: number | null
    ps_rate: number | null
  }>)
    .filter((row) => Boolean(row.model_name) && Boolean(row.panel_label))
    .map((row) => ({
      modelName: (row.model_name ?? '').trim(),
      panelLabel: (row.panel_label ?? '').trim(),
      ppRate: row.pp_rate,
      pmRate: row.pm_rate,
      psRate: row.ps_rate,
    }))

  return ok(rows)
}
