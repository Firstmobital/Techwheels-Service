import { supabase } from '../supabase'
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
): Promise<ApiResult<{ success: boolean; message: string }>> {
  try {
    const response = await fetch(
      `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')}/functions/v1/send-transactional-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          to,
          subject,
          html,
          text: html.replace(/<[^>]*>/g, ''), // Strip HTML for plain text
          purpose: 'manual_message',
          attachments,
        }),
      },
    )

    if (!response.ok) {
      const errorData = await response.text()
      return fail(`Email send failed: ${errorData}`)
    }

    const result = await response.json() as { success: boolean; message: string }
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
    attachments?: EmailAttachmentRef[]
  },
): Promise<ApiResult<EmailLog>> {
  // Send email via edge function
  const sendRes = await sendTransactionalEmail(options.to, options.subject, options.html, options.attachments)
  if (sendRes.error) {
    return fail(`Failed to send email: ${sendRes.error}`)
  }

  // Normalise recipients to a comma-joined string for DB logging
  const recipientStr = Array.isArray(options.to) ? options.to.join(',') : options.to

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
 */
export function generateClaimEmailContent(jobCard: {
  jc_number: string
  reg_number: string
  model: string | null
  colour: string | null
  complaint_date: string
  dealer_name: string | null
  total_estimate_amount: number | null
}): { subject: string; html: string; plainText: string } {
  const date = new Date(jobCard.complaint_date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const dealer = jobCard.dealer_name || 'Dealer'
  const amount = (jobCard.total_estimate_amount ?? 0).toLocaleString('en-IN')
  
  const subject = `Warranty Claim - ${jobCard.jc_number} (${jobCard.reg_number})`
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 8px 0 0 0; opacity: 0.9; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .section { margin-bottom: 25px; }
    .section h2 { font-size: 16px; font-weight: 600; color: #1e3a8a; margin: 0 0 12px 0; border-bottom: 2px solid #dbeafe; padding-bottom: 8px; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-label { font-weight: 500; color: #4b5563; }
    .detail-value { text-align: right; color: #1e3a8a; }
    .highlight { background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; border-radius: 4px; margin: 15px 0; }
    .attachment-list { background: white; padding: 12px; border-radius: 4px; border: 1px solid #e5e7eb; }
    .attachment-item { padding: 8px 0; display: flex; align-items: center; }
    .attachment-item::before { content: "📎"; margin-right: 8px; }
    .footer { background: #f3f4f6; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #6b7280; }
    .amount-highlight { font-size: 20px; font-weight: 700; color: #059669; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Warranty Claim Submission</h1>
      <p>AutoDoc Warranty Manager — ${dealer}</p>
    </div>
    
    <div class="content">
      <div class="section">
        <h2>Vehicle Information</h2>
        <div class="detail-row">
          <span class="detail-label">Registration:</span>
          <span class="detail-value"><strong>${jobCard.reg_number}</strong></span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Job Card #:</span>
          <span class="detail-value"><strong>${jobCard.jc_number}</strong></span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Model:</span>
          <span class="detail-value">${jobCard.model || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Colour:</span>
          <span class="detail-value">${jobCard.colour || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Complaint Date:</span>
          <span class="detail-value">${date}</span>
        </div>
      </div>

      <div class="section highlight">
        <strong>Claim Amount:</strong><br>
        <div class="amount-highlight">₹${amount}</div>
      </div>

      <div class="section">
        <h2>Documents Attached</h2>
        <div class="attachment-list">
          <div class="attachment-item">Pre-Repair PPT Report (damage assessment)</div>
          <div class="attachment-item">Post-Repair PPT Report (repair completion)</div>
          <div class="attachment-item">Estimate & Quotation (Excel)</div>
        </div>
      </div>

      <div class="section">
        <p>Please review the attached documents and advise on claim approval status.</p>
        <p><strong>Regards,</strong><br>${dealer}<br>AutoDoc Warranty Claim System</p>
      </div>
    </div>

    <div class="footer">
      <p>This is an automated message from the AutoDoc Warranty Manager. Please do not reply directly to this email.</p>
      <p>&copy; 2026 Techwheels. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim()

  const plainText = `
Warranty Claim Submission
AutoDoc Warranty Manager — ${dealer}

VEHICLE INFORMATION
Registration: ${jobCard.reg_number}
Job Card #: ${jobCard.jc_number}
Model: ${jobCard.model || 'N/A'}
Colour: ${jobCard.colour || 'N/A'}
Complaint Date: ${date}

CLAIM AMOUNT
₹${amount}

DOCUMENTS ATTACHED
• Pre-Repair PPT Report (damage assessment)
• Post-Repair PPT Report (repair completion)
• Estimate & Quotation (Excel)

Please review the attached documents and advise on claim approval status.

Regards,
${dealer}
AutoDoc Warranty Claim System

---
This is an automated message from the AutoDoc Warranty Manager. Please do not reply directly to this email.
© 2026 Techwheels. All rights reserved.
  `.trim()

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
      `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')}/functions/v1/technician-daily-earnings-report`,
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
