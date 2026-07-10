/**
 * wa-updation-reminder
 *
 * Import-driven WhatsApp automation for Tata Motors "updation" (recall / software /
 * hardware update) campaigns. Staff upload a chassis-number sheet from the Updation
 * Reminder page; this function resolves each chassis against all_service_data and
 * sends up to two WhatsApp reminders per vehicle — reminder 1 immediately on import,
 * reminder 2 after wa_agent_config.updation_reminder_gap_days (default 3) — each
 * offering a "Book My Visit" Flow (date/time/branch) that writes into service_bookings
 * (booking replies are captured by wa-webhook and linked back via booking_id).
 *
 * Two entry points via request body:
 *
 *   1. action: 'import' — called synchronously from the UI on file upload.
 *      Body: { action: 'import', rows: Array<{ chassis_no, updation_code?, updation_name?, model? }>,
 *              file_name?, sheet_name?, dry_run? }
 *      Matches each chassis exactly against all_service_data.chassis_no, buckets into
 *      matched-with-phone / matched-no-phone / unmatched, records an
 *      updation_import_batches row, and (unless dry_run) inserts + sends reminder 1
 *      immediately while scheduling reminder 2.
 *
 *   2. Default / cron sweep (dry_run or none) — invoked daily by pg_cron via
 *      invoke_updation_reminder_daily(). Sends reminder 2 for rows whose
 *      scheduled_for_date has arrived, skipping anyone already booked or opted out.
 *
 * Safety guarantees:
 *  - DB UNIQUE(chassis_no, reminder_number, batch_id) prevents duplicate rows within
 *    the same import batch.
 *  - Skip-duplicate: an active (pending/sent/delivered/read) reminder for the same
 *    chassis created within the last 30 days blocks a fresh reminder 1/2 pair.
 *  - Skip-booked: reminder 2 is skipped if booking_id is already set (Flow tap on
 *    reminder 1) or the customer has a non-cancelled service_booking created since
 *    reminder 1 was sent.
 *  - Respects UPDATION_REMINDER_ENABLED env var and wa_agent_config.updation_reminder_enabled
 *    (gates the reminder-2 sweep only — reminder 1 always sends on import).
 *  - dry_run=true → full logic, no actual Meta API calls or DB writes for the import path.
 *
 * Invoke manually (reminder-2 sweep):
 *   curl -X POST https://<project>.supabase.co/functions/v1/wa-updation-reminder \
 *     -H "Content-Type: application/json" \
 *     -d '{"dry_run": true}'
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

const DUP_COOLDOWN_DAYS = 30

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

function normalizeChassis(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase()
}

// ─── Send Meta template ("Book My Visit" is a Flow button baked into the
//     approved template at creation time — see docs/web/cross-cutting/wa_templates
//     /reference/updation_reminder_wa.md) ─────────────────────────────────────

async function sendFlowTemplate(
  phoneId: string,
  token: string,
  to: string,
  templateName: string,
  language: string,
  params: Array<{ type: 'text'; text: string }>,
  hasFlowButton: boolean,
): Promise<{ messages?: Array<{ id: string }>; error?: Record<string, unknown> }> {
  const components: Record<string, unknown>[] = [{ type: 'body', parameters: params }]
  // Only attach the button component if the approved template actually has a
  // Flow button — Meta rejects the whole send if the components array doesn't
  // match what the template was approved with (e.g. a plain body-only template).
  if (hasFlowButton) {
    components.push({ type: 'button', sub_type: 'flow', index: '0', parameters: [{ type: 'payload', payload: 'UPDATION_BOOK_NOW' }] })
  }
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
        components,
      },
    }),
  })
  return res.json()
}

// ─── Build body params (merges the matched all_service_data row with the
//     import row's campaign fields — "reason" comes from updation_name, which
//     only exists in the import file, not in all_service_data) ────────────────

function buildBodyParams(
  varExamples: Array<{ name?: string; example_value?: string }>,
  variableMap: Record<string, string>,
  sourceRow: Record<string, unknown>,
): Array<{ type: 'text'; text: string }> {
  return varExamples.map((ex) => {
    const varName = (ex.name || '').trim()
    const colName = variableMap[varName]
    let val = ''
    if (colName && sourceRow[colName] !== undefined && sourceRow[colName] !== null) {
      val = String(sourceRow[colName])
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

// ─── Shared config/template loader ───────────────────────────────────────────

type LoadedConfig = {
  cfg: Record<string, unknown>
  phoneId: string
  token: string
  templateName: string
  templateLang: string
  varExamples: Array<{ name?: string; example_value?: string }>
  variableMap: Record<string, string>
  gapDays: number
  hasFlowButton: boolean
}

async function loadConfigAndTemplate(): Promise<{ ok: true; value: LoadedConfig } | { ok: false; error: string; status: number }> {
  const { data: cfgArr } = await sb.from('wa_agent_config').select('*').eq('id', 1).limit(1)
  const cfg = cfgArr?.[0] as Record<string, unknown> | undefined
  if (!cfg) return { ok: false, error: 'Config not found', status: 500 }

  const phoneId = cfg.meta_phone_number_id as string
  const token   = cfg.meta_access_token as string
  if (!phoneId || !token) return { ok: false, error: 'Meta credentials missing', status: 400 }

  const templateId = cfg.updation_reminder_template_id as number | undefined
  if (!templateId) return { ok: false, error: 'updation_reminder_template_id not configured', status: 400 }

  const { data: tplArr } = await sb.from('wa_templates').select('*').eq('id', templateId).limit(1)
  const tpl = tplArr?.[0] as Record<string, unknown> | undefined
  if (!tpl) return { ok: false, error: `Template id=${templateId} not found`, status: 400 }
  if (tpl.status !== 'approved') return { ok: false, error: `Template "${tpl.name}" is not approved (status: ${tpl.status})`, status: 400 }

  const variableMap = (cfg.updation_reminder_variable_map as Record<string, string>) || {
    name:    'first_name',
    model:   'model',
    reg_no:  'vehicle_registration_number',
    reason:  'updation_name',
  }

  const buttons = tpl.buttons as Array<{ type?: string }> | null
  const hasFlowButton = Array.isArray(buttons) && buttons.some(b => b.type === 'FLOW')

  return {
    ok: true,
    value: {
      cfg,
      phoneId,
      token,
      templateName: tpl.name as string,
      templateLang: (cfg.updation_reminder_template_lang as string) || (tpl.language as string) || 'en',
      varExamples: (tpl.variable_examples as Array<{ name?: string; example_value?: string }>) || [],
      variableMap,
      gapDays: (cfg.updation_reminder_gap_days as number) ?? 3,
      hasFlowButton,
    },
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  const dryRun    = body.dry_run === true
  const testPhone = typeof body.test_phone === 'string' ? body.test_phone : undefined
  const action    = typeof body.action === 'string' ? body.action : undefined

  const loaded = await loadConfigAndTemplate()
  if (!loaded.ok) {
    console.error('UR: config/template load failed:', loaded.error)
    return Response.json({ ok: false, error: loaded.error }, { status: loaded.status, headers: corsHeaders })
  }
  const { cfg, phoneId, token, templateName, templateLang, varExamples, variableMap, gapDays, hasFlowButton } = loaded.value

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
    const waRes = await sendFlowTemplate(phoneId, token, phone.e164, templateName, templateLang, bodyParams, hasFlowButton)
    const waMessageId = waRes.messages?.[0]?.id
    if (waMessageId) {
      return Response.json({ ok: true, test: true, sent: true, phone: phone.e164, wa_message_id: waMessageId }, { headers: corsHeaders })
    }
    return Response.json({ ok: false, test: true, error: waRes.error ? JSON.stringify(waRes.error) : 'No message ID in response' }, { status: 400, headers: corsHeaders })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTION: import — resolve a chassis list against all_service_data and send
  //         reminder 1 immediately, scheduling reminder 2 for gapDays later.
  // ═══════════════════════════════════════════════════════════════════════════
  if (action === 'import') {
    const rawRows = Array.isArray(body.rows) ? body.rows as Array<Record<string, unknown>> : []
    const fileName  = typeof body.file_name === 'string' ? body.file_name : null
    const sheetName = typeof body.sheet_name === 'string' ? body.sheet_name : null

    if (rawRows.length === 0) {
      return Response.json({ ok: false, error: 'rows[] is required and must be non-empty' }, { status: 400, headers: corsHeaders })
    }

    // Normalize + dedupe input by chassis number, keeping the first occurrence's campaign fields.
    const byChassis = new Map<string, { chassis_no: string; updation_code: string | null; updation_name: string | null; model: string | null }>()
    for (const r of rawRows) {
      const chassis = normalizeChassis(r.chassis_no)
      if (!chassis || byChassis.has(chassis)) continue
      byChassis.set(chassis, {
        chassis_no: chassis,
        updation_code: r.updation_code ? String(r.updation_code).trim() : null,
        updation_name: r.updation_name ? String(r.updation_name).trim() : null,
        model: r.model ? String(r.model).trim() : null,
      })
    }
    const inputRows = Array.from(byChassis.values())
    const chassisList = inputRows.map(r => r.chassis_no)

    // ── Exact-match lookup against all_service_data (validated: case/whitespace
    //    already normalized on both sides gives no additional matches, so exact
    //    match on the uppercase-trimmed chassis is sufficient). ────────────────
    const { data: matchedRows, error: matchErr } = await sb.from('all_service_data')
      .select('id, first_name, last_name, contact_phones, vehicle_registration_number, model, chassis_no')
      .in('chassis_no', chassisList)

    if (matchErr) {
      console.error('UR: all_service_data lookup failed:', matchErr.message)
      return Response.json({ ok: false, error: matchErr.message }, { status: 500, headers: corsHeaders })
    }

    const matchByChassis = new Map<string, Record<string, unknown>>()
    for (const row of (matchedRows || []) as Array<Record<string, unknown>>) {
      matchByChassis.set(normalizeChassis(row.chassis_no), row)
    }

    type Candidate = {
      input: { chassis_no: string; updation_code: string | null; updation_name: string | null; model: string | null }
      serviceRow: Record<string, unknown>
      serviceDataId: number
      customerName: string
      regNo: string
      model: string
      phone: { e164: string; local10: string }
    }

    const candidates: Candidate[] = []
    const matchedNoPhone: string[] = []
    const unmatched: string[] = []

    for (const input of inputRows) {
      const serviceRow = matchByChassis.get(input.chassis_no)
      if (!serviceRow) {
        unmatched.push(input.chassis_no)
        continue
      }
      const phone = normalizePhone(serviceRow.contact_phones as string)
      if (!phone) {
        matchedNoPhone.push(input.chassis_no)
        continue
      }
      candidates.push({
        input,
        serviceRow,
        serviceDataId: serviceRow.id as number,
        customerName: [serviceRow.first_name, serviceRow.last_name].filter(Boolean).join(' ') || 'Valued Customer',
        regNo: (serviceRow.vehicle_registration_number as string) || '',
        model: input.model || (serviceRow.model as string) || '',
        phone,
      })
    }

    // ── Record the batch (even in dry_run, so staff can see the summary) ──────
    const { data: batchArr, error: batchErr } = await sb.from('updation_import_batches').insert([{
      file_name: fileName,
      sheet_name: sheetName,
      total_rows: inputRows.length,
      matched_with_phone_count: candidates.length,
      matched_no_phone_count: matchedNoPhone.length,
      unmatched_count: unmatched.length,
      unmatched_chassis: unmatched,
      matched_no_phone_chassis: matchedNoPhone,
    }]).select('id').single()

    if (batchErr) {
      console.error('UR: batch insert failed:', batchErr.message)
      return Response.json({ ok: false, error: batchErr.message }, { status: 500, headers: corsHeaders })
    }
    const batchId = batchArr!.id as number

    const stats = {
      total: inputRows.length,
      matched_with_phone: candidates.length,
      matched_no_phone: matchedNoPhone.length,
      unmatched: unmatched.length,
      sent: 0, failed: 0, skipped_duplicate: 0,
      dry_run: dryRun,
    }
    const log: Array<Record<string, unknown>> = []

    // ── Skip-duplicate check: an active reminder for this chassis within the
    //    cooldown window means we don't spin up another pair. ─────────────────
    const cooldownFrom = addDays(todayIST(), -DUP_COOLDOWN_DAYS)
    const skipResults = await runBatched<Candidate, { candidate: Candidate; skip: boolean }>(
      candidates,
      30,
      0,
      async (c) => {
        const { data: existing } = await sb.from('updation_reminders')
          .select('id')
          .eq('chassis_no', c.input.chassis_no)
          .in('status', ['pending', 'sent', 'delivered', 'read'])
          .gte('created_at', cooldownFrom)
          .limit(1)
        return { candidate: c, skip: !!existing?.length }
      },
    )

    const toProcess: Candidate[] = []
    for (const r of skipResults) {
      if (r.skip) {
        stats.skipped_duplicate++
        log.push({ chassis_no: r.candidate.input.chassis_no, action: 'skip', reason: 'duplicate_within_cooldown' })
      } else {
        toProcess.push(r.candidate)
      }
    }

    if (dryRun) {
      for (const c of toProcess) {
        const mergedRow = { ...c.serviceRow, updation_name: c.input.updation_name, updation_code: c.input.updation_code, model: c.model }
        const bodyParams = buildBodyParams(varExamples, variableMap, mergedRow)
        log.push({
          chassis_no: c.input.chassis_no, reg_no: c.regNo, phone: c.phone.e164,
          action: 'dry_run_would_send_reminder_1', template: templateName, body_params: bodyParams,
        })
      }
      return Response.json({
        ok: true, stats, log, batch_id: batchId,
        unmatched_chassis: unmatched, matched_no_phone_chassis: matchedNoPhone,
      }, { headers: corsHeaders })
    }

    const today = todayIST()
    const day2  = addDays(today, gapDays)

    // ── Insert reminder 1 + 2 rows, then send reminder 1 immediately ──────────
    await runBatched<Candidate, void>(
      toProcess,
      15,
      300,
      async (c) => {
        const baseRow = {
          batch_id: batchId,
          service_data_id: c.serviceDataId,
          chassis_no: c.input.chassis_no,
          updation_code: c.input.updation_code,
          updation_name: c.input.updation_name,
          customer_name: c.customerName,
          mobile_number: c.phone.local10,
          vehicle_registration_number: c.regNo,
          model: c.model,
          template_name: templateName,
        }

        const { data: inserted, error: insErr } = await sb.from('updation_reminders').insert([
          { ...baseRow, reminder_number: 1, scheduled_for_date: today, status: 'pending' },
          { ...baseRow, reminder_number: 2, scheduled_for_date: day2, status: 'pending' },
        ]).select('id, reminder_number')

        if (insErr) {
          console.error(`UR: reminder insert failed for ${c.input.chassis_no}:`, insErr.message)
          stats.failed++
          log.push({ chassis_no: c.input.chassis_no, action: 'failed', reason: insErr.message })
          return
        }

        const reminder1Id = (inserted || []).find(r => r.reminder_number === 1)?.id as number | undefined
        if (!reminder1Id) return

        const mergedRow = { ...c.serviceRow, updation_name: c.input.updation_name, updation_code: c.input.updation_code, model: c.model }
        const bodyParams = buildBodyParams(varExamples, variableMap, mergedRow)

        try {
          const waRes = await sendFlowTemplate(phoneId, token, c.phone.e164, templateName, templateLang, bodyParams, hasFlowButton)
          const waMessageId = waRes.messages?.[0]?.id

          if (waMessageId) {
            await sb.from('updation_reminders').update({
              status: 'sent', sent_at: new Date().toISOString(), wa_message_id: waMessageId, updated_at: new Date().toISOString(),
            }).eq('id', reminder1Id)
            stats.sent++
            log.push({ chassis_no: c.input.chassis_no, reg_no: c.regNo, action: 'sent', wa_message_id: waMessageId })
          } else {
            const errStr = waRes.error ? JSON.stringify(waRes.error) : 'No message ID in response'
            console.error(`UR: send failed for ${c.phone.e164}:`, errStr)
            await sb.from('updation_reminders').update({
              status: 'failed', failure_reason: errStr, updated_at: new Date().toISOString(),
            }).eq('id', reminder1Id)
            stats.failed++
            log.push({ chassis_no: c.input.chassis_no, reg_no: c.regNo, action: 'failed', reason: errStr })
          }
        } catch (e) {
          const errStr = e instanceof Error ? e.message : String(e)
          console.error(`UR: exception for ${c.phone.e164}:`, errStr)
          await sb.from('updation_reminders').update({
            status: 'failed', failure_reason: errStr, updated_at: new Date().toISOString(),
          }).eq('id', reminder1Id)
          stats.failed++
        }
      },
    )

    console.log('UR: import completed —', JSON.stringify(stats))
    return Response.json({
      ok: true, stats, log, batch_id: batchId,
      unmatched_chassis: unmatched, matched_no_phone_chassis: matchedNoPhone,
    }, { headers: corsHeaders })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEFAULT / CRON: daily sweep — send reminder 2 for rows whose scheduled date
  //                 has arrived, skipping anyone already booked or opted out.
  // ═══════════════════════════════════════════════════════════════════════════
  const envEnabled = Deno.env.get('UPDATION_REMINDER_ENABLED')
  const enabled = envEnabled !== undefined
    ? envEnabled === 'true'
    : (cfg.updation_reminder_enabled as boolean) ?? false

  if (!enabled && !dryRun) {
    console.log('UR: follow-up sweep disabled via config. Use dry_run=true to test anyway.')
    return Response.json({ ok: true, skipped: true, reason: 'disabled' }, { headers: corsHeaders })
  }

  const today = todayIST()

  const { data: dueRows, error: dueErr } = await sb.from('updation_reminders')
    .select('id, chassis_no, mobile_number, customer_name, vehicle_registration_number, model, updation_code, updation_name, service_data_id, booking_id, created_at')
    .eq('reminder_number', 2)
    .eq('status', 'pending')
    .lte('scheduled_for_date', today)

  if (dueErr) {
    console.error('UR: reminder-2 sweep query failed:', dueErr.message)
    return Response.json({ ok: false, error: dueErr.message }, { status: 500, headers: corsHeaders })
  }

  const rows = (dueRows || []) as Array<Record<string, unknown>>
  console.log(`UR: ${rows.length} reminder-2 candidates due on/before ${today}`)

  const stats = { processed: rows.length, sent: 0, skipped_booked: 0, skipped_opted_out: 0, skipped_invalid_phone: 0, failed: 0, dry_run: dryRun }
  const log: Array<Record<string, unknown>> = []

  const skipResults = await runBatched<Record<string, unknown>, { row: Record<string, unknown>; skip: boolean; reason?: string }>(
    rows,
    30,
    0,
    async (row) => {
      if (row.booking_id) return { row, skip: true, reason: 'already_booked' }

      const phone = normalizePhone(row.mobile_number as string)
      if (!phone) return { row, skip: true, reason: 'invalid_phone' }

      const [{ count: bookingCount }, { data: convArr }] = await Promise.all([
        sb.from('service_bookings')
          .select('id', { count: 'exact', head: true })
          .eq('customer_phone', phone.local10)
          .gte('created_at', row.created_at as string)
          .not('status', 'in', '("Cancelled","No Show")'),
        sb.from('wa_conversations')
          .select('status')
          .or(`phone.eq.${phone.local10},phone.eq.${phone.e164}`)
          .order('created_at', { ascending: false })
          .limit(1),
      ])

      if ((bookingCount || 0) > 0) return { row, skip: true, reason: 'already_booked' }
      if (convArr?.[0]?.status === 'Opted-Out') return { row, skip: true, reason: 'opted_out' }
      return { row, skip: false }
    },
  )

  const toSend: Array<{ row: Record<string, unknown>; phone: { e164: string; local10: string } }> = []
  for (const r of skipResults) {
    if (r.skip) {
      if (r.reason === 'already_booked') stats.skipped_booked++
      else if (r.reason === 'opted_out') stats.skipped_opted_out++
      else stats.skipped_invalid_phone++
      if (!dryRun) {
        await sb.from('updation_reminders').update({ status: 'skipped', failure_reason: r.reason, updated_at: new Date().toISOString() }).eq('id', r.row.id)
      }
      log.push({ id: r.row.id, chassis_no: r.row.chassis_no, action: 'skip', reason: r.reason })
    } else {
      const phone = normalizePhone(r.row.mobile_number as string)!
      toSend.push({ row: r.row, phone })
    }
  }

  if (dryRun) {
    for (const { row, phone } of toSend) {
      const bodyParams = buildBodyParams(varExamples, variableMap, {
        first_name: row.customer_name, model: row.model,
        vehicle_registration_number: row.vehicle_registration_number, updation_name: row.updation_name,
      })
      stats.sent++
      log.push({ id: row.id, chassis_no: row.chassis_no, phone: phone.e164, action: 'dry_run_would_send_reminder_2', body_params: bodyParams })
    }
    console.log('UR: sweep dry run completed —', JSON.stringify(stats))
    return Response.json({ ok: true, stats, log, today }, { headers: corsHeaders })
  }

  await runBatched(toSend, 15, 300, async ({ row, phone }) => {
    const bodyParams = buildBodyParams(varExamples, variableMap, {
      first_name: row.customer_name, model: row.model,
      vehicle_registration_number: row.vehicle_registration_number, updation_name: row.updation_name,
    })
    try {
      const waRes = await sendFlowTemplate(phoneId, token, phone.e164, templateName, templateLang, bodyParams, hasFlowButton)
      const waMessageId = waRes.messages?.[0]?.id
      if (waMessageId) {
        await sb.from('updation_reminders').update({
          status: 'sent', sent_at: new Date().toISOString(), wa_message_id: waMessageId, updated_at: new Date().toISOString(),
        }).eq('id', row.id)
        stats.sent++
        log.push({ id: row.id, chassis_no: row.chassis_no, action: 'sent', wa_message_id: waMessageId })
      } else {
        const errStr = waRes.error ? JSON.stringify(waRes.error) : 'No message ID in response'
        await sb.from('updation_reminders').update({ status: 'failed', failure_reason: errStr, updated_at: new Date().toISOString() }).eq('id', row.id)
        stats.failed++
        log.push({ id: row.id, chassis_no: row.chassis_no, action: 'failed', reason: errStr })
      }
    } catch (e) {
      const errStr = e instanceof Error ? e.message : String(e)
      await sb.from('updation_reminders').update({ status: 'failed', failure_reason: errStr, updated_at: new Date().toISOString() }).eq('id', row.id)
      stats.failed++
    }
  })

  console.log('UR: sweep completed —', JSON.stringify(stats))
  return Response.json({ ok: true, stats, log, today }, { headers: corsHeaders })
})
