/**
 * wa-template-submit
 * Submits/syncs/deletes WhatsApp message templates via Meta Graph API
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { data: cfgArr } = await sb.from('wa_agent_config').select('*').eq('id', 1).limit(1)
  const config = cfgArr?.[0] as Record<string, unknown>
  if (!config) return json({ error: 'Agent config not found' }, 500)

  const metaToken = config.meta_access_token as string
  const wabaId    = config.waba_id as string
  const action    = body.action as string

  if (!metaToken) return json({ error: 'meta_access_token not configured' }, 400)

  // ── submit ────────────────────────────────────────────────────────────────
  if (action === 'submit') {
    if (!wabaId) return json({ error: 'waba_id not configured in Settings. Add your WhatsApp Business Account ID.' }, 400)
    const { data: tplArr } = await sb.from('wa_templates').select('*').eq('id', body.template_id).limit(1)
    const tpl = tplArr?.[0] as Record<string, unknown>
    if (!tpl) return json({ error: 'Template not found' }, 404)
    if (['approved','pending'].includes(tpl.status as string))
      return json({ error: `Template is already ${tpl.status}` }, 400)

    const components: unknown[] = []
    if (tpl.header_type && tpl.header_type !== 'NONE') {
      const h: Record<string,unknown> = { type:'HEADER', format: tpl.header_type }
      if (tpl.header_type === 'TEXT' && tpl.header_text) h.text = tpl.header_text
      components.push(h)
    }
    const varExamples = (tpl.variable_examples as Array<{name:string;example_value:string}>) || []
    const bodyComp: Record<string,unknown> = { type:'BODY', text: tpl.body_text }
    if (varExamples.length) bodyComp.example = { body_text: [varExamples.map(v => v.example_value)] }
    components.push(bodyComp)
    if (tpl.footer_text) components.push({ type:'FOOTER', text: tpl.footer_text })
    const buttons = tpl.buttons as Array<{type:string;text:string;url?:string;phone?:string}>|null
    if (buttons?.length) {
      components.push({ type:'BUTTONS', buttons: buttons.map(b =>
        b.type==='URL' ? {type:'URL',text:b.text,url:b.url} :
        b.type==='PHONE_NUMBER' ? {type:'PHONE_NUMBER',text:b.text,phone_number:b.phone} :
        {type:'QUICK_REPLY',text:b.text}
      )})
    }

    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/message_templates`, {
      method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${metaToken}`},
      body: JSON.stringify({ name:tpl.name, language:tpl.language||'en', category:tpl.category, components }),
    })
    const metaData = await metaRes.json()
    if (metaData.error) {
      await sb.from('wa_templates').update({ status:'rejected', rejection_reason:`Meta: ${metaData.error.message}`, updated_at:new Date().toISOString() }).eq('id', body.template_id)
      return json({ error: metaData.error.message, meta_error: metaData.error }, 400)
    }
    await sb.from('wa_templates').update({ meta_template_id:metaData.id||null, status:(metaData.status||'PENDING').toLowerCase(), rejection_reason:null, submitted_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id', body.template_id)
    return json({ success:true, meta_template_id:metaData.id, status:metaData.status, message:`Template submitted! Meta will review within 24–48 hours. Status: ${metaData.status}` })
  }

  // ── sync_status ───────────────────────────────────────────────────────────
  if (action === 'sync_status') {
    if (!wabaId) return json({ error:'waba_id not configured' }, 400)
    const { data: tplArr } = await sb.from('wa_templates').select('*').eq('id', body.template_id).limit(1)
    const tpl = tplArr?.[0] as Record<string,unknown>
    if (!tpl?.meta_template_id) return json({ error:'Template not submitted to Meta yet' }, 400)
    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/message_templates?name=${encodeURIComponent(tpl.name as string)}&fields=id,name,status,rejected_reason`, { headers:{Authorization:`Bearer ${metaToken}`} })
    const metaData = await metaRes.json()
    if (metaData.error) return json({ error:metaData.error.message }, 400)
    const found = metaData.data?.[0]
    if (!found) return json({ error:'Not found in Meta' }, 404)
    const newStatus = (found.status||'').toLowerCase()
    const upd: Record<string,unknown> = { status:newStatus, updated_at:new Date().toISOString() }
    if (found.rejected_reason) upd.rejection_reason = found.rejected_reason
    if (newStatus === 'approved') upd.approved_at = new Date().toISOString()
    await sb.from('wa_templates').update(upd).eq('id', body.template_id)
    return json({ success:true, status:newStatus, rejection_reason:found.rejected_reason||null })
  }

  // ── sync_all ──────────────────────────────────────────────────────────────
  if (action === 'sync_all') {
    if (!wabaId) return json({ error:'waba_id not configured' }, 400)
    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/message_templates?fields=id,name,status,rejected_reason&limit=100`, { headers:{Authorization:`Bearer ${metaToken}`} })
    const metaData = await metaRes.json()
    if (metaData.error) return json({ error:metaData.error.message }, 400)
    const metaMap = Object.fromEntries((metaData.data||[]).map((t: Record<string,string>) => [t.name, t]))
    const { data: ourTpls } = await sb.from('wa_templates').select('id,name,status').in('status',['pending','submitted'])
    let synced = 0
    for (const tpl of (ourTpls||[])) {
      const m = (metaMap as Record<string, Record<string,string>>)[tpl.name as string]
      if (!m) continue
      const ns = (m.status||'').toLowerCase()
      const upd: Record<string,unknown> = { status:ns, updated_at:new Date().toISOString() }
      if (m.rejected_reason) upd.rejection_reason = m.rejected_reason
      if (ns === 'approved') upd.approved_at = new Date().toISOString()
      await sb.from('wa_templates').update(upd).eq('id', tpl.id)
      synced++
    }
    return json({ success:true, synced, total_meta_templates:(metaData.data||[]).length })
  }

  // ── delete ────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    if (!wabaId) return json({ error:'waba_id not configured' }, 400)
    const { data: tplArr } = await sb.from('wa_templates').select('*').eq('id', body.template_id).limit(1)
    const tpl = tplArr?.[0] as Record<string,unknown>
    if (!tpl) return json({ error:'Template not found' }, 404)
    if (tpl.meta_template_id) {
      const delRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/message_templates?hsm_id=${tpl.meta_template_id}&name=${tpl.name}`, { method:'DELETE', headers:{Authorization:`Bearer ${metaToken}`} })
      const dd = await delRes.json()
      if (dd.error && dd.error.code !== 100) return json({ error:dd.error.message }, 400)
    }
    await sb.from('wa_templates').update({ status:'deleted', updated_at:new Date().toISOString() }).eq('id', body.template_id)
    return json({ success:true })
  }

  return json({ error:`Unknown action: ${action}` }, 400)
})
