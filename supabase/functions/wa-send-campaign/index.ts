import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

function renderTemplate(template: string, vars: Record<string,string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '')
}

async function sendWA(phoneNumberId: string, token: string, to: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  })
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const { campaign_id, batch_size = 20, delay_ms = 800 } = await req.json()
  if (!campaign_id) return Response.json({ error: 'campaign_id required' }, { status: 400 })

  const { data: cfgArr } = await sb.from('wa_agent_config').select('*').eq('id', 1).limit(1)
  const config = cfgArr?.[0] as Record<string,unknown>
  if (!config?.meta_phone_number_id || !config?.meta_access_token) {
    return Response.json({ error: 'Meta credentials not configured' }, { status: 400 })
  }

  const { data: campArr } = await sb.from('wa_campaigns').select('*').eq('id', campaign_id).limit(1)
  const campaign = campArr?.[0] as Record<string,unknown>
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 })

  await sb.from('wa_campaigns').update({ status: 'Running', started_at: new Date().toISOString() }).eq('id', campaign_id)

  const { data: contacts } = await sb.from('wa_campaign_contacts')
    .select('*').eq('campaign_id', campaign_id).eq('status', 'Pending').limit(batch_size)

  let sent = 0, failed = 0

  for (const contact of (contacts || [])) {
    const phone = (contact.phone as string).replace(/\D/g, '')
    const message = renderTemplate(campaign.template_message as string, {
      name: contact.customer_name || 'Customer',
      model: contact.model || '',
      reg_no: contact.reg_number || '',
      service_due: contact.service_due_date || '',
      branch: ((config.available_branches as string[]) || [])[0] || '',
      agent: config.agent_name as string || 'Riya',
      business: config.business_name as string || 'Techwheels Service',
    })

    try {
      const waRes = await sendWA(config.meta_phone_number_id as string, config.meta_access_token as string, `91${phone}`, message)

      if (waRes.messages?.[0]?.id) {
        // Ensure conversation exists
        const { data: existingConv } = await sb.from('wa_conversations').select('id').eq('phone', phone).limit(1)
        let convId = existingConv?.[0]?.id
        if (!convId) {
          const { data: newConvArr } = await sb.from('wa_conversations').insert([{
            phone, customer_name: contact.customer_name, reg_number: contact.reg_number,
            model: contact.model, campaign_id, status: 'Open', stage: 'intro', ai_turns: 0,
          }]).select('id')
          convId = newConvArr?.[0]?.id
        }
        if (convId) {
          await sb.from('wa_messages').insert([{
            conversation_id: convId, direction: 'outbound', sender: 'ai', body: message,
            wa_message_id: waRes.messages[0].id, ai_generated: false, status: 'sent',
          }])
        }
        await sb.from('wa_campaign_contacts').update({ status: 'Sent', sent_at: new Date().toISOString(), conversation_id: convId }).eq('id', contact.id)
        sent++
      } else {
        await sb.from('wa_campaign_contacts').update({ status: 'Failed' }).eq('id', contact.id)
        failed++
      }
    } catch { failed++ }

    await new Promise(r => setTimeout(r, delay_ms))
  }

  await sb.from('wa_campaigns').update({
    sent_count: ((campaign.sent_count as number) || 0) + sent,
    status: (contacts?.length || 0) < batch_size ? 'Completed' : 'Running',
    ...((contacts?.length || 0) < batch_size ? { completed_at: new Date().toISOString() } : {}),
  }).eq('id', campaign_id)

  return Response.json({ ok: true, sent, failed, total: contacts?.length || 0 })
})
