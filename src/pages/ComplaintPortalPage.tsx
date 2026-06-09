// ============================================================================
// COMPLAINTS — CUSTOMER PORTAL (PUBLIC LINK)
// ============================================================================
// Path: /c/:token
// No authentication required; uses SECURITY DEFINER RPCs
// ============================================================================

import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getComplaintByToken,
  raiseComplaint,
  addCustomerMessage,
  submitCsat,
  reopenComplaint,
} from '../lib/api/complaints'
import {
  SLAStatusBadge,
  MessageBubble,
  TicketHeaderCard,
  LoadingSpinner,
  ErrorAlert,
  SuccessAlert,
} from '../components/complaints/UI'
import type { ComplaintPortalResponse, ComplaintStatus } from '../components/complaints/types'

type PortalMode = 'raise' | 'view'

interface FormState {
  category: string
  title: string
  description: string
  severitySelf: string
  customerName: string
  customerPhone: string
}

export const ComplaintPortalPage: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [data, setData] = useState<ComplaintPortalResponse | null>(null)
  const [mode, setMode] = useState<PortalMode>('raise')
  const [formState, setFormState] = useState<FormState>({
    category: 'service_quality',
    title: '',
    description: '',
    severitySelf: 'medium',
    customerName: '',
    customerPhone: '',
  })
  const [newMessage, setNewMessage] = useState('')
  const [csatRating, setCsatRating] = useState<number | null>(null)
  const [csatComment, setCsatComment] = useState('')
  const [reopenReason, setReopenReason] = useState('')

  const clearFeedback = () => {
    setError(null)
    setSuccess(null)
  }

  useEffect(() => {
    if (!success) return
    const timeout = window.setTimeout(() => setSuccess(null), 3500)
    return () => window.clearTimeout(timeout)
  }, [success])

  // ── Load complaint data ──────────────────────────────────────────────────
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
        setMode(response.mode)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load complaint')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [token])

  // ── Raise complaint ──────────────────────────────────────────────────────
  const handleRaise = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    const trimmedTitle = formState.title.trim()
    const trimmedDescription = formState.description.trim()
    const trimmedPhone = formState.customerPhone.trim()

    if (trimmedTitle.length < 5) {
      setError('Title should be at least 5 characters.')
      return
    }

    if (trimmedDescription.length < 10) {
      setError('Description should be at least 10 characters.')
      return
    }

    if (trimmedPhone && !/^\d{10}$/.test(trimmedPhone)) {
      setError('Phone must be exactly 10 digits when provided.')
      return
    }

    try {
      clearFeedback()
      setLoading(true)
      const response = await raiseComplaint(token, formState.category, trimmedTitle, trimmedDescription, {
        severity_self: formState.severitySelf || undefined,
        customer_name: formState.customerName.trim() || undefined,
        customer_phone: trimmedPhone || undefined,
      })
      setData(response)
      setMode('view')
      setSuccess('Complaint raised successfully!')
      setFormState({ category: 'service_quality', title: '', description: '', severitySelf: 'medium', customerName: '', customerPhone: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to raise complaint')
    } finally {
      setLoading(false)
    }
  }

  // ── Add customer message ─────────────────────────────────────────────────
  const handleAddMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedMessage = newMessage.trim()
    if (!token || !trimmedMessage) return

    if (trimmedMessage.length < 2) {
      setError('Message should be at least 2 characters.')
      return
    }

    try {
      clearFeedback()
      setLoading(true)
      const response = await addCustomerMessage(token, trimmedMessage)
      setData(response)
      setNewMessage('')
      setSuccess('Message added!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add message')
    } finally {
      setLoading(false)
    }
  }

  // ── Submit CSAT ──────────────────────────────────────────────────────────
  const handleSubmitCsat = async () => {
    if (!token || csatRating === null) return

    if (csatRating < 1 || csatRating > 5) {
      setError('Please select a valid rating between 1 and 5.')
      return
    }

    try {
      clearFeedback()
      setLoading(true)
      const response = await submitCsat(token, csatRating, csatComment.trim() || undefined)
      setData(response)
      setSuccess('Thank you for your rating!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit rating')
    } finally {
      setLoading(false)
    }
  }

  // ── Reopen complaint ─────────────────────────────────────────────────────
  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedReason = reopenReason.trim()
    if (!token || !trimmedReason) return

    if (trimmedReason.length < 8) {
      setError('Please provide at least 8 characters for reopen reason.')
      return
    }

    try {
      clearFeedback()
      setLoading(true)
      const response = await reopenComplaint(token, trimmedReason)
      setData(response)
      setReopenReason('')
      setSuccess('Complaint reopened and escalated!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen complaint')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading && !data) return <LoadingSpinner />

  if (error && !data) return <ErrorAlert message={error} />

  if (!data) return <ErrorAlert message="No data loaded" />

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Complaint Portal</h1>
          <p className="text-gray-600 mt-2">Track and manage your service complaint</p>
        </div>

        {/* Success/Error Alerts */}
        {success && (
          <>
            <SuccessAlert message={success} />
            <button
              onClick={() => setSuccess(null)}
              className="mt-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Dismiss
            </button>
          </>
        )}
        {error && (
          <>
            <ErrorAlert message={error} />
            <button
              onClick={() => setError(null)}
              className="mt-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Dismiss
            </button>
          </>
        )}

        {/* Entry Summary */}
        {data.entry_summary && (
          <div className="bg-white border rounded-lg p-4 mb-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-2">Service Visit</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Registration:</span>
                <p className="font-semibold">{data.entry_summary.reg_number}</p>
              </div>
              <div>
                <span className="text-gray-600">Model:</span>
                <p className="font-semibold">{data.entry_summary.model || 'N/A'}</p>
              </div>
              <div>
                <span className="text-gray-600">Branch:</span>
                <p className="font-semibold">{data.entry_summary.branch || 'N/A'}</p>
              </div>
              <div>
                <span className="text-gray-600">Service Type:</span>
                <p className="font-semibold">{data.entry_summary.service_type || 'N/A'}</p>
              </div>
            </div>
          </div>
        )}

        {/* RAISE MODE */}
        {mode === 'raise' && (
          <form
            onSubmit={handleRaise}
            className="bg-white border rounded-lg p-6 shadow-sm"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-4">Raise a Complaint</h2>

            <div className="space-y-4">
              {/* Category */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Category <span className="text-red-600">*</span>
                </label>
                <select
                  value={formState.category}
                  onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="service_quality">Service Quality</option>
                  <option value="billing">Billing</option>
                  <option value="delivery_delay">Delivery Delay</option>
                  <option value="staff_behaviour">Staff Behaviour</option>
                  <option value="parts_spares">Parts/Spares</option>
                  <option value="damage_during_service">Damage During Service</option>
                  <option value="cleanliness">Cleanliness</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Title <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={formState.title}
                  onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief summary of complaint"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Description <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={formState.description}
                  onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                  required
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe your complaint in detail"
                />
              </div>

              {/* Severity */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Severity
                </label>
                <select
                  value={formState.severitySelf}
                  onChange={(e) => setFormState({ ...formState, severitySelf: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Not specified</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Customer Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  value={formState.customerName}
                  onChange={(e) => setFormState({ ...formState, customerName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional"
                />
              </div>

              {/* Customer Phone */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Your Phone
                </label>
                <input
                  type="tel"
                  value={formState.customerPhone}
                  onChange={(e) => setFormState({ ...formState, customerPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="10-digit phone number (optional)"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition"
              >
                {loading ? 'Submitting...' : 'Submit Complaint'}
              </button>
            </div>
          </form>
        )}

        {/* VIEW MODE */}
        {mode === 'view' && data.ticket && (
          <div className="space-y-6">
            {/* Ticket Header */}
            <TicketHeaderCard
              ticketNumber={data.ticket.ticket_number}
              status={data.ticket.status as ComplaintStatus}
              priority={data.ticket.priority}
              category={data.ticket.category}
              regNumber={data.ticket.reg_number}
              model={data.ticket.model}
            />

            {/* SLA Status */}
            {data.ticket.sla_status && (
              <div className="bg-white border rounded-lg p-4 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-2">Resolution Status</h3>
                <SLAStatusBadge status={data.ticket.sla_status} />
                {data.ticket.response_due_at && (
                  <p className="text-sm text-gray-600 mt-2">
                    Expected response by: {new Date(data.ticket.response_due_at).toLocaleString()}
                  </p>
                )}
                {data.ticket.resolution_due_at && (
                  <p className="text-sm text-gray-600">
                    Expected resolution by: {new Date(data.ticket.resolution_due_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {/* Ticket Details */}
            <div className="bg-white border rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-2">Complaint Details</h3>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-gray-600">Title:</span> <span className="font-semibold">{data.ticket.title}</span>
                </p>
                <p>
                  <span className="text-gray-600">Description:</span> <span>{data.ticket.description}</span>
                </p>
                <p>
                  <span className="text-gray-600">Assigned to:</span> <span className="font-semibold">{data.ticket.assigned_to_name || 'Unassigned'}</span>
                </p>
                {data.ticket.is_escalated && (
                  <p className="text-red-600 font-semibold">🚨 Escalated: {data.ticket.escalation_reason}</p>
                )}
              </div>
            </div>

            {/* Messages */}
            {data.messages && (
              <div className="bg-white border rounded-lg p-4 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">Conversation</h3>
                {data.messages.length === 0 ? (
                  <p className="text-sm text-gray-500 mb-4">No messages yet. Start the conversation below.</p>
                ) : (
                  <div className="max-h-96 overflow-y-auto mb-4">
                    {data.messages.map((msg) => (
                      <MessageBubble
                        key={msg.id.toString()}
                        author={msg.author_name || 'Support Team'}
                        body={msg.body}
                        timestamp={msg.created_at}
                        isCustomer={msg.author_type === 'customer'}
                      />
                    ))}
                  </div>
                )}

                {/* Add Message Form */}
                {data.ticket.status !== 'closed' && (
                  <form onSubmit={handleAddMessage} className="border-t pt-4">
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Add a message..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={loading || !newMessage.trim()}
                      className="mt-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition"
                    >
                      {loading ? 'Sending...' : 'Send'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* CSAT Rating */}
            {(data.ticket.status === 'resolved' || data.ticket.status === 'closed') && !data.ticket.csat_rating && (
              <div className="bg-white border rounded-lg p-4 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-3">How was your experience?</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Rate your satisfaction (1-5 stars)
                    </label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setCsatRating(star)}
                          className={`text-2xl transition ${
                            csatRating === star ? 'scale-125' : ''
                          } ${csatRating === star || csatRating === null ? 'text-yellow-400' : 'text-gray-300'}`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={csatComment}
                    onChange={(e) => setCsatComment(e.target.value)}
                    placeholder="Additional comments (optional)"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <button
                    onClick={handleSubmitCsat}
                    disabled={loading || csatRating === null}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition"
                  >
                    {loading ? 'Submitting...' : 'Submit Rating'}
                  </button>
                </div>
              </div>
            )}

            {/* CSAT Display */}
            {data.ticket.csat_rating && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <h3 className="font-semibold text-emerald-900 mb-2">Your Rating</h3>
                <p className="text-2xl">{'★'.repeat(data.ticket.csat_rating)}{'☆'.repeat(5 - data.ticket.csat_rating)}</p>
                {data.ticket.csat_comment && (
                  <p className="text-sm text-emerald-700 mt-2">{data.ticket.csat_comment}</p>
                )}
              </div>
            )}

            {/* Reopen Button */}
            {(data.ticket.status === 'resolved' || data.ticket.status === 'closed') &&
              !reopenReason && (
                <div className="bg-white border rounded-lg p-4 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3">Not satisfied?</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    You can reopen this complaint if the issue isn't fully resolved.
                  </p>
                  <form onSubmit={handleReopen}>
                    <textarea
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      placeholder="Tell us why you're reopening this complaint..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={loading || !reopenReason.trim()}
                      className="mt-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition"
                    >
                      {loading ? 'Reopening...' : 'Reopen Complaint'}
                    </button>
                  </form>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ComplaintPortalPage
