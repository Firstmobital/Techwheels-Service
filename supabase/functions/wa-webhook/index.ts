/**
 * wa-webhook — Production-hardened WhatsApp AI booking agent
 *
 * FIX 1: AI memory — all extracted details persisted to DB & injected into every prompt
 * FIX 2: Hindi/Hinglish NLU — richer extraction prompt with 50+ Hinglish phrase mappings
 * FIX 3: DMS/CRM integration — vehicle history, service due dates, AMC, EW from all_service_data
 * FIX 4: Smart escalation — proactive SA forwarding, structured escalation record, WA SA alert
 * FIX 5: Workshop-aware prompt — real service types, free service logic, complaint capture
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Send WhatsApp text ───────────────────────────────────────────────────────
async function sendWA(phoneId: string, token: string, to: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  })
  const data = await res.json()
  if (data.error) console.error('WA send error:', JSON.stringify(data.error))
  return data
}

// ─── Safe time parser ─────────────────────────────────────────────────────────
function safeTime(t: string | null): string | null {
  if (!t) return null
  const m = t.match(/^(\d{1,2}):?(\d{2})?/)
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}:00`
}

// ─── Normalize phone ──────────────────────────────────────────────────────────
function normalizePhone(raw: string): { e164: string; local10: string } {
  const d = raw.replace(/\D/g, '')
  const local10 = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.slice(-10)
  const e164 = d.startsWith('91') && d.length >= 12 ? d : `91${d.slice(-10)}`
  return { e164, local10 }
}

// ─── FIX 3: Load full vehicle history from DMS ────────────────────────────────
async function loadVehicleHistory(phone10: string, phoneE164: string): Promise<Record<string, unknown> | null> {
  const { data } = await sb.from('all_service_data')
    .select(`
      id, cust_first_name, cust_last_name, registration_no, ppl, pl,
      vehicle_sale_date, chassis_no, fuel_type: intended_application,
      first_free_service_done_flag, first_free_service_date,
      second_free_service_done_flag, second_free_service_date,
      third_free_service_done_flag, third_free_service_date,
      fourth_free_service_done_flag, fourth_free_service_done_date,
      scheduled_next_service_date, last_service_date, last_service_type,
      extended_warranty_product, extended_warranty_end_date,
      amc_no, amc_type, amc_end_date,
      service_churn_flag, amc_propensity_flag, extended_propensity_flag
    `)
    .or(`cust_mobile_no.eq.${phone10},cust_mobile_no.eq.${phoneE164}`)
    .order('last_service_date', { ascending: false })
    .limit(1)
  return data?.[0] as Record<string, unknown> | null
}

// ─── FIX 3: Check slot availability for a date ───────────────────────────────
async function checkSlotAvailability(
  date: string,
  branch: string | null,
  capacity: number,
): Promise<{ available: boolean; booked: number; remaining: number }> {
  let query = sb.from('service_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('appointment_date', date)
    .not('status', 'in', '("Cancelled","No Show")')
  if (branch) query = query.eq('branch', branch)
  const { count } = await query
  const booked = count || 0
  return { available: booked < capacity, booked, remaining: Math.max(0, capacity - booked) }
}

// ─── FIX 2: Extract ALL booking details — rich Hinglish NLU ──────────────────
async function extractDetails(
  apiKey: string,
  history: Array<{ direction: string; body: string }>,
  todayStr: string,
): Promise<{
  date: string | null; time: string | null; branch: string | null
  service_type: string | null; complaint: string | null; km_reading: number | null
  confirmed: boolean; stage: string; escalate: boolean; escalation_reason: string | null
  customer_language: string
} | null> {
  if (!apiKey) return null

  const transcript = history.slice(-14).map(m =>
    `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.body}`
  ).join('\n')

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: `You are analyzing a WhatsApp conversation between a car service booking agent and a customer (India, Tata Motors dealer).

Return ONLY valid JSON with these fields:
{
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM (24h) or null",
  "branch": "Sitapura | Ajmer Road | Shahpura | null",
  "service_type": "Free Service | Paid Service | Accidental Repair | AMC | Running Repair | null",
  "complaint": "brief complaint description or null",
  "km_reading": number or null,
  "confirmed": true or false,
  "stage": "intro | collecting | confirming | booked | escalate",
  "escalate": true or false,
  "escalation_reason": "reason string or null",
  "customer_language": "hindi | english | hinglish"
}

=== HINDI/HINGLISH RECOGNITION RULES ===
SERVICE TYPE mapping (customer may say any of these):
- Free Service: "free service", "first service", "2nd service", "pehli service", "dusri service", "tisri service", "free wali service", "warranty service", "1st/2nd/3rd/4th free"
- Paid Service: "paid service", "regular service", "normal service", "routine service", "general service", "servicing karna hai", "service lena hai"
- Accidental Repair: "accident", "accident ho gaya", "thoka", "thoka hua", "dent", "scratch", "ghisa hua", "bodywork", "body repair", "bumper", "dikka", "chakka"  
- AMC: "AMC", "annual maintenance", "contract wali service"
- Running Repair: "breakdown", "band ho gaya", "start nahi ho raha", "engine problem", "noise", "khat khat", "vibration", "brake problem", "tyre flat", "puncture", "AC nahi chal raha", "chalte chalte band"

COMPLAINT keywords: anything customer says is wrong/noisy/broken — capture verbatim in English or transliterated Hindi

DATE mapping (relative to today ${todayStr}):
- "kal" = tomorrow, "parso" = day after tomorrow, "aaj" = today
- "is hafte" = this week (suggest nearest weekday), "agle hafte" = next week

TIME mapping:
- "morning/subah" = "09:00", "afternoon/dopahar" = "13:00", "evening/shaam" = "15:00", "late morning" = "11:00"

BRANCH mapping:
- "Sitapura", "sitapur" → "Sitapura"
- "Ajmer", "Ajmer Road", "ajmer wala" → "Ajmer Road"
- "Shahpura", "shahpur" → "Shahpura"

ESCALATE = true if customer says:
- "manager se baat karo", "supervisor chahiye", "main baat nahi karna", "complaint karna hai"
- "very angry", "bahut gussa", "frustrated", "disgusted", "worst service"
- Mentions a past bad experience they want resolved urgently
- Asks for a specific SA by name
- Emergency breakdown / accident on road

CONFIRMED = true ONLY when customer explicitly says YES/confirm/haan/theek hai/bilkul/book karo/kar do to a SPECIFIC proposed appointment
stage = "booked" ONLY after agent sends booking confirmation AND customer acknowledges it
stage = "escalate" when escalate=true`
        }, {
          role: 'user', content: transcript,
        }],
        max_tokens: 200, temperature: 0, response_format: { type: 'json_object' },
      }),
    })
    const data = await res.json()
    if (data.error) { console.error('extractDetails error:', JSON.stringify(data.error)); return null }
    return JSON.parse(data.choices?.[0]?.message?.content || '{}')
  } catch (e) {
    console.error('extractDetails failed:', e)
    return null
  }
}

// ─── FIX 1+5: Build rich AI reply prompt with full memory + workshop context ──
async function getAIReply(
  config: Record<string, unknown>,
  conv: Record<string, unknown>,
  vehicle: Record<string, unknown> | null,
  history: Array<{ direction: string; body: string }>,
  customerMessage: string,
  slotInfo: { available: boolean; remaining: number } | null,
): Promise<string> {
  const apiKey = config.openai_api_key as string
  if (!apiKey) return 'Ek second — hamare service advisor aapko call karenge. 🙏'

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const branches = (config.available_branches as string[])?.join(', ') || 'Sitapura, Ajmer Road, Shahpura'
  const stage = (conv.stage as string) || 'intro'
  const custName = (conv.customer_name as string) || 'Valued Customer'

  // ── FIX 1: Full memory block — never repeat questions for known info ────────
  const memoryBlock = `
=== CUSTOMER MEMORY (DO NOT ASK FOR THIS AGAIN) ===
Name: ${custName}
Phone: ${conv.phone}
Vehicle: ${conv.model || 'unknown'} | Reg: ${conv.reg_number || 'not given'} | Fuel: ${conv.fuel_type || 'unknown'}
Service Type Needed: ${conv.service_type || 'not specified yet'}
Complaint/Issue: ${conv.complaint_description || 'none mentioned'}
KM Reading: ${conv.km_reading ? conv.km_reading + ' km' : 'not given'}
Preferred Date: ${conv.preferred_date ? String(conv.preferred_date).split('T')[0] : 'not set'}
Preferred Time Slot: ${conv.preferred_time_slot || 'not set'}
Preferred Branch: ${conv.preferred_branch || 'not set'}
Conversation Stage: ${stage}
Language Preference: ${conv.customer_language || 'hinglish'}`

  // ── FIX 3: DMS vehicle history block ────────────────────────────────────────
  let dmsBlock = ''
  if (vehicle) {
    const freeServicesStatus = []
    if (vehicle.first_free_service_done_flag === 'Y') freeServicesStatus.push('1st ✅')
    else freeServicesStatus.push('1st ❌ pending')
    if (vehicle.second_free_service_done_flag === 'Y') freeServicesStatus.push('2nd ✅')
    else freeServicesStatus.push('2nd ❌ pending')
    if (vehicle.third_free_service_done_flag === 'Y') freeServicesStatus.push('3rd ✅')
    else freeServicesStatus.push('3rd ❌ pending')
    if (vehicle.fourth_free_service_done_flag === 'Y') freeServicesStatus.push('4th ✅')
    else freeServicesStatus.push('4th ❌ pending')

    const hasPendingFree = ['first_free_service_done_flag','second_free_service_done_flag','third_free_service_done_flag','fourth_free_service_done_flag']
      .some(f => vehicle[f] !== 'Y')

    dmsBlock = `
=== VEHICLE HISTORY FROM DMS ===
Model: ${vehicle.ppl} | Chassis: ${vehicle.chassis_no}
Sale Date: ${vehicle.vehicle_sale_date}
Last Service: ${vehicle.last_service_date || 'never'} (${vehicle.last_service_type || 'unknown type'})
Next Scheduled Service: ${vehicle.scheduled_next_service_date || 'overdue'}
Free Services: ${freeServicesStatus.join(' | ')}
Pending Free Service: ${hasPendingFree ? 'YES — customer is eligible for a free service' : 'No, all done'}
AMC: ${vehicle.amc_no ? `Active (${vehicle.amc_type}, valid till ${vehicle.amc_end_date})` : 'None'}
Extended Warranty: ${vehicle.extended_warranty_product ? `Active (${vehicle.extended_warranty_product}, till ${vehicle.extended_warranty_end_date})` : 'None'}
Service Churn Risk: ${vehicle.service_churn_flag === 'Y' ? 'HIGH — customer has not visited in a long time, be extra warm' : 'Normal'}

USE THIS DATA: If customer asks "what service do I need?", check last service date and scheduled date. If they have a pending free service, TELL THEM — it's free!`
  }

  // ── Slot availability context ────────────────────────────────────────────────
  const slotBlock = slotInfo
    ? `\nSlot availability for preferred date/branch: ${slotInfo.available ? `✅ ${slotInfo.remaining} slots remaining` : '❌ FULLY BOOKED — suggest next available day'}`
    : ''

  // ── FIX 5: Workshop-aware base prompt ────────────────────────────────────────
  const basePrompt = (config.system_prompt as string) ||
    `You are ${config.agent_name || 'Riya'}, a friendly service booking agent for ${config.business_name || 'Techwheels'} (Tata Motors authorised dealer, Jaipur).`

  const systemPrompt = `${basePrompt}

TODAY: ${today} | WORKING HOURS: ${config.working_hours || 'Mon-Sat 9AM-6PM'} | BRANCHES: ${branches}

${memoryBlock}
${dmsBlock}
${slotBlock}

=== BOOKING FLOW ===
STAGE intro     → Warm greeting using name. Mention vehicle model. Ask: "Kya service chahiye — free service, regular service, ya koi problem hai?" 
STAGE collecting → Collect missing: service_type > complaint (if any issue) > date > time slot > branch. NEVER re-ask what you already know.
STAGE confirming → Give full summary: vehicle, service type, complaint, date, time, branch. Ask customer to reply *YES*.
STAGE booked    → Thank warmly, share booking ID, remind appointment details.
STAGE escalate  → Immediately say you're connecting them to a Service Advisor. Be empathetic, do NOT argue.

=== WORKSHOP RULES (critical for correctness) ===
1. Free service eligibility: Only Tata vehicles with pending free service visits (check DMS data above).
   If all 4 free services done → it's a paid service. Tell customer honestly.
2. Accidental repair → Take to Bodyshop, NOT regular service bay. Mention that separately.
3. Running repair (breakdown) → Ask: is the vehicle driveable? If no → offer roadside assistance call.
4. AMC customers → their labour is covered, only parts may be charged. Tell them this.
5. EW customers → warranty claims need chassis no and EW policy no.
6. KM reading: Ask once if not given. Workshop needs it for service record.
7. Do NOT quote prices. Say "our SA will confirm the exact estimate."
8. Sunday is holiday. If customer asks for Sunday appointment, suggest Saturday or Monday.

=== COMMUNICATION RULES ===
1. Under 80 words per reply. Use *bold* for key info.
2. Hinglish by default — match customer's language (if they write in English, reply in English).
3. Suggest SPECIFIC dates: "How about *Monday, 16 June*?" — never say "any day works."
4. If slot is full: "Wo date full hai — *Tuesday 17 June* available hai, chalega?"
5. NEVER repeat a question already answered. Check memory block above.
6. If customer is upset — empathise first, then offer SA escalation.

${stage === 'intro' ? 'ACT: Warmly greet by name, say vehicle is due, ask what service they need.' : ''}
${stage === 'collecting' ? 'ACT: Check memory — collect only what is still missing.' : ''}
${stage === 'confirming' ? 'ACT: Full booking summary. Ask for YES.' : ''}
${stage === 'booked' ? 'ACT: Confirm appointment warmly. Give SA name if assigned.' : ''}
${stage === 'escalate' ? 'ACT: Apologise if needed. Say SA will call within 30 minutes. Do NOT continue booking flow.' : ''}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.slice(-12).map(m => ({
            role: m.direction === 'inbound' ? 'user' : 'assistant',
            content: m.body,
          })),
          { role: 'user', content: customerMessage },
        ],
        max_tokens: 220, temperature: 0.65,
      }),
    })
    const data = await res.json()
    if (data.error) { console.error('AI reply error:', JSON.stringify(data.error)); return "Ek second — hamare team se connect kar raha hoon. 🙏" }
    return data.choices?.[0]?.message?.content?.trim() || "Thank you! We'll be in touch. 🙏"
  } catch (e) {
    console.error('AI fetch failed:', e)
    return "Thank you! Our team will contact you shortly. 🙏"
  }
}

// ─── FIX 4: Smart escalation — notify SA on WhatsApp ─────────────────────────
async function escalateToSA(
  config: Record<string, unknown>,
  conv: Record<string, unknown>,
  vehicle: Record<string, unknown> | null,
  reason: string,
  fromPhoneE164: string,
  convId: number,
): Promise<void> {
  const phoneId = config.meta_phone_number_id as string
  const token   = config.meta_access_token as string
  const saNumber = config.sa_whatsapp_number as string  // SA's WA number e.g. 919876543210
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@techwheels.in'

  // 1. Update conversation status
  await sb.from('wa_conversations').update({
    status: 'Escalated',
    stage: 'escalate',
    escalation_reason: reason,
    escalated_at: new Date().toISOString(),
  }).eq('id', convId)

  // 2. Notify SA on WhatsApp (if sa_whatsapp_number configured)
  if (saNumber && phoneId && token) {
    const saAlert = `⚠️ *Escalation Alert — Techwheels WA Bot*

👤 Customer: *${conv.customer_name || 'Unknown'}* | 📞 ${(conv.phone as string)?.replace(/\d{4}$/, 'XXXX')}
🚗 Vehicle: *${conv.model || vehicle?.ppl || 'Unknown'}* (${conv.reg_number || '—'})
🔧 Issue: ${reason}
📋 Service Type: ${conv.service_type || 'Not specified'}
💬 Complaint: ${conv.complaint_description || 'None'}

Please call the customer within *30 minutes*.
View conversation: https://yourcrm.techwheels.in/wa-agent`

    await sendWA(phoneId, token, saNumber, saAlert)
  }

  // 3. Email alert (if configured)
  const escalationEmail = config.escalation_email as string
  if (resendKey && escalationEmail) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: fromEmail,
          to: [escalationEmail],
          subject: `🚨 WA Escalation — ${conv.customer_name || conv.phone} — ${reason.slice(0, 40)}`,
          html: `<h3>Customer needs immediate SA attention</h3>
<table style="border-collapse:collapse">
<tr><td><b>Customer</b></td><td>${conv.customer_name || 'Unknown'}</td></tr>
<tr><td><b>Phone</b></td><td>${conv.phone}</td></tr>
<tr><td><b>Vehicle</b></td><td>${conv.model || vehicle?.ppl || 'Unknown'} (${conv.reg_number || '—'})</td></tr>
<tr><td><b>Reg No</b></td><td>${conv.reg_number || '—'}</td></tr>
<tr><td><b>Escalation Reason</b></td><td>${reason}</td></tr>
<tr><td><b>Service Type</b></td><td>${conv.service_type || 'Not specified'}</td></tr>
<tr><td><b>Complaint</b></td><td>${conv.complaint_description || 'None'}</td></tr>
<tr><td><b>Last Service</b></td><td>${vehicle?.last_service_date || 'Unknown'}</td></tr>
<tr><td><b>Conversation ID</b></td><td>${convId}</td></tr>
</table>
<p><b>Please call customer within 30 minutes.</b></p>`,
        }),
      })
    } catch (e) { console.error('Escalation email failed:', e) }
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const url = new URL(req.url)

  const { data: cfgArr } = await sb.from('wa_agent_config').select('*').eq('id', 1).limit(1)
  const config = cfgArr?.[0] as Record<string, unknown> | undefined

  // ── Webhook verification ───────────────────────────────────────────────────
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === (config?.wa_verify_token as string))
      return new Response(challenge, { status: 200 })
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let payload: Record<string, unknown>
  try { payload = await req.json() } catch { return new Response('OK', { status: 200 }) }

  const phoneId   = config.meta_phone_number_id as string
  const metaToken = config.meta_access_token as string
  const openaiKey = config.openai_api_key as string
  const slotCap   = (config.daily_slot_capacity as number) || 40

  if (!phoneId || !metaToken) { console.error('Meta creds not set'); return new Response('OK', { status: 200 }) }

  const entry   = (payload.entry as unknown[])?.[0] as Record<string, unknown>
  const changes = (entry?.changes as unknown[])?.[0] as Record<string, unknown>
  const value   = changes?.value as Record<string, unknown>

  // ── Status updates (delivered / read / failed) ─────────────────────────
  // These arrive as value.statuses[], not value.messages[]
  const statuses = value?.statuses as unknown[]
  if (statuses?.length) {
    for (const st of statuses) {
      const s       = st as Record<string, unknown>
      const msgId   = s.id as string
      const newStat = s.status as string // sent, delivered, read, failed
      if (!msgId || !newStat) continue

      // Update wa_messages delivery status
      await sb.from('wa_messages')
        .update({ status: newStat })
        .eq('wa_message_id', msgId)

      // Update auto_service_reminders — only advance, never downgrade read→delivered
      if (['delivered', 'read', 'failed'].includes(newStat)) {
        const failReason = (s.errors as unknown[])?.[0]
          ? JSON.stringify((s.errors as unknown[])[0])
          : null
        const asrUpdate: Record<string, unknown> = {
          status:     newStat,
          updated_at: new Date().toISOString(),
        }
        if (failReason) asrUpdate.failure_reason = failReason

        let asrQuery = sb.from('auto_service_reminders')
          .update(asrUpdate)
          .eq('wa_message_id', msgId)
        // Don't overwrite 'read' with 'delivered'
        if (newStat === 'delivered') asrQuery = asrQuery.neq('status', 'read')
        await asrQuery
      }
    }
    return new Response('OK', { status: 200 })
  }

  const msgs    = value?.messages as unknown[]

  if (!msgs?.length) return new Response('OK', { status: 200 })

  const msg = msgs[0] as Record<string, unknown>
  // Accept both text and interactive (button/list reply) messages
  const msgType = msg.type as string
  if (!['text', 'interactive', 'location'].includes(msgType)) return new Response('OK', { status: 200 })

  const { e164: fromE164, local10: from10 } = normalizePhone(msg.from as string)

  // Extract text body
  let messageText = ''
  if (msgType === 'text') {
    messageText = ((msg.text as Record<string, string>)?.body || '').trim()
  } else if (msgType === 'interactive') {
    const inter = msg.interactive as Record<string, unknown>
    const interType = inter?.type as string
    if (interType === 'button_reply') {
      messageText = ((inter?.button_reply as Record<string,string>)?.title || '').trim()
    } else if (interType === 'list_reply') {
      messageText = ((inter?.list_reply as Record<string,string>)?.title || '').trim()
    } else if (interType === 'nfm_reply') {
      const nfm = (inter?.nfm_reply as Record<string, unknown>) || {}
      messageText = 'Flow form submitted'
      if (typeof nfm.body === 'string' && nfm.body.trim()) messageText = nfm.body.trim()
    }
  } else if (msgType === 'location') {
    const loc = msg.location as Record<string, unknown>
    messageText = `📍 ${loc?.latitude},${loc?.longitude}`
  }

  const waMessageId = msg.id as string
  if (!messageText && msgType === 'text') return new Response('OK', { status: 200 })

  // ── Deduplication ──────────────────────────────────────────────────────────
  const { data: dup } = await sb.from('wa_messages').select('id').eq('wa_message_id', waMessageId).limit(1)
  if (dup?.length) { console.log('Duplicate webhook, skipping'); return new Response('OK', { status: 200 }) }

  // ── Get or create conversation ─────────────────────────────────────────────
  const { data: convArr } = await sb.from('wa_conversations')
    .select('*')
    .or(`phone.eq.${from10},phone.eq.${fromE164}`)
    .order('created_at', { ascending: false })
    .limit(1)

  let conv = convArr?.[0] as Record<string, unknown> | undefined

  // ── FIX 3: Load vehicle history from DMS ──────────────────────────────────
  const vehicle = await loadVehicleHistory(from10, fromE164)

  if (!conv) {
    const custName = vehicle
      ? `${vehicle.cust_first_name || ''} ${vehicle.cust_last_name || ''}`.trim() || 'Valued Customer'
      : 'Valued Customer'

    const { data: newConvArr, error: convErr } = await sb.from('wa_conversations').insert([{
      phone: from10,
      customer_name: custName,
      reg_number: (vehicle?.registration_no as string) || null,
      model: (vehicle?.ppl as string) || null,
      fuel_type: (vehicle?.intended_application as string) || null,
      mfg_year: vehicle?.vehicle_sale_date ? new Date(vehicle.vehicle_sale_date as string).getFullYear() : null,
      last_service_date: (vehicle?.last_service_date as string) || null,
      service_data_id: (vehicle?.id as number) || null,
      status: 'Open', stage: 'intro', ai_turns: 0,
      customer_language: 'hinglish',
      last_message_at: new Date().toISOString(),
    }]).select()
    if (convErr) { console.error('Conv create failed:', convErr.message); return new Response('OK', { status: 200 }) }
    conv = newConvArr?.[0] as Record<string, unknown>
  }

  const convId = conv!.id as number
  const todayStr = new Date().toISOString().split('T')[0]

  // ── AUTO SERVICE REMINDER: handle WhatsApp Flow form submission ──────────
  // When customer taps "Book Now" on an auto reminder template and submits the
  // Flow form, Meta sends an nfm_reply. Since reminders are sent directly (not
  // via wa_campaigns flow path), flow_active will be false on the conversation.
  // We detect this here before the flow_active router below.
  if (msgType === 'interactive') {
    const inter     = msg.interactive as Record<string, unknown>
    const interType = inter?.type as string
    if (interType === 'nfm_reply' && !conv?.flow_active) {
      const nfm = (inter.nfm_reply as Record<string, unknown>) || {}
      const rawResp = nfm.response_json
      let flowFields: Record<string, unknown> = {}
      if (typeof rawResp === 'string') {
        try { flowFields = JSON.parse(rawResp) } catch { flowFields = {} }
      } else if (rawResp && typeof rawResp === 'object') {
        flowFields = rawResp as Record<string, unknown>
      }

      // Flow payload keys from the service_booking_cta Flow JSON:
      // screen_0_Service_Date_0, screen_0_Preferred_time_1, screen_0_Service_Type_2,
      // screen_0_Type_3, screen_0_Pickup_Address_4, screen_0_Issues_with_Vehicle_5
      const rawDate        = (flowFields['screen_0_Service_Date_0']      as string) || ''
      const rawTime        = (flowFields['screen_0_Preferred_time_1']    as string) || ''
      const rawServiceType = flowFields['screen_0_Service_Type_2']  // CheckboxGroup → array or string
      const rawVisitType   = (flowFields['screen_0_Type_3']             as string) || ''
      const pickupAddress  = (flowFields['screen_0_Pickup_Address_4']   as string) || ''
      const vehicleIssues  = (flowFields['screen_0_Issues_with_Vehicle_5'] as string) || ''

      // Map radio/checkbox values to DB-friendly strings
      const serviceTypeTitles = Array.isArray(rawServiceType)
        ? (rawServiceType as string[]).map(v => v.replace(/^\d+_/, '').replace(/_/g, ' '))
        : [String(rawServiceType).replace(/^\d+_/, '').replace(/_/g, ' ')]
      const serviceTypeLabel = serviceTypeTitles[0] || 'Paid Service'
      const serviceTypeMap: Record<string, string> = {
        'Scheduled Service': 'Paid Service',
        'Running Repair':    'Running Repairs',
        'Accidental':        'Accident',
      }
      const bookingServiceType = serviceTypeMap[serviceTypeLabel] || 'Paid Service'

      const timeMap: Record<string, string> = {
        '0_Morning':   '09:00:00',
        '1_Afternoon': '13:00:00',
        '2_Evening':   '16:00:00',
      }
      const bookingTime = timeMap[rawTime] || null

      const isPickup = rawVisitType.includes('PickUp') || rawVisitType.includes('Pickup')

      // Appointment date from Flow (DatePicker returns YYYY-MM-DD)
      const appointmentDate = rawDate
        ? rawDate.split('T')[0]
        : todayStr

      const branchToUse = (config.available_branches as string[])?.[0] || 'Sitapura'

      // Save inbound message
      await sb.from('wa_messages').insert([{
        conversation_id: convId, direction: 'inbound', sender: 'customer',
        body: `[Flow submitted] Service: ${bookingServiceType}, Date: ${appointmentDate}, Time: ${rawTime}`,
        wa_message_id: waMessageId, status: 'delivered', ai_generated: false,
      }])
      await sb.from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId)

      // Insert booking
      const { data: newBkgArr, error: bkgErr } = await sb.from('service_bookings').insert([{
        booking_source:       'WhatsApp Auto Reminder',
        booking_date:         todayStr,
        appointment_date:     appointmentDate,
        booking_time:         bookingTime,
        branch:               branchToUse,
        reg_number:           (conv?.reg_number as string) || (vehicle?.registration_no as string) || 'UNKNOWN',
        model:                (conv?.model as string) || (vehicle?.ppl as string) || null,
        customer_name:        (conv?.customer_name as string) || 'Valued Customer',
        customer_phone:       from10,
        service_type:         bookingServiceType,
        complaint_description: vehicleIssues || null,
        pickup_required:      isPickup,
        pickup_address:       isPickup && pickupAddress ? pickupAddress : null,
        status:               'Confirmed',
        wa_opt_in:            true,
        wa_conversation_id:   String(convId),
      }]).select()

      if (bkgErr) {
        console.error('ASR flow booking insert failed:', bkgErr.message)
      } else {
        const newBkg = newBkgArr?.[0] as Record<string, unknown>
        const bkgId  = (newBkg?.lead_number as string) || `#${newBkg?.id}`

        // Update conversation
        await sb.from('wa_conversations').update({
          status:           'Booked',
          stage:            'booked',
          booking_id:       newBkg?.id || null,
          preferred_date:   appointmentDate,
          preferred_branch: branchToUse,
        }).eq('id', convId)

        // Link booking back to auto_service_reminders
        await sb.from('auto_service_reminders')
          .update({
            booking_id:       newBkg?.id || null,
            flow_response_id: waMessageId,
            updated_at:       new Date().toISOString(),
          })
          .eq('mobile_number', from10)
          .is('booking_id', null)
          .order('created_at', { ascending: false })
          // Only update the most recent sent/delivered reminder for this phone
          .limit(1)

        const confirmMsg = `✅ *Booking Confirmed!*\n📋 Booking ID: ${bkgId}\n🔧 Service: ${bookingServiceType}\n📅 Date: ${appointmentDate}\n⏰ Time: ${rawTime.replace(/^\d+_/, '')}\n📍 Branch: ${branchToUse}${isPickup ? `\n🚗 Pickup from: ${pickupAddress || 'address provided'}` : ''}\n\nDhanyawad! Our team will confirm shortly. 🙏`

        await sb.from('wa_messages').insert([{
          conversation_id: convId, direction: 'outbound', sender: 'ai',
          body: confirmMsg, ai_generated: true, status: 'sent',
        }])
        await sendWA(phoneId, metaToken, fromE164, confirmMsg)
        console.log(`ASR flow booking ${bkgId} created for ${from10}`)
      }

      return new Response('OK', { status: 200 })
    }
  }

  // ── Guard: normal AI chat requires auto_reply_enabled ─────────────────────
  if (!config?.auto_reply_enabled) return new Response('OK', { status: 200 })

  // ── FLOW BOOT: customer tapped "Book My Service" from campaign blast ──────
  const convFlowStep = conv?.flow_step as string
  if (convFlowStep === 'blast_sent' && msgType === 'interactive') {
    const inter = msg.interactive as Record<string, unknown>
    const interType = inter?.type as string
    if (interType === 'button_reply') {
      const btnId = ((inter.button_reply as Record<string,string>)?.id || '').toLowerCase()
      const btnTitle = ((inter.button_reply as Record<string,string>)?.title || '').toLowerCase()
      if (btnId.includes('book') || btnTitle.includes('book') || btnTitle.includes('service')) {
        // Activate the flow
        await sb.from('wa_conversations').update({
          flow_active: true,
          flow_step: 'flow_starting',
          updated_at: new Date().toISOString(),
        }).eq('id', convId)

        // Save inbound tap
        await sb.from('wa_messages').insert([{
          conversation_id: convId, direction: 'inbound', sender: 'customer',
          body: 'Book My Service (button tap)', wa_message_id: waMessageId,
          status: 'delivered', ai_generated: false,
        }])
        await sb.from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId)

        // Start the flow
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wa-campaign-flow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({ action: 'start', phone: fromE164, conv_id: convId }),
        })
        return new Response('OK', { status: 200 })
      }
    }
  }

  // ── FLOW ROUTER: if this conv is in an active button flow, handle it there ──
  if (conv!.flow_active) {
    // Extract button reply info
    let replyType = 'text'
    let replyId   = ''
    let replyTitle = messageText
    let locationLat: string | null = null
    let locationLon: string | null = null

    if (msgType === 'interactive') {
      const inter = msg.interactive as Record<string, unknown>
      const interType = inter?.type as string
      if (interType === 'button_reply') {
        replyType  = 'button_reply'
        replyId    = ((inter.button_reply as Record<string,string>)?.id || '').trim()
        replyTitle = ((inter.button_reply as Record<string,string>)?.title || '').trim()
      } else if (interType === 'list_reply') {
        replyType  = 'list_reply'
        replyId    = ((inter.list_reply as Record<string,string>)?.id || '').trim()
        replyTitle = ((inter.list_reply as Record<string,string>)?.title || '').trim()
      } else if (interType === 'nfm_reply') {
        replyType = 'nfm_reply'
        const nfm = (inter.nfm_reply as Record<string, unknown>) || {}
        replyTitle = (typeof nfm.body === 'string' && nfm.body.trim()) ? nfm.body.trim() : 'Flow form submitted'
      }
    }

    let replyData: Record<string, unknown> | null = null
    if (msgType === 'interactive') {
      const inter = msg.interactive as Record<string, unknown>
      const interType = inter?.type as string
      if (interType === 'nfm_reply') {
        const nfm = (inter.nfm_reply as Record<string, unknown>) || {}
        const rawResp = nfm.response_json
        let parsedResp: unknown = rawResp
        if (typeof rawResp === 'string') {
          try { parsedResp = JSON.parse(rawResp) } catch { parsedResp = { raw: rawResp } }
        }
        replyData = {
          name: nfm.name || null,
          body: nfm.body || null,
          response_json: (parsedResp as Record<string, unknown>) || {},
        }
      }
    } else if (msgType === 'location') {
      const loc = msg.location as Record<string, unknown>
      locationLat = String(loc?.latitude || '')
      locationLon = String(loc?.longitude || '')
      replyTitle  = `📍 ${locationLat},${locationLon}`
    }

    // Save the inbound message first
    await sb.from('wa_messages').insert([{
      conversation_id: convId, direction: 'inbound', sender: 'customer',
      body: replyTitle, wa_message_id: waMessageId, status: 'delivered', ai_generated: false,
    }])
    await sb.from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId)

    // Hand off to wa-campaign-flow
    const flowRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wa-campaign-flow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        action:       'handle_reply',
        phone:        fromE164,
        conv_id:      convId,
        reply_type:   replyType,
        reply_id:     replyId,
        reply_text:   replyTitle,
        reply_data:   replyData,
        location_lat: locationLat,
        location_lon: locationLon,
      }),
    })
    console.log('Flow handler response:', await flowRes.text())
    return new Response('OK', { status: 200 })
  }

  // ── Save inbound message ───────────────────────────────────────────────────
  await sb.from('wa_messages').insert([{
    conversation_id: convId, direction: 'inbound', sender: 'customer',
    body: messageText, wa_message_id: waMessageId, status: 'delivered', ai_generated: false,
  }])
  await sb.from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId)

  // ── Opt-out ────────────────────────────────────────────────────────────────
  if (/\b(stop|unsubscribe|opt.?out|not interested|hatao|band karo|mat bhejo|remove me)\b/i.test(messageText)) {
    await sb.from('wa_conversations').update({ status: 'Opted-Out', stage: 'closed' }).eq('id', convId)
    await sendWA(phoneId, metaToken, fromE164, 'Aapko unsubscribe kar diya gaya hai. Take care! 🙏')
    return new Response('OK', { status: 200 })
  }

  // ── Status guards ──────────────────────────────────────────────────────────
  const convStatus = conv!.status as string
  const aiTurns    = (conv!.ai_turns as number) || 0
  const maxTurns   = (config.max_ai_turns as number) || 15

  if (convStatus === 'Booked') {
    const d = conv!.preferred_date ? String(conv!.preferred_date).split('T')[0] : 'soon'
    await sendWA(phoneId, metaToken, fromE164, `Aapki service already book hai! ✅\n📅 *${d}*\n📍 *${conv!.preferred_branch || 'our branch'}*\n\nKoi sawaal ho toh call karein. 🚗`)
    return new Response('OK', { status: 200 })
  }
  if (['Opted-Out', 'Closed'].includes(convStatus)) return new Response('OK', { status: 200 })
  if (['Escalated', 'escalate'].includes(convStatus) || conv!.stage === 'escalate') {
    // Already escalated — just acknowledge, don't restart booking
    await sendWA(phoneId, metaToken, fromE164, 'Aapka case hamare Service Advisor ke paas hai. Woh jald hi call karenge. 🙏')
    return new Response('OK', { status: 200 })
  }

  if (aiTurns >= maxTurns) {
    await escalateToSA(config, conv!, vehicle, 'Max AI turns reached — needs human', fromE164, convId)
    await sendWA(phoneId, metaToken, fromE164, 'Hamara Service Advisor aapko 30 minute mein call karega booking complete karne ke liye. 🙏')
    return new Response('OK', { status: 200 })
  }

  // ── Load history ───────────────────────────────────────────────────────────
  const { data: histRows } = await sb.from('wa_messages')
    .select('direction,body').eq('conversation_id', convId)
    .order('created_at', { ascending: true }).limit(14)
  const history = (histRows || []) as Array<{ direction: string; body: string }>

  // ── FIX 2: Extract all details (rich Hinglish NLU) ────────────────────────
  const extracted = await extractDetails(openaiKey, history, todayStr)
  console.log('Extracted:', JSON.stringify(extracted))

  // ── FIX 1: Persist ALL extracted details to DB (memory) ───────────────────
  const updatePayload: Record<string, unknown> = {}
  const newStage = extracted?.stage || (conv!.stage as string) || 'intro'
  if (newStage !== conv!.stage) updatePayload.stage = newStage

  const convDateStr = conv!.preferred_date ? String(conv!.preferred_date).split('T')[0] : null
  if (extracted?.date && extracted.date !== convDateStr) updatePayload.preferred_date = extracted.date
  if (extracted?.branch && extracted.branch !== conv!.preferred_branch) updatePayload.preferred_branch = extracted.branch
  if (extracted?.time && extracted.time !== conv!.preferred_time_slot) updatePayload.preferred_time_slot = extracted.time
  if (extracted?.service_type && !conv!.service_type) updatePayload.service_type = extracted.service_type
  if (extracted?.complaint && !conv!.complaint_description) updatePayload.complaint_description = extracted.complaint
  if (extracted?.km_reading && !conv!.km_reading) updatePayload.km_reading = extracted.km_reading
  if (extracted?.customer_language && extracted.customer_language !== conv!.customer_language) updatePayload.customer_language = extracted.customer_language

  if (Object.keys(updatePayload).length > 0) {
    await sb.from('wa_conversations').update(updatePayload).eq('id', convId)
    conv = { ...conv!, ...updatePayload }
  }

  // ── FIX 4: Smart escalation trigger ───────────────────────────────────────
  if (extracted?.escalate === true || newStage === 'escalate') {
    const reason = extracted?.escalation_reason || 'Customer requested escalation'
    await escalateToSA(config, conv!, vehicle, reason, fromE164, convId)
    const escMsg = `Samajh gaya! Main aapko abhi hamare *Service Advisor* se connect kar raha hoon. 🙏\n\nWoh *30 minute* mein aapko call karenge.\n\nAapki complaint note kar li gayi hai: _${reason}_`
    await sb.from('wa_messages').insert([{ conversation_id: convId, direction: 'outbound', sender: 'ai', body: escMsg, ai_generated: true, status: 'sent' }])
    await sb.from('wa_conversations').update({ ai_turns: aiTurns + 1 }).eq('id', convId)
    await sendWA(phoneId, metaToken, fromE164, escMsg)
    return new Response('OK', { status: 200 })
  }

  // ── FIX 3: Check slot availability before confirming ──────────────────────
  let slotInfo: { available: boolean; remaining: number } | null = null
  const dateToCheck = (extracted?.date || conv!.preferred_date) as string | null
  if (dateToCheck) {
    slotInfo = await checkSlotAvailability(
      String(dateToCheck).split('T')[0],
      (extracted?.branch || conv!.preferred_branch as string) || null,
      slotCap,
    )
  }

  // ── Booking confirmed ──────────────────────────────────────────────────────
  const alreadyBooked = convStatus === 'Booked' || conv!.stage === 'booked'
  if (extracted?.confirmed === true && extracted?.date && !alreadyBooked) {
    // If slot is full, don't confirm — redirect to another date
    if (slotInfo && !slotInfo.available) {
      const nextDay = new Date(extracted.date + 'T00:00:00')
      nextDay.setDate(nextDay.getDate() + 1)
      // Skip Sunday
      if (nextDay.getDay() === 0) nextDay.setDate(nextDay.getDate() + 1)
      const nextDateStr = nextDay.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
      const fullMsg = `Yeh date ke liye slots *full* ho gaye hain! 😔\n\nKya *${nextDateStr}* chalega? Woh available hai. Confirm karein? ✅`
      await sb.from('wa_messages').insert([{ conversation_id: convId, direction: 'outbound', sender: 'ai', body: fullMsg, ai_generated: true, status: 'sent' }])
      await sendWA(phoneId, metaToken, fromE164, fullMsg)
      await sb.from('wa_conversations').update({ ai_turns: aiTurns + 1 }).eq('id', convId)
      return new Response('OK', { status: 200 })
    }

    // Create booking
    const bookingTime = safeTime(extracted.time || conv!.preferred_time_slot as string || null)
    const branchToUse = extracted.branch || (conv!.preferred_branch as string) || (config.available_branches as string[])?.[0] || null

    const { data: newBkgArr, error: bkgErr } = await sb.from('service_bookings').insert([{
      booking_source: 'WhatsApp AI Agent',
      booking_date: todayStr,
      appointment_date: extracted.date,
      booking_time: bookingTime,
      branch: branchToUse,
      reg_number: (conv!.reg_number as string) || 'UNKNOWN',
      model: (conv!.model as string) || (vehicle?.ppl as string) || null,
      customer_name: (conv!.customer_name as string) || 'Valued Customer',
      customer_phone: from10,
      service_type: (conv!.service_type as string) || 'Paid Service',
      complaint_description: (conv!.complaint_description as string) || null,
      km_reading: (conv!.km_reading as number) || null,
      status: 'Confirmed', wa_opt_in: true, wa_conversation_id: String(convId),
    }]).select()

    if (bkgErr) {
      console.error('Booking insert failed:', bkgErr.message)
    } else {
      const newBkg = newBkgArr?.[0] as Record<string, unknown>
      const bkgId  = (newBkg?.lead_number as string) || `#${newBkg?.id}`

      await sb.from('wa_conversations').update({
        status: 'Booked', stage: 'booked', booking_id: newBkg?.id || null,
        preferred_date: extracted.date,
        preferred_time: extracted.time || conv!.preferred_time_slot || null,
        preferred_branch: branchToUse,
      }).eq('id', convId)

      // Campaign stats
      if (conv!.campaign_id) {
        await sb.from('wa_campaign_contacts').update({ status: 'Booked', replied_at: new Date().toISOString() }).eq('campaign_id', conv!.campaign_id as number).eq('phone', from10)
        const { data: ca } = await sb.from('wa_campaigns').select('booked_count,replied_count').eq('id', conv!.campaign_id as number).limit(1)
        if (ca?.[0]) await sb.from('wa_campaigns').update({ booked_count: ((ca[0].booked_count as number) || 0) + 1, replied_count: ((ca[0].replied_count as number) || 0) + 1 }).eq('id', conv!.campaign_id as number)
      }

      const confirmTemplate = (config.booking_confirm_msg as string) ||
        '✅ *Booking Confirmed!*\n📋 ID: {{booking_id}}\n🚗 {{model}} ({{reg_no}})\n🔧 {{service_type}}\n📅 {{date}} at {{time}}\n📍 {{branch}}\n\nSee you! Dhanyawad 🙏'

      const dateStr = new Date(extracted.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const confirmMsg = confirmTemplate
        .replace(/\{\{booking_id\}\}/g, bkgId)
        .replace(/\{\{reg_no\}\}/g, (conv!.reg_number as string) || '')
        .replace(/\{\{model\}\}/g, (conv!.model as string) || '')
        .replace(/\{\{service_type\}\}/g, (conv!.service_type as string) || 'Service')
        .replace(/\{\{date\}\}/g, dateStr)
        .replace(/\{\{time\}\}/g, extracted.time || 'Morning slot')
        .replace(/\{\{branch\}\}/g, branchToUse || '')
        .replace(/\{\{sa_name\}\}/g, 'Our team')

      await sb.from('wa_messages').insert([{ conversation_id: convId, direction: 'outbound', sender: 'ai', body: confirmMsg, ai_generated: true, status: 'sent' }])
      await sb.from('wa_conversations').update({ ai_turns: aiTurns + 1 }).eq('id', convId)
      await sendWA(phoneId, metaToken, fromE164, confirmMsg)
      console.log(`Booking ${bkgId} created for ${from10}`)
      return new Response('OK', { status: 200 })
    }
  }

  // ── Normal AI reply ────────────────────────────────────────────────────────
  const aiReply = await getAIReply(config, conv!, vehicle, history, messageText, slotInfo)

  await sb.from('wa_messages').insert([{ conversation_id: convId, direction: 'outbound', sender: 'ai', body: aiReply, ai_generated: true, status: 'sent' }])
  await sb.from('wa_conversations').update({ ai_turns: aiTurns + 1 }).eq('id', convId)
  await sendWA(phoneId, metaToken, fromE164, aiReply)

  return new Response('OK', { status: 200 })
})
