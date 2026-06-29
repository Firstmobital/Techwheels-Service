/**
 * wa-auto-service-reminder
 *
 * Daily job that sends WhatsApp service reminder templates to customers whose
 * assumed_next_service_date falls 20, 9, or 3 days from today (IST).
 *
 * Safety guarantees:
 *  - DB UNIQUE(service_data_id, assumed_next_service_date, reminder_type) prevents
 *    duplicate rows even if job runs twice.
 *  - Code-level skip if a row already exists (status != failed).
 *  - Skip if customer already has a service_booking for that due date.
 *  - Respects AUTO_SERVICE_REMINDER_ENABLED env var and wa_agent_config.auto_reminder_enabled.
 *  - dry_run=true in request body → full logic, no actual Meta API calls.
 *
 * Invoke manually:
 *   curl -X POST https://<project>.supabase.co/functions/v1/wa-auto-service-reminder \
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

/** Returns today's date string in IST as YYYY-MM-DD */
function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** Returns YYYY-MM-DD for today + N days (in IST) */
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

// ─── Send Meta template with body params ─────────────────────────────────────

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
          { type: 'button', sub_type: 'flow', index: '0', parameters: [{ type: 'payload', payload: 'BOOK_NOW' }] },
        ],
      },
    }),
  })
  return res.json()
}

// ─── Build body params from variable map ─────────────────────────────────────

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
      // Format date fields as DD/MMM for readability
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

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  const dryRun = body.dry_run === true
  const testServiceDataId = body.test_service_data_id as number | undefined

  // ── Load config ──────────────────────────────────────────────────────────
  const { data: cfgArr } = await sb.from('wa_agent_config').select('*').eq('id', 1).limit(1)
  const cfg = cfgArr?.[0] as Record<string, unknown> | undefined

  if (!cfg) {
    console.error('ASR: wa_agent_config row not found')
    return Response.json({ ok: false, error: 'Config not found' }, { status: 500, headers: corsHeaders })
  }

  const envEnabled = Deno.env.get('AUTO_SERVICE_REMINDER_ENABLED')
  const enabled = envEnabled !== undefined
    ? envEnabled === 'true'
    : (cfg.auto_reminder_enabled as boolean) ?? false

  if (!enabled && !dryRun) {
    console.log('ASR: disabled via config. Use dry_run=true to test anyway.')
    return Response.json({ ok: true, skipped: true, reason: 'disabled' })
  }

  const phoneId  = cfg.meta_phone_number_id as string
  const token    = cfg.meta_access_token as string

  if (!phoneId || !token) {
    console.error('ASR: Meta credentials not configured in wa_agent_config')
    return Response.json({ ok: false, error: 'Meta credentials missing' }, { status: 400, headers: corsHeaders })
  }

  // ── Load approved template ──────────────────────────────────────────────
  const templateId = cfg.auto_reminder_template_id as number | undefined
  if (!templateId) {
    console.error('ASR: auto_reminder_template_id not set in wa_agent_config')
    return Response.json({ ok: false, error: 'auto_reminder_template_id not configured' }, { status: 400, headers: corsHeaders })
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
  const templateLang = (cfg.auto_reminder_template_lang as string) || (tpl.language as string) || 'en'
  const varExamples  = (tpl.variable_examples as Array<{ name?: string; example_value?: string }>) || []
  const variableMap  = (cfg.auto_reminder_variable_map as Record<string, string>) || {
    name:        'first_name',
    model:       'model',
    reg_no:      'vehicle_registration_number',
    service_due: 'assumed_next_service_date',
  }

  // ── Determine target dates (IST) ─────────────────────────────────────────
  const today         = todayIST()
  const date20        = addDays(today, 20)
  const date9         = addDays(today, 9)
  const date3         = addDays(today, 3)

  // All columns needed (from variableMap values + required fields)
  const neededCols = Array.from(new Set([
    'id', 'first_name', 'last_name', 'contact_phones',
    'vehicle_registration_number', 'model', 'chassis_no', 'assumed_next_service_date',
    ...Object.values(variableMap),
  ])).join(', ')

  // ── Query all_service_data ───────────────────────────────────────────────
  let query = sb.from('all_service_data')
    .select(neededCols)
    .not('assumed_next_service_date', 'is', null)
    .not('contact_phones', 'is', null)
    .in('assumed_next_service_date', [date20, date9, date3])

  if (testServiceDataId) {
    query = query.eq('id', testServiceDataId)
  }

  const { data: serviceRows, error: queryErr } = await query

  if (queryErr) {
    console.error('ASR: all_service_data query failed:', queryErr.message)
    return Response.json({ ok: false, error: queryErr.message }, { status: 500, headers: corsHeaders })
  }

  const rows = (serviceRows || []) as Array<Record<string, unknown>>
  console.log(`ASR: found ${rows.length} candidate rows for dates ${date3}/${date9}/${date20}`)

  const stats = { processed: 0, sent: 0, skipped_duplicate: 0, skipped_booked: 0, skipped_invalid_phone: 0, failed: 0, dry_run: dryRun }
  const log: Array<Record<string, unknown>> = []

  for (const row of rows) {
    stats.processed++
    const serviceDataId = row.id as number
    const dueDate       = row.assumed_next_service_date as string

    // Determine reminder type
    let reminderType: '20_day' | '9_day' | '3_day'
    if (dueDate === date20) reminderType = '20_day'
    else if (dueDate === date9) reminderType = '9_day'
    else if (dueDate === date3) reminderType = '3_day'
    else continue

    const customerName = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Valued Customer'
    const regNo        = (row.vehicle_registration_number as string) || ''
    const chassis      = (row.chassis_no as string) || ''
    const rawPhone     = row.contact_phones as string

    // ── Validate phone ────────────────────────────────────────────────────
    const phone = normalizePhone(rawPhone)
    if (!phone) {
      console.log(`ASR: SKIP invalid phone for service_data_id=${serviceDataId}`)
      stats.skipped_invalid_phone++
      log.push({ service_data_id: serviceDataId, reg_no: regNo, action: 'skip', reason: 'invalid_phone' })
      continue
    }

    // ── Skip if duplicate reminder already sent (non-failed) ─────────────
    const { data: existingReminder } = await sb
      .from('auto_service_reminders')
      .select('id, status')
      .eq('service_data_id', serviceDataId)
      .eq('assumed_next_service_date', dueDate)
      .eq('reminder_type', reminderType)
      .not('status', 'eq', 'failed')
      .limit(1)

    if (existingReminder?.length) {
      console.log(`ASR: SKIP duplicate reminder (${reminderType}) for service_data_id=${serviceDataId}`)
      stats.skipped_duplicate++
      log.push({ service_data_id: serviceDataId, reg_no: regNo, action: 'skip', reason: 'duplicate', reminder_type: reminderType })
      continue
    }

    // ── Skip if customer already has a booking near this due date ─────────
    // Check for any confirmed/arrived/completed booking within ±7 days of due date
    const dateFrom = addDays(dueDate, -7)
    const dateTo   = addDays(dueDate,  7)
    const { count: bookingCount } = await sb
      .from('service_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('customer_phone', phone.local10)
      .gte('appointment_date', dateFrom)
      .lte('appointment_date', dateTo)
      .not('status', 'in', '("Cancelled","No Show")')

    if ((bookingCount || 0) > 0) {
      console.log(`ASR: SKIP already booked — service_data_id=${serviceDataId} phone=${phone.local10}`)
      stats.skipped_booked++
      log.push({ service_data_id: serviceDataId, reg_no: regNo, action: 'skip', reason: 'already_booked', reminder_type: reminderType })
      continue
    }

    // ── Skip earlier reminder types if a later reminder already exists ────
    // i.e. if 20_day was already sent and we're now at 9_day, that's fine.
    // But if booking exists, we already skipped above.

    // ── Build body params ─────────────────────────────────────────────────
    const bodyParams = buildBodyParams(varExamples, variableMap, row)

    console.log(`ASR: [${dryRun ? 'DRY_RUN' : 'SEND'}] ${reminderType} → ${phone.e164} (${regNo}, due ${dueDate})`)

    // ── Insert reminder log (before send, so we capture intent) ──────────
    const reminderInsert = {
      service_data_id:             serviceDataId,
      customer_name:               customerName,
      mobile_number:               phone.local10,
      vehicle_registration_number: regNo,
      chassis_no:                  chassis,
      assumed_next_service_date:   dueDate,
      reminder_type:               reminderType,
      scheduled_for_date:          today,
      template_name:               templateName,
      status:                      'pending' as const,
    }

    let reminderId: number | undefined

    if (!dryRun) {
      const { data: rInserted, error: rErr } = await sb
        .from('auto_service_reminders')
        .insert([reminderInsert])
        .select('id')
        .single()

      if (rErr) {
        if (rErr.code === '23505') {
          // Race condition: another run inserted it between our check and insert
          console.log(`ASR: SKIP race-condition duplicate for service_data_id=${serviceDataId}`)
          stats.skipped_duplicate++
          continue
        }
        console.error(`ASR: reminder insert failed for service_data_id=${serviceDataId}:`, rErr.message)
        stats.failed++
        continue
      }
      reminderId = rInserted?.id as number
    }

    // ── Send WhatsApp template ────────────────────────────────────────────
    let waMessageId: string | undefined
    if (!dryRun) {
      try {
        const waRes = await sendFlowTemplate(phoneId, token, phone.e164, templateName, templateLang, bodyParams)
        waMessageId = waRes.messages?.[0]?.id

        if (waMessageId) {
          await sb.from('auto_service_reminders').update({
            status:   'sent',
            sent_at:  new Date().toISOString(),
            wa_message_id: waMessageId,
            updated_at:    new Date().toISOString(),
          }).eq('id', reminderId)
          stats.sent++
          log.push({ service_data_id: serviceDataId, reg_no: regNo, action: 'sent', reminder_type: reminderType, wa_message_id: waMessageId })
        } else {
          const errStr = waRes.error ? JSON.stringify(waRes.error) : 'No message ID in response'
          console.error(`ASR: send failed for ${phone.e164}:`, errStr)
          await sb.from('auto_service_reminders').update({
            status:         'failed',
            failure_reason: errStr,
            updated_at:     new Date().toISOString(),
          }).eq('id', reminderId)
          stats.failed++
          log.push({ service_data_id: serviceDataId, reg_no: regNo, action: 'failed', reminder_type: reminderType, reason: errStr })
        }
      } catch (e) {
        const errStr = e instanceof Error ? e.message : String(e)
        console.error(`ASR: exception for ${phone.e164}:`, errStr)
        await sb.from('auto_service_reminders').update({
          status:         'failed',
          failure_reason: errStr,
          updated_at:     new Date().toISOString(),
        }).eq('id', reminderId)
        stats.failed++
      }
    } else {
      // Dry run — just log what would be sent
      stats.sent++ // count as "would send"
      log.push({
        service_data_id: serviceDataId,
        reg_no:          regNo,
        phone:           phone.e164,
        action:          'dry_run_would_send',
        reminder_type:   reminderType,
        template:        templateName,
        body_params:     bodyParams,
      })
    }

    // Rate limiting: small delay between sends
    if (!dryRun && rows.length > 1) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  console.log('ASR: completed —', JSON.stringify(stats))
  return Response.json({ ok: true, stats, log, today, target_dates: { '20_day': date20, '9_day': date9, '3_day': date3 } }, { headers: corsHeaders })
})
