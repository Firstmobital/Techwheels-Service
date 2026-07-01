/**
 * wa-post-service-feedback
 *
 * Daily job that sends a WhatsApp post-service feedback request (Flow-based
 * star rating + remarks) to customers whose job card closed
 * `post_service_feedback_delay_days` (default 1) days ago.
 *
 * Safety guarantees:
 *  - DB UNIQUE(job_card_closed_data_id) prevents duplicate sends even if the
 *    job runs twice.
 *  - Code-level skip if a row already exists for that job card.
 *  - Respects wa_agent_config.post_service_feedback_enabled.
 *  - dry_run=true in request body → full logic, no actual Meta API calls.
 *
 * Invoke manually:
 *   curl -X POST https://<project>.supabase.co/functions/v1/wa-post-service-feedback \
 *     -H "Content-Type: application/json" \
 *     -d '{"dry_run": true}'
 *
 * Test single job card:
 *   -d '{"dry_run": true, "test_job_card_id": 12345}'
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

// ─── Send Meta flow template ──────────────────────────────────────────────────

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
          { type: 'button', sub_type: 'flow', index: '0', parameters: [{ type: 'payload', payload: 'SUBMIT_FEEDBACK' }] },
        ],
      },
    }),
  })
  return res.json()
}

// ─── Build body params ────────────────────────────────────────────────────────

function buildBodyParams(
  varExamples: Array<{ name?: string; example_value?: string; example?: string }>,
  variableMap: Record<string, string>,
  jobCardRow: Record<string, unknown>,
): Array<{ type: 'text'; text: string }> {
  return varExamples.map((ex) => {
    const varName = (ex.name || '').trim()
    const colName = variableMap[varName]
    let val = ''
    if (colName && jobCardRow[colName] !== undefined && jobCardRow[colName] !== null) {
      val = String(jobCardRow[colName])
      if (colName.includes('date') || colName.includes('Date')) {
        const d = new Date(val)
        if (!isNaN(d.getTime())) {
          val = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
        }
      }
    }
    if (!val) val = ex.example_value || ex.example || ''
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
  const testJobCardId = body.test_job_card_id as number | undefined

  // ── Load config ──────────────────────────────────────────────────────────
  const { data: cfgArr } = await sb.from('wa_agent_config').select('*').eq('id', 1).limit(1)
  const cfg = cfgArr?.[0] as Record<string, unknown> | undefined

  if (!cfg) {
    console.error('PSF: wa_agent_config row not found')
    return Response.json({ ok: false, error: 'Config not found' }, { status: 500, headers: corsHeaders })
  }

  const enabled = (cfg.post_service_feedback_enabled as boolean) ?? false

  if (!enabled && !dryRun) {
    console.log('PSF: disabled via config. Use dry_run=true to test anyway.')
    return Response.json({ ok: true, skipped: true, reason: 'disabled' }, { headers: corsHeaders })
  }

  const phoneId = cfg.meta_phone_number_id as string
  const token   = cfg.meta_access_token as string

  if (!phoneId || !token) {
    console.error('PSF: Meta credentials not configured in wa_agent_config')
    return Response.json({ ok: false, error: 'Meta credentials missing' }, { status: 400, headers: corsHeaders })
  }

  // ── Load approved template ──────────────────────────────────────────────
  const templateId = cfg.post_service_feedback_template_id as number | undefined
  if (!templateId) {
    console.error('PSF: post_service_feedback_template_id not set in wa_agent_config')
    return Response.json({ ok: false, error: 'post_service_feedback_template_id not configured' }, { status: 400, headers: corsHeaders })
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
  const templateLang = (cfg.post_service_feedback_template_lang as string) || (tpl.language as string) || 'en'
  const varExamples  = (tpl.variable_examples as Array<{ name?: string; example_value?: string; example?: string }>) || []
  const variableMap  = (cfg.post_service_feedback_variable_map as Record<string, string>) || {
    customer_name: 'first_name',
    service_date:  'closed_date_time',
  }
  const delayDays = (cfg.post_service_feedback_delay_days as number) ?? 1

  // ── Determine target date (IST) ──────────────────────────────────────────
  const today       = todayIST()
  const targetDate  = addDays(today, -delayDays)

  const neededCols = Array.from(new Set([
    'id', 'first_name', 'last_name', 'account_phone_number',
    'vehicle_registration_number', 'job_card_number', 'closed_date_time',
    ...Object.values(variableMap),
  ])).join(', ')

  // ── Query job_card_closed_data ───────────────────────────────────────────
  let query = sb.from('job_card_closed_data')
    .select(neededCols)
    .not('closed_date_time', 'is', null)
    .not('account_phone_number', 'is', null)
    .gte('closed_date_time', `${targetDate}T00:00:00+05:30`)
    .lt('closed_date_time', `${addDays(targetDate, 1)}T00:00:00+05:30`)

  if (testJobCardId) {
    query = query.eq('id', testJobCardId)
  }

  const { data: jobCardRows, error: queryErr } = await query

  if (queryErr) {
    console.error('PSF: job_card_closed_data query failed:', queryErr.message)
    return Response.json({ ok: false, error: queryErr.message }, { status: 500, headers: corsHeaders })
  }

  const rows = (jobCardRows || []) as Array<Record<string, unknown>>
  console.log(`PSF: found ${rows.length} candidate rows for closed_date ${targetDate}`)

  const stats = { processed: 0, sent: 0, skipped_duplicate: 0, skipped_invalid_phone: 0, failed: 0, dry_run: dryRun }
  const log: Array<Record<string, unknown>> = []

  // ── Phase 1: validate phones ──────────────────────────────────────────────
  type Candidate = {
    row: Record<string, unknown>
    jobCardId: number
    closedDate: string
    customerName: string
    regNo: string
    jobCardNumber: string
    phone: { e164: string; local10: string }
  }

  const candidates: Candidate[] = []

  for (const row of rows) {
    stats.processed++
    const jobCardId = row.id as number

    const phone = normalizePhone(row.account_phone_number as string)
    if (!phone) {
      stats.skipped_invalid_phone++
      log.push({ job_card_id: jobCardId, reg_no: row.vehicle_registration_number, action: 'skip', reason: 'invalid_phone' })
      continue
    }

    candidates.push({
      row,
      jobCardId,
      closedDate: (row.closed_date_time as string).split('T')[0],
      customerName: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Valued Customer',
      regNo: (row.vehicle_registration_number as string) || '',
      jobCardNumber: (row.job_card_number as string) || '',
      phone,
    })
  }

  // ── Phase 2: skip check — already has a feedback row (batches of 30) ─────
  type SkipResult = { candidate: Candidate; skip: boolean }

  const skipResults = await runBatched<Candidate, SkipResult>(
    candidates,
    30,
    0,
    async (c) => {
      const { data: existing } = await sb.from('post_service_feedback_messages')
        .select('id')
        .eq('job_card_closed_data_id', c.jobCardId)
        .limit(1)
      return { candidate: c, skip: !!existing?.length }
    },
  )

  const toSend: Candidate[] = []
  for (const r of skipResults) {
    if (r.skip) {
      stats.skipped_duplicate++
      log.push({ job_card_id: r.candidate.jobCardId, reg_no: r.candidate.regNo, action: 'skip', reason: 'duplicate' })
    } else {
      toSend.push(r.candidate)
    }
  }

  console.log(`PSF: ${toSend.length} to send after skip checks`)

  // Dry run — log what would be sent and return early
  if (dryRun) {
    for (const c of toSend) {
      const bodyParams = buildBodyParams(varExamples, variableMap, c.row)
      stats.sent++
      log.push({
        job_card_id:  c.jobCardId,
        reg_no:       c.regNo,
        phone:        c.phone.e164,
        action:       'dry_run_would_send',
        template:     templateName,
        body_params:  bodyParams,
      })
    }
    console.log('PSF: dry run completed —', JSON.stringify(stats))
    return Response.json({ ok: true, stats, log, today, target_date: targetDate }, { headers: corsHeaders })
  }

  // ── Phase 3: insert all feedback rows in parallel (batches of 20) ────────
  type InsertResult = { candidate: Candidate; feedbackId?: number; insertFailed: boolean }

  const insertResults = await runBatched<Candidate, InsertResult>(
    toSend,
    20,
    0,
    async (c) => {
      const { data: rInserted, error: rErr } = await sb
        .from('post_service_feedback_messages')
        .insert([{
          job_card_closed_data_id:     c.jobCardId,
          customer_name:               c.customerName,
          mobile_number:               c.phone.local10,
          vehicle_registration_number: c.regNo,
          job_card_number:             c.jobCardNumber,
          closed_date:                 c.closedDate,
          scheduled_for_date:          today,
          template_name:               templateName,
          status:                      'pending',
        }])
        .select('id')
        .single()

      if (rErr) {
        if (rErr.code === '23505') {
          console.log(`PSF: SKIP race-condition duplicate for job_card_id=${c.jobCardId}`)
          return { candidate: c, insertFailed: false }
        }
        console.error(`PSF: feedback insert failed for job_card_id=${c.jobCardId}:`, rErr.message)
        return { candidate: c, insertFailed: true }
      }
      return { candidate: c, feedbackId: rInserted?.id as number, insertFailed: false }
    },
  )

  type SendItem = { candidate: Candidate; feedbackId: number }
  const readyToSend: SendItem[] = []
  for (const r of insertResults) {
    if (r.insertFailed) {
      stats.failed++
    } else if (!r.feedbackId) {
      stats.skipped_duplicate++
    } else {
      readyToSend.push({ candidate: r.candidate, feedbackId: r.feedbackId })
    }
  }

  // ── Phase 4: send WhatsApp messages in parallel batches ──────────────────
  // Batches of 15 with 300ms gap stays well within Meta's rate limits
  await runBatched<SendItem, void>(
    readyToSend,
    15,
    300,
    async ({ candidate: c, feedbackId }) => {
      const bodyParams = buildBodyParams(varExamples, variableMap, c.row)
      console.log(`PSF: SEND → ${c.phone.e164} (${c.regNo}, closed ${c.closedDate})`)

      try {
        const waRes = await sendFlowTemplate(phoneId, token, c.phone.e164, templateName, templateLang, bodyParams)
        const waMessageId = waRes.messages?.[0]?.id

        if (waMessageId) {
          await sb.from('post_service_feedback_messages').update({
            status:        'sent',
            sent_at:       new Date().toISOString(),
            wa_message_id: waMessageId,
            updated_at:    new Date().toISOString(),
          }).eq('id', feedbackId)
          stats.sent++
          log.push({ job_card_id: c.jobCardId, reg_no: c.regNo, action: 'sent', wa_message_id: waMessageId })
        } else {
          const errStr = waRes.error ? JSON.stringify(waRes.error) : 'No message ID in response'
          console.error(`PSF: send failed for ${c.phone.e164}:`, errStr)
          await sb.from('post_service_feedback_messages').update({
            status:         'failed',
            failure_reason: errStr,
            updated_at:     new Date().toISOString(),
          }).eq('id', feedbackId)
          stats.failed++
          log.push({ job_card_id: c.jobCardId, reg_no: c.regNo, action: 'failed', reason: errStr })
        }
      } catch (e) {
        const errStr = e instanceof Error ? e.message : String(e)
        console.error(`PSF: exception for ${c.phone.e164}:`, errStr)
        await sb.from('post_service_feedback_messages').update({
          status:         'failed',
          failure_reason: errStr,
          updated_at:     new Date().toISOString(),
        }).eq('id', feedbackId)
        stats.failed++
      }
    },
  )

  console.log('PSF: completed —', JSON.stringify(stats))
  return Response.json({ ok: true, stats, log, today, target_date: targetDate }, { headers: corsHeaders })
})
