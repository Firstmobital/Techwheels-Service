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

type PortalMode = 'verify' | 'raise' | 'submitted' | 'view'

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
  const [mode, setMode] = useState<PortalMode>('verify')
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
        setMode(response.mode === 'raise' ? 'verify' : 'view')
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
      setMode('submitted')
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
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-50">
      {/* Mobile-optimized container */}
      <div className="w-full max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        
        {/* Success/Error Alerts - Sticky top */}
        {success && (
          <div className="fixed top-0 left-0 right-0 mx-4 mt-4 max-w-2xl z-50">
            <SuccessAlert message={success} />
          </div>
        )}
        {error && (
          <div className="fixed top-0 left-0 right-0 mx-4 mt-4 max-w-2xl z-50">
            <ErrorAlert message={error} />
          </div>
        )}

        {/* Service Context Card - Prominent at top for mobile */}
        {data.entry_summary && (
          <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-4 mb-6 sticky top-4 z-40">
            <div className="flex items-center gap-3 mb-3">
              <div className="text-2xl">🛡️</div>
              <div className="flex-1">
                <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider">TechWheels Care</div>
                <div className="text-sm font-semibold text-gray-900">{data.entry_summary.reg_number}</div>
              </div>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              <span className="font-semibold">{data.entry_summary.model}</span> • {data.entry_summary.service_type}
            </p>
            {data.entry_summary.branch && (
              <p className="text-xs text-gray-500 mt-1">📍 {data.entry_summary.branch}</p>
            )}
          </div>
        )}

        {/* VERIFY SCREEN - Landing Page */}
        {mode === 'verify' && (
          <div className="space-y-6 pb-8">
            {/* Blue Header Section */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl text-white p-6 -mx-4 px-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="text-3xl">🛡️</div>
                <div>
                  <div className="text-sm font-semibold opacity-90">TechWheels Care</div>
                  <div className="text-2xl font-bold">Service Feedback</div>
                </div>
              </div>
              
              {/* Vehicle Info Card within header */}
              {data.entry_summary && (
                <div className="bg-white/10 backdrop-blur rounded-lg p-4 mt-4 border border-white/20">
                  <div className="text-sm font-semibold mb-2">{data.entry_summary.reg_number}</div>
                  <p className="text-sm opacity-95">
                    {data.entry_summary.model} • {data.entry_summary.service_type}
                  </p>
                </div>
              )}
            </div>

            {/* Main Content */}
            <div className="px-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
                Not happy with your service?
              </h1>
              <p className="text-gray-700 mb-6 leading-relaxed">
                We're sorry if your visit at <span className="font-semibold">{data.entry_summary?.branch}</span> didn't go as expected. Raise a complaint and our team will personally resolve it.
              </p>

              {/* Value Props */}
              <div className="space-y-3 mb-8">
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <span className="text-xl mt-0.5">🛡️</span>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">This link is unique to your vehicle visit</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <span className="text-xl mt-0.5">👤</span>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">Goes straight to your advisor</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <span className="text-xl mt-0.5">⏱️</span>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">Track the resolution live on this same link</div>
                  </div>
                </div>
              </div>

              {/* CTA Button */}
              <button
                onClick={() => setMode('raise')}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-4 px-6 rounded-lg shadow-md hover:shadow-lg transition-all min-h-12 text-base mb-3"
              >
                Raise a Complaint
              </button>

              <p className="text-xs text-gray-600 text-center">
                Just visiting? You can also view past requests here.
              </p>
            </div>
          </div>
        )}

        {/* RAISE SCREEN - Complaint Form */}
        {mode === 'raise' && (
          <form onSubmit={handleRaise} className="space-y-5 pb-8">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                Raise a Complaint
              </h1>
              <p className="text-gray-600 text-sm">
                Tell us what went wrong so we can fix it fast.
              </p>
            </div>

            {/* Category Selection - Visual grid */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                What went wrong? <span className="text-red-600">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {[
                  { value: 'service_quality', label: '🔧 Service Quality', desc: 'Issue not fixed' },
                  { value: 'billing', label: '💰 Billing', desc: 'Unexpected charges' },
                  { value: 'delivery_delay', label: '⏱️ Delivery Delay', desc: 'Late delivery' },
                  { value: 'staff_behaviour', label: '👤 Staff Behaviour', desc: 'Staff conduct' },
                  { value: 'parts_spares', label: '📦 Parts/Spares', desc: 'Wrong/missing' },
                  { value: 'damage_during_service', label: '⚠️ Damage', desc: 'New damage' },
                  { value: 'cleanliness', label: '🧹 Cleanliness', desc: 'Wash not done' },
                  { value: 'other', label: '📝 Other', desc: 'Something else' },
                ].map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setFormState({ ...formState, category: cat.value })}
                    className={`p-3 sm:p-4 rounded-lg border-2 transition-all text-left ${
                      formState.category === cat.value
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-sm sm:text-base text-gray-900 mb-1">
                      {cat.label}
                    </div>
                    <div className="text-xs text-gray-600">{cat.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Summary <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={formState.title}
                onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                required
                maxLength={100}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base sm:text-sm"
                placeholder="Brief summary of your complaint"
              />
              <p className="text-xs text-gray-500 mt-1">{formState.title.length}/100 characters</p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Details <span className="text-red-600">*</span>
              </label>
              <textarea
                value={formState.description}
                onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                required
                maxLength={500}
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base sm:text-sm"
                placeholder="Describe what happened and what you'd like us to do about it"
              />
              <p className="text-xs text-gray-500 mt-1">{formState.description.length}/500 characters</p>
            </div>

            {/* Optional Section */}
            <div className="border-t pt-4 mt-4">
              <details className="cursor-pointer">
                <summary className="text-sm font-semibold text-gray-700 hover:text-gray-900 flex items-center gap-2">
                  <span>+ Optional Details</span>
                </summary>
                <div className="space-y-3 mt-4">
                  {/* Severity */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      How urgent is this?
                    </label>
                    <div className="flex gap-2">
                      {[
                        { value: 'low', label: '😊 Low', desc: 'Can wait' },
                        { value: 'medium', label: '😐 Medium', desc: 'Soon' },
                        { value: 'high', label: '😟 High', desc: 'Urgent' },
                      ].map((sev) => (
                        <button
                          key={sev.value}
                          type="button"
                          onClick={() => setFormState({ ...formState, severitySelf: sev.value })}
                          className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm transition-all ${
                            formState.severitySelf === sev.value
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="font-semibold">{sev.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Customer Name */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Your Name
                    </label>
                    <input
                      type="text"
                      value={formState.customerName}
                      onChange={(e) => setFormState({ ...formState, customerName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="Optional"
                    />
                  </div>

                  {/* Customer Phone */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Your Phone
                    </label>
                    <input
                      type="tel"
                      value={formState.customerPhone}
                      onChange={(e) => setFormState({ ...formState, customerPhone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="10-digit number (optional)"
                    />
                  </div>
                </div>
              </details>
            </div>

            {/* Submit Button - Large, touch-friendly */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-400 text-white font-semibold py-4 px-6 rounded-lg transition-all shadow-md hover:shadow-lg min-h-12 flex items-center justify-center gap-2 text-base"
            >
              {loading ? '⏳ Submitting...' : '✓ Submit Complaint'}
            </button>

            <p className="text-xs text-gray-600 text-center">
              ✓ Your complaint goes directly to your service advisor
            </p>
          </form>
        )}

        {/* SUBMITTED SCREEN - Confirmation */}
        {mode === 'submitted' && data.ticket && (
          <div className="space-y-6 pb-8">
            {/* Success Icon */}
            <div className="flex justify-center mb-4">
              <div className="bg-emerald-100 rounded-full p-6 flex items-center justify-center">
                <span className="text-5xl">✓</span>
              </div>
            </div>

            {/* Heading */}
            <div className="text-center">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Complaint Received</h1>
              <p className="text-gray-600 text-sm">
                Thank you. Your complaint is logged and assigned to your advisor.
              </p>
            </div>

            {/* Details Card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
              <div className="flex justify-between items-start border-b pb-4">
                <span className="text-gray-600 font-semibold text-sm">Complaint No.</span>
                <span className="text-lg font-bold text-blue-600 text-right">{data.ticket.ticket_number}</span>
              </div>
              
              <div className="flex justify-between items-start border-b pb-4">
                <span className="text-gray-600 font-semibold text-sm">Assigned To</span>
                <span className="text-gray-900 font-semibold text-sm">{data.ticket.assigned_to_name || 'Support Team'}</span>
              </div>
              
              <div className="flex justify-between items-start border-b pb-4">
                <span className="text-gray-600 font-semibold text-sm">First Response</span>
                <span className="text-emerald-600 font-semibold text-sm">Within 4 hours</span>
              </div>
              
              <div className="flex justify-between items-start">
                <span className="text-gray-600 font-semibold text-sm">Target Resolution</span>
                <span className="text-gray-900 font-semibold text-sm">Within 24 hours</span>
              </div>
            </div>

            {/* Bookmark Note */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">🛡️</span>
              <div>
                <div className="font-semibold text-gray-900 text-sm mb-1">Bookmark this page</div>
                <p className="text-gray-700 text-xs">
                  This same link now shows your complaint's live status. We've also texted it to {data.ticket.customer_phone || 'your phone'}.
                </p>
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={() => setMode('view')}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-4 px-6 rounded-lg shadow-md hover:shadow-lg transition-all min-h-12 text-base"
            >
              Track My Complaint
            </button>
          </div>
        )}

        {/* TRACKING SCREEN - Live View */}
        {mode === 'view' && data.ticket && (
          <div className="space-y-5 pb-8">
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
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">📋</span>
                  <h3 className="font-semibold text-gray-900">Resolution Status</h3>
                </div>
                <div className="mb-3">
                  <SLAStatusBadge status={data.ticket.sla_status} />
                </div>
                <div className="space-y-1 text-sm">
                  {data.ticket.response_due_at && (
                    <p className="text-gray-600">
                      <span className="font-semibold">Response by:</span> {new Date(data.ticket.response_due_at).toLocaleDateString()}
                    </p>
                  )}
                  {data.ticket.resolution_due_at && (
                    <p className="text-gray-600">
                      <span className="font-semibold">Resolution by:</span> {new Date(data.ticket.resolution_due_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Ticket Details */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">📝</span>
                <h3 className="font-semibold text-gray-900">Your Complaint</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-600 font-semibold">{data.ticket.title}</span>
                </div>
                <p className="text-gray-700 leading-relaxed">{data.ticket.description}</p>
                <div className="flex items-center gap-2 pt-2 border-t">
                  <span className="text-lg">👤</span>
                  <span className="text-gray-600">
                    Assigned to <span className="font-semibold">{data.ticket.assigned_to_name || 'Support team'}</span>
                  </span>
                </div>
                {data.ticket.is_escalated && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2">
                    <p className="text-red-700 font-semibold">🚨 Escalated</p>
                    <p className="text-red-600 text-sm mt-1">{data.ticket.escalation_reason}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            {data.messages && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">💬</span>
                  <h3 className="font-semibold text-gray-900">Conversation</h3>
                </div>
                {data.messages.length === 0 ? (
                  <p className="text-sm text-gray-600 py-4">
                    No messages yet. Your advisor will respond here.
                  </p>
                ) : (
                  <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                    {data.messages.map((msg) => (
                      <MessageBubble
                        key={msg.id.toString()}
                        author={msg.author_name || 'Support'}
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
                      placeholder="Send a message..."
                      maxLength={300}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-500">{newMessage.length}/300</span>
                      <button
                        type="submit"
                        disabled={loading || !newMessage.trim()}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
                      >
                        Send
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* CSAT Rating */}
            {(data.ticket.status === 'resolved' || data.ticket.status === 'closed') && !data.ticket.csat_rating && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">⭐</span>
                  <h3 className="font-semibold text-gray-900">How was your experience?</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-700 mb-2">Would you like to rate your service?</p>
                    <div className="flex justify-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setCsatRating(star)}
                          className={`text-3xl transition transform ${
                            csatRating && csatRating >= star
                              ? 'text-yellow-400 scale-110'
                              : 'text-gray-300 hover:scale-105'
                          }`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={csatComment}
                    onChange={(e) => setCsatComment(e.target.value)}
                    placeholder="Optional: Share your feedback"
                    maxLength={200}
                    rows={2}
                    className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  />
                  <button
                    onClick={handleSubmitCsat}
                    disabled={loading || csatRating === null}
                    className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
                  >
                    Submit Rating
                  </button>
                </div>
              </div>
            )}

            {/* CSAT Display */}
            {data.ticket.csat_rating && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="font-semibold text-emerald-900 mb-2">Your Rating</p>
                <p className="text-4xl mb-2">{'★'.repeat(data.ticket.csat_rating)}{'☆'.repeat(5 - data.ticket.csat_rating)}</p>
                {data.ticket.csat_comment && (
                  <p className="text-sm text-emerald-700">"{data.ticket.csat_comment}"</p>
                )}
              </div>
            )}

            {/* Reopen Button */}
            {(data.ticket.status === 'resolved' || data.ticket.status === 'closed') &&
              !reopenReason && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🔄</span>
                    <h3 className="font-semibold text-gray-900">Not fully resolved?</h3>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">
                    You can reopen this complaint if the issue persists.
                  </p>
                  <form onSubmit={handleReopen}>
                    <textarea
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      placeholder="Why are you reopening this complaint?"
                      maxLength={300}
                      rows={3}
                      className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm mb-2"
                    />
                    <button
                      type="submit"
                      disabled={loading || !reopenReason.trim()}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
                    >
                      Reopen Complaint
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
