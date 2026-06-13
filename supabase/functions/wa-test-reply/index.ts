import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

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

  // Load history
  const { data: historyRows } = await sb.from('wa_messages')
    .select('direction,body').eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true }).limit(12)
  const history = (historyRows || []) as Array<{ direction: string; body: string }>

  // Extract booking details
  const allMsgs = [...history, { direction: 'inbound', body: message }]
  const transcript = allMsgs.slice(-8).map(m => `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.body}`).join('\n')

  let extracted: Record<string, unknown> | null = null
  try {
    const extRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Analyze this WhatsApp booking conversation. Return JSON: { "date": "YYYY-MM-DD or null", "time": "HH:MM or null", "branch": "branch or null", "confirmed": true/false, "stage": "intro|collecting|confirming|booked" }. confirmed=true ONLY if customer explicitly said YES/confirm/haan to a specific date. Today: ${new Date().toISOString().split('T')[0]}` },
          { role: 'user', content: transcript },
        ],
        max_tokens: 120, temperature: 0, response_format: { type: 'json_object' },
      }),
    })
    const extData = await extRes.json()
    extracted = JSON.parse(extData.choices?.[0]?.message?.content || '{}')
  } catch { extracted = null }

  // Update stage if changed
  const newStage = (extracted?.stage as string) || (conv.stage as string) || 'intro'
  if (newStage !== conv.stage) {
    await sb.from('wa_conversations').update({ stage: newStage }).eq('id', conversation_id)
  }
  if (extracted?.date) await sb.from('wa_conversations').update({ preferred_date: extracted.date }).eq('id', conversation_id)
  if (extracted?.branch) await sb.from('wa_conversations').update({ preferred_branch: extracted.branch }).eq('id', conversation_id)

  // Build AI reply
  const branches = (config?.available_branches as string[])?.join(', ') || 'Sitapura, Ajmer Road, Shahpura'
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const systemPrompt = `${config?.system_prompt}
TODAY: ${today} | BRANCHES: ${branches}
Customer: ${conv.customer_name || 'Test Customer'} | Vehicle: ${conv.model || 'Nexon'} | Reg: ${conv.reg_number || ''}
Stage: ${newStage} | Preferred date: ${extracted?.date || conv.preferred_date || 'not set'} | Branch: ${extracted?.branch || conv.preferred_branch || 'not set'}
RULES: Under 80 words. Move conversation forward. Suggest specific dates. If customer said YES → confirm booking.`

  const aiMessages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-8).map(m => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.body })),
    { role: 'user', content: message },
  ]

  let aiReply = "Thank you! We'll be in touch soon. 🙏"
  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: aiMessages, max_tokens: 200, temperature: 0.75 }),
  })
  const aiData = await aiRes.json()
  if (aiData.choices?.[0]?.message?.content) aiReply = aiData.choices[0].message.content.trim()

  // If confirmed → create booking
  let bookingCreated = false
  let bookingId: string | null = null
  if (extracted?.confirmed === true && extracted?.date && newStage !== 'booked') {
    const { data: newBkgArr } = await sb.from('service_bookings').insert([{
      booking_source: 'WhatsApp AI Agent (Test)',
      booking_date: new Date().toISOString().split('T')[0],
      appointment_date: extracted.date,
      booking_time: extracted.time ? `${extracted.time}:00` : null,
      branch: (extracted.branch as string) || (config?.available_branches as string[])?.[0] || null,
      reg_number: (conv.reg_number as string) || 'TEST-REG',
      model: (conv.model as string) || 'Test Vehicle',
      customer_name: (conv.customer_name as string) || 'Test Customer',
      customer_phone: (conv.phone as string) || '9999999999',
      service_type: 'Paid Service', status: 'Confirmed',
      wa_opt_in: true, wa_conversation_id: String(conversation_id),
    }]).select()
    const newBkg = newBkgArr?.[0] as Record<string, unknown>
    bookingId = (newBkg?.lead_number as string) || `#${newBkg?.id}`
    bookingCreated = true

    await sb.from('wa_conversations').update({
      status: 'Booked', stage: 'booked',
      booking_id: newBkg?.id || null,
      preferred_date: extracted.date as string,
      preferred_time: (extracted.time as string) || null,
      preferred_branch: (extracted.branch as string) || null,
    }).eq('id', conversation_id)

    const confirmMsg = ((config?.booking_confirm_msg as string) || '✅ *Booking Confirmed!*\n📋 {{booking_id}}\n📅 {{date}}\n📍 {{branch}}\nDhanyawad! 🙏')
      .replace(/\{\{booking_id\}\}/g, bookingId || '')
      .replace(/\{\{date\}\}/g, new Date(extracted.date as string).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }))
      .replace(/\{\{branch\}\}/g, (extracted.branch as string) || '')
      .replace(/\{\{time\}\}/g, (extracted.time as string) || 'Morning slot')
      .replace(/\{\{reg_no\}\}/g, (conv.reg_number as string) || '')
      .replace(/\{\{model\}\}/g, (conv.model as string) || '')
      .replace(/\{\{sa_name\}\}/g, 'Our team')
    aiReply = confirmMsg
  }

  // Save AI reply to DB
  await sb.from('wa_messages').insert([{
    conversation_id, direction: 'outbound', sender: 'ai', body: aiReply, ai_generated: true, status: 'sent',
  }])
  await sb.from('wa_conversations').update({ ai_turns: ((conv.ai_turns as number) || 0) + 1 }).eq('id', conversation_id)

  return Response.json({ reply: aiReply, stage: newStage, extracted, bookingCreated, bookingId })
})
