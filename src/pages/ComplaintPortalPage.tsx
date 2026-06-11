import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  addCustomerMessage,
  getComplaintByToken,
  raiseComplaint,
  reopenComplaint,
  submitCsat,
} from '../lib/api/complaints'
import type { ComplaintPortalResponse, ComplaintStatus } from '../components/complaints/types'
import './ComplaintPortalPage.css'

type PortalMode = 'verify' | 'raise' | 'submitted' | 'view'

type CategoryOption = {
  value: string
  title: string
  description: string
  icon: string
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: 'service_quality', title: 'Service quality / rework', description: 'Issue not fixed, or came back', icon: '🔧' },
  { value: 'billing', title: 'Billing / overcharge', description: 'Wrong or unexpected charges', icon: '💰' },
  { value: 'delivery_delay', title: 'Delivery delay', description: 'Vehicle delivered late', icon: '⏱️' },
  { value: 'staff_behaviour', title: 'Staff behaviour', description: 'Conduct of advisor or staff', icon: '👤' },
  { value: 'parts_spares', title: 'Parts / spares', description: 'Wrong, missing or faulty part', icon: '📦' },
  { value: 'damage_during_service', title: 'Damage during service', description: 'New scratch, dent or damage', icon: '⚠️' },
  { value: 'cleanliness', title: 'Cleanliness / wash', description: 'Wash or interior not done well', icon: '🧹' },
  { value: 'other', title: 'Something else', description: 'Tell us in your own words', icon: '📝' },
]

interface FormState {
  category: string
  description: string
  severitySelf: string
  customerName: string
  customerPhone: string
}

const STATUS_ORDER: ComplaintStatus[] = ['new', 'acknowledged', 'in_progress', 'resolved', 'closed']

function iconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    </svg>
  )
}

function iconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  )
}

function iconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

const statusLabel: Record<ComplaintStatus, string> = {
  new: 'Raised',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'In progress',
}

function relativeTime(iso?: string) {
  if (!iso) return 'Updated just now'
  const then = new Date(iso).getTime()
  const now = Date.now()
  const mins = Math.max(1, Math.floor((now - then) / 60000))
  if (mins < 60) return `Updated ${mins} min ago`
  const hrs = Math.floor(mins / 60)
  return `Updated ${hrs}h ago`
}

function formatDateShort(iso?: string) {
  if (!iso) return '--'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getSlaText(resolutionDueAt?: string) {
  if (!resolutionDueAt) return { leftText: '--', pct: 0 }
  const dueMs = new Date(resolutionDueAt).getTime()
  const now = Date.now()
  const diff = dueMs - now
  if (diff <= 0) return { leftText: 'breached', pct: 100 }
  const total = 48 * 60 * 60 * 1000
  const spentPct = Math.min(100, Math.max(0, Math.round(((total - diff) / total) * 100)))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours >= 1) return { leftText: `${hours}h left`, pct: spentPct }
  const mins = Math.floor(diff / (1000 * 60))
  return { leftText: `${mins}m left`, pct: spentPct }
}

function firstName(name?: string) {
  if (!name) return 'Customer'
  return name.trim().split(/\s+/)[0] || 'Customer'
}

export const ComplaintPortalPage: React.FC = () => {
  const { token } = useParams<{ token: string }>()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [data, setData] = useState<ComplaintPortalResponse | null>(null)
  const [mode, setMode] = useState<PortalMode>('verify')

  const [formState, setFormState] = useState<FormState>({
    category: 'service_quality',
    description: '',
    severitySelf: 'medium',
    customerName: '',
    customerPhone: '',
  })

  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [csatRating, setCsatRating] = useState<number | null>(null)
  const [csatComment, setCsatComment] = useState('')
  const [reopenReason, setReopenReason] = useState('')
  const [showReopenForm, setShowReopenForm] = useState(false)

  const ticket = data?.ticket
  const entry = data?.entry_summary
  const isResolvedState = ticket?.status === 'resolved' || ticket?.status === 'closed'

  const activeStep = useMemo(() => {
    if (!ticket) return 0
    const normalized = ticket.status === 'reopened' ? 'in_progress' : ticket.status
    const idx = STATUS_ORDER.indexOf(normalized as ComplaintStatus)
    return idx === -1 ? 0 : idx
  }, [ticket])

  const isFullyResolvedView = mode === 'view' && ticket?.status === 'resolved'

  useEffect(() => {
    if (!success) return
    const t = window.setTimeout(() => setSuccess(null), 3500)
    return () => window.clearTimeout(t)
  }, [success])

  useEffect(() => {
    const loadData = async () => {
      if (!token) {
        setError('Invalid or missing complaint token')
        setLoading(false)
        return
      }

      try {
        const response = await getComplaintByToken(token)
        setData(response)
        setMode(response.mode === 'raise' ? 'verify' : 'view')
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load complaint')
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [token])

  const clearFeedback = () => {
    setError(null)
    setSuccess(null)
  }

  const handleRaise = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    const trimmedDescription = formState.description.trim()
    const trimmedPhone = formState.customerPhone.trim()

    if (trimmedDescription.length < 10) {
      setError('Details should be at least 10 characters.')
      return
    }

    if (!trimmedPhone || !/^\d{10}$/.test(trimmedPhone)) {
      setError('Contact number is required and must be exactly 10 digits.')
      return
    }

    try {
      clearFeedback()
      setLoading(true)
      const selectedCategory = CATEGORY_OPTIONS.find((c) => c.value === formState.category)
      const derivedTitle = trimmedDescription.slice(0, 100) || selectedCategory?.title || 'Complaint raised'
      // Keep backend title mandatory while matching reference UI (single issue description input).
      const payloadResponse = await raiseComplaint(token, formState.category, derivedTitle, trimmedDescription, {
        severity_self: formState.severitySelf,
        customer_name: formState.customerName.trim() || entry?.customer_name || undefined,
        customer_phone: trimmedPhone,
      })
      setData(payloadResponse)
      setMode('submitted')
      setSuccess('Complaint submitted successfully.')
      setAttachmentFiles([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to raise complaint')
    } finally {
      setLoading(false)
    }
  }

  const handleAddMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = newMessage.trim()
    if (!token || !body) return

    if (body.length < 2) {
      setError('Reply should be at least 2 characters.')
      return
    }

    try {
      clearFeedback()
      setLoading(true)
      const response = await addCustomerMessage(token, body)
      setData(response)
      setNewMessage('')
      setSuccess('Message sent.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitCsat = async () => {
    if (!token || csatRating == null) return

    try {
      clearFeedback()
      setLoading(true)
      const response = await submitCsat(token, csatRating, csatComment.trim() || undefined)
      setData(response)
      setSuccess('Thanks for your feedback.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit rating')
    } finally {
      setLoading(false)
    }
  }

  const handleReopen = async () => {
    const reason = reopenReason.trim()
    if (!token || !reason) return

    if (reason.length < 8) {
      setError('Please provide at least 8 characters for reopen reason.')
      return
    }

    try {
      clearFeedback()
      setLoading(true)
      const response = await reopenComplaint(token, reason)
      setData(response)
      setReopenReason('')
      setMode('view')
      setSuccess('Complaint reopened and escalated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen complaint')
    } finally {
      setLoading(false)
    }
  }

  const handleAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setAttachmentFiles((prev) => [...prev, ...files].slice(0, 4))
  }

  if (loading && !data) {
    return <div className="twcp-page"><div className="twcp-shell twcp-body">Loading complaint...</div></div>
  }

  if (error && !data) {
    return <div className="twcp-page"><div className="twcp-shell twcp-body">{error}</div></div>
  }

  if (!data) {
    return <div className="twcp-page"><div className="twcp-shell twcp-body">No complaint data found.</div></div>
  }

  const sla = getSlaText(ticket?.resolution_due_at)
  const isConsumedView = mode === 'submitted' || mode === 'view'

  return (
    <div className="twcp-page">
      <div className="twcp-shell">
        {success && <div className="twcp-banner ok">{success}</div>}
        {error && <div className="twcp-banner err">{error}</div>}
        <div className="twcp-urlbar">
          <span style={{ color: '#0e7c5a' }}>🔒</span>
          <span>tw.care/c/{token ? token.slice(0, 8) : '--------'}</span>
          <span className={`twcp-mode-pill ${isConsumedView ? 'view' : 'raise'}`}>{isConsumedView ? 'View' : 'Raise'}</span>
        </div>

        {mode === 'verify' && (
          <>
            <div className="twcp-head">
              <div className="twcp-brand"><span className="twcp-brand-mark">{iconShield()}</span>TechWheels Care</div>
              <div style={{ marginTop: 16, fontSize: 13, opacity: 0.9 }}>Service feedback for</div>
              <div className="twcp-veh">
                <div className="twcp-reg">{entry?.reg_number || '--'}</div>
                <div className="twcp-veh-meta">{entry?.model || '--'} · {entry?.service_type || '--'}</div>
                <div className="twcp-veh-jc">{entry?.jc_number || ticket?.jc_number || '--'}</div>
              </div>
            </div>
            <div className="twcp-body">
              <h1 className="twcp-title">Not happy with your service?</h1>
              <p className="twcp-lead">
                We're sorry if your visit at <b>{entry?.branch || '--'}</b> on {formatDateShort(ticket?.created_at)} didn't go as expected. Raise a complaint and our team will personally resolve it.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
                <div className="twcp-row"><span className="twcp-chip-icon">{iconShield()}</span><span className="twcp-chip-text">This link is unique to your vehicle visit</span></div>
                <div className="twcp-row"><span className="twcp-chip-icon">{iconUser()}</span><span className="twcp-chip-text">Goes straight to your advisor, {ticket?.assigned_to_name || 'Service Advisor'}</span></div>
                <div className="twcp-row"><span className="twcp-chip-icon">{iconClock()}</span><span className="twcp-chip-text">Track the resolution live on this same link</span></div>
              </div>
            </div>
            <div className="twcp-sticky">
              <button className="twcp-btn primary" onClick={() => setMode('raise')}>Raise a complaint</button>
              <div className="twcp-small-center">Just visiting? You can also view past requests here.</div>
            </div>
          </>
        )}

        {mode === 'raise' && (
          <form onSubmit={handleRaise}>
            <div className="twcp-body" style={{ paddingTop: 18 }}>
              <button type="button" className="twcp-back twcp-muted-mini" onClick={() => setMode('verify')}>← Back</button>
              <h1 className="twcp-title" style={{ marginTop: 12 }}>Raise a complaint</h1>
              <p className="twcp-lead">A few quick details so we can fix this fast.</p>

              <div style={{ marginTop: 18 }}>
                <div className="twcp-section-label">What went wrong?</div>
                {CATEGORY_OPTIONS.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    className={`twcp-optcard ${formState.category === cat.value ? 'sel' : ''}`}
                    onClick={() => setFormState((prev) => ({ ...prev, category: cat.value }))}
                  >
                    <span className="twcp-optcard-icon">{cat.icon}</span>
                    <span style={{ minWidth: 0, textAlign: 'left' }}>
                      <span className="twcp-optcard-title">{cat.title}</span>
                      <span className="twcp-optcard-desc">{cat.description}</span>
                    </span>
                    <span className="twcp-radio" />
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 20 }}>
                <div className="twcp-section-label">How much is this affecting you?</div>
                <div className="twcp-seg">
                  {[
                    { value: 'low', label: 'A little' },
                    { value: 'medium', label: 'Quite a bit' },
                    { value: 'high', label: 'Very urgent' },
                  ].map((sev) => (
                    <button
                      key={sev.value}
                      type="button"
                      className={formState.severitySelf === sev.value ? 'on' : ''}
                      onClick={() => setFormState((prev) => ({ ...prev, severitySelf: sev.value }))}
                    >
                      {sev.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="twcp-field">
                <label>Describe the issue <span className="twcp-req">*</span></label>
                <textarea
                  className="twcp-inp"
                  rows={4}
                  maxLength={500}
                  value={formState.description}
                  onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g. The AC was serviced but cooling dropped again the next morning..."
                  required
                />
                <div className="twcp-count">{formState.description.length}/500 characters</div>
              </div>

              <div className="twcp-field">
                <label>Add photos <span style={{ color: '#94a0b5' }}>optional</span></label>
                <div className="twcp-uploads">
                  {attachmentFiles.map((f) => (
                    <div key={f.name + String(f.size)} className="twcp-upload" title={f.name}>IMG</div>
                  ))}
                  <label className="twcp-upload" htmlFor="complaint-attachments">+ Add</label>
                  <input
                    id="complaint-attachments"
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleAttachment}
                  />
                </div>
                {!!attachmentFiles.length && (
                  <div className="twcp-upload-file">{attachmentFiles.map((f) => f.name).join(', ')}</div>
                )}
              </div>

              <div className="twcp-field">
                <label>Your contact number <span className="twcp-req">*</span></label>
                <input
                  className="twcp-inp"
                  value={formState.customerPhone}
                  onChange={(e) => setFormState((prev) => ({ ...prev, customerPhone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  placeholder="10 digit mobile number"
                  required
                />
                <div className="twcp-count">We'll send status updates here. We never share your number.</div>
              </div>
            </div>

            <div className="twcp-sticky">
              <button className="twcp-btn primary" type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Submit complaint'}</button>
              <div className="twcp-small-center">After you submit, this link becomes your live tracker.</div>
            </div>
          </form>
        )}

        {mode === 'submitted' && ticket && (
          <>
            <div className="twcp-body" style={{ textAlign: 'center', paddingTop: 46 }}>
              <div className="twcp-ok-mark">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="twcp-title">Complaint received</h1>
              <p className="twcp-lead" style={{ maxWidth: 300, margin: '0 auto' }}>
                Thank you, {firstName(ticket.customer_name || entry?.customer_name)}. Your complaint is logged and assigned to your advisor.
              </p>

              <div className="twcp-card" style={{ marginTop: 24, textAlign: 'left' }}>
                <div className="twcp-card-body">
                  <div className="twcp-kv">
                    <span className="k">Complaint no.</span>
                    <span className="twcp-bignum">{ticket.ticket_number}</span>
                  </div>
                  <div className="twcp-divider" />
                  <div className="twcp-kv"><span className="k">Assigned to</span><span className="v">{ticket.assigned_to_name || 'Service advisor'}</span></div>
                  <div className="twcp-kv"><span className="k">First response</span><span className="v" style={{ color: '#0e7c5a' }}>within 4 hours</span></div>
                  <div className="twcp-kv"><span className="k">Target resolution</span><span className="v">within 24 hours</span></div>
                </div>
              </div>

              <div className="twcp-access-note" style={{ marginTop: 20, textAlign: 'left' }}>
                <span className="twcp-chip-icon">{iconShield()}</span>
                <div>
                  <b>Bookmark this page</b>
                  <p className="twcp-lead" style={{ marginTop: 4 }}>
                    This same link now shows your complaint's live status. We've also texted it to {ticket.customer_phone || 'your number'}.
                  </p>
                </div>
              </div>
            </div>

            <div className="twcp-sticky">
              <button className="twcp-btn primary" onClick={() => setMode('view')}>Track my complaint</button>
            </div>
          </>
        )}

        {mode === 'view' && ticket && (
          <>
            <div className={`twcp-head ${isFullyResolvedView ? 'resolved' : ''}`}>
              <div className="twcp-brand">
                <span className="twcp-brand-mark">{isFullyResolvedView ? '✓' : iconShield()}</span>
                {isFullyResolvedView ? 'Complaint resolved' : 'TechWheels Care'}
              </div>
              <div className="twcp-bignum" style={{ color: '#fff', marginTop: 14 }}>{ticket.ticket_number}</div>
              <div className="twcp-veh-meta" style={{ marginTop: 6, fontSize: 14, opacity: 0.95 }}>
                {ticket.reg_number} · {isFullyResolvedView ? 'resolved' : (ticket.model || 'In progress')}
              </div>
            </div>

            <div className="twcp-body" style={{ paddingTop: 18 }}>
              <div className="twcp-card">
                <div className="twcp-card-body">
                  {!isFullyResolvedView && (
                    <div className="twcp-row" style={{ marginBottom: 14, justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '4px 10px', background: '#fbf1e0', color: '#b26a00' }}>
                        {statusLabel[ticket.status]}
                      </span>
                      <span style={{ fontSize: 12.5, color: '#62708a' }}>{relativeTime(ticket.updated_at)}</span>
                    </div>
                  )}
                  <div className="twcp-stepper">
                    {STATUS_ORDER.map((status, idx) => {
                      const done = idx < activeStep
                      const current = idx === activeStep
                      return (
                        <div key={status} className={`twcp-step ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
                          <div className="twcp-step-dot">{done ? '✓' : String(idx + 1)}</div>
                          <div className="twcp-step-lab">{statusLabel[status]}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {isFullyResolvedView ? (
                <>
                  <div className="twcp-card" style={{ marginTop: 16 }}>
                    <div className="twcp-card-body">
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Resolution summary</div>
                      <p className="twcp-lead" style={{ color: '#2b3852' }}>
                        {ticket.description || 'Your complaint has been resolved by our service team and verified by the advisor.'}
                      </p>
                    </div>
                  </div>

                  {!ticket.csat_rating && (
                    <div className="twcp-card" style={{ marginTop: 16 }}>
                      <div className="twcp-card-body" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>How did we do?</div>
                        <p className="twcp-lead" style={{ marginBottom: 12 }}>Rate how we handled your complaint.</p>
                        <div className="twcp-stars">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              className={`twcp-star ${csatRating && csatRating >= n ? 'on' : ''}`}
                              onClick={() => setCsatRating(n)}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                        {csatRating != null && (
                          <div style={{ marginTop: 12 }}>
                            <textarea
                              className="twcp-inp"
                              rows={2}
                              placeholder="Anything else you'd like to tell us? (optional)"
                              value={csatComment}
                              onChange={(e) => setCsatComment(e.target.value)}
                            />
                            <button className="twcp-btn primary" style={{ marginTop: 10 }} onClick={handleSubmitCsat} disabled={loading}>
                              Submit rating
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {ticket.csat_rating && (
                    <div className="twcp-card" style={{ marginTop: 16 }}>
                      <div className="twcp-card-body" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Your rating</div>
                        <div style={{ fontSize: 30, color: '#f5a623' }}>{'★'.repeat(ticket.csat_rating)}{'☆'.repeat(5 - ticket.csat_rating)}</div>
                        {ticket.csat_comment && <p className="twcp-lead" style={{ marginTop: 8 }}>&quot;{ticket.csat_comment}&quot;</p>}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="twcp-card" style={{ marginTop: 16 }}>
                    <div className="twcp-card-body">
                      <div className="twcp-row" style={{ gap: 12 }}>
                        <div className="twcp-avatar">SA</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{ticket.assigned_to_name || 'Service Advisor'}</div>
                          <div className="twcp-lead" style={{ fontSize: 12.5 }}>Your service advisor · {ticket.branch || entry?.branch || '--'}</div>
                        </div>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <span className="twcp-sla">
                          <span className="twcp-ring" style={{ ['--p' as string]: String(sla.pct) }} />
                          <span className="twcp-sla-txt">
                            {sla.leftText}
                            <small>resolution SLA</small>
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 24 }}>
                    <div className="twcp-section-label" style={{ marginBottom: 10 }}>Conversation</div>
                    <div className="twcp-thread">
                      <div className="twcp-msg system"><div className="twcp-msg-body">- Complaint {ticket.ticket_number} raised via secure link -</div></div>
                      {(data.messages || []).map((msg) => (
                        <div key={msg.id.toString()} className={`twcp-msg ${msg.author_type === 'customer' ? 'me' : ''}`}>
                          <span className={`twcp-avatar ${msg.author_type === 'customer' ? 'me' : ''}`}>{msg.author_type === 'customer' ? 'YOU' : 'SA'}</span>
                          <div className="twcp-msg-body">
                            <div className="twcp-msg-name">{msg.author_name || (msg.author_type === 'customer' ? 'You' : 'Service Advisor')}</div>
                            <div className="twcp-msg-copy">{msg.body}</div>
                            <div className="twcp-msg-meta">{formatDateShort(msg.created_at)}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {ticket.status !== 'closed' && (
                      <form onSubmit={handleAddMessage} style={{ marginTop: 16 }}>
                        <textarea
                          className="twcp-inp"
                          rows={2}
                          maxLength={300}
                          placeholder="Reply to your advisor..."
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                        />
                        <button className="twcp-btn primary" style={{ marginTop: 10 }} disabled={loading || !newMessage.trim()}>
                          Send
                        </button>
                      </form>
                    )}
                  </div>
                </>
              )}

              {isResolvedState && (
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  {!showReopenForm ? (
                    <button
                      className="twcp-btn ghost"
                      onClick={() => setShowReopenForm(true)}
                    >
                      Issue not fixed? Reopen complaint
                    </button>
                  ) : (
                    <>
                      <textarea
                        className="twcp-inp"
                        rows={2}
                        value={reopenReason}
                        onChange={(e) => setReopenReason(e.target.value)}
                        placeholder="Tell us why you want to reopen"
                      />
                      <button
                        className="twcp-btn primary"
                        style={{ marginTop: 10 }}
                        onClick={handleReopen}
                        disabled={loading || reopenReason.trim().length < 8}
                      >
                        Confirm reopen
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ComplaintPortalPage
