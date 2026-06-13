import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Send a WhatsApp message via Meta Cloud API ───────────────────────────────
async function sendWhatsApp(phoneId: string, token: string, to: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  })
  const data = await res.json()
  if (data.error) console.error('WA send error:', JSON.stringify(data.error))
  return data
}

// ─── Get AI reply from GPT-4o-mini ───────────────────────────────────────────
async function getAIReply(
  config: Record<string, unknown>,
  conv: Record<string, unknown>,
  history: Array<{ direction: string; body: string }>,
  customerMessage: string,
): Promise<string> {
  const apiKey = config.openai_api_key as string
  if (!apiKey) {
    console.error('OpenAI key not set in wa_agent_config')
    return 'Thank you! Our service advisor will call you shortly to confirm your booking. 🙏'
  }

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const branches = (config.available_branches as string[])?.join(', ') || 'Sitapura, Ajmer Road, Shahpura'

  // Strong, structured system prompt that drives toward booking
  const systemPrompt = `You are ${config.agent_name}, a service booking agent for ${config.business_name} (Tata Motors authorised dealer in Jaipur).

TODAY: ${today}
WORKING HOURS: ${config.working_hours}
BRANCHES: ${branches}

CUSTOMER DETAILS:
- Name: ${conv.customer_name || 'Customer'}
- Vehicle: ${conv.model || 'their vehicle'} | Reg: ${conv.reg_number || 'not provided'}
- Current stage: ${conv.stage}
- Preferred date so far: ${conv.preferred_date || 'not set'}
- Preferred branch: ${conv.preferred_branch || 'not set'}

YOUR GOAL: Get the customer to confirm a service appointment. Follow this flow:
STAGE intro → Ask which service they need (free/paid/accidental) + preferred date
STAGE collecting → Confirm date, time slot (morning 9-12 / afternoon 12-3 / evening 3-6), and branch
STAGE confirming → Repeat back all details and ask customer to reply YES to confirm

STRICT RULES:
1. Keep every reply under 80 words. Use WhatsApp formatting (*bold* for key info).
2. Always suggest specific dates (e.g. "How about *Monday June 16*?") — never be vague.
3. If customer says YES/confirm/haan/theek hai → immediately say booking is being confirmed.
4. If customer says NO/stop/band karo/not interested → politely close.
5. Speak in Hinglish (mix of Hindi + English) — friendly and warm.
6. Never make up prices or availability beyond what you know.
7. ALWAYS move the conversation forward — never just ask open-ended questions.

${(conv.stage as string) === 'intro' ? 'START by warmly greeting them and mentioning their vehicle is due for service, then ask about their preferred date.' : ''}
${(conv.stage as string) === 'collecting' ? 'You have a date preference. Now confirm the time slot and branch.' : ''}
${(conv.stage as string) === 'confirming' ? 'Repeat the full booking summary and ask customer to reply YES to confirm.' : ''}
${(conv.stage as string) === 'booked' ? 'Booking is done. Just warmly remind them of the appointment details.' : ''}`

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10).map(m => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.body,
    })),
    { role: 'user', content: customerMessage },
  ]

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 200, temperature: 0.75 }),
    })
    const data = await res.json()
    if (data.error) {
      console.error('OpenAI error:', JSON.stringify(data.error))
      return "Ek second, hamare service advisor aapko jaldi call karenge! 🙏"
    }
    return data.choices?.[0]?.message?.content?.trim() || "Thank you! We'll be in touch soon. 🙏"
  } catch (e) {
    console.error('OpenAI fetch failed:', e)
    return "Thank you! Our team will contact you shortly. 🙏"
  }
}

// ─── Extract booking intent from recent conversation ──────────────────────────
async function extractBookingDetails(
  apiKey: string,
  history: Array<{ direction: string; body: string }>,
): Promise<{ date: string | null; time: string | null; branch: string | null; confirmed: boolean; stage: string } | null> {
  if (!apiKey) return null

  const transcript = history.slice(-10).map(m =>
    `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.body}`
  ).join('\n')

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Analyze this WhatsApp service booking conversation. Extract booking details and determine the stage.
Return JSON ONLY with these fields:
{
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM or null (24h format)",
  "branch": "branch name or null",
  "confirmed": true or false,
  "stage": "intro" | "collecting" | "confirming" | "booked"
}

Rules:
- confirmed=true ONLY if customer explicitly said YES/confirm/haan/theek hai/book it to a specific date
- stage=booked ONLY if customer has confirmed AND agent has acknowledged the booking
- stage=confirming if agent has asked for YES confirmation and customer hasn't replied yet
- stage=collecting if date/time/branch are being discussed
- stage=intro if conversation just started or no specifics yet
- For date: interpret "Monday", "kal", "parso" relative to today ${new Date().toISOString().split('T')[0]}`,
          },
          { role: 'user', content: transcript },
        ],
        max_tokens: 150,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    })
    const data = await res.json()
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    return parsed
  } catch (e) {
    console.error('extractBookingDetails failed:', e)
    return null
  }
}

// ─── Normalize phone: strip country code for DB lookup ───────────────────────
function normalizePhone(rawPhone: string): { e164: string; local10: string } {
  const digits = rawPhone.replace(/\D/g, '')
  // Meta sends 91XXXXXXXXXX (12 digits with India code) or just 10 digits
  const local10 = digits.length === 12 && digits.startsWith('91')
    ? digits.slice(2)
    : digits.length === 10
      ? digits
      : digits
  const e164 = digits.length === 12 && digits.startsWith('91') ? digits : `91${digits}`
  return { e164, local10 }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Load config from DB (both GET and POST need it)
  const { data: cfgArr, error: cfgErr } = await sb.from('wa_agent_config').select('*').eq('id', 1).limit(1)
  if (cfgErr) console.error('Config load error:', cfgErr.message)
  const config = cfgArr?.[0] as Record<string, unknown> | undefined

  // ── GET: Meta webhook verification ────────────────────────────────────────
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode')
    const token     = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    const verifyToken = (config?.wa_verify_token as string) || 'techwheels_wa_2026'
    if (mode === 'subscribe' && token === verifyToken) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Always return 200 to Meta immediately to prevent retries
  // Parse payload
  let payload: Record<string, unknown>
  try { payload = await req.json() } catch {
    return new Response('OK', { status: 200 })
  }

  // ── Guard: config must exist and AI must be on ────────────────────────────
  if (!config?.auto_reply_enabled) return new Response('OK', { status: 200 })

  const metaPhoneId = config.meta_phone_number_id as string
  const metaToken   = config.meta_access_token as string
  const openaiKey   = config.openai_api_key as string

  if (!metaPhoneId || !metaToken) {
    console.error('Meta credentials not set in wa_agent_config — configure in WA Agent Settings')
    return new Response('OK', { status: 200 })
  }

  // ── Parse Meta webhook payload ────────────────────────────────────────────
  const entry   = (payload.entry as unknown[])?.[0] as Record<string, unknown>
  const changes = (entry?.changes as unknown[])?.[0] as Record<string, unknown>
  const value   = changes?.value as Record<string, unknown>
  const msgs    = value?.messages as unknown[]

  // Not a message event (could be status/delivery update) — ignore
  if (!msgs?.length) return new Response('OK', { status: 200 })

  const msg = msgs[0] as Record<string, unknown>
  // Only handle text messages for now
  if (msg.type !== 'text') return new Response('OK', { status: 200 })

  const { e164: fromPhoneE164, local10: fromPhone10 } = normalizePhone(msg.from as string)
  const messageText = ((msg.text as Record<string, string>)?.body || '').trim()
  const waMessageId = msg.id as string

  if (!messageText) return new Response('OK', { status: 200 })

  // ── Get or create conversation ────────────────────────────────────────────
  // Try both 10-digit and E164 (12-digit) formats in DB
  const { data: convArr } = await sb.from('wa_conversations')
    .select('*')
    .or(`phone.eq.${fromPhone10},phone.eq.${fromPhoneE164}`)
    .order('created_at', { ascending: false })
    .limit(1)

  let conv = convArr?.[0] as Record<string, unknown> | undefined

  if (!conv) {
    // Look up customer in all_service_data — try both formats
    const { data: custArr } = await sb.from('all_service_data')
      .select('id,cust_first_name,cust_last_name,registration_no,ppl,scheduled_next_service_date,last_service_date')
      .or(`cust_mobile_no.eq.${fromPhone10},cust_mobile_no.eq.${fromPhoneE164}`)
      .limit(1)
    const cust = custArr?.[0] as Record<string, unknown> | undefined

    const custName = cust
      ? `${cust.cust_first_name || ''} ${cust.cust_last_name || ''}`.trim()
      : null

    const { data: newConvArr, error: convErr } = await sb.from('wa_conversations').insert([{
      phone: fromPhone10,   // store normalized 10-digit
      customer_name: custName,
      reg_number: cust?.registration_no || null,
      model: cust?.ppl || null,
      service_data_id: cust?.id || null,
      status: 'Open',
      stage: 'intro',
      ai_turns: 0,
      last_message_at: new Date().toISOString(),
    }]).select()

    if (convErr) {
      console.error('Failed to create conversation:', convErr.message)
      return new Response('OK', { status: 200 })
    }
    conv = newConvArr?.[0] as Record<string, unknown>
  }

  const convId = conv!.id as number

  // ── Save inbound message ──────────────────────────────────────────────────
  await sb.from('wa_messages').insert([{
    conversation_id: convId,
    direction: 'inbound',
    sender: 'customer',
    body: messageText,
    wa_message_id: waMessageId,
    status: 'delivered',
    ai_generated: false,
  }])
  await sb.from('wa_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', convId)

  // ── Opt-out check ─────────────────────────────────────────────────────────
  const optedOut = /\b(stop|unsubscribe|opt.?out|no thanks|not interested|hatao|band karo|mat bhejo|remove me)\b/i.test(messageText)
  if (optedOut) {
    await sb.from('wa_conversations').update({ status: 'Opted-Out', stage: 'closed' }).eq('id', convId)
    await sendWhatsApp(metaPhoneId, metaToken, fromPhoneE164,
      "Aapko unsubscribe kar diya gaya hai. Hum aapko dobara contact nahi karenge. Take care! 🙏")
    return new Response('OK', { status: 200 })
  }

  // ── Max turns / already booked check ─────────────────────────────────────
  const convStatus = conv!.status as string
  const aiTurns    = (conv!.ai_turns as number) || 0
  const maxTurns   = (config.max_ai_turns as number) || 10

  if (convStatus === 'Booked') {
    // Just confirm the existing booking, don't create another
    const bkgDate   = conv!.preferred_date as string || ''
    const bkgBranch = conv!.preferred_branch as string || ''
    await sendWhatsApp(metaPhoneId, metaToken, fromPhoneE164,
      `Aapki service already booked hai! ✅\n📅 ${bkgDate}\n📍 ${bkgBranch}\nKoi aur sawal ho toh humein call karein. See you! 🚗`)
    return new Response('OK', { status: 200 })
  }

  if (convStatus === 'Opted-Out' || convStatus === 'Closed') {
    return new Response('OK', { status: 200 })
  }

  if (aiTurns >= maxTurns) {
    await sb.from('wa_conversations').update({ status: 'Escalated', stage: 'escalated' }).eq('id', convId)
    await sendWhatsApp(metaPhoneId, metaToken, fromPhoneE164,
      "Hamara ek service advisor aapko call karega booking complete karne ke liye. Thoda wait karein! 🙏")
    return new Response('OK', { status: 200 })
  }

  // ── Load conversation history ─────────────────────────────────────────────
  const { data: historyRows } = await sb.from('wa_messages')
    .select('direction,body')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(12)
  const history = (historyRows || []) as Array<{ direction: string; body: string }>

  // ── Extract booking details from conversation ─────────────────────────────
  const allMsgsForExtract = [
    ...history,
    { direction: 'inbound', body: messageText },
  ]
  const extracted = await extractBookingDetails(openaiKey, allMsgsForExtract)
  console.log('Extracted booking details:', JSON.stringify(extracted))

  // Update stage in conversation if it changed
  const newStage = extracted?.stage || (conv!.stage as string) || 'intro'
  if (newStage !== conv!.stage) {
    await sb.from('wa_conversations').update({ stage: newStage }).eq('id', convId)
    conv = { ...conv!, stage: newStage }
  }

  // Update preferred date/branch if extracted
  if (extracted?.date && extracted.date !== conv!.preferred_date) {
    await sb.from('wa_conversations').update({ preferred_date: extracted.date }).eq('id', convId)
    conv = { ...conv!, preferred_date: extracted.date }
  }
  if (extracted?.branch && extracted.branch !== conv!.preferred_branch) {
    await sb.from('wa_conversations').update({ preferred_branch: extracted.branch }).eq('id', convId)
    conv = { ...conv!, preferred_branch: extracted.branch }
  }

  // ── BOOKING CONFIRMED — create service_bookings record ───────────────────
  if (extracted?.confirmed === true && extracted?.date && newStage !== 'booked') {
    console.log('Booking confirmed! Creating service_bookings record...')

    // Parse time safely — booking_time column is `time` type
    let bookingTime: string | null = null
    if (extracted.time) {
      // Ensure HH:MM format
      const timeParts = extracted.time.match(/^(\d{1,2}):?(\d{2})?/)
      if (timeParts) {
        const hh = timeParts[1].padStart(2, '0')
        const mm = (timeParts[2] || '00').padStart(2, '0')
        bookingTime = `${hh}:${mm}:00`
      }
    }

    const { data: newBkgArr, error: bkgErr } = await sb.from('service_bookings').insert([{
      booking_source: 'WhatsApp AI Agent',
      booking_date: new Date().toISOString().split('T')[0],
      appointment_date: extracted.date,
      booking_time: bookingTime,
      branch: extracted.branch || (config.available_branches as string[])?.[0] || null,
      reg_number: (conv!.reg_number as string) || 'UNKNOWN',
      model: (conv!.model as string) || null,
      customer_name: (conv!.customer_name as string) || 'Customer',
      customer_phone: fromPhone10,
      service_type: 'Paid Service',
      status: 'Confirmed',
      wa_opt_in: true,
      wa_conversation_id: String(convId),
      // created_by is intentionally omitted — service role insert, no user context
    }]).select()

    if (bkgErr) {
      console.error('Failed to create booking:', bkgErr.message)
      // Still reply but don't mark as booked
    } else {
      const newBkg = newBkgArr?.[0] as Record<string, unknown>
      const bkgId  = (newBkg?.lead_number as string) || `#${newBkg?.id}`

      // Update conversation to Booked
      await sb.from('wa_conversations').update({
        status: 'Booked',
        stage: 'booked',
        booking_id: newBkg?.id || null,
        preferred_date: extracted.date,
        preferred_time: extracted.time || null,
        preferred_branch: extracted.branch || null,
      }).eq('id', convId)

      // Update campaign contact if applicable
      if (conv!.campaign_id) {
        await sb.from('wa_campaign_contacts')
          .update({ status: 'Booked', replied_at: new Date().toISOString() })
          .eq('campaign_id', conv!.campaign_id as number)
          .eq('phone', fromPhone10)
        // Increment campaign booked count
        const { data: campArr } = await sb.from('wa_campaigns').select('booked_count,replied_count').eq('id', conv!.campaign_id as number).limit(1)
        if (campArr?.[0]) {
          await sb.from('wa_campaigns').update({
            booked_count: ((campArr[0].booked_count as number) || 0) + 1,
            replied_count: ((campArr[0].replied_count as number) || 0) + 1,
          }).eq('id', conv!.campaign_id as number)
        }
      }

      // Send booking confirmation
      const confirmTemplate = (config.booking_confirm_msg as string) ||
        '✅ *Booking Confirmed!*\n📋 ID: {{booking_id}}\n🚗 {{model}} | {{reg_no}}\n📅 {{date}} at {{time}}\n📍 {{branch}}\n\nSee you then! Dhanyawad 🙏'

      const confirmMsg = confirmTemplate
        .replace(/\{\{booking_id\}\}/g, bkgId)
        .replace(/\{\{reg_no\}\}/g, (conv!.reg_number as string) || '')
        .replace(/\{\{model\}\}/g, (conv!.model as string) || '')
        .replace(/\{\{date\}\}/g, new Date(extracted.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
        .replace(/\{\{time\}\}/g, extracted.time || 'Morning slot')
        .replace(/\{\{branch\}\}/g, extracted.branch || (config.available_branches as string[])?.[0] || '')
        .replace(/\{\{sa_name\}\}/g, 'Our team')

      await sendWhatsApp(metaPhoneId, metaToken, fromPhoneE164, confirmMsg)
      console.log(`Booking ${bkgId} created for ${fromPhone10}`)

      // Update ai_turns
      await sb.from('wa_conversations').update({ ai_turns: aiTurns + 1 }).eq('id', convId)
      return new Response('OK', { status: 200 })
    }
  }

  // ── Normal AI reply ───────────────────────────────────────────────────────
  const aiReply = await getAIReply(config, conv!, history, messageText)

  // Save outbound message
  await sb.from('wa_messages').insert([{
    conversation_id: convId,
    direction: 'outbound',
    sender: 'ai',
    body: aiReply,
    ai_generated: true,
    status: 'sent',
  }])

  // Increment AI turns
  await sb.from('wa_conversations').update({ ai_turns: aiTurns + 1 }).eq('id', convId)

  // Send via WhatsApp
  await sendWhatsApp(metaPhoneId, metaToken, fromPhoneE164, aiReply)

  return new Response('OK', { status: 200 })
})
