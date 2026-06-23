import { supabase } from '../supabase'
import { getSupabaseBaseUrl } from '../env'
import { fail, ok, type ApiResult } from './types'

export interface EmailLog {
  id: string
  job_card_id: string
  recipient_email: string
  subject: string
  body: string
  attachments: string[] | null
  sent_at: string | null
  created_at: string
}

export interface EmailAttachmentRef {
  filename: string
  storagePath: string
  bucket?: string
  driveFileId?: string | null
  driveUrl?: string | null
}

/**
 * Send transactional email via edge function
 */
async function sendTransactionalEmail(
  to: string | string[],
  subject: string,
  html: string,
  attachments?: EmailAttachmentRef[],
  purpose?: string,
  plainTextOverride?: string,
): Promise<ApiResult<{ success: boolean; message: string }>> {
  try {
    // Refresh session first to get a fresh token
    const { data: refreshed } = await supabase.auth.refreshSession()
    let sessionData = refreshed.session
    if (!sessionData?.access_token) {
      // Fallback: try reading cached session
      sessionData = (await supabase.auth.getSession()).data.session
    }
    if (!sessionData?.access_token) {
      return fail('Session expired — please log out and log in again, then retry.')
    }
    const accessToken = sessionData.access_token

    const response = await fetch(
      `${getSupabaseBaseUrl()}/functions/v1/send-transactional-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          to,
          subject,
          html,
          text: plainTextOverride ?? html.replace(/<[^>]*>/g, ''), // Use plain text if provided
          purpose: purpose ?? 'manual_message',
          attachments,
        }),
      },
    )

    if (!response.ok) {
      const errorData = await response.text()
      return fail(`Email send failed: ${errorData}`)
    }

    const result = await response.json() as { success: boolean; message: string; recipients?: string[] }
    return ok(result)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unknown error sending email')
  }
}

/**
 * Store an email draft/send log for warranty claims
 */
export async function logEmail(
  jobCardId: string,
  options: {
    recipientEmail: string
    subject: string
    body: string
    attachments?: string[]
    sentAt?: string | null
  },
): Promise<ApiResult<EmailLog>> {
  const payload = {
    job_card_id: jobCardId,
    recipient_email: options.recipientEmail,
    subject: options.subject,
    body: options.body,
    attachments: options.attachments ?? null,
    sent_at: options.sentAt ?? null,
  }

  const { error } = await supabase
    .from('email_logs')
    .insert(payload)

  if (error) return fail(error)

  // Avoid requiring SELECT permission on email_logs for callers that only need send success.
  return ok({
    id: '',
    job_card_id: jobCardId,
    recipient_email: options.recipientEmail,
    subject: options.subject,
    body: options.body,
    attachments: options.attachments ?? null,
    sent_at: options.sentAt ?? null,
    created_at: new Date().toISOString(),
  })
}

/**
 * Send warranty claim email via edge function and log it
 */
export async function sendClaimEmail(
  jobCardId: string,
  options: {
    to: string | string[]
    subject: string
    html: string
    plainText?: string
    attachments?: EmailAttachmentRef[]
    purpose?: string
  },
): Promise<ApiResult<EmailLog>> {
  // Send email via edge function
  const sendRes = await sendTransactionalEmail(options.to, options.subject, options.html, options.attachments, options.purpose, options.plainText)
  if (sendRes.error) {
    return fail(`Failed to send email: ${sendRes.error}`)
  }

  // Use actual recipients returned by edge fn (may differ if dealer_settings override)
  const actualRecipients = (sendRes.data as { recipients?: string[] } & { success: boolean; message: string })?.recipients
  const recipientStr = actualRecipients
    ? actualRecipients.join(',')
    : Array.isArray(options.to) ? options.to.join(',') : options.to

  // Log email to database with sent timestamp
  const logRes = await logEmail(jobCardId, {
    recipientEmail: recipientStr,
    subject: options.subject,
    body: options.html,
    attachments: options.attachments?.map((a) => a.storagePath),
    sentAt: new Date().toISOString(),
  })

  if (logRes.error) {
    console.warn('Email sent but logging failed:', logRes.error)
    return ok({
      id: '',
      job_card_id: jobCardId,
      recipient_email: recipientStr,
      subject: options.subject,
      body: options.html,
      attachments: options.attachments?.map((a) => a.storagePath) ?? null,
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
  }

  return ok(logRes.data!)
}

/**
 * Generate HTML email content for warranty claim
 * Matches the official Techwheels pre-approval email format
 */
export function generateClaimEmailContent(jobCard: {
  jc_number:             string
  reg_number:            string
  vin:                   string | null
  model:                 string | null
  colour:                string | null
  complaint_date:        string
  km_reading:            number | null
  date_of_sale:          string | null
  dealer_name:           string | null
  dealer_code:           string | null
  warranty_age_days:     number | null
  claim_type:            string | null
  complaint_text:        string | null
  panel_names:           string[] | null
  total_estimate_amount: number | null
  tml_share_percent:     number | null
  sender_name?:          string | null
  estimate_rows?:        Array<{
    sr_no:               number
    panel_name:          string
    part_number:         string | null
    part_description:    string | null
    defect:              string | null
    action:              string | null
    qty:                 number | null
    ndp_value:           number | null
    paint_charges:       number | null
    labour_charges:      number | null
    row_total:           number | null
  }>
}): { subject: string; html: string; plainText: string } {

  // Age is calculated from date_of_sale to TODAY (current date) — not complaint_date
  // This matches TML expectations (e.g. sold May 2023, emailed June 2026 → 3+ years → "3-4 Years")
  const ageCalcDays = (() => {
    if (jobCard.date_of_sale) {
      const sale = new Date(jobCard.date_of_sale)
      const today = new Date()
      const ms = today.getTime() - sale.getTime()
      if (ms > 0) return Math.floor(ms / (1000 * 60 * 60 * 24))
    }
    // Fallback to stored warranty_age_days
    return jobCard.warranty_age_days ?? 0
  })()

  const ageStr = (() => {
    const d = ageCalcDays
    const y = Math.floor(d / 365)
    const m = Math.floor((d % 365) / 30)
    return y > 0 ? `${y} Year${y > 1 ? 's' : ''} ${m} Month${m !== 1 ? 's' : ''}` : `${m} Month${m !== 1 ? 's' : ''}`
  })()

  const ageCat = (() => {
    const d = ageCalcDays
    const y = d / 365
    if (y < 1) return 'Under 1 Year'
    if (y < 2) return '1-2 Years'
    if (y < 3) return '2-3 Years'
    if (y < 4) return '3-4 Years'
    if (y < 5) return '4-5 Years'
    return 'Above 5 Years'
  })()

  const fmt = (n: number | null | undefined) =>
    n != null ? n.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'

  const fmtDate = (s: string | null | undefined) => {
    if (!s) return '—'
    try {
      const d = new Date(s)
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = d.getFullYear()
      return `${dd}/${mm}/${yyyy}`
    } catch { return s }
  }

  // Normalize complaint text → always "X related issues" format for professional email tone
  const issueDesc = (() => {
    const raw = (jobCard.complaint_text ?? '').trim().toLowerCase()
    if (!raw) return 'rusting related issues'
    // If it's just a noun like "rusting issue", "rust", "rusting", normalize it
    const stripped = raw
      .replace(/\s*(issue|issues|problem|complaint|concern|related issues)\s*$/i, '')
      .trim()
    if (!stripped) return 'rusting related issues'
    return `${stripped} related issues`
  })()

  // Panel names: prefer those derived from estimate_rows (more accurate), fall back to panel_names array
  const panelList = (() => {
    // First try estimate_rows panel names
    if (jobCard.estimate_rows && jobCard.estimate_rows.length > 0) {
      const panels = Array.from(new Set(
        jobCard.estimate_rows.map(r => r.panel_name?.trim()).filter(Boolean) as string[]
      ))
      if (panels.length > 0) return panels.join(', ')
    }
    // Fall back to panel_names array from dashboard summary
    const names = (jobCard.panel_names ?? []).filter(Boolean)
    if (names.length > 0) return names.join(', ')
    return 'various panels'
  })()
  // Derive actual issue type from estimate rows defects (more accurate than claim_type which is generic)
  const inferredIssueType = (() => {
    if (jobCard.estimate_rows && jobCard.estimate_rows.length > 0) {
      const defects = jobCard.estimate_rows
        .map(r => r.defect?.trim())
        .filter(Boolean) as string[]
      const uniqueDefects = Array.from(new Set(defects))
      if (uniqueDefects.length === 1) return uniqueDefects[0]
      if (uniqueDefects.some(d => d.toLowerCase().includes('rust'))) return 'Rusting'
      if (uniqueDefects.length > 0) return uniqueDefects[0]
    }
    return null
  })()
  const claimType = inferredIssueType ?? (
    jobCard.claim_type && !['body & paint', 'body and paint', 'bodyshop'].includes(jobCard.claim_type.toLowerCase())
      ? jobCard.claim_type
      : 'Rusting'
  )
  const sender    = jobCard.sender_name || jobCard.dealer_name || 'Service Team'
  const amount    = fmt(jobCard.total_estimate_amount)
  const tmlAmt    = jobCard.tml_share_percent && jobCard.total_estimate_amount
    ? fmt(Math.round((jobCard.total_estimate_amount * jobCard.tml_share_percent) / 100))
    : null

  const subject = `Pre-Approval Request – ${jobCard.reg_number} | ${jobCard.model ?? ''} | ${claimType} | JC: ${jobCard.jc_number}`

  // ── Estimate table rows HTML ───────────────────────────────────────────────
  let estimateTableHtml = ''
  if (jobCard.estimate_rows && jobCard.estimate_rows.length > 0) {
    const rowsHtml = jobCard.estimate_rows.map((r, i) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
        <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center;font-size:12px">${r.sr_no}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:12px">${r.panel_name}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:12px">${r.part_number ?? '—'}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:12px">${r.part_description ?? '—'}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:12px">${r.defect ?? '—'}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:12px">${r.action ?? '—'}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right;font-size:12px">${fmt(r.qty)}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right;font-size:12px">₹${fmt(r.ndp_value)}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right;font-size:12px">₹${fmt(r.paint_charges)}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right;font-size:12px">₹${fmt(r.labour_charges)}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right;font-size:12px;font-weight:600">₹${fmt(r.row_total)}</td>
      </tr>`).join('')

    estimateTableHtml = `
      <div style="margin-top:20px">
        <h3 style="font-size:13px;font-weight:700;color:#1e3a8a;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.05em">Estimate Summary (Parts & Labour)</h3>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:12px">
            <thead>
              <tr style="background:#1e3a8a;color:#fff">
                <th style="padding:8px;border:1px solid #1e3a8a;text-align:center">Sr</th>
                <th style="padding:8px;border:1px solid #1e3a8a">Panel</th>
                <th style="padding:8px;border:1px solid #1e3a8a">Part No.</th>
                <th style="padding:8px;border:1px solid #1e3a8a">Description</th>
                <th style="padding:8px;border:1px solid #1e3a8a">Defect</th>
                <th style="padding:8px;border:1px solid #1e3a8a">Action</th>
                <th style="padding:8px;border:1px solid #1e3a8a;text-align:right">Qty</th>
                <th style="padding:8px;border:1px solid #1e3a8a;text-align:right">NDP</th>
                <th style="padding:8px;border:1px solid #1e3a8a;text-align:right">Paint</th>
                <th style="padding:8px;border:1px solid #1e3a8a;text-align:right">Labour</th>
                <th style="padding:8px;border:1px solid #1e3a8a;text-align:right">Total</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              <tr style="background:#f0fdf4;font-weight:700">
                <td colspan="10" style="padding:8px 10px;border:1px solid #e5e7eb;text-align:right;font-size:13px">Recommended Estimated Amount</td>
                <td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:right;font-size:14px;color:#059669">₹${amount} /-</td>
              </tr>
              ${tmlAmt ? `<tr style="background:#eff6ff;font-weight:700">
                <td colspan="10" style="padding:8px 10px;border:1px solid #e5e7eb;text-align:right;font-size:13px">TML Share (${jobCard.tml_share_percent}%)</td>
                <td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:right;font-size:14px;color:#1e40af">₹${tmlAmt} /-</td>
              </tr>` : ''}
            </tfoot>
          </table>
        </div>
      </div>`
  }

  // ── Plain text — EXACT format as per TML pre-approval requirement ─────────
  const kmFormatted = jobCard.km_reading != null
    ? jobCard.km_reading.toLocaleString('en-IN') + ' km'
    : '—'

  const plainText = `Dear Sir,
Greetings for the Day

Vehicle reported in the workshop for ${issueDesc}. Post inspection ${claimType.toLowerCase()} observed on the ${panelList}. we have checked heavy ${claimType.toLowerCase()} issue. DIR & estimate and vehicle service history attached for reference. Vehicle is now out of warranty and falls between the ${ageCat} category. Need prior support on this case related to ${claimType.toLowerCase()}.

Vehicle detail mentioned below:-
Chassis No.-       ${jobCard.vin ?? '—'}
Vehicle No.-       ${jobCard.reg_number}
Model:-             ${jobCard.model ?? '—'}
K.m.:-                ${kmFormatted}
Date Of Sale:-  ${fmtDate(jobCard.date_of_sale)}
Recommended Estimated Amount : Rs ${amount} /-
 Estimates attached as per the warranty policy . Need your kind approval for the same.`

  // ── HTML (styled version of the same format) ──────────────────────────────
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#222;font-size:14px;line-height:1.7;background:#f5f5f5">
  <div style="max-width:700px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">

    <!-- Header -->
    <div style="background:#1e3a8a;padding:24px 28px">
      <div style="color:#fff;font-size:18px;font-weight:700">Pre-Approval Request</div>
      <div style="color:#93c5fd;font-size:13px;margin-top:4px">${jobCard.dealer_name ?? ''} · AutoDoc Warranty System</div>
    </div>

    <!-- Body -->
    <div style="padding:28px">

      <!-- Salutation -->
      <p style="margin:0 0 8px 0">Dear Sir,</p>
      <p style="margin:0 0 20px 0">Greetings for the Day</p>

      <!-- Description paragraph -->
      <p style="margin:0 0 20px 0;padding:14px 16px;background:#fef9f0;border-left:4px solid #f59e0b;border-radius:4px">
        Vehicle reported in the workshop for <strong>${issueDesc}</strong>. Post inspection <strong>${claimType.toLowerCase()}</strong> observed on the <strong>${panelList}</strong>.
        We have checked heavy <strong>${claimType.toLowerCase()}</strong> issue. DIR &amp; estimate and vehicle service history attached for reference.
        Vehicle is now out of warranty and falls between the <strong>${ageCat}</strong> category.
        Need prior support on this case related to <strong>${claimType.toLowerCase()}</strong>.
      </p>

      <!-- Vehicle Details -->
      <div style="margin-bottom:20px">
        <div style="font-size:13px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #dbeafe">
          Vehicle detail mentioned below:–
        </div>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:6px 0;font-weight:600;color:#555;width:200px">Chassis No.</td>
            <td style="padding:6px 0;font-family:monospace;font-weight:700;color:#1e3a8a">${jobCard.vin ?? '—'}</td>
          </tr>
          <tr style="background:#f9fafb">
            <td style="padding:6px 8px;font-weight:600;color:#555">Vehicle No.</td>
            <td style="padding:6px 8px;font-family:monospace;font-weight:700;color:#1e3a8a">${jobCard.reg_number}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-weight:600;color:#555">Model</td>
            <td style="padding:6px 0">${jobCard.model ?? '—'} ${jobCard.colour ? '· ' + jobCard.colour : ''}</td>
          </tr>
          <tr style="background:#f9fafb">
            <td style="padding:6px 8px;font-weight:600;color:#555">K.m.</td>
            <td style="padding:6px 8px">${kmFormatted}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-weight:600;color:#555">Date Of Sale</td>
            <td style="padding:6px 0">${fmtDate(jobCard.date_of_sale)}</td>
          </tr>
          <tr style="background:#f9fafb">
            <td style="padding:6px 8px;font-weight:600;color:#555">Vehicle Age</td>
            <td style="padding:6px 8px">${ageStr} <span style="color:#92400e;background:#fef3c7;padding:2px 8px;border-radius:10px;font-size:12px;margin-left:4px">${ageCat}</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-weight:600;color:#555">Job Card No.</td>
            <td style="padding:6px 0">${jobCard.jc_number}</td>
          </tr>
          <tr style="background:#f0fdf4">
            <td style="padding:10px 8px;font-weight:700;color:#065f46;font-size:14px">Recommended Est. Amount</td>
            <td style="padding:10px 8px;font-weight:700;color:#059669;font-size:18px">₹${amount} /-</td>
          </tr>
          ${tmlAmt ? `<tr style="background:#eff6ff">
            <td style="padding:8px;font-weight:700;color:#1e40af">TML Share (${jobCard.tml_share_percent}%)</td>
            <td style="padding:8px;font-weight:700;color:#1e40af;font-size:16px">₹${tmlAmt} /-</td>
          </tr>` : ''}
        </table>
      </div>

      ${estimateTableHtml}

      <!-- Closing -->
      <p style="margin:24px 0 8px 0">Estimates attached as per the warranty policy. Need your kind approval for the same.</p>

      <!-- Attachments note -->
      <div style="margin:16px 0;padding:12px 16px;background:#f0f4ff;border-radius:6px;font-size:13px">
        <div style="font-weight:600;margin-bottom:6px;color:#1e3a8a">📎 Attachments included:</div>
        <div>• DIR (Damage Inspection Report) – Pre-Repair PPT</div>
        <div>• Estimate – Excel sheet</div>
        <div>• Vehicle Service History</div>
      </div>

      <!-- Regards -->
      <p style="margin:20px 0 4px 0">Regards,</p>
      <p style="margin:0;font-weight:700;font-size:15px">${sender}</p>
      ${jobCard.dealer_name && jobCard.dealer_name !== sender ? `<p style="margin:2px 0 0 0;color:#555;font-size:13px">${jobCard.dealer_name}</p>` : ''}
    </div>

    <!-- Footer -->
    <div style="background:#f3f4f6;padding:14px 28px;font-size:11px;color:#888;border-top:1px solid #e5e7eb">
      This is an automated email generated by AutoDoc Warranty System. JC: ${jobCard.jc_number} · ${new Date().toLocaleDateString('en-IN')}
    </div>
  </div>
</body>
</html>`

  return { subject, html, plainText }
}

export interface TechnicianDailyEarningsTestResult {
  success: boolean
  reportDateIst: string
  reportFromIst?: string
  reportToIst?: string
  reportLabel?: string
  recipients: string[]
  rowCount: number
  totalEarnings: number
  attachment: {
    bucket: string
    storagePath: string
    filename: string
  }
}

export interface TechnicianDailyEarningsSendParams {
  runDateIst?: string
  runFromIst?: string
  runToIst?: string
  reportScopeLabel?: string
  rows?: Array<{
    technicianCode: string
    technicianName: string
    earnings: number
  }>
}

export async function sendTechnicianDailyEarningsTestEmail(
  params: TechnicianDailyEarningsSendParams = {},
): Promise<ApiResult<TechnicianDailyEarningsTestResult>> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const accessToken = session?.access_token
    if (!accessToken) return fail('No authenticated session for report email send')

    const payload: Record<string, string> = { runMode: 'test' }
    if (params.runDateIst) payload.runDateIst = params.runDateIst
    if (params.runFromIst) payload.runFromIst = params.runFromIst
    if (params.runToIst) payload.runToIst = params.runToIst
    if (params.reportScopeLabel) payload.reportScopeLabel = params.reportScopeLabel

    const body: Record<string, unknown> = payload
    if (params.rows && params.rows.length > 0) {
      body.rows = params.rows
    }

    const response = await fetch(
      `${getSupabaseBaseUrl()}/functions/v1/technician-daily-earnings-report`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      },
    )

    if (!response.ok) {
      const details = await response.text()
      return fail(`Technician report email failed: ${details}`)
    }

    const responsePayload = await response.json() as TechnicianDailyEarningsTestResult
    return ok<TechnicianDailyEarningsTestResult>(responsePayload)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unknown error sending technician report email')
  }
}
