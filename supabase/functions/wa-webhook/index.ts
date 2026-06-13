import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const OPENAI_KEY   = Deno.env.get('OPENAI_API_KEY') ?? ''

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

async function sendWhatsApp(phoneNumberId: string, accessToken: string, to: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  })
  return res.json()
}

async function getAIReply(config: Record<string,unknown>, conv: Record<string,unknown>, history: Array<{direction:string;body:string}>, customerMessage: string): Promise<string> {
  const apiKey = (config.openai_api_key as string) || OPENAI_KEY
  if (!apiKey) return "Thank you! Our team will contact you shortly. 🙏"

  const systemPrompt = `${config.system_prompt}
Business: ${config.business_name} | Agent: ${config.agent_name}
Working Hours: ${config.working_hours}
Available Branches: ${(config.available_branches as string[])?.join(', ')}
Customer: ${conv.customer_name || 'Customer'} | Vehicle: ${conv.reg_number || ''} ${conv.model || ''}
Stage: ${conv.stage} | Preferred Date: ${conv.preferred_date || 'Not set'} | Branch: ${conv.preferred_branch || 'Not set'}
RULES: Keep replies under 80 words. Be warm. Extract date/time/branch when customer confirms. Say you will have advisor call if unsure.`

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-8).map(m => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.body })),
    { role: 'user', content: customerMessage },
  ]

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 200, temperature: 0.7 }),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || "Thank you! We'll be in touch soon. 🙏"
}

async function extractBookingDetails(apiKey: string, history: Array<{direction:string;body:string}>) {
  if (!apiKey) return null
  const transcript = history.slice(-6).map(m => `${m.direction==='inbound'?'Customer':'Agent'}: ${m.body}`).join('\n')
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Extract booking details from this conversation. Return JSON only: { "date": "YYYY-MM-DD or null", "time": "HH:MM or null", "branch": "branch name or null", "confirmed": true/false }. confirmed=true only if customer clearly agreed to a specific date.' },
          { role: 'user', content: transcript },
        ],
        max_tokens: 100, temperature: 0, response_format: { type: 'json_object' },
      }),
    })
    const data = await res.json()
    return JSON.parse(data.choices?.[0]?.message?.content || '{}')
  } catch { return null }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // GET — Meta webhook verification
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    const VERIFY_TOKEN = Deno.env.get('WA_VERIFY_TOKEN') ?? 'techwheels_wa_2026'
    if (mode === 'subscribe' && token === VERIFY_TOKEN) return new Response(challenge, { status: 200 })
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let payload: Record<string,unknown>
  try { payload = await req.json() } catch { return new Response('OK', { status: 200 }) }

  const entry   = (payload.entry as unknown[])?.[0] as Record<string,unknown>
  const changes = (entry?.changes as unknown[])?.[0] as Record<string,unknown>
  const value   = changes?.value as Record<string,unknown>
  const msgs    = value?.messages as unknown[]
  if (!msgs?.length) return new Response('OK', { status: 200 })

  const msg = msgs[0] as Record<string,unknown>
  if (msg.type !== 'text') return new Response('OK', { status: 200 })

  const fromPhone   = (msg.from as string).replace(/\D/g, '')
  const messageText = ((msg.text as Record<string,string>)?.body || '').trim()
  const waMessageId = msg.id as string

  // Load config
  const { data: cfgArr } = await sb.from('wa_agent_config').select('*').eq('id', 1).limit(1)
  const config = cfgArr?.[0] as Record<string,unknown>
  if (!config?.auto_reply_enabled) return new Response('OK', { status: 200 })

  const metaPhoneId = config.meta_phone_number_id as string
  const metaToken   = config.meta_access_token as string
  const openaiKey   = (config.openai_api_key as string) || OPENAI_KEY
  if (!metaPhoneId || !metaToken) return new Response('OK', { status: 200 })

  // Get or create conversation
  const { data: convArr } = await sb.from('wa_conversations').select('*').eq('phone', fromPhone).limit(1)
  let conv = convArr?.[0] as Record<string,unknown>

  if (!conv) {
    const { data: custArr } = await sb.from('all_service_data').select('id,cust_first_name,cust_last_name,registration_no,ppl').eq('cust_mobile_no', fromPhone).limit(1)
    const cust = custArr?.[0] as Record<string,unknown> | undefined
    const custName = cust ? `${cust.cust_first_name || ''} ${cust.cust_last_name || ''}`.trim() : null
    const { data: newConvArr } = await sb.from('wa_conversations').insert([{
      phone: fromPhone, customer_name: custName, reg_number: cust?.registration_no, model: cust?.ppl,
      service_data_id: cust?.id, status: 'Open', stage: 'intro', ai_turns: 0,
    }]).select()
    conv = newConvArr?.[0] as Record<string,unknown>
  }

  const convId = conv.id as number

  // Save inbound message
  await sb.from('wa_messages').insert([{ conversation_id: convId, direction: 'inbound', sender: 'customer', body: messageText, wa_message_id: waMessageId, status: 'delivered', ai_generated: false }])
  await sb.from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId)

  const aiTurns = (conv.ai_turns as number) || 0
  const maxTurns = (config.max_ai_turns as number) || 10
  const optedOut = /\b(stop|unsubscribe|opt.?out|no thanks|not interested|hatao|band karo)\b/i.test(messageText)

  if (optedOut) {
    await sb.from('wa_conversations').update({ status: 'Opted-Out', stage: 'closed' }).eq('id', convId)
    await sendWhatsApp(metaPhoneId, metaToken, fromPhone, "You've been unsubscribed. We won't contact you again. Take care! 🙏")
    return new Response('OK', { status: 200 })
  }

  if (aiTurns >= maxTurns || conv.status === 'Booked') {
    if (conv.status !== 'Booked') {
      await sb.from('wa_conversations').update({ status: 'Escalated', stage: 'escalated' }).eq('id', convId)
      await sendWhatsApp(metaPhoneId, metaToken, fromPhone, "Thank you for your patience! 🙏 A service advisor will call you shortly to complete your booking.")
    }
    return new Response('OK', { status: 200 })
  }

  // Load history
  const { data: historyRows } = await sb.from('wa_messages').select('direction,body').eq('conversation_id', convId).order('created_at', { ascending: true }).limit(10)
  const history = (historyRows || []) as Array<{direction:string;body:string}>

  // AI reply
  const aiReply = await getAIReply(config, conv, history, messageText)
  await sb.from('wa_messages').insert([{ conversation_id: convId, direction: 'outbound', sender: 'ai', body: aiReply, ai_generated: true, status: 'sent' }])
  await sb.from('wa_conversations').update({ ai_turns: aiTurns + 1 }).eq('id', convId)

  // Try to extract booking
  const allHistory = [...history, { direction: 'inbound', body: messageText }, { direction: 'outbound', body: aiReply }]
  const booking = await extractBookingDetails(openaiKey, allHistory)

  if (booking?.confirmed && booking.date && conv.stage !== 'booked') {
    const { data: newBkgArr } = await sb.from('service_bookings').insert([{
      booking_source: 'WhatsApp', booking_date: new Date().toISOString().split('T')[0],
      appointment_date: booking.date, booking_time: booking.time || null, branch: booking.branch || null,
      reg_number: (conv.reg_number as string) || 'UNKNOWN', model: conv.model as string || null,
      customer_name: conv.customer_name as string || 'Customer', customer_phone: fromPhone,
      service_type: 'Paid Service', status: 'Confirmed', wa_opt_in: true, wa_conversation_id: String(convId),
    }]).select()
    const newBkg = newBkgArr?.[0] as Record<string,unknown>

    await sb.from('wa_conversations').update({
      status: 'Booked', stage: 'booked', booking_id: newBkg?.id || null,
      preferred_date: booking.date, preferred_time: booking.time || null, preferred_branch: booking.branch || null,
    }).eq('id', convId)

    const confirmMsg = ((config.booking_confirm_msg as string) || '✅ Booking Confirmed!\n📋 ID: {{booking_id}}\n📅 {{date}}\n📍 {{branch}}')
      .replace('{{booking_id}}', (newBkg?.lead_number as string) || `#${newBkg?.id}`)
      .replace('{{reg_no}}', conv.reg_number as string || '')
      .replace('{{model}}', conv.model as string || '')
      .replace('{{date}}', booking.date)
      .replace('{{time}}', booking.time || 'As scheduled')
      .replace('{{branch}}', booking.branch || '')
      .replace('{{sa_name}}', 'Our team')

    await sendWhatsApp(metaPhoneId, metaToken, fromPhone, confirmMsg)
    return new Response('OK', { status: 200 })
  }

  await sendWhatsApp(metaPhoneId, metaToken, fromPhone, aiReply)
  return new Response('OK', { status: 200 })
})
