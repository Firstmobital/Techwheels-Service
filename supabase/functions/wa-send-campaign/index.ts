/**
 * wa-send-campaign
 * Sends a campaign batch. Supports two modes:
 *   blast — plain text message
 *   flow  — Meta template with "Book My Service" button; sets flow_active on conv
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

function renderTemplate(template: string, vars: Record<string,string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '')
}

async function sendText(phoneId: string, token: string, to: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  })
  return res.json()
}

async function sendFlowTemplate(
  phoneId: string, token: string, to: string,
  templateName: string, language: string,
  params: Array<{ type: 'text'; text: string }>
) {
  // Send Meta template with "Book My Service" CTA button
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language || 'en' },
        components: [
          {
            type: 'body',
            parameters: params,
          },
        ],
      },
    }),
  })
  return res.json()
}

function buildTemplateBodyParams(
  vars: Record<string, string>,
  flowTemplate: Record<string, unknown> | null,
): Array<{ type: 'text'; text: string }> {
  const examples = (flowTemplate?.variable_examples as Array<{ name?: string; example_value?: string }> | null) || []
  if (examples.length > 0) {
    return examples.map((ex) => {
      const key = (ex.name || '').trim()
      const val = (key && vars[key]) ? vars[key] : (ex.example_value || '')
      return { type: 'text', text: String(val || '') }
    })
  }

  const fallbackOrder = ['name', 'model', 'reg_no', 'service_due', 'branch', 'agent', 'business']
  return fallbackOrder.map((k) => ({ type: 'text', text: vars[k] || '' }))
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const { campaign_id, batch_size = 20, delay_ms = 800, test_numbers } = await req.json()
  if (!campaign_id) return Response.json({ error: 'campaign_id required' }, { status: 400 })

  const { data: cfgArr } = await sb.from('wa_agent_config').select('*').eq('id', 1).limit(1)
  const cfg = cfgArr?.[0] as Record<string,unknown>
  if (!cfg?.meta_phone_number_id || !cfg?.meta_access_token)
    return Response.json({ error: 'Meta credentials not configured' }, { status: 400 })

  const phoneId = cfg.meta_phone_number_id as string
  const token   = cfg.meta_access_token as string

  const { data: campArr } = await sb.from('wa_campaigns').select('*').eq('id', campaign_id).limit(1)
  const campaign = campArr?.[0] as Record<string,unknown>
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 })

  const isFlow = campaign.campaign_flow_type === 'flow'

  // If flow campaign, get the Meta template details
  let flowTemplate: Record<string,unknown> | null = null
  if (isFlow && campaign.template_id) {
    const { data: tplArr } = await sb.from('wa_templates').select('*').eq('id', campaign.template_id).limit(1)
    flowTemplate = tplArr?.[0] as Record<string,unknown> ?? null
    if (!flowTemplate || flowTemplate.status !== 'approved') {
      return Response.json({ error: 'Flow campaign requires an approved Meta template. Please approve the template first.' }, { status: 400 })
    }
  }

  // ── TEST MODE: send to specific numbers instead of campaign contacts ─────────
  const isTest = Array.isArray(test_numbers) && test_numbers.length > 0

  if (!isTest) {
    await sb.from('wa_campaigns').update({ status: 'Running', started_at: new Date().toISOString() }).eq('id', campaign_id)
  }

  // Build contact list: either test numbers or pending campaign contacts
  let contacts: Array<Record<string, unknown>>

  if (isTest) {
    contacts = test_numbers.map((num: string) => ({
      phone: num,
      customer_name: 'Test Customer',
      reg_number: 'TEST-001',
      model: 'Test Model',
      service_due_date: '',
      status: 'Pending',
    }))
  } else {
    const { data: dbContacts } = await sb.from('wa_campaign_contacts')
      .select('*').eq('campaign_id', campaign_id).eq('status', 'Pending').limit(batch_size)
    contacts = (dbContacts || []) as unknown as Array<Record<string, unknown>>
  }

  let sent = 0, failed = 0

  for (const contact of contacts) {
    const rawPhone = (contact.phone as string).replace(/\D/g, '')
    const e164 = rawPhone.startsWith('91') ? `+${rawPhone}` : `+91${rawPhone}`
    const local10 = rawPhone.slice(-10)

    const vars: Record<string,string> = {
      name:        contact.customer_name as string || 'Customer',
      model:       contact.model as string || '',
      reg_no:      contact.reg_number as string || '',
      service_due: contact.service_due_date as string || '',
      branch:      ((cfg.available_branches as string[]) || [])[0] || '',
      agent:       cfg.agent_name as string || 'Riya',
      business:    cfg.business_name as string || 'Techwheels Service',
    }

    try {
      let waRes: Record<string,unknown>

      if (isFlow && flowTemplate) {
        // Send Meta template with CTA button
        const bodyParams = buildTemplateBodyParams(vars, flowTemplate)
        waRes = await sendFlowTemplate(phoneId, token, e164,
          flowTemplate.name as string, flowTemplate.language as string || 'en', bodyParams)
      } else {
        // Plain text blast
        const message = renderTemplate(campaign.template_message as string, vars)
        waRes = await sendText(phoneId, token, e164, message)
      }

      const msgId = (waRes.messages as Array<{id:string}>)?.[0]?.id
      if (msgId) {
        // Upsert conversation
        const { data: existingConv } = await sb.from('wa_conversations')
          .select('id,flow_active')
          .or(`phone.eq.${local10},phone.eq.${e164}`)
          .limit(1)

        let convId = existingConv?.[0]?.id as number | undefined
        if (!convId) {
          const { data: newConvArr } = await sb.from('wa_conversations').insert([{
            phone: local10,
            customer_name: contact.customer_name,
            reg_number: contact.reg_number,
            model: contact.model,
            campaign_id,
            flow_campaign_id: isFlow ? campaign_id : null,
            status: 'Open',
            stage: 'intro',
            ai_turns: 0,
            // If flow campaign: immediately set up flow so when customer taps button, we're ready
            flow_active: false,  // becomes true when customer taps the button
            flow_step: isFlow ? 'blast_sent' : null,
            flow_data: isFlow ? { campaign_id } : {},
          }]).select('id')
          convId = newConvArr?.[0]?.id as number
        } else if (isFlow) {
          // Mark existing conv as flow-ready
          await sb.from('wa_conversations').update({
            flow_campaign_id: campaign_id,
            flow_step: 'blast_sent',
            flow_data: { campaign_id },
            updated_at: new Date().toISOString(),
          }).eq('id', convId)
        }

        if (convId) {
          const msgBody = isFlow
            ? `[Flow Template: ${flowTemplate?.display_name}] Sent to ${e164}`
            : renderTemplate(campaign.template_message as string, vars)

          await sb.from('wa_messages').insert([{
            conversation_id: convId,
            direction: 'outbound',
            sender: 'campaign',
            body: msgBody,
            wa_message_id: msgId,
            ai_generated: false,
            status: 'sent',
          }])
        }

        if (!isTest && contact.id) {
          await sb.from('wa_campaign_contacts').update({
            status: 'Sent',
            sent_at: new Date().toISOString(),
            conversation_id: convId,
          }).eq('id', contact.id)
        }
        sent++
      } else {
        console.error('WA send failed for', e164, ':', JSON.stringify(waRes))
        if (!isTest && contact.id) {
          await sb.from('wa_campaign_contacts').update({ status: 'Failed' }).eq('id', contact.id)
        }
        failed++
      }
    } catch (e) {
      console.error('Exception for', e164, e)
      failed++
    }

    await new Promise(r => setTimeout(r, delay_ms))
  }

  // Only update campaign stats/status for real sends (not test mode)
  if (!isTest) {
    await sb.from('wa_campaigns').update({
      sent_count: ((campaign.sent_count as number) || 0) + sent,
      status: (contacts.length) < batch_size ? 'Completed' : 'Running',
      ...(contacts.length < batch_size ? { completed_at: new Date().toISOString() } : {}),
    }).eq('id', campaign_id)
  }

  return Response.json({ ok: true, sent, failed, total: contacts.length, mode: isFlow ? 'flow' : 'blast', test: isTest })
})
