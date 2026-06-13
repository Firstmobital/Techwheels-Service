import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Safe time parser ─────────────────────────────────────────────────────────
function safeBookingTime(rawTime: string | null): string | null {
  if (!rawTime) return null
  const match = rawTime.match(/^(\d{1,2}):?(\d{2})?/)
  if (!match) return null
  const hh = match[1].padStart(2, '0')
  const mm = (match[2] || '00').padStart(2, '0')
  return `${hh}:${mm}:00`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const { conversation_id, message } = await req.json()
  if (!conversation_id || !message) return Response.json({ error: 'conversation_id and message required' }, { status: 400 })

  // Load config
  const { data: cfgArr } = await sb.from('wa_agent_config').select('*').eq('id', 1).limit(1)
  const config = cfgArr?.[0] as Record<string, unknown>
  const openaiKey = config?.openai_api_key as string
  if (!openaiKey) return Response.json({ error: 'OpenAI key not set in Settings' }, { status: 400 })

  // Load conversation
  const { data: convArr } = await sb.from('wa_conversations').select('*').eq('id', conversation_id).limit(1)
  const conv = convArr?.[0] as Record<string, unknown>
  if (!conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })

  // Load history (already includes the inbound message saved by the UI before calling this fn)
  const { data: historyRows } = await sb.from('wa_messages')
    .select('direction,body').eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true }).limit(14)
  const history = (historyRows || []) as Array<{ direction: string; body: string }>

  // ── Extract booking details ──────────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0]
  const transcript = history.slice(-12).map(m => `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.body}`).join('\n')

  let extracted: Record<string, unknown> | null = null
  try {
    const extRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Analyze this WhatsApp service booking conversation. Return JSON only:
{ "date": "YYYY-MM-DD or null", "time": "HH:MM or null (24h)", "branch": "branch name or null", "confirmed": true/false, "stage": "intro|collecting|confirming|booked" }
Rules: confirmed=true ONLY if customer explicitly said YES/confirm/haan/theek hai to a specific appointment.
For time: morning/subah=09:00, afternoon/dopahar=13:00, evening/shaam=15:00.
Relative dates relative to today: ${todayStr}` },
          { role: 'user', content: transcript },
        ],
        max_tokens: 120, temperature: 0, response_format: { type: 'json_object' },
      }),
    })
    const extData = await extRes.json()
    extracted = JSON.parse(extData.choices?.[0]?.message?.content || '{}')
  } catch { extracted = null }

  // ── Update stage/date/branch if changed ──────────────────────────────────
  const newStage = (extracted?.stage as string) || (conv.stage as string) || 'intro'
  if (newStage !== conv.stage) {
    await sb.from('wa_conversations').update({ stage: newStage }).eq('id', conversation_id)
  }
  const convDateStr = conv.preferred_date ? String(conv.preferred_date).split('T')[0] : null
  if (extracted?.date && extracted.date !== convDateStr) {
    await sb.from('wa_conversations').update({ preferred_date: extracted.date }).eq('id', conversation_id)
  }
  if (extracted?.branch && extracted.branch !== conv.preferred_branch) {
    await sb.from('wa_conversations').update({ preferred_branch: extracted.branch }).eq('id', conversation_id)
  }

  // ── Build AI system prompt (same as webhook — uses DB system_prompt) ──────
  const branches = (config?.available_branches as string[])?.join(', ') || 'Sitapura, Ajmer Road, Shahpura'
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const custName = (conv.customer_name as string) || 'Valued Customer'
  const stage = newStage
  const basePrompt = (config?.system_prompt as string) || `You are ${config?.agent_name || 'Riya'}, a service booking agent for ${config?.business_name || 'Techwheels'} (Tata Motors authorised dealer in Jaipur).`

  const systemPrompt = `${basePrompt}

TODAY: ${today}
WORKING HOURS: ${config?.working_hours || 'Mon-Sat 9AM-6PM'}
BRANCHES: ${branches}

CUSTOMER DETAILS:
- Name: ${custName}
- Vehicle: ${conv.model || 'their vehicle'} | Reg: ${conv.reg_number || 'not provided'}
- Current stage: ${stage}
- Preferred date: ${extracted?.date || (conv.preferred_date ? String(conv.preferred_date).split('T')[0] : 'not set')}
- Preferred branch: ${extracted?.branch || conv.preferred_branch || 'not set'}

YOUR GOAL: Get the customer to confirm a service appointment.
STRICT RULES:
1. Keep every reply under 80 words. Use *bold* for key info.
2. Always suggest specific dates. E.g. "How about *Monday, 16 June*?"
3. If customer says YES/confirm/haan → say booking is being confirmed.
4. Speak in Hinglish — friendly and professional.
5. Do NOT repeat questions for info already provided.
6. ALWAYS move the conversation forward.

${stage === 'intro' ? 'STAGE INTRO: Greet warmly by name, mention their vehicle, ask service type + preferred date.' : ''}
${stage === 'collecting' ? 'STAGE COLLECTING: Collect missing info (date, time slot, branch). Do not re-ask what you already have.' : ''}
${stage === 'confirming' ? 'STAGE CONFIRMING: Give full booking summary and ask customer to reply YES to confirm.' : ''}
${stage === 'booked' ? 'BOOKING DONE: Warmly remind them of appointment details.' : ''}`

  const aiMessages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10).map(m => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.body })),
    { role: 'user', content: message },
  ]

  let aiReply = "Thank you! We'll be in touch soon. 🙏"
  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: aiMessages, max_tokens: 200, temperature: 0.7 }),
  })
  const aiData = await aiRes.json()
  if (aiData.error) console.error('OpenAI AI reply error:', JSON.stringify(aiData.error))
  if (aiData.choices?.[0]?.message?.content) aiReply = aiData.choices[0].message.content.trim()

  // ── If confirmed → create booking ─────────────────────────────────────────
  let bookingCreated = false
  let bookingId: string | null = null
  const alreadyBooked = conv.status === 'Booked' || conv.stage === 'booked'

  if (extracted?.confirmed === true && extracted?.date && !alreadyBooked) {
    const bookingTime = safeBookingTime((extracted.time as string) || null)
    const branchToUse = (extracted.branch as string) || (conv.preferred_branch as string) || (config?.available_branches as string[])?.[0] || null

    const { data: newBkgArr, error: bkgErr } = await sb.from('service_bookings').insert([{
      booking_source: 'WhatsApp AI Agent (Test)',
      booking_date: new Date().toISOString().split('T')[0],
      appointment_date: extracted.date,
      booking_time: bookingTime,
      branch: branchToUse,
      reg_number: (conv.reg_number as string) || 'TEST-REG',
      model: (conv.model as string) || 'Test Vehicle',
      customer_name: (conv.customer_name as string) || 'Test Customer',
      customer_phone: (conv.phone as string) || '9999999999',
      service_type: 'Paid Service', status: 'Confirmed',
      wa_opt_in: true, wa_conversation_id: String(conversation_id),
    }]).select()

    if (bkgErr) {
      console.error('Booking insert error:', bkgErr.message)
    } else {
      const newBkg = newBkgArr?.[0] as Record<string, unknown>
      bookingId = (newBkg?.lead_number as string) || `#${newBkg?.id}`
      bookingCreated = true

      await sb.from('wa_conversations').update({
        status: 'Booked', stage: 'booked',
        booking_id: newBkg?.id || null,
        preferred_date: extracted.date as string,
        preferred_time: (extracted.time as string) || null,
        preferred_branch: branchToUse,
      }).eq('id', conversation_id)

      // Build confirmation reply
      const dateStr = new Date((extracted.date as string) + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      })
      const confirmTemplate = ((config?.booking_confirm_msg as string) || '✅ *Booking Confirmed!*\n📋 ID: {{booking_id}}\n🚗 {{model}} ({{reg_no}})\n📅 {{date}} at {{time}}\n📍 {{branch}}\n\nDhanyawad! 🙏')
      aiReply = confirmTemplate
        .replace(/\{\{booking_id\}\}/g, bookingId || '')
        .replace(/\{\{date\}\}/g, dateStr)
        .replace(/\{\{branch\}\}/g, branchToUse || '')
        .replace(/\{\{time\}\}/g, (extracted.time as string) || 'Morning slot')
        .replace(/\{\{reg_no\}\}/g, (conv.reg_number as string) || '')
        .replace(/\{\{model\}\}/g, (conv.model as string) || '')
        .replace(/\{\{sa_name\}\}/g, 'Our team')
    }
  }

  // Save AI reply to DB
  await sb.from('wa_messages').insert([{
    conversation_id, direction: 'outbound', sender: 'ai', body: aiReply, ai_generated: true, status: 'sent',
  }])
  await sb.from('wa_conversations').update({ ai_turns: ((conv.ai_turns as number) || 0) + 1 }).eq('id', conversation_id)

  return Response.json({ reply: aiReply, stage: newStage, extracted, bookingCreated, bookingId })
})
