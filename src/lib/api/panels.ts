import { supabase } from '../supabase'
import { fail, ok, type ApiResult, type PanelRow } from './types'

export async function listPanels(jobCardId: string): Promise<ApiResult<PanelRow[]>> {
  const { data, error } = await supabase
    .from('panels')
    .select('id, panel_name, action')
    .eq('job_card_id', jobCardId)
    .order('created_at')

  if (error) return fail(error)
  return ok((data ?? []) as PanelRow[])
}

export async function createPanel(jobCardId: string, panelName: string): Promise<ApiResult<PanelRow>> {
  const name = panelName.trim()
  if (!name) return fail('Panel name is required')

  const { data, error } = await supabase
    .from('panels')
    .insert({ job_card_id: jobCardId, panel_name: name, action: 'repaint' })
    .select('id, panel_name, action')
    .single<PanelRow>()

  if (error) return fail(error)
  return ok(data)
}
