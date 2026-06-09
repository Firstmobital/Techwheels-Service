// ============================================================================
// COMPLAINTS — STAFF MODULE (AUTHENTICATED DASHBOARD)
// ============================================================================
// Path: /complaints
// Staff view with inbox, filters, quick actions, detail modal
// ============================================================================

import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  acknowledge,
  startProgress,
  resolve,
  close,
  escalate,
  addStaffMessage,
} from '../lib/api/complaints'
import {
  StatusBadge,
  PriorityBadge,
  TicketHeaderCard,
  LoadingSpinner,
  ErrorAlert,
  SuccessAlert,
} from '../components/complaints/UI'
import type { ComplaintTicket, ComplaintMessage, ComplaintStatus, ComplaintPriority } from '../components/complaints/types'

interface FilterState {
  status: ComplaintStatus | 'all'
  priority: ComplaintPriority | 'all'
  search: string
}

interface DetailModalState {
  open: boolean
  ticketId: bigint | null
}

export const ComplaintsPage: React.FC = () => {
  const [tickets, setTickets] = useState<ComplaintTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({ status: 'all', priority: 'all', search: '' })
  const [detailModal, setDetailModal] = useState<DetailModalState>({ open: false, ticketId: null })
  const [selectedTicket, setSelectedTicket] = useState<ComplaintTicket | null>(null)
  const [ticketMessages, setTicketMessages] = useState<ComplaintMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const clearFeedback = () => {
    setError(null)
    setSuccess(null)
  }

  useEffect(() => {
    if (!success) return
    const timeout = window.setTimeout(() => setSuccess(null), 3500)
    return () => window.clearTimeout(timeout)
  }, [success])

  // ── Load complaints ──────────────────────────────────────────────────────
  useEffect(() => {
    const loadComplaints = async () => {
      try {
        const { data, error: err } = await supabase
          .from('complaint_tickets')
          .select('*')
          .order('created_at', { ascending: false })

        if (err) throw err
        setTickets((data || []) as ComplaintTicket[])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load complaints')
      } finally {
        setLoading(false)
      }
    }

    loadComplaints()
  }, [])

  // ── Load ticket details & messages ───────────────────────────────────────
  const loadTicketDetails = async (ticketId: bigint) => {
    try {
      // Fetch ticket
      const { data: ticketData, error: ticketErr } = await supabase
        .from('complaint_tickets')
        .select('*')
        .eq('id', ticketId)
        .single()

      if (ticketErr) throw ticketErr

      setSelectedTicket(ticketData as ComplaintTicket)

      // Fetch messages
      const { data: messagesData, error: messagesErr } = await supabase
        .from('complaint_messages')
        .select('*')
        .eq('complaint_id', ticketId)
        .order('created_at', { ascending: true })

      if (messagesErr) throw messagesErr
      setTicketMessages((messagesData || []) as ComplaintMessage[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket details')
    }
  }

  // ── Open detail modal ────────────────────────────────────────────────────
  const openDetailModal = (ticketId: bigint) => {
    loadTicketDetails(ticketId)
    setDetailModal({ open: true, ticketId })
  }

  // ── Status update actions ────────────────────────────────────────────────
  const handleStatusChange = async (newStatus: ComplaintStatus) => {
    if (!selectedTicket) return

    try {
      clearFeedback()
      setActionLoading(true)
      switch (newStatus) {
        case 'acknowledged':
          await acknowledge(selectedTicket.id)
          break
        case 'in_progress':
          await startProgress(selectedTicket.id)
          break
        case 'resolved':
          await resolve(selectedTicket.id)
          break
        case 'closed':
          await close(selectedTicket.id)
          break
        default:
          return
      }

      setSelectedTicket({ ...selectedTicket, status: newStatus })
      setTickets(
        tickets.map((t) =>
          t.id === selectedTicket.id ? { ...t, status: newStatus } : t
        )
      )
      setSuccess(`Status changed to ${newStatus}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setActionLoading(false)
    }
  }

  const handleEscalate = async () => {
    if (!selectedTicket) return

    try {
      clearFeedback()
      setActionLoading(true)
      await escalate(selectedTicket.id, 'Manual escalation by staff')
      setSelectedTicket({ ...selectedTicket, is_escalated: true })
      setTickets(
        tickets.map((t) =>
          t.id === selectedTicket.id ? { ...t, is_escalated: true } : t,
        ),
      )
      setSuccess('Complaint escalated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to escalate complaint')
    } finally {
      setActionLoading(false)
    }
  }

  // ── Add staff message ────────────────────────────────────────────────────
  const handleAddMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedMessage = newMessage.trim()
    if (!selectedTicket || !trimmedMessage) return

    if (trimmedMessage.length < 2) {
      setError('Message should be at least 2 characters.')
      return
    }

    try {
      clearFeedback()
      setActionLoading(true)
      await addStaffMessage(selectedTicket.id, trimmedMessage, isInternal)
      setNewMessage('')
      setIsInternal(false)
      await loadTicketDetails(selectedTicket.id)
      setSuccess('Message added!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add message')
    } finally {
      setActionLoading(false)
    }
  }

  // ── Filter tickets ───────────────────────────────────────────────────────
  const filteredTickets = tickets.filter((ticket) => {
    if (filters.status !== 'all' && ticket.status !== filters.status) return false
    if (filters.priority !== 'all' && ticket.priority !== filters.priority) return false
    if (filters.search && !ticket.ticket_number.toLowerCase().includes(filters.search.toLowerCase())) {
      return false
    }
    return true
  })

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading && tickets.length === 0) return <LoadingSpinner />

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Complaints</h1>
          <p className="text-gray-600 mt-2">Manage customer complaints and tickets</p>
        </div>

        {/* Alerts */}
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

        {/* Filters */}
        <div className="bg-white border rounded-lg p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as ComplaintStatus | 'all' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
                <option value="reopened">Reopened</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Priority
              </label>
              <select
                value={filters.priority}
                onChange={(e) => setFilters({ ...filters, priority: e.target.value as ComplaintPriority | 'all' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Search
              </label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Search by ticket number..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Tickets List */}
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          {filteredTickets.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-600">No complaints match the current filters.</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.id.toString()}
                  onClick={() => openDetailModal(ticket.id)}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{ticket.ticket_number}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {ticket.reg_number} • {ticket.title}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <StatusBadge status={ticket.status as ComplaintStatus} />
                        <PriorityBadge priority={ticket.priority as ComplaintPriority} />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        {new Date(ticket.created_at).toLocaleDateString()}
                      </p>
                      {ticket.is_escalated && (
                        <p className="text-xs text-red-600 font-semibold mt-1">🚨 Escalated</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {detailModal.open && selectedTicket && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b px-5 py-4 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">{selectedTicket.ticket_number}</h2>
                <button
                  onClick={() => setDetailModal({ open: false, ticketId: null })}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 text-xl"
                  aria-label="Close details"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 space-y-5">
                {/* Ticket Header */}
                <TicketHeaderCard
                  ticketNumber={selectedTicket.ticket_number}
                  status={selectedTicket.status as ComplaintStatus}
                  priority={selectedTicket.priority as ComplaintPriority}
                  category={selectedTicket.category}
                  regNumber={selectedTicket.reg_number}
                  model={selectedTicket.model}
                />

                {/* Quick Actions */}
                <div className="bg-gray-50 border rounded p-3">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Ticket Actions</p>
                  <p className="text-xs text-gray-500 mb-2">Current status: {selectedTicket.status.replace('_', ' ')}</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedTicket.status === 'new' && (
                      <button
                        onClick={() => handleStatusChange('acknowledged')}
                        disabled={actionLoading}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                      >
                        Acknowledge
                      </button>
                    )}
                    {selectedTicket.status === 'acknowledged' && (
                      <button
                        onClick={() => handleStatusChange('in_progress')}
                        disabled={actionLoading}
                        className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded text-sm"
                      >
                        Mark In Progress
                      </button>
                    )}
                    {selectedTicket.status === 'in_progress' && (
                      <button
                        onClick={() => handleStatusChange('resolved')}
                        disabled={actionLoading}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded text-sm"
                      >
                        Mark Resolved
                      </button>
                    )}
                    {selectedTicket.status === 'resolved' && (
                      <button
                        onClick={() => handleStatusChange('closed')}
                        disabled={actionLoading}
                        className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
                      >
                        Close Ticket
                      </button>
                    )}
                    {!selectedTicket.is_escalated && (
                      <button
                        onClick={handleEscalate}
                        disabled={actionLoading}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                      >
                        {actionLoading ? 'Escalating...' : 'Escalate Ticket'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="text-sm space-y-2">
                  <p>
                    <span className="text-gray-600">Complaint description:</span> {selectedTicket.description || 'No description provided'}
                  </p>
                  <p>
                    <span className="text-gray-600">Assigned staff:</span> {selectedTicket.assigned_to ? selectedTicket.assigned_to : 'Unassigned'}
                  </p>
                  {selectedTicket.is_escalated && (
                    <p className="text-red-600">
                      <span className="font-semibold">Escalation reason:</span> {selectedTicket.escalation_reason}
                    </p>
                  )}
                </div>

                {/* Messages */}
                <div className="border-t pt-3">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Conversation (staff view)</p>
                  {ticketMessages.length === 0 ? (
                    <p className="text-xs text-gray-500">No messages yet.</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto space-y-2">
                      {ticketMessages.map((msg) => (
                        <div key={msg.id.toString()} className="text-xs bg-gray-50 p-2 rounded">
                          <p className="font-semibold">{msg.author_name || 'Unknown'}</p>
                          <p className="text-gray-600">{msg.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add Message */}
                {selectedTicket.status !== 'closed' && (
                  <form onSubmit={handleAddMessage} className="border-t pt-3">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                        className="mt-2"
                      />
                      <label className="text-xs text-gray-600">Internal note (not visible to customer)</label>
                    </div>
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Add staff reply or internal note..."
                      rows={2}
                      className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={actionLoading || !newMessage.trim()}
                      className="mt-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-1 px-3 rounded text-sm transition"
                    >
                      {actionLoading ? 'Sending...' : 'Send'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ComplaintsPage
