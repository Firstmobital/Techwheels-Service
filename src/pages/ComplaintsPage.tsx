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
  reassign,
  setPriority,
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
  const [currentTab, setCurrentTab] = useState<'inbox' | 'board' | 'sla'>('inbox')
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
  const [staffList, setStaffList] = useState<Array<{ id: string; full_name: string }>>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [canModifyComplaints, setCanModifyComplaints] = useState(false)

  const clearFeedback = () => {
    setError(null)
    setSuccess(null)
  }

  useEffect(() => {
    if (!success) return
    const timeout = window.setTimeout(() => setSuccess(null), 3500)
    return () => window.clearTimeout(timeout)
  }, [success])

  // ── Resolve complaints modify permission ───────────────────────────────
  useEffect(() => {
    const resolvePermissions = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const userId = sessionData.session?.user?.id
        if (!userId) {
          setCanModifyComplaints(false)
          return
        }

        const [{ data: profile }, { data: permissionRows }] = await Promise.all([
          supabase.from('users').select('role, is_active').eq('id', userId).maybeSingle(),
          supabase.rpc('get_all_my_permissions'),
        ])

        const role = String((profile as { role?: string | null } | null)?.role ?? '').trim().toLowerCase()
        const isActive = (profile as { is_active?: boolean | null } | null)?.is_active === true
        const isAdminLike = (role === 'admin' || role === 'super_admin') && isActive

        type PermissionRow = {
          module_name?: string | null
          can_modify?: boolean | null
        }

        const permissions = (permissionRows ?? []) as PermissionRow[]
        const hasComplaintsModify = permissions.some(
          (row) => String(row.module_name ?? '').trim().toLowerCase() === 'complaints' && row.can_modify === true,
        )

        setCanModifyComplaints(isAdminLike || hasComplaintsModify)
      } catch {
        setCanModifyComplaints(false)
      }
    }

    resolvePermissions()
  }, [])

  // ── Load staff list ─────────────────────────────────────────────────────
  useEffect(() => {
    const loadStaff = async () => {
      try {
        const { data, error: err } = await supabase
          .from('users')
          .select('id, full_name')
          .eq('is_active', true)
          .order('full_name')

        if (err) throw err
        setStaffList((data || []) as Array<{ id: string; full_name: string }>)
      } catch (err) {
        console.error('Failed to load staff list:', err)
      }
    }

    loadStaff()
  }, [])

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

  const handleReassign = async () => {
    if (!selectedTicket || !selectedStaffId) return

    try {
      clearFeedback()
      setActionLoading(true)
      await reassign(selectedTicket.id, selectedStaffId)
      const staffMember = staffList.find(s => s.id === selectedStaffId)
      setSelectedTicket({ ...selectedTicket, assigned_to: selectedStaffId })
      setTickets(
        tickets.map((t) =>
          t.id === selectedTicket.id ? { ...t, assigned_to: selectedStaffId } : t,
        ),
      )
      setSuccess(`Reassigned to ${staffMember?.full_name || 'staff member'}`)
      setSelectedStaffId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reassign complaint')
    } finally {
      setActionLoading(false)
    }
  }

  const handleChangePriority = async (newPriority: ComplaintPriority) => {
    if (!selectedTicket) return

    try {
      clearFeedback()
      setActionLoading(true)
      await setPriority(selectedTicket.id, newPriority)
      setSelectedTicket({ ...selectedTicket, priority: newPriority })
      setTickets(
        tickets.map((t) =>
          t.id === selectedTicket.id ? { ...t, priority: newPriority } : t,
        ),
      )
      setSuccess(`Priority changed to ${newPriority}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change priority')
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

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200">
          <div className="flex gap-4">
            <button
              onClick={() => setCurrentTab('inbox')}
              className={`px-4 py-3 font-semibold border-b-2 transition ${
                currentTab === 'inbox'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Inbox
            </button>
            <button
              onClick={() => setCurrentTab('board')}
              className={`px-4 py-3 font-semibold border-b-2 transition ${
                currentTab === 'board'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setCurrentTab('sla')}
              className={`px-4 py-3 font-semibold border-b-2 transition ${
                currentTab === 'sla'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              SLA Breaches
            </button>
          </div>
        </div>

        {/* INBOX TAB */}
        {currentTab === 'inbox' && (
          <>
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
          </>
        )}

        {/* BOARD TAB */}
        {currentTab === 'board' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {(['new', 'acknowledged', 'in_progress', 'resolved', 'closed'] as const).map((status) => {
              const statusTickets = tickets.filter((t) => t.status === status)
              const columnTitles: Record<string, string> = {
                new: 'New',
                acknowledged: 'Acknowledged',
                in_progress: 'In Progress',
                resolved: 'Resolved',
                closed: 'Closed',
              }

              return (
                <div key={status} className="bg-white border rounded-lg p-4 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3">
                    {columnTitles[status]}
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">{statusTickets.length} tickets</p>
                  <div className="space-y-2">
                    {statusTickets.map((ticket) => (
                      <div
                        key={ticket.id.toString()}
                        onClick={() => openDetailModal(ticket.id)}
                        className="p-3 bg-gray-50 hover:bg-gray-100 border rounded cursor-pointer transition"
                      >
                        <p className="font-semibold text-sm text-gray-900">
                          {ticket.ticket_number}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">{ticket.reg_number}</p>
                        <div className="flex gap-1 mt-2">
                          <PriorityBadge priority={ticket.priority as ComplaintPriority} />
                        </div>
                        {ticket.is_escalated && (
                          <p className="text-xs text-red-600 font-semibold mt-2">🚨 Escalated</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* SLA BREACHES TAB */}
        {currentTab === 'sla' && (
          <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
            {(() => {
              const slaBreaches = tickets.filter(
                (t) =>
                  (t.response_breached || t.resolution_breached) &&
                  !['closed', 'resolved'].includes(t.status)
              )

              if (slaBreaches.length === 0) {
                return (
                  <div className="p-8 text-center">
                    <p className="text-gray-600">✓ No SLA breaches! All tickets are on track.</p>
                  </div>
                )
              }

              return (
                <div className="divide-y">
                  {slaBreaches.map((ticket) => (
                    <div
                      key={ticket.id.toString()}
                      onClick={() => openDetailModal(ticket.id)}
                      className="p-4 hover:bg-red-50 cursor-pointer transition border-l-4 border-l-red-500"
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
                          <div className="mt-2">
                            {ticket.response_breached && (
                              <p className="text-xs text-red-600 font-semibold">
                                ⚠️ Response SLA breached
                              </p>
                            )}
                            {ticket.resolution_breached && (
                              <p className="text-xs text-red-600 font-semibold">
                                ⚠️ Resolution SLA breached
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">
                            {new Date(ticket.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}

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

                {canModifyComplaints ? (
                  <>
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

                    {/* Priority & Reassignment */}
                    <div className="bg-gray-50 border rounded p-3">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Settings</p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Priority</label>
                          <select
                            value={selectedTicket.priority}
                            onChange={(e) => handleChangePriority(e.target.value as ComplaintPriority)}
                            disabled={actionLoading}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Assign to Staff</label>
                          <div className="flex gap-2">
                            <select
                              value={selectedStaffId || ''}
                              onChange={(e) => setSelectedStaffId(e.target.value)}
                              disabled={actionLoading}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">Select staff member...</option>
                              {staffList.map((staff) => (
                                <option key={staff.id} value={staff.id}>
                                  {staff.full_name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={handleReassign}
                              disabled={actionLoading || !selectedStaffId}
                              className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-3 py-2 rounded text-sm font-semibold transition"
                            >
                              {actionLoading ? 'Assigning...' : 'Assign'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3">
                    <p className="text-sm text-blue-800">
                      You have view access only. Ticket actions are hidden because complaints modify permission is not granted.
                    </p>
                  </div>
                )}

                {/* Details */}
                <div className="text-sm space-y-2">
                  <p>
                    <span className="text-gray-600">Complaint description:</span> {selectedTicket.description || 'No description provided'}
                  </p>
                  <p>
                    <span className="text-gray-600">Assigned staff:</span> {selectedTicket.assigned_to ? staffList.find(s => s.id === selectedTicket.assigned_to)?.full_name || selectedTicket.assigned_to : 'Unassigned'}
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
                {selectedTicket.status !== 'closed' && canModifyComplaints && (
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

                {selectedTicket.status !== 'closed' && !canModifyComplaints && (
                  <p className="border-t pt-3 text-xs text-gray-500">
                    Reply composer is hidden for view-only users.
                  </p>
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
