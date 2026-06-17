/**
 * wa-campaign-flow
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles the 6-step button-based booking flow triggered from WA campaigns.
 *
 * Steps:
 *   init           → customer taps "Book My Service" from campaign blast
 *   date_sent      → waiting for date choice (Tomorrow / Day After / Pick Another)
 *   custom_date    → waiting for customer to TYPE a custom date
 *   time_sent      → waiting for time slot choice
 *   branch_sent    → waiting for branch choice (Sitapura / Ajmer Road)
 *   pickup_sent    → waiting for Visit / Pickup choice
 *   address_sent   → (if pickup) waiting for customer to TYPE their address
 *   confirmed      → booking created, done
 *
 * Called by wa-webhook when flow_active = true on the conversation.
 * Also called directly to INITIATE a flow (action: "start").
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getConfig() {
  const { data } = await sb.from('wa_agent_config').select('*').eq('id', 1).single()
  return data as Record<string, unknown>
}

async function sendWA(phoneId: string, token: string, to: string, body: Record<string, unknown>) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, ...body }),
  })
  const data = await res.json()
  if (data.error) console.error('WA send error:', JSON.stringify(data.error))
  return data
}

function sendText(phoneId: string, token: string, to: string, text: string) {
  return sendWA(phoneId, token, to, { type: 'text', text: { body: text, preview_url: false } })
}

function sendButtons(phoneId: string, token: string, to: string, body: string, buttons: Array<{id:string;title:string}>, header?: string, footer?: string) {
  return sendWA(phoneId, token, to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      ...(header ? { header: { type: 'text', text: header } } : {}),
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: { buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
    },
  })
}

function sendList(phoneId: string, token: string, to: string, bodyText: string, buttonLabel: string, sections: Array<{title:string; rows: Array<{id:string;title:string;description?:string}>}>) {
  return sendWA(phoneId, token, to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: { button: buttonLabel, sections },
    },
  })
}

function sendMetaFlow(
  phoneId: string,
  token: string,
  to: string,
  flowId: string,
  flowToken: string,
  ctaLabel: string,
  prefill: Record<string, unknown>,
) {
  return sendWA(phoneId, token, to, {
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: { type: 'text', text: '🚗 Book Your Service' },
      body: { text: 'Please fill your preferred date, time, branch, and pickup option.' },
      footer: { text: 'Techwheels — Tata Authorised Service' },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_id: flowId,
          flow_cta: ctaLabel,
          flow_token: flowToken,
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'BOOK_SERVICE',
            data: prefill,
          },
        },
      },
    },
  })
}

// Format a Date as "Mon, 16 Jun"
function fmtDate(d: Date) {
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Parse IST date string typed by user (e.g. "18 june", "18/6", "18-06-2026")
function parseUserDate(input: string): Date | null {
  const s = input.trim().toLowerCase()
  const months: Record<string,number> = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11,
    january:0, february:1, march:2, april:3, june:5, july:6, august:7, september:8, october:9, november:10, december:11 }
  const now = new Date()
  // "18 june" or "18 jun"
  let m = s.match(/^(\d{1,2})\s+([a-z]+)/)
  if (m) {
    const day = parseInt(m[1]), mon = months[m[2].slice(0,3)]
    if (mon !== undefined) {
      const yr = now.getMonth() > mon ? now.getFullYear() + 1 : now.getFullYear()
      return new Date(yr, mon, day)
    }
  }
  // "18/6" or "18/06" or "18-06" or "18-06-2026"
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?$/)
  if (m) {
    const day = parseInt(m[1]), mon = parseInt(m[2]) - 1, yr = m[3] ? parseInt(m[3]) : now.getFullYear()
    return new Date(yr, mon, day)
  }
  return null
}

function slotToSqlTime(slot: string | null | undefined): string | null {
  if (!slot) return null
  const s = slot.toLowerCase()
  if (s.includes('morning') || s.includes('9 am') || s.includes('9–11')) return '09:00:00'
  if (s.includes('afternoon') || s.includes('12 pm') || s.includes('12–2')) return '12:00:00'
  if (s.includes('evening') || s.includes('3 pm') || s.includes('3–6')) return '15:00:00'
  const m = s.match(/(\d{1,2}):(\d{2})/)
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}:00`
  return null
}

function normalizeIndianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  return digits.slice(-10)
}

function normalizeBranch(input: string | null | undefined): string | null {
  if (!input) return null
  const s = input.toLowerCase()
  if (s.includes('sitapura')) return 'Sitapura'
  if (s.includes('ajmer')) return 'Ajmer Road'
  return input
}

function parseMetaFlowDate(input: string | null | undefined): string | null {
  if (!input) return null
  const s = String(input).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?$/)
  if (!m) return null
  const now = new Date()
  const dd = m[1].padStart(2, '0')
  const mm = m[2].padStart(2, '0')
  const yy = m[3] || String(now.getFullYear())
  return `${yy}-${mm}-${dd}`
}

function parseMetaFlowPickupFlag(input: unknown): boolean {
  if (typeof input === 'boolean') return input
  const s = String(input || '').toLowerCase()
  return s.includes('pickup') || s === 'yes' || s === 'true' || s === '1'
}

// Multiple-choice fields from Meta Flows arrive as arrays — flatten to string
function parseMetaFlowMultiChoice(input: unknown): string | null {
  if (!input) return null
  if (Array.isArray(input)) return (input as string[]).filter(Boolean).join(', ') || null
  return String(input).trim() || null
}

// Map Meta Flow time label → SQL time string
function parseMetaFlowTime(input: string | null | undefined): string | null {
  if (!input) return null
  const s = String(input).toLowerCase()
  if (s.includes('morning'))   return 'Morning (9 AM – 11 AM)'
  if (s.includes('afternoon')) return 'Afternoon (12 PM – 2 PM)'
  if (s.includes('evening'))   return 'Evening (3 PM – 6 PM)'
  return String(input).trim()
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  let payload: Record<string, unknown> = {}
  try { payload = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const cfg = await getConfig()
  const phoneId = cfg.meta_phone_number_id as string
  const token   = cfg.meta_access_token as string

  const action   = payload.action as string   // "start" | "handle_reply"
  const phone    = payload.phone as string     // customer WA number
  const convId   = payload.conv_id as number

  // ── LOAD conversation ────────────────────────────────────────────────────
  const { data: convArr } = await sb.from('wa_conversations').select('*').eq('id', convId).limit(1)
  const conv = convArr?.[0] as Record<string, unknown>
  if (!conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })

  const flowData = (conv.flow_data || {}) as Record<string, unknown>

  // ── Helper: save flow state ──────────────────────────────────────────────
  async function saveFlow(step: string, extra: Record<string, unknown> = {}) {
    await sb.from('wa_conversations').update({
      flow_active: true,
      flow_step: step,
      flow_data: { ...flowData, ...extra },
      updated_at: new Date().toISOString(),
    }).eq('id', convId)
  }

  async function endFlow(bookingId?: number) {
    await sb.from('wa_conversations').update({
      flow_active: false,
      flow_step: 'confirmed',
      status: 'Booked',
      stage: 'Booked',
      booking_id: bookingId ?? conv.booking_id,
      flow_booking_id: bookingId ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', convId)
  }

  // ────────────────────────────────────────────────────────────────────────
  // ACTION: start — send initial date picker
  // Called after campaign blast, when customer taps "Book My Service"
  // ────────────────────────────────────────────────────────────────────────
  if (action === 'start') {
    const custName = (conv.customer_name as string || 'there').split(' ')[0]
    const metaFlowId = (cfg.meta_booking_flow_id as string) || ''
    const metaFlowCta = (cfg.meta_booking_flow_cta as string) || 'Book My Service'

    if (metaFlowId) {
      const flowRes = await sendMetaFlow(
        phoneId,
        token,
        phone,
        metaFlowId,
        `tw_booking_${convId}_${Date.now()}`,
        metaFlowCta,
        {
          customer_name: conv.customer_name || custName,
          model: conv.model || '',
          reg_number: conv.reg_number || '',
          branches: (cfg.available_branches as string[]) || ['Sitapura', 'Ajmer Road'],
        },
      )

      if (!(flowRes as Record<string, unknown>)?.error) {
        await saveFlow('meta_flow_sent')
        return Response.json({ success: true, step: 'meta_flow_sent' })
      }
      console.error('Meta Flow send failed, falling back to button flow')
    }

    const tomorrow   = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    const dayAfter   = new Date(); dayAfter.setDate(dayAfter.getDate() + 2)
    // Skip Sunday
    if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1)
    if (dayAfter.getDay() === 0) dayAfter.setDate(dayAfter.getDate() + 1)

    await sendButtons(phoneId, token, phone,
      `Hi ${custName}! 😊 Let's get your ${conv.model || 'vehicle'} serviced.\n\n📅 Which date works for you?`,
      [
        { id: `date_tmr_${tomorrow.toISOString().split('T')[0]}`, title: `Tomorrow, ${fmtDate(tomorrow)}` },
        { id: `date_da_${dayAfter.toISOString().split('T')[0]}`,  title: `${fmtDate(dayAfter)}` },
        { id: 'date_other', title: '📅 Choose Another Date' },
      ],
      '🚗 Book Your Service',
      'Techwheels — Tata Authorised Service'
    )
    await saveFlow('date_sent')
    return Response.json({ success: true, step: 'date_sent' })
  }

  // ────────────────────────────────────────────────────────────────────────
  // ACTION: handle_reply — process what customer sent/tapped
  // ────────────────────────────────────────────────────────────────────────
  if (action === 'handle_reply') {
    const replyType   = payload.reply_type as string   // "button_reply" | "text"
    const replyId     = payload.reply_id as string     // button ID (for button_reply)
    const replyText   = payload.reply_text as string   // raw text (for text type)
    const currentStep = conv.flow_step as string

    if (currentStep === 'meta_flow_sent' && replyType === 'nfm_reply') {
      const flowReply = (payload.reply_data || {}) as Record<string, unknown>
      const response = (flowReply.response_json || flowReply) as Record<string, unknown>

      // ── Single-screen form field extraction ─────────────────────────────────
      // Field keys match the IDs set in Meta Flow Builder (snake_case of label)
      const dateRaw    = (response.service_date || response.appointment_date || response.booking_date || response.date) as string | undefined
      const timeLabel  = (response.preferred_time || response.booking_time || response.time_slot || response.time) as string | undefined
      const serviceRaw = response.service_type || response.service_category || response.service
      const pickupRaw  = response.type || response.visit_type || response.pickup_required || response.visit_mode
      const pickupAddress = (response.pickup_address || response.address || null) as string | null
      const issuesRaw  = (response.issues_with_vehicle || response.complaint || response.issue || response.notes || null) as string | null

      const bookingDate    = parseMetaFlowDate(dateRaw)
      const timeSlot       = parseMetaFlowTime(timeLabel)
      const serviceType    = parseMetaFlowMultiChoice(serviceRaw)
      const pickupRequired = parseMetaFlowPickupFlag(pickupRaw)

      // Default branch to first configured branch — form has no branch field
      const defaultBranch  = ((cfg.available_branches as string[]) || [])[0] || null

      if (!bookingDate) {
        await sendText(phoneId, token, phone,
          'Ek problem aa gayi form mein 😅 Please continue with buttons below 👇'
        )
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
        const dayAfter = new Date(); dayAfter.setDate(dayAfter.getDate() + 2)
        await sendButtons(phoneId, token, phone,
          `📅 Which date works for you?`,
          [
            { id: `date_tmr_${tomorrow.toISOString().split('T')[0]}`, title: `Tomorrow, ${fmtDate(tomorrow)}` },
            { id: `date_da_${dayAfter.toISOString().split('T')[0]}`,  title: `${fmtDate(dayAfter)}` },
            { id: 'date_other', title: '📅 Choose Another Date' },
          ]
        )
        await saveFlow('date_sent')
        return Response.json({ success: true, step: 'date_sent' })
      }

      // ── Update conversation with form-sourced fields ─────────────────────────
      // reg_number, customer_name, customer_phone come from campaign contact (already on conv)
      const convUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (serviceType)     convUpdates.service_type          = serviceType
      if (issuesRaw)       convUpdates.complaint_description = issuesRaw
      if (pickupRequired)  convUpdates.pickup_required       = pickupRequired
      if (pickupAddress)   convUpdates.pickup_address        = pickupAddress
      await sb.from('wa_conversations').update(convUpdates).eq('id', convId)
      Object.assign(conv, convUpdates)

      const nextFlowData = {
        ...flowData,
        booking_date:     bookingDate,
        time_slot:        timeSlot || 'Morning (9 AM – 11 AM)',
        branch:           defaultBranch,
        service_type:     serviceType,
        complaint:        issuesRaw,
        pickup_required:  pickupRequired,
        pickup_address:   pickupRequired ? pickupAddress : null,
      }

      await saveFlow('confirming', nextFlowData)
      return await createBookingAndConfirm(
        conv,
        nextFlowData,
        pickupRequired,
        pickupRequired ? pickupAddress : null,
        phone,
        phoneId,
        token,
        endFlow,
      )
    }

    // ── STEP: date_sent ── waiting for date button ────────────────────────
    if (currentStep === 'date_sent') {
      if (replyType === 'button_reply') {
        if (replyId === 'date_other') {
          // Ask them to type
          await sendText(phoneId, token, phone,
            `Sure! Please type your preferred date 📅\n\nExamples:\n• *18 June*\n• *18/6*\n• *18-06-2026*\n\n(We're open Mon–Sat, closed Sundays)`
          )
          await saveFlow('custom_date')
          return Response.json({ success: true, step: 'custom_date' })
        } else {
          // Extract date from button ID: "date_tmr_2026-06-17"
          const datePart = replyId.replace(/^date_(tmr|da)_/, '')
          return await sendTimeStep(datePart)
        }
      }
      // If they typed something anyway
      const parsed = parseUserDate(replyText)
      if (parsed) return await sendTimeStep(parsed.toISOString().split('T')[0])
      await sendText(phoneId, token, phone, `Please tap one of the buttons above to choose your date 👆`)
      return Response.json({ success: true })
    }

    // ── STEP: custom_date ── waiting for typed date ───────────────────────
    if (currentStep === 'custom_date') {
      const parsed = parseUserDate(replyText || '')
      if (!parsed) {
        await sendText(phoneId, token, phone,
          `I couldn't understand that date 😅 Please try like:\n• *18 June*\n• *18/6*\n• *20-06-2026*`
        )
        return Response.json({ success: true })
      }
      if (parsed.getDay() === 0) {
        const next = new Date(parsed); next.setDate(next.getDate() + 1)
        await sendText(phoneId, token, phone,
          `Sorry, we're closed on Sundays 🙏\nHow about *${fmtDate(next)}* (Monday)? Please reply with that date.`
        )
        return Response.json({ success: true })
      }
      return await sendTimeStep(parsed.toISOString().split('T')[0])
    }

    // ── STEP: time_sent ── waiting for time slot button ───────────────────
    if (currentStep === 'time_sent') {
      if (replyType !== 'button_reply') {
        await sendText(phoneId, token, phone, `Please tap one of the time options above 👆`)
        return Response.json({ success: true })
      }
      const slotMap: Record<string, string> = {
        slot_morning:   'Morning (9 AM – 11 AM)',
        slot_afternoon: 'Afternoon (12 PM – 2 PM)',
        slot_evening:   'Evening (3 PM – 6 PM)',
      }
      const slot = slotMap[replyId] || replyText
      await saveFlow('branch_sent', { time_slot: slot })

      await sendButtons(phoneId, token, phone,
        `Got it — *${slot}* 👍\n\n📍 Which service centre is convenient for you?`,
        [
          { id: 'branch_sitapura', title: '📍 Sitapura' },
          { id: 'branch_ajmer',    title: '📍 Ajmer Road' },
        ]
      )
      return Response.json({ success: true, step: 'branch_sent' })
    }

    // ── STEP: branch_sent ── waiting for branch button ────────────────────
    if (currentStep === 'branch_sent') {
      if (replyType !== 'button_reply') {
        await sendText(phoneId, token, phone, `Please tap a branch above 👆`)
        return Response.json({ success: true })
      }
      const branchMap: Record<string, string> = {
        branch_sitapura: 'Sitapura',
        branch_ajmer:    'Ajmer Road',
      }
      const branch = branchMap[replyId] || replyText
      await saveFlow('pickup_sent', { branch })

      await sendButtons(phoneId, token, phone,
        `Great — *${branch}* it is! 🏢\n\nHow will your vehicle reach us?`,
        [
          { id: 'visit_self',   title: "🚗 I'll Drive It In" },
          { id: 'visit_pickup', title: '🛻 Car Pickup Please' },
        ]
      )
      return Response.json({ success: true, step: 'pickup_sent' })
    }

    // ── STEP: pickup_sent ── waiting for visit/pickup button ─────────────
    if (currentStep === 'pickup_sent') {
      if (replyType !== 'button_reply') {
        await sendText(phoneId, token, phone, `Please tap one of the options above 👆`)
        return Response.json({ success: true })
      }
      if (replyId === 'visit_pickup') {
        await saveFlow('address_sent', { pickup_required: true })
        await sendText(phoneId, token, phone,
          `Perfect! 🛻 Please share your *pickup address* so our driver can find you.\n\nYou can type the address or share your location 📍`
        )
        return Response.json({ success: true, step: 'address_sent' })
      } else {
        // Self drop — confirm directly
        await saveFlow('confirming', { pickup_required: false })
        return await createBookingAndConfirm(conv, flowData, false, null, phone, phoneId, token, endFlow)
      }
    }

    // ── STEP: address_sent ── waiting for customer to type pickup address ──
    if (currentStep === 'address_sent') {
      let address = replyText?.trim() || ''
      // Handle location message
      if (payload.location_lat && payload.location_lon) {
        address = `📍 Location shared (${payload.location_lat}, ${payload.location_lon})`
      }
      if (!address || address.length < 5) {
        await sendText(phoneId, token, phone, `Please share your pickup address or location 📍`)
        return Response.json({ success: true })
      }
      await saveFlow('confirming', { pickup_address: address })
      return await createBookingAndConfirm(conv, { ...flowData, pickup_address: address }, true, address, phone, phoneId, token, endFlow)
    }

    return Response.json({ success: true, unhandled_step: currentStep })
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 })

  // ── Internal helpers ───────────────────────────────────────────────────

  async function sendTimeStep(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    if (d.getDay() === 0) {
      d.setDate(d.getDate() + 1) // shift to Monday
      await sendText(phoneId, token, phone, `Sundays we're closed 🙏 Bumping you to *${fmtDate(d)}*…`)
    }
    const finalDate = d.toISOString().split('T')[0]
    await saveFlow('time_sent', { booking_date: finalDate })

    await sendButtons(phoneId, token, phone,
      `📅 *${fmtDate(d)}* — great choice!\n\n⏰ What time works best for you?`,
      [
        { id: 'slot_morning',   title: '🌅 Morning 9–11 AM' },
        { id: 'slot_afternoon', title: '☀️ Afternoon 12–2 PM' },
        { id: 'slot_evening',   title: '🌇 Evening 3–6 PM' },
      ]
    )
    return Response.json({ success: true, step: 'time_sent' })
  }
})

// ── Create booking + send confirmation ─────────────────────────────────────
async function createBookingAndConfirm(
  conv: Record<string, unknown>,
  flowData: Record<string, unknown>,
  pickupRequired: boolean,
  pickupAddress: string | null,
  phone: string,
  phoneId: string,
  token: string,
  endFlow: (id?: number) => Promise<void>
) {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
  const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

  const appointmentDate = flowData.booking_date as string
  const timeSlot    = flowData.time_slot as string
  const branch      = (flowData.branch as string) || null
  const bookingTime = slotToSqlTime(timeSlot)
  const customerPhone = normalizeIndianPhone(phone)

  // service_type and complaint may come directly from the Meta Flow form via flowData
  const serviceType  = (flowData.service_type as string) || (conv.service_type as string) || null
  const complaint    = (flowData.complaint as string) || (conv.complaint_description as string) || null

  // Generate lead number
  const leadNum = `TW-WA-${Date.now().toString().slice(-6)}`

  const bookingPayload = {
    booking_source:        'WhatsApp',
    lead_number:           leadNum,
    booking_date:          new Date().toISOString().split('T')[0],
    booking_time:          bookingTime,
    appointment_date:      appointmentDate,
    reg_number:            conv.reg_number || null,
    model:                 conv.model || null,
    fuel_type:             conv.fuel_type || null,
    customer_name:         conv.customer_name || null,
    customer_phone:        customerPhone,
    service_type:          serviceType,
    complaint_description: complaint,
    pickup_required:       pickupRequired,
    pickup_address:        pickupAddress,
    branch:                branch,
    status:                'New',
    wa_conversation_id:    String(conv.id),
    wa_opt_in:             true,
    created_at:            new Date().toISOString(),
    updated_at:            new Date().toISOString(),
  }

  const { data: bk, error: bkErr } = await sb.from('service_bookings').insert([bookingPayload]).select().single()
  if (bkErr) {
    console.error('Booking insert error:', bkErr)
    await sb.from('wa_conversations').update({ flow_active: false }).eq('id', conv.id)
    const sendWA2 = async (to: string, body: Record<string, unknown>) => {
      await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, ...body }),
      })
    }
    await sendWA2(phone, { type: 'text', text: { body: `Sorry, there was an error creating your booking. Please call us directly. 🙏` } })
    return Response.json({ error: 'Booking insert failed', detail: bkErr.message }, { status: 500 })
  }

  const bookingId = (bk as Record<string, unknown>).id as number
  await endFlow(bookingId)

  // Format confirmation date
  const d = new Date(appointmentDate + 'T00:00:00')
  const fmtD = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  // Send beautiful confirmation
  const confirmLines = [
    `✅ *Service Booked Successfully!*`,
    ``,
    `📋 *Booking ID:* #${leadNum}`,
    `👤 *Name:* ${conv.customer_name || 'Customer'}`,
    `🚗 *Vehicle:* ${conv.model || ''} ${conv.reg_number ? `(${conv.reg_number})` : ''}`.trim(),
    `📅 *Date:* ${fmtD}`,
    `⏰ *Time:* ${timeSlot}`,
    `📍 *Branch:* Techwheels, ${branch}`,
    pickupRequired ? `🛻 *Pickup:* ${pickupAddress}` : `🚗 *Visit:* Drive-in`,
    ``,
    `Your assigned Service Advisor will contact you shortly to confirm. 🙏`,
    ``,
    `_Techwheels — Tata Authorised Service, Jaipur_`,
  ].filter(Boolean).join('\n')

  await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: confirmLines },
    }),
  })

  // Notify SA via WA (if configured)
  const cfg2 = await sb.from('wa_agent_config').select('sa_whatsapp_number').eq('id', 1).single()
  const saNum = (cfg2.data as Record<string,string>)?.sa_whatsapp_number
  if (saNum) {
    const saAlert = [
      `🔔 *New WA Campaign Booking* #${leadNum}`,
      `👤 ${conv.customer_name || 'Unknown'} | 📞 ${phone}`,
      `🚗 ${conv.model || '-'} ${conv.reg_number ? `(${conv.reg_number})` : ''}`,
      `📅 ${fmtD} | ⏰ ${timeSlot}`,
      `📍 ${branch}`,
      pickupRequired ? `🛻 Pickup: ${pickupAddress}` : `🚗 Drive-in`,
    ].join('\n')
    await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: saNum, type: 'text', text: { body: saAlert } }),
    })
  }

  return Response.json({ success: true, booking_id: bookingId, lead_number: leadNum })
}
