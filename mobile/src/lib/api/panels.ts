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

export async function syncDamagePanels(jobCardId: string, selectedPanels: string[]): Promise<ApiResult<{
  panels: PanelRow[]
  removedPanelNames: string[]
}>> {
  const resolvedIdRes = await resolveExistingJobCardId(jobCardId)
  if (resolvedIdRes.error || !resolvedIdRes.data) return fail(resolvedIdRes.error ?? 'Job card not found')

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
  if (!supabaseUrl) return fail('Supabase URL not configured')

  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token

  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/autodoc-sync-panels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jobCardId: resolvedIdRes.data, selectedPanels }),
    })
  } catch (error) {
    return fail(error, 'Unable to reach panel sync service')
  }

  const result = await response.json().catch(() => ({})) as {
    error?: string
    panels?: PanelRow[]
    removedPanelNames?: string[]
  }

  if (!response.ok) {
    return fail(result.error ?? `HTTP ${response.status}`)
  }

  return ok({
    panels: result.panels ?? [],
    removedPanelNames: result.removedPanelNames ?? [],
  })
}
