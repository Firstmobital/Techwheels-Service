import { supabase } from '../supabase'
import { resolveExistingJobCardId, type JobReferenceHints } from './jobCards'
import { fail, ok, type ApiResult, type PanelRow } from './types'

export async function listPanels(jobCardId: string, hints?: JobReferenceHints): Promise<ApiResult<PanelRow[]>> {
  const resolvedIdRes = await resolveExistingJobCardId(jobCardId, hints)
  if (resolvedIdRes.error || !resolvedIdRes.data) return fail(resolvedIdRes.error ?? 'Job card not found')

  const { data, error } = await supabase
    .from('panels')
    .select('id, panel_name, action')
    .eq('job_card_id', resolvedIdRes.data)
    .order('created_at')

  if (error) return fail(error)
  return ok((data ?? []) as PanelRow[])
}

export async function createPanel(jobCardId: string, panelName: string, hints?: JobReferenceHints): Promise<ApiResult<PanelRow>> {
  const name = panelName.trim()
  if (!name) return fail('Panel name is required')
  const resolvedIdRes = await resolveExistingJobCardId(jobCardId, hints)
  if (resolvedIdRes.error || !resolvedIdRes.data) return fail(resolvedIdRes.error ?? 'Job card not found')

  const { data, error } = await supabase
    .from('panels')
    .insert({ job_card_id: resolvedIdRes.data, panel_name: name, action: 'repaint' })
    .select('id, panel_name, action')
    .single<PanelRow>()

  if (error) return fail(error)
  return ok(data)
}

export async function deletePanel(panelId: string): Promise<ApiResult<true>> {
  if (!panelId.trim()) return fail('Panel id is required')

  const { error } = await supabase
    .from('panels')
    .delete()
    .eq('id', panelId)

  if (error) return fail(error)
  return ok(true)
}

export async function syncDamagePanels(jobCardId: string, selectedPanels: string[], hints?: JobReferenceHints): Promise<ApiResult<{
  panels: PanelRow[]
  removedPanelNames: string[]
}>> {
  const resolvedIdRes = await resolveExistingJobCardId(jobCardId, hints)
  if (resolvedIdRes.error || !resolvedIdRes.data) return fail(resolvedIdRes.error ?? 'Job card not found')

  const normalizedSelected = Array.from(new Set(selectedPanels.map((name) => name.trim()).filter((name) => name.length > 0)))

  const directSyncFallback = async (): Promise<ApiResult<{
    panels: PanelRow[]
    removedPanelNames: string[]
  }>> => {
    const listRes = await listPanels(resolvedIdRes.data, hints)
    if (listRes.error || !listRes.data) {
      return fail(listRes.error ?? 'Unable to read existing panels')
    }

    const existingByName = new Map<string, PanelRow>()
    for (const panel of listRes.data) {
      const name = String(panel.panel_name ?? '').trim()
      if (!name) continue
      existingByName.set(name, panel)
    }

    const removedPanelNames: string[] = []
    const removedPanelIds: string[] = []
    for (const [name, panel] of existingByName.entries()) {
      if (normalizedSelected.includes(name)) continue
      removedPanelNames.push(name)
      removedPanelIds.push(panel.id)
    }

    for (const panelId of removedPanelIds) {
      const deletePhotosRes = await supabase
        .from('panel_photos')
        .delete()
        .eq('job_card_id', resolvedIdRes.data)
        .eq('panel_id', panelId)

      if (deletePhotosRes.error) return fail(deletePhotosRes.error)

      const deletePanelRes = await deletePanel(panelId)
      if (deletePanelRes.error) return fail(deletePanelRes.error)
    }

    if (removedPanelNames.length > 0) {
      const deleteEstimateRes = await supabase
        .from('estimate_rows')
        .delete()
        .eq('job_card_id', resolvedIdRes.data)
        .in('panel_name', removedPanelNames)

      if (deleteEstimateRes.error) return fail(deleteEstimateRes.error)
    }

    for (const panelName of normalizedSelected) {
      if (existingByName.has(panelName)) continue
      const createRes = await createPanel(resolvedIdRes.data, panelName, hints)
      if (createRes.error) return fail(createRes.error)
    }

    const finalRes = await listPanels(resolvedIdRes.data, hints)
    if (finalRes.error || !finalRes.data) return fail(finalRes.error ?? 'Unable to fetch final panel list')

    return ok({
      panels: finalRes.data,
      removedPanelNames,
    })
  }

  const invokeRes = await supabase.functions.invoke('autodoc-sync-panels', {
    body: { jobCardId: resolvedIdRes.data, selectedPanels: normalizedSelected },
  })

  if (invokeRes.error) {
    return directSyncFallback()
  }

  const result = (invokeRes.data ?? {}) as {
    error?: string
    panels?: PanelRow[]
    removedPanelNames?: string[]
  }

  if (result.error) {
    return directSyncFallback()
  }

  return ok({
    panels: result.panels ?? [],
    removedPanelNames: result.removedPanelNames ?? [],
  })
}
