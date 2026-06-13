/**
 * wa-followup-cron
 * ────────────────
 * Runs on schedule (daily 10:00 AM IST). Scans wa_followup_queue for
 * pending items whose scheduled_at <= now(), sends WA messages, skips
 * conversations that already booked or opted-out.
 *
 * Also called by the "Enroll" action when a campaign finishes, to
 * schedule Day-1/3/7 follow-ups for all sent contacts.
 *
 * POST body:
 *   {}                           → cron sweep mode (send due messages)
 *   { enroll_campaign_id: N }   → enroll all Sent contacts from campaign N
 *   { enroll_conversation_id: N }→ enroll a single organic conversation
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Send WhatsApp text ───────────────────────────────────────────────────────
async function sendWA(phoneId: string, token: string, to: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  })
  const data = await res.json()
  if (data.error) console.error('WA send error:', JSON.stringify(data.error))
  return data
}

// ─── Render {{vars}} in template ─────────────────────────────────────────────
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}

// ─── Normalize phone to E164 ──────────────────────────────────────────────────
function toE164(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.startsWith('91') && d.length === 12 ? d : `91${d.slice(-10)}`
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  // Load WA config
  const { data: cfgArr } = await sb.from('wa_agent_config').select('*').eq('id', 1).limit(1)
  const config = cfgArr?.[0] as Record<string, unknown>
  if (!config) return Response.json({ error: 'wa_agent_config not found' }, { status: 500 })

  const phoneId   = config.meta_phone_number_id as string
  const token     = config.meta_access_token as string
  const branches  = (config.available_branches as string[])?.join(', ') || 'Sitapura, Ajmer Road, Shahpura'
  const agentName = (config.agent_name as string) || 'Riya'
  const bizName   = (config.business_name as string) || 'Techwheels Service'

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty body ok */ }

  // ════════════════════════════════════════════════════════
  // MODE A: ENROLL — schedule follow-ups for a campaign
  // ════════════════════════════════════════════════════════
  if (body.enroll_campaign_id) {
    const campId = body.enroll_campaign_id as number
    const sequenceId = (body.sequence_id as number) || 1

    // Load active steps for the sequence
    const { data: steps } = await sb.from('wa_followup_steps')
      .select('*').eq('sequence_id', sequenceId).eq('is_active', true)
      .order('sort_order')
    if (!steps?.length) return Response.json({ error: 'No active steps in sequence' }, { status: 400 })

    // Load all Sent contacts from the campaign not yet enrolled
    const { data: contacts } = await sb.from('wa_campaign_contacts')
      .select('*').eq('campaign_id', campId).eq('status', 'Sent')
      .or('followup_enrolled.is.null,followup_enrolled.eq.false')

    if (!contacts?.length) return Response.json({ message: 'No contacts to enroll', enrolled: 0 })

    const now = new Date()
    const rows = []

    for (const contact of contacts) {
      const convId = contact.conversation_id as number | null

      for (const step of steps) {
        const dayOffset = step.day_offset as number
        const scheduledAt = new Date(now)
        scheduledAt.setDate(scheduledAt.getDate() + dayOffset)
        // Send at 10:30 AM IST (05:00 UTC)
        scheduledAt.setUTCHours(5, 0, 0, 0)

        rows.push({
          conversation_id: convId || null,
          phone: contact.phone as string,
          customer_name: contact.customer_name as string,
          reg_number: contact.reg_number as string,
          model: contact.model as string,
          step_id: step.id as number,
          sequence_id: sequenceId,
          scheduled_at: scheduledAt.toISOString(),
          status: 'pending',
          campaign_id: campId,
        })
      }

      // Mark contact as enrolled
      await sb.from('wa_campaign_contacts')
        .update({ followup_enrolled: true, followup_sequence_id: sequenceId, first_sent_at: contact.sent_at || now.toISOString() })
        .eq('id', contact.id as number)
    }

    const { error: qErr } = await sb.from('wa_followup_queue').insert(rows)
    if (qErr) {
      console.error('Queue insert error:', qErr.message)
      return Response.json({ error: qErr.message }, { status: 500 })
    }

    return Response.json({ message: 'Enrolled', enrolled: contacts.length, steps: steps.length, total_queue_items: rows.length })
  }

  // ════════════════════════════════════════════════════════
  // MODE B: ENROLL SINGLE CONVERSATION (organic / inbound)
  // ════════════════════════════════════════════════════════
  if (body.enroll_conversation_id) {
    const convId = body.enroll_conversation_id as number
    const sequenceId = (body.sequence_id as number) || 1

    const { data: convArr } = await sb.from('wa_conversations').select('*').eq('id', convId).limit(1)
    const conv = convArr?.[0] as Record<string, unknown>
    if (!conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })

    const { data: steps } = await sb.from('wa_followup_steps')
      .select('*').eq('sequence_id', sequenceId).eq('is_active', true).order('sort_order')
    if (!steps?.length) return Response.json({ error: 'No active steps' }, { status: 400 })

    const now = new Date()
    const rows = []
    for (const step of steps) {
      const scheduledAt = new Date(now)
      scheduledAt.setDate(scheduledAt.getDate() + (step.day_offset as number))
      scheduledAt.setUTCHours(5, 0, 0, 0)
      rows.push({
        conversation_id: convId,
        phone: conv.phone as string,
        customer_name: conv.customer_name as string,
        reg_number: conv.reg_number as string,
        model: conv.model as string,
        step_id: step.id as number,
        sequence_id: sequenceId,
        scheduled_at: scheduledAt.toISOString(),
        status: 'pending',
        campaign_id: conv.campaign_id as number | null,
      })
    }

    await sb.from('wa_followup_queue').insert(rows)
    return Response.json({ message: 'Enrolled', steps: rows.length })
  }

  // ════════════════════════════════════════════════════════
  // MODE C: CRON SWEEP — send all due follow-ups
  // ════════════════════════════════════════════════════════
  if (!phoneId || !token) {
    return Response.json({ error: 'Meta credentials not configured' }, { status: 400 })
  }

  const now = new Date()

  // Fetch all due pending items (scheduled_at <= now)
  const { data: dueItems, error: dueErr } = await sb.from('wa_followup_queue')
    .select(`
      *,
      wa_followup_steps!step_id ( message_template, day_offset )
    `)
    .eq('status', 'pending')
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at')
    .limit(100)

  if (dueErr) {
    console.error('Queue fetch error:', dueErr.message)
    return Response.json({ error: dueErr.message }, { status: 500 })
  }

  if (!dueItems?.length) {
    return Response.json({ message: 'No due follow-ups', sent: 0, skipped: 0 })
  }

  let sent = 0, skipped = 0, failed = 0

  for (const item of dueItems) {
    const queueId = item.id as number
    const phone   = item.phone as string
    const e164    = toE164(phone)

    // ── Skip check: conversation booked / opted-out / closed ──────────────
    if (item.conversation_id) {
      const { data: convArr } = await sb.from('wa_conversations')
        .select('status,stage').eq('id', item.conversation_id as number).limit(1)
      const conv = convArr?.[0]
      const skipStatuses = ['Booked', 'Opted-Out', 'Closed', 'Escalated']
      if (conv && skipStatuses.includes(conv.status as string)) {
        await sb.from('wa_followup_queue')
          .update({ status: 'skipped', skip_reason: `conv_status=${conv.status}` })
          .eq('id', queueId)
        skipped++
        continue
      }
    }

    // ── Also check phone-level: any booked conv for this phone ────────────
    const { data: existingBooked } = await sb.from('wa_conversations')
      .select('id,status').eq('phone', phone).eq('status', 'Booked').limit(1)
    if (existingBooked?.length) {
      await sb.from('wa_followup_queue')
        .update({ status: 'skipped', skip_reason: 'already_booked' })
        .eq('id', queueId)
      // Also skip all other pending follow-ups for this phone
      await sb.from('wa_followup_queue')
        .update({ status: 'skipped', skip_reason: 'already_booked' })
        .eq('phone', phone).eq('status', 'pending')
      skipped++
      continue
    }

    // ── Render message ─────────────────────────────────────────────────────
    const stepData = item.wa_followup_steps as Record<string, unknown>
    const template = (stepData?.message_template as string) || ''
    const message  = render(template, {
      name:     (item.customer_name as string) || 'Valued Customer',
      model:    (item.model as string) || 'your vehicle',
      reg_no:   (item.reg_number as string) || '',
      branches,
      agent:    agentName,
      business: bizName,
    })

    // ── Send WA message ────────────────────────────────────────────────────
    try {
      const waRes = await sendWA(phoneId, token, e164, message)

      if (waRes.messages?.[0]?.id) {
        // Save to wa_messages for inbox visibility
        let convId = item.conversation_id as number | null
        if (!convId) {
          // Find or create conversation
          const { data: existingConv } = await sb.from('wa_conversations')
            .select('id').eq('phone', phone).limit(1)
          convId = existingConv?.[0]?.id || null
          if (!convId) {
            const { data: newConvArr } = await sb.from('wa_conversations').insert([{
              phone, customer_name: item.customer_name, reg_number: item.reg_number,
              model: item.model, status: 'Open', stage: 'intro', ai_turns: 0,
            }]).select('id')
            convId = newConvArr?.[0]?.id || null
            // Update queue item with new conv id
            if (convId) {
              await sb.from('wa_followup_queue').update({ conversation_id: convId }).eq('id', queueId)
            }
          }
        }

        if (convId) {
          await sb.from('wa_messages').insert([{
            conversation_id: convId,
            direction: 'outbound',
            sender: 'ai',
            body: message,
            wa_message_id: waRes.messages[0].id,
            ai_generated: true,
            status: 'sent',
          }])
          await sb.from('wa_conversations')
            .update({ last_message_at: now.toISOString(), stage: 'intro' })
            .eq('id', convId)
        }

        // Mark queue item sent
        await sb.from('wa_followup_queue')
          .update({ status: 'sent', sent_at: now.toISOString() })
          .eq('id', queueId)
        sent++

        // Small delay to respect Meta rate limits
        await new Promise(r => setTimeout(r, 300))
      } else {
        console.error(`WA send failed for ${phone}:`, JSON.stringify(waRes))
        await sb.from('wa_followup_queue')
          .update({ status: 'failed', skip_reason: JSON.stringify(waRes.error || 'unknown') })
          .eq('id', queueId)
        failed++
      }
    } catch (e) {
      console.error(`Exception sending to ${phone}:`, e)
      failed++
    }
  }

  console.log(`Follow-up cron: sent=${sent} skipped=${skipped} failed=${failed}`)
  return Response.json({ sent, skipped, failed, total: dueItems.length })
})
