/**
 * wa-ew-service-reminder
 *
 * Daily job that sends WhatsApp Extended Warranty service reminders to
 * customers whose all_service_data.extended_warranty_end_date falls 30 or 15
 * days from today (IST) — nudging them to get serviced while EW coverage is
 * still active.
 *
 * Safety guarantees:
 *  - DB UNIQUE(service_data_id, extended_warranty_end_date, reminder_type)
 *    prevents duplicate rows even if job runs twice.
 *  - Code-level skip if a row already exists (status != failed).
 *  - Skip if customer already has a service_booking near the due date.
 *  - Respects EW_SERVICE_REMINDER_ENABLED env var and wa_agent_config.ew_service_reminder_enabled.
 *  - dry_run=true in request body → full logic, no actual Meta API calls.
 *
 * "Book Now" reuses the same WhatsApp Flow (date/time/branch picker) as the
 * approved auto-service-reminder template — wa-webhook's nfm_reply handler
 * links the resulting booking back to this table (see ew_service_reminders.booking_id).
 *
 * Invoke manually:
 *   curl -X POST https://<project>.supabase.co/functions/v1/wa-ew-service-reminder \
 *     -H "Content-Type: application/json" \
 *     -d '{"dry_run": true}'
 *
 * Test single customer:
 *   -d '{"dry_run": true, "test_service_data_id": 12345}'
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── IST date helpers ─────────────────────────────────────────────────────────

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function addDays(baseIST: string, days: number): string {
  const d = new Date(baseIST + 'T00:00:00+05:30')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

// ─── Phone normalisation ──────────────────────────────────────────────────────

function normalizePhone(raw: string | null): { e164: string; local10: string } | null {
  if (!raw) return null
  const d = raw.replace(/\D/g, '')
  if (d.length < 10) return null
  const local10 = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.slice(-10)
  const e164 = `+91${local10}`
  return { e164, local10 }
}

// ─── Send Meta template ("Book Now" is a Flow button, same Flow the approved
//     auto-reminder template uses; "Call Us" is a static PHONE_NUMBER button
//     baked into the template, so it needs no component override) ───────────

async function sendFlowTemplate(
  phoneId: string,
  token: string,
  to: string,
  templateName: string,
  language: string,
  params: Array<{ type: 'text'; text: string }>,
): Promise<{ messages?: Array<{ id: string }>; error?: Record<string, unknown> }> {
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
          { type: 'body', parameters: params },
          { type: 'button', sub_type: 'flow', index: '0', parameters: [{ type: 'payload', payload: 'EW_SERVICE_BOOK_NOW' }] },
        ],
      },
    }),
  })
  return res.json()
}

// ─── Build body params ────────────────────────────────────────────────────────

function buildBodyParams(
  varExamples: Array<{ name?: string; example_value?: string }>,
  variableMap: Record<string, string>,
  serviceRow: Record<string, unknown>,
): Array<{ type: 'text'; text: string }> {
  return varExamples.map((ex) => {
    const varName = (ex.name || '').trim()
    const colName = variableMap[varName]
    let val = ''
    if (colName && serviceRow[colName] !== undefined && serviceRow[colName] !== null) {
      val = String(serviceRow[colName])
      if (colName.includes('date') || colName.includes('Date')) {
        const d = new Date(val + 'T00:00:00+05:30')
        if (!isNaN(d.getTime())) {
          val = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase()
        }
      }
    }
    if (!val) val = ex.example_value || ''
    return { type: 'text', text: val }
  })
}

// ─── Parallel batch runner ────────────────────────────────────────────────────

async function runBatched<T, R>(
  items: T[],
  batchSize: number,
  delayMs: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
    if (i + batchSize < items.length && delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  return results
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  const dryRun = body.dry_run === true
  const testServiceDataId = body.test_service_data_id as number | undefined
  const testPhone = typeof body.test_phone === 'string' ? body.test_phone : undefined

  // ── Load config ──────────────────────────────────────────────────────────
  const { data: cfgArr } = await sb.from('wa_agent_config').select('*').eq('id', 1).limit(1)
  const cfg = cfgArr?.[0] as Record<string, unknown> | undefined

  if (!cfg) {
    console.error('ESR: wa_agent_config row not found')
    return Response.json({ ok: false, error: 'Config not found' }, { status: 500, headers: corsHeaders })
  }

  const envEnabled = Deno.env.get('EW_SERVICE_REMINDER_ENABLED')
  const enabled = envEnabled !== undefined
    ? envEnabled === 'true'
    : (cfg.ew_service_reminder_enabled as boolean) ?? false

  if (!enabled && !dryRun && !testPhone) {
    console.log('ESR: disabled via config. Use dry_run=true to test anyway.')
    return Response.json({ ok: true, skipped: true, reason: 'disabled' }, { headers: corsHeaders })
  }

  const phoneId = cfg.meta_phone_number_id as string
  const token   = cfg.meta_access_token as string

  if (!phoneId || !token) {
    console.error('ESR: Meta credentials not configured in wa_agent_config')
    return Response.json({ ok: false, error: 'Meta credentials missing' }, { status: 400, headers: corsHeaders })
  }

  // ── Load approved template ──────────────────────────────────────────────
  const templateId = cfg.ew_service_reminder_template_id as number | undefined
  if (!templateId) {
    console.error('ESR: ew_service_reminder_template_id not set in wa_agent_config')
    return Response.json({ ok: false, error: 'ew_service_reminder_template_id not configured' }, { status: 400, headers: corsHeaders })
  }

  const { data: tplArr } = await sb.from('wa_templates').select('*').eq('id', templateId).limit(1)
  const tpl = tplArr?.[0] as Record<string, unknown> | undefined

  if (!tpl) {
    return Response.json({ ok: false, error: `Template id=${templateId} not found` }, { status: 400, headers: corsHeaders })
  }
  if (tpl.status !== 'approved') {
    return Response.json({ ok: false, error: `Template "${tpl.name}" is not approved (status: ${tpl.status})` }, { status: 400, headers: corsHeaders })
  }

  const templateName = tpl.name as string
  const templateLang = (cfg.ew_service_reminder_template_lang as string) || (tpl.language as string) || 'en'
  const varExamples  = (tpl.variable_examples as Array<{ name?: string; example_value?: string }>) || []
  const variableMap  = (cfg.ew_service_reminder_variable_map as Record<string, string>) || {
    name:        'first_name',
    model:       'model',
    reg_no:      'vehicle_registration_number',
    ew_end_date: 'extended_warranty_end_date',
  }

  // ── Test send: fire one message to an arbitrary number using example values ─
  if (testPhone) {
    const phone = normalizePhone(testPhone)
    if (!phone) {
      return Response.json({ ok: false, error: 'Invalid test phone number' }, { status: 400, headers: corsHeaders })
    }
    const bodyParams = buildBodyParams(varExamples, variableMap, {})
    if (dryRun) {
      return Response.json({
        ok: true, test: true, dry_run: true,
        would_send: { phone: phone.e164, template: templateName, language: templateLang, body_params: bodyParams },
      }, { headers: corsHeaders })
    }
    const waRes = await sendFlowTemplate(phoneId, token, phone.e164, templateName, templateLang, bodyParams)
    const waMessageId = waRes.messages?.[0]?.id
    if (waMessageId) {
      return Response.json({ ok: true, test: true, sent: true, phone: phone.e164, wa_message_id: waMessageId }, { headers: corsHeaders })
    }
    return Response.json({ ok: false, test: true, error: waRes.error ? JSON.stringify(waRes.error) : 'No message ID in response' }, { status: 400, headers: corsHeaders })
  }

  // ── Determine target dates (IST) ─────────────────────────────────────────
  const today  = todayIST()
  const date30 = addDays(today, 30)
  const date15 = addDays(today, 15)

  const neededCols = Array.from(new Set([
    'id', 'first_name', 'last_name', 'contact_phones',
    'vehicle_registration_number', 'model', 'chassis_no', 'extended_warranty_end_date',
    ...Object.values(variableMap),
  ])).join(', ')

  // ── Query all_service_data ───────────────────────────────────────────────
  let query = sb.from('all_service_data')
    .select(neededCols)
    .not('extended_warranty_end_date', 'is', null)
    .not('contact_phones', 'is', null)
    .in('extended_warranty_end_date', [date30, date15])

  if (testServiceDataId) {
    query = query.eq('id', testServiceDataId)
  }

  const { data: serviceRows, error: queryErr } = await query

  if (queryErr) {
    console.error('ESR: all_service_data query failed:', queryErr.message)
    return Response.json({ ok: false, error: queryErr.message }, { status: 500, headers: corsHeaders })
  }

  const rows = (serviceRows || []) as Array<Record<string, unknown>>
  console.log(`ESR: found ${rows.length} candidate rows for dates ${date15}/${date30}`)

  const stats = { processed: 0, sent: 0, skipped_duplicate: 0, skipped_booked: 0, skipped_invalid_phone: 0, failed: 0, dry_run: dryRun }
  const log: Array<Record<string, unknown>> = []

  // ── Phase 1: validate phones and determine reminder types ────────────────
  type Candidate = {
    row: Record<string, unknown>
    serviceDataId: number
    dueDate: string
    reminderType: '30_day' | '15_day'
    customerName: string
    regNo: string
    chassis: string
    phone: { e164: string; local10: string }
  }

  const candidates: Candidate[] = []

  for (const row of rows) {
    stats.processed++
    const serviceDataId = row.id as number
    const dueDate       = row.extended_warranty_end_date as string

    let reminderType: '30_day' | '15_day'
    if (dueDate === date30) reminderType = '30_day'
    else if (dueDate === date15) reminderType = '15_day'
    else continue

    const phone = normalizePhone(row.contact_phones as string)
    if (!phone) {
      stats.skipped_invalid_phone++
      log.push({ service_data_id: serviceDataId, reg_no: row.vehicle_registration_number, action: 'skip', reason: 'invalid_phone' })
      continue
    }

    candidates.push({
      row,
      serviceDataId,
      dueDate,
      reminderType,
      customerName: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Valued Customer',
      regNo: (row.vehicle_registration_number as string) || '',
      chassis: (row.chassis_no as string) || '',
      phone,
    })
  }

  // ── Phase 2: run all skip checks in parallel (batches of 30) ────────────
  type SkipResult = { candidate: Candidate; skip: boolean; reason?: string }

  const skipResults = await runBatched<Candidate, SkipResult>(
    candidates,
    30,
    0,
    async (c) => {
      const dateFrom = addDays(c.dueDate, -7)
      const dateTo   = addDays(c.dueDate,  7)
      const [{ data: existingReminder }, { count: bookingCount }] = await Promise.all([
        sb.from('ew_service_reminders')
          .select('id, status')
          .eq('service_data_id', c.serviceDataId)
          .eq('extended_warranty_end_date', c.dueDate)
          .eq('reminder_type', c.reminderType)
          .not('status', 'eq', 'failed')
          .limit(1),
        sb.from('service_bookings')
          .select('id', { count: 'exact', head: true })
          .eq('customer_phone', c.phone.local10)
          .gte('appointment_date', dateFrom)
          .lte('appointment_date', dateTo)
          .not('status', 'in', '("Cancelled","No Show")'),
      ])

      if (existingReminder?.length) return { candidate: c, skip: true, reason: 'duplicate' }
      if ((bookingCount || 0) > 0) return { candidate: c, skip: true, reason: 'already_booked' }
      return { candidate: c, skip: false }
    },
  )

  const toSend: Candidate[] = []
  for (const r of skipResults) {
    if (r.skip) {
      if (r.reason === 'duplicate') {
        stats.skipped_duplicate++
        log.push({ service_data_id: r.candidate.serviceDataId, reg_no: r.candidate.regNo, action: 'skip', reason: 'duplicate', reminder_type: r.candidate.reminderType })
      } else {
        stats.skipped_booked++
        log.push({ service_data_id: r.candidate.serviceDataId, reg_no: r.candidate.regNo, action: 'skip', reason: 'already_booked', reminder_type: r.candidate.reminderType })
      }
    } else {
      toSend.push(r.candidate)
    }
  }

  console.log(`ESR: ${toSend.length} to send after skip checks`)

  // Dry run — log what would be sent and return early
  if (dryRun) {
    for (const c of toSend) {
      const bodyParams = buildBodyParams(varExamples, variableMap, c.row)
      stats.sent++
      log.push({
        service_data_id: c.serviceDataId,
        reg_no:          c.regNo,
        phone:           c.phone.e164,
        action:          'dry_run_would_send',
        reminder_type:   c.reminderType,
        template:        templateName,
        body_params:     bodyParams,
      })
    }
    console.log('ESR: dry run completed —', JSON.stringify(stats))
    return Response.json({ ok: true, stats, log, today, target_dates: { '30_day': date30, '15_day': date15 } }, { headers: corsHeaders })
  }

  // ── Phase 3: insert all reminder rows in parallel (batches of 20) ────────
  type InsertResult = { candidate: Candidate; reminderId?: number; insertFailed: boolean }

  const insertResults = await runBatched<Candidate, InsertResult>(
    toSend,
    20,
    0,
    async (c) => {
      const { data: rInserted, error: rErr } = await sb
        .from('ew_service_reminders')
        .insert([{
          service_data_id:             c.serviceDataId,
          customer_name:               c.customerName,
          mobile_number:               c.phone.local10,
          vehicle_registration_number: c.regNo,
          chassis_no:                  c.chassis,
          extended_warranty_end_date:  c.dueDate,
          reminder_type:               c.reminderType,
          scheduled_for_date:          today,
          template_name:               templateName,
          status:                      'pending',
        }])
        .select('id')
        .single()

      if (rErr) {
        if (rErr.code === '23505') {
          console.log(`ESR: SKIP race-condition duplicate for service_data_id=${c.serviceDataId}`)
          return { candidate: c, insertFailed: false }
        }
        console.error(`ESR: reminder insert failed for service_data_id=${c.serviceDataId}:`, rErr.message)
        return { candidate: c, insertFailed: true }
      }
      return { candidate: c, reminderId: rInserted?.id as number, insertFailed: false }
    },
  )

  type SendItem = { candidate: Candidate; reminderId: number }
  const readyToSend: SendItem[] = []
  for (const r of insertResults) {
    if (r.insertFailed) {
      stats.failed++
    } else if (!r.reminderId) {
      stats.skipped_duplicate++
    } else {
      readyToSend.push({ candidate: r.candidate, reminderId: r.reminderId })
    }
  }

  // ── Phase 4: send WhatsApp messages in parallel batches ──────────────────
  // Batches of 15 with 300ms gap stays well within Meta's rate limits
  await runBatched<SendItem, void>(
    readyToSend,
    15,
    300,
    async ({ candidate: c, reminderId }) => {
      const bodyParams = buildBodyParams(varExamples, variableMap, c.row)
      console.log(`ESR: SEND ${c.reminderType} → ${c.phone.e164} (${c.regNo}, expires ${c.dueDate})`)

      try {
        const waRes = await sendFlowTemplate(phoneId, token, c.phone.e164, templateName, templateLang, bodyParams)
        const waMessageId = waRes.messages?.[0]?.id

        if (waMessageId) {
          await sb.from('ew_service_reminders').update({
            status:        'sent',
            sent_at:       new Date().toISOString(),
            wa_message_id: waMessageId,
            updated_at:    new Date().toISOString(),
          }).eq('id', reminderId)
          stats.sent++
          log.push({ service_data_id: c.serviceDataId, reg_no: c.regNo, action: 'sent', reminder_type: c.reminderType, wa_message_id: waMessageId })
        } else {
          const errStr = waRes.error ? JSON.stringify(waRes.error) : 'No message ID in response'
          console.error(`ESR: send failed for ${c.phone.e164}:`, errStr)
          await sb.from('ew_service_reminders').update({
            status:         'failed',
            failure_reason: errStr,
            updated_at:     new Date().toISOString(),
          }).eq('id', reminderId)
          stats.failed++
          log.push({ service_data_id: c.serviceDataId, reg_no: c.regNo, action: 'failed', reminder_type: c.reminderType, reason: errStr })
        }
      } catch (e) {
        const errStr = e instanceof Error ? e.message : String(e)
        console.error(`ESR: exception for ${c.phone.e164}:`, errStr)
        await sb.from('ew_service_reminders').update({
          status:         'failed',
          failure_reason: errStr,
          updated_at:     new Date().toISOString(),
        }).eq('id', reminderId)
        stats.failed++
      }
    },
  )

  console.log('ESR: completed —', JSON.stringify(stats))
  return Response.json({ ok: true, stats, log, today, target_dates: { '30_day': date30, '15_day': date15 } }, { headers: corsHeaders })
})
