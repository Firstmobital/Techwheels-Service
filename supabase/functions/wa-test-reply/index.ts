/**
 * wa-test-reply — mirrors wa-webhook logic for the Test Simulator tab
 * Same fixes: memory, Hinglish NLU, DMS lookup, escalation, workshop prompts
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

function safeTime(t: string | null): string | null {
  if (!t) return null
  const m = t.match(/^(\d{1,2}):?(\d{2})?/)
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}:00`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const { conversation_id, message } = await req.json()
  if (!conversation_id || !message) return Response.json({ error: 'conversation_id and message required' }, { status: 400 })

  const { data: cfgArr } = await sb.from('wa_agent_config').select('*').eq('id', 1).limit(1)
  const config = cfgArr?.[0] as Record<string, unknown>
  const openaiKey = config?.openai_api_key as string
  if (!openaiKey) return Response.json({ error: 'OpenAI key not set in Settings' }, { status: 400 })

  const { data: convArr } = await sb.from('wa_conversations').select('*').eq('id', conversation_id).limit(1)
  const conv = convArr?.[0] as Record<string, unknown>
  if (!conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })

  // Load vehicle history
  const phone10 = conv.phone as string
  const { data: vehArr } = await sb.from('all_service_data')
    .select('id,cust_first_name,cust_last_name,registration_no,ppl,vehicle_sale_date,first_free_service_done_flag,second_free_service_done_flag,third_free_service_done_flag,fourth_free_service_done_flag,last_service_date,last_service_type,scheduled_next_service_date,extended_warranty_product,extended_warranty_end_date,amc_no,amc_type,amc_end_date,service_churn_flag')
    .eq('cust_mobile_no', phone10).limit(1)
  const vehicle = vehArr?.[0] as Record<string, unknown> | null

  // Load history
  const { data: histRows } = await sb.from('wa_messages')
    .select('direction,body').eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true }).limit(14)
  const history = (histRows || []) as Array<{ direction: string; body: string }>

  const todayStr = new Date().toISOString().split('T')[0]
  const transcript = history.slice(-14).map(m => `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.body}`).join('\n')

  // ── Extract details (same rich prompt as webhook) ──────────────────────────
  let extracted: Record<string, unknown> | null = null
  try {
    const extRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: `Analyze WhatsApp car service booking conversation. Return JSON only:
{ "date":"YYYY-MM-DD or null","time":"HH:MM or null","branch":"Sitapura|Ajmer Road|Shahpura|null",
  "service_type":"Free Service|Paid Service|Accidental Repair|AMC|Running Repair|null",
  "complaint":"text or null","km_reading":number or null,"confirmed":true/false,
  "stage":"intro|collecting|confirming|booked|escalate","escalate":false,
  "escalation_reason":"text or null","customer_language":"hindi|english|hinglish" }
Service type hints: free/pehli/dusri/tisri=Free Service, accident/thoka/dent=Accidental Repair, breakdown/band ho gaya=Running Repair, AMC=AMC, else=Paid Service.
confirmed=true ONLY if customer said YES/haan/theek hai/bilkul to a specific date. Today: ${todayStr}`
        }, { role: 'user', content: transcript }],
        max_tokens: 200, temperature: 0, response_format: { type: 'json_object' },
      }),
    })
    const ed = await extRes.json()
    extracted = JSON.parse(ed.choices?.[0]?.message?.content || '{}')
  } catch { extracted = null }

  // ── Persist memory ─────────────────────────────────────────────────────────
  const updatePayload: Record<string, unknown> = {}
  const newStage = (extracted?.stage as string) || (conv.stage as string) || 'intro'
  if (newStage !== conv.stage) updatePayload.stage = newStage
  const convDateStr = conv.preferred_date ? String(conv.preferred_date).split('T')[0] : null
  if (extracted?.date && extracted.date !== convDateStr) updatePayload.preferred_date = extracted.date
  if (extracted?.branch && extracted.branch !== conv.preferred_branch) updatePayload.preferred_branch = extracted.branch
  if (extracted?.time && extracted.time !== conv.preferred_time_slot) updatePayload.preferred_time_slot = extracted.time
  if (extracted?.service_type && !conv.service_type) updatePayload.service_type = extracted.service_type
  if (extracted?.complaint && !conv.complaint_description) updatePayload.complaint_description = extracted.complaint
  if (extracted?.km_reading && !conv.km_reading) updatePayload.km_reading = extracted.km_reading
  if (Object.keys(updatePayload).length > 0) await sb.from('wa_conversations').update(updatePayload).eq('id', conversation_id)
  const updatedConv = { ...conv, ...updatePayload }

  // ── Build rich system prompt ───────────────────────────────────────────────
  const branches = (config?.available_branches as string[])?.join(', ') || 'Sitapura, Ajmer Road, Shahpura'
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const stage = newStage

  const memoryBlock = `=== CUSTOMER MEMORY (DO NOT ASK FOR THIS AGAIN) ===
Name: ${updatedConv.customer_name || 'Valued Customer'}
Vehicle: ${updatedConv.model || 'unknown'} | Reg: ${updatedConv.reg_number || 'not given'}
Service Type: ${updatedConv.service_type || 'not specified'} | Complaint: ${updatedConv.complaint_description || 'none'}
KM Reading: ${updatedConv.km_reading ? updatedConv.km_reading + ' km' : 'not given'}
Preferred Date: ${updatedConv.preferred_date ? String(updatedConv.preferred_date).split('T')[0] : 'not set'}
Preferred Time: ${updatedConv.preferred_time_slot || 'not set'} | Branch: ${updatedConv.preferred_branch || 'not set'}`

  let dmsBlock = ''
  if (vehicle) {
    dmsBlock = `=== DMS VEHICLE HISTORY ===
Model: ${vehicle.ppl} | Last Service: ${vehicle.last_service_date || 'never'} (${vehicle.last_service_type || 'unknown'})
Next Due: ${vehicle.scheduled_next_service_date || 'overdue'}
Free Services: 1st=${vehicle.first_free_service_done_flag==='Y'?'done':'pending'} 2nd=${vehicle.second_free_service_done_flag==='Y'?'done':'pending'} 3rd=${vehicle.third_free_service_done_flag==='Y'?'done':'pending'} 4th=${vehicle.fourth_free_service_done_flag==='Y'?'done':'pending'}
AMC: ${vehicle.amc_no ? `${vehicle.amc_type} till ${vehicle.amc_end_date}` : 'none'} | EW: ${vehicle.extended_warranty_product ? `${vehicle.extended_warranty_product} till ${vehicle.extended_warranty_end_date}` : 'none'}`
  }

  const basePrompt = (config?.system_prompt as string) || `You are ${config?.agent_name || 'Riya'}, service booking agent for ${config?.business_name || 'Techwheels'} (Tata Motors, Jaipur).`
  const systemPrompt = `${basePrompt}
TODAY: ${today} | WORKING HOURS: ${config?.working_hours || 'Mon-Sat 9AM-6PM'} | BRANCHES: ${branches}
${memoryBlock}
${dmsBlock}
RULES: Under 80 words. Hinglish. Specific dates. No repeated questions. Workshop-aware (free service=free, Sunday=holiday, accident=bodyshop).
${stage === 'intro' ? 'ACT: Greet by name, ask service type needed.' : ''}
${stage === 'collecting' ? 'ACT: Collect only missing info.' : ''}
${stage === 'confirming' ? 'ACT: Full summary, ask YES.' : ''}
${stage === 'escalate' ? 'ACT: Empathise, say SA will call in 30 min.' : ''}`

  let aiReply = "Thank you! We'll be in touch. 🙏"
  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.slice(-12).map(m => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.body })),
        { role: 'user', content: message },
      ],
      max_tokens: 220, temperature: 0.65,
    }),
  })
  const aiData = await aiRes.json()
  if (aiData.choices?.[0]?.message?.content) aiReply = aiData.choices[0].message.content.trim()

  // ── Booking confirm ────────────────────────────────────────────────────────
  let bookingCreated = false, bookingId: string | null = null
  const alreadyBooked = conv.status === 'Booked' || conv.stage === 'booked'
  if (extracted?.confirmed === true && extracted?.date && !alreadyBooked) {
    const branchToUse = (extracted.branch as string) || (updatedConv.preferred_branch as string) || (config?.available_branches as string[])?.[0] || null
    const { data: nb, error: be } = await sb.from('service_bookings').insert([{
      booking_source: 'WhatsApp AI Agent (Test)',
      booking_date: todayStr, appointment_date: extracted.date,
      booking_time: safeTime((extracted.time as string) || (updatedConv.preferred_time_slot as string) || null),
      branch: branchToUse,
      reg_number: (conv.reg_number as string) || 'TEST-REG',
      model: (conv.model as string) || (vehicle?.ppl as string) || 'Test Vehicle',
      customer_name: (conv.customer_name as string) || 'Test Customer',
      customer_phone: phone10, service_type: (updatedConv.service_type as string) || 'Paid Service',
      complaint_description: (updatedConv.complaint_description as string) || null,
      km_reading: (updatedConv.km_reading as number) || null,
      status: 'Confirmed', wa_opt_in: true, wa_conversation_id: String(conversation_id),
    }]).select()
    if (!be && nb?.[0]) {
      bookingId = (nb[0].lead_number as string) || `#${nb[0].id}`
      bookingCreated = true
      await sb.from('wa_conversations').update({ status: 'Booked', stage: 'booked', booking_id: nb[0].id }).eq('id', conversation_id)
      const dateStr = new Date((extracted.date as string) + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
      aiReply = `✅ *Booking Confirmed!*\n📋 ID: ${bookingId}\n🚗 ${conv.model || vehicle?.ppl || ''} (${conv.reg_number || ''})\n🔧 ${updatedConv.service_type || 'Service'}\n📅 ${dateStr}\n📍 ${branchToUse || ''}\n\nDhanyawad! 🙏`
    } else if (be) console.error('Booking error:', be.message)
  }

  await sb.from('wa_messages').insert([{ conversation_id, direction: 'outbound', sender: 'ai', body: aiReply, ai_generated: true, status: 'sent' }])
  await sb.from('wa_conversations').update({ ai_turns: ((conv.ai_turns as number) || 0) + 1 }).eq('id', conversation_id)

  return Response.json({ reply: aiReply, stage: newStage, extracted, bookingCreated, bookingId, vehicleFound: !!vehicle, memoryUpdated: Object.keys(updatePayload) })
})
