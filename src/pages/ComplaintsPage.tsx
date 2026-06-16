import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  acknowledge,
  addStaffMessage,
  close,
  escalate,
  reassign,
  resolve,
  setPriority,
  startProgress,
} from '../lib/api/complaints'
import { LoadingSpinner, ErrorAlert, SuccessAlert } from '../components/complaints/UI'
import type { ComplaintMessage, ComplaintPriority, ComplaintStatus, ComplaintTicket } from '../components/complaints/types'
import './ComplaintsPage.css'

type TabKey = 'inbox' | 'board' | 'sla'
type ViewRole = 'manager' | 'advisor' | 'viewer'

interface FilterState {
  status: ComplaintStatus | 'all'
  priority: ComplaintPriority | 'all'
  search: string
}

const STATUS_ORDER: ComplaintStatus[] = ['new', 'acknowledged', 'in_progress', 'resolved', 'closed']

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'Reopened',
}

const CATEGORY_LABELS: Record<string, string> = {
  service_quality: 'Service quality / rework',
  billing: 'Billing / overcharge',
  delivery_delay: 'Delivery delay',
  staff_behaviour: 'Staff behaviour',
  parts_spares: 'Parts / spares',
  damage_during_service: 'Damage during service',
  cleanliness: 'Cleanliness / wash',
  other: 'Other',
}

const PRIORITY_ORDER: ComplaintPriority[] = ['urgent', 'high', 'medium', 'low']

const priorityClass = (priority: ComplaintPriority): string => {
  return `priority ${priority}`
}

const statusClass = (status: ComplaintStatus): string => {
  return `status-pill ${status}`
}

const formatDate = (value?: string): string => {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

const calculateAgeHours = (ticket: ComplaintTicket): number => {
  const start = new Date(ticket.created_at).getTime()
  const end = (ticket.closed_at || ticket.resolved_at) ? new Date(ticket.closed_at || ticket.resolved_at || '').getTime() : Date.now()
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60)))
}

const buildSlaMeta = (ticket: ComplaintTicket): { pct: number; text: string; color: string } => {
  const due = ticket.resolution_due_at || ticket.response_due_at
  if (!due) {
    return { pct: 0, text: 'No SLA set', color: '#94a0b5' }
  }

  const created = new Date(ticket.created_at).getTime()
  const deadline = new Date(due).getTime()
  const now = Date.now()
  const total = Math.max(1, deadline - created)
  const elapsed = Math.max(0, now - created)
  const pct = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))

  if (ticket.response_breached || ticket.resolution_breached || now > deadline) {
    return { pct: 100, text: 'Breached', color: '#d23a4b' }
  }

  const leftMins = Math.max(0, Math.round((deadline - now) / (1000 * 60)))
  const label = leftMins >= 60 ? `${Math.ceil(leftMins / 60)}h left` : `${leftMins}m left`
  const color = pct >= 85 ? '#ea580c' : '#0e7c5a'
  return { pct, text: label, color }
}

export const ComplaintsPage: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabKey>('inbox')
  const [tickets, setTickets] = useState<ComplaintTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [filters, setFilters] = useState<FilterState>({ status: 'all', priority: 'all', search: '' })

  const [selectedTicket, setSelectedTicket] = useState<ComplaintTicket | null>(null)
  const [ticketMessages, setTicketMessages] = useState<ComplaintMessage[]>([])

  const [newMessage, setNewMessage] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const [staffList, setStaffList] = useState<Array<{ id: string; full_name: string }>>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)

  const [hasComplaintsView, setHasComplaintsView] = useState(false)
  const [canModifyComplaints, setCanModifyComplaints] = useState(false)
  const [, setEffectiveViewRole] = useState<ViewRole>('viewer')
  const [permissionsResolved, setPermissionsResolved] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const canEdit = hasComplaintsView && canModifyComplaints

  const clearFeedback = () => {
    setError(null)
    setSuccess(null)
  }

  useEffect(() => {
    if (!success) return
    const timeout = window.setTimeout(() => setSuccess(null), 3500)
    return () => window.clearTimeout(timeout)
  }, [success])

  useEffect(() => {
    const resolvePermissions = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const userId = sessionData.session?.user?.id
        setCurrentUserId(userId ?? null)

        if (!userId) {
          setHasComplaintsView(false)
          setCanModifyComplaints(false)
          setEffectiveViewRole('viewer')
          setPermissionsResolved(true)
          return
        }

        const [{ data: profile }, { data: permissionRows }, { data: links }] = await Promise.all([
          supabase.from('users').select('role, is_active').eq('id', userId).maybeSingle(),
          supabase.rpc('get_all_my_permissions'),
          supabase
            .from('user_employee_links')
            .select('employee_code')
            .eq('user_id', userId)
            .eq('is_active', true)
            .is('deleted_at', null),
        ])

        const role = String((profile as { role?: string | null } | null)?.role ?? '').trim().toLowerCase()
        const isActive = (profile as { is_active?: boolean | null } | null)?.is_active === true
        const isAdminLike = (role === 'admin' || role === 'super_admin') && isActive

        type PermissionRow = {
          module_name?: string | null
          can_view?: boolean | null
          can_modify?: boolean | null
        }

        const permissions = (permissionRows ?? []) as PermissionRow[]
        const hasComplaintsViewPermission = permissions.some(
          (row) =>
            String(row.module_name ?? '').trim().toLowerCase() === 'complaints' &&
            (row.can_view === true || row.can_modify === true),
        )
        const hasComplaintsModify = permissions.some(
          (row) => String(row.module_name ?? '').trim().toLowerCase() === 'complaints' && row.can_modify === true,
        )

        const employeeCodes = ((links ?? []) as Array<{ employee_code?: string | null }>)
          .map((row) => String(row.employee_code ?? '').trim())
          .filter(Boolean)

        let businessRoles: string[] = []
        if (employeeCodes.length > 0) {
          const { data: employeeRows } = await supabase
            .from('employee_master')
            .select('role')
            .in('employee_code', employeeCodes)

          businessRoles = ((employeeRows ?? []) as Array<{ role?: string | null }>)
            .map((row) => String(row.role ?? '').trim().toUpperCase())
            .filter(Boolean)
        }

        const hasManagerBusinessRole = businessRoles.some((value) => value === 'CRM' || value === 'GM' || value === 'SM')
        const hasAdvisorBusinessRole = businessRoles.some((value) => value === 'SA' || value === 'SERVICE ADVISOR' || value === 'SERVICE_ADVISOR')

        const canView = isAdminLike || hasComplaintsViewPermission
        const editable = isAdminLike || hasComplaintsModify

        let nextViewRole: ViewRole = 'viewer'
        if (canView) {
          if (isAdminLike || hasManagerBusinessRole) {
            nextViewRole = 'manager'
          } else if (hasAdvisorBusinessRole) {
            nextViewRole = 'advisor'
          } else {
            nextViewRole = editable ? 'manager' : 'advisor'
          }
        }

        setHasComplaintsView(canView)
        setCanModifyComplaints(editable)
        setEffectiveViewRole(nextViewRole)
        setPermissionsResolved(true)
      } catch {
        setHasComplaintsView(false)
        setCanModifyComplaints(false)
        setEffectiveViewRole('viewer')
        setPermissionsResolved(true)
      }
    }

    resolvePermissions()
  }, [])

  useEffect(() => {
    if (!permissionsResolved || !hasComplaintsView) return

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
  }, [hasComplaintsView, permissionsResolved])

  useEffect(() => {
    if (!permissionsResolved) return

    if (!hasComplaintsView) {
      setTickets([])
      setSelectedTicket(null)
      setTicketMessages([])
      setLoading(false)
      return
    }

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
  }, [hasComplaintsView, permissionsResolved])

  const loadTicketDetails = async (ticketId: bigint) => {
    try {
      const { data: ticketData, error: ticketErr } = await supabase
        .from('complaint_tickets')
        .select('*')
        .eq('id', ticketId)
        .single()

      if (ticketErr) throw ticketErr

      const ticket = ticketData as ComplaintTicket
      setSelectedTicket(ticket)
      setSelectedStaffId(ticket.assigned_to ?? null)

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

  const openDetail = (ticketId: bigint) => {
    loadTicketDetails(ticketId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeDetail = () => {
    setSelectedTicket(null)
    setTicketMessages([])
    setNewMessage('')
    setIsInternal(false)
  }

  const syncTicketFromDb = async (ticketId: bigint): Promise<ComplaintTicket> => {
    const { data, error: err } = await supabase
      .from('complaint_tickets')
      .select('*')
      .eq('id', ticketId)
      .maybeSingle()

    if (err) throw err
    if (!data) {
      throw new Error('Complaint not found after update. Reload and try again.')
    }

    const latest = data as ComplaintTicket
    setSelectedTicket(latest)
    setSelectedStaffId(latest.assigned_to ?? null)
    setTickets((prev) => prev.map((ticket) => (ticket.id === latest.id ? latest : ticket)))
    return latest
  }

  const persistenceError = (action: string): Error => {
    return new Error(
      `${action} did not persist to the database. Check dealer mapping and complaints modify access for this user.`,
    )
  }

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

      const latest = await syncTicketFromDb(selectedTicket.id)
      if (latest.status !== newStatus) {
        throw persistenceError(`Status change to ${STATUS_LABELS[newStatus]}`)
      }

      setSuccess(`Status changed to ${STATUS_LABELS[newStatus]}`)
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

      const latest = await syncTicketFromDb(selectedTicket.id)
      if (!latest.is_escalated) {
        throw persistenceError('Escalation')
      }

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

      const latest = await syncTicketFromDb(selectedTicket.id)
      if ((latest.assigned_to || null) !== selectedStaffId) {
        throw persistenceError('Reassignment')
      }

      const staffMember = staffList.find((s) => s.id === selectedStaffId)
      setSuccess(`Reassigned to ${staffMember?.full_name || 'staff member'}`)
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

      const latest = await syncTicketFromDb(selectedTicket.id)
      if (latest.priority !== newPriority) {
        throw persistenceError(`Priority change to ${newPriority}`)
      }

      setSuccess(`Priority changed to ${newPriority}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change priority')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAddMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newMessage.trim()
    if (!selectedTicket || !trimmed) return

    if (trimmed.length < 2) {
      setError('Message should be at least 2 characters.')
      return
    }

    try {
      clearFeedback()
      setActionLoading(true)
      await addStaffMessage(selectedTicket.id, trimmed, isInternal)
      setNewMessage('')
      setIsInternal(false)
      await loadTicketDetails(selectedTicket.id)
      setSuccess('Message added')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add message')
    } finally {
      setActionLoading(false)
    }
  }

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (filters.status !== 'all' && ticket.status !== filters.status) return false
      if (filters.priority !== 'all' && ticket.priority !== filters.priority) return false

      if (filters.search) {
        const needle = filters.search.toLowerCase()
        const haystack = [ticket.ticket_number, ticket.reg_number, ticket.customer_name, ticket.title]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        if (!haystack.includes(needle)) return false
      }

      return true
    })
  }, [filters, tickets])

  const breachedTickets = useMemo(() => {
    return filteredTickets.filter(
      (t) => (t.response_breached || t.resolution_breached) && !['resolved', 'closed'].includes(t.status),
    )
  }, [filteredTickets])

  const boardGroups = useMemo(() => {
    return STATUS_ORDER.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      items: filteredTickets.filter((t) => t.status === status),
    }))
  }, [filteredTickets])

  const inboxCount = filteredTickets.length
  const newCount = filteredTickets.filter((t) => t.status === 'new').length
  const openCount = filteredTickets.filter((t) => !['resolved', 'closed'].includes(t.status)).length
  const escalatedCount = filteredTickets.filter((t) => t.is_escalated).length
  const avgAgeHours =
    filteredTickets.length > 0
      ? Math.round(filteredTickets.reduce((acc, t) => acc + calculateAgeHours(t), 0) / filteredTickets.length)
      : 0

  const selectedSla = selectedTicket ? buildSlaMeta(selectedTicket) : null

  const activeStepIndex = (status: ComplaintStatus): number => {
    if (status === 'reopened') return 2
    const idx = STATUS_ORDER.indexOf(status)
    return idx >= 0 ? idx : 0
  }

  if (!permissionsResolved) {
    return <LoadingSpinner />
  }

  if (!hasComplaintsView) {
    return (
      <div className="main complaints-staff">
        <div className="page">
          <div className="access-denied">
            <div className="card access-denied__card">
              <div className="card__head">
                <div className="access-denied__head">
                  <span className="access-denied__icon">🔒</span>
                  <div>
                    <h3>Complaints module is not assigned</h3>
                    <p className="access-denied__copy">
                      This page is visible only after the complaints module is granted in role permissions.
                    </p>
                  </div>
                </div>
              </div>
              <div className="card__body">
                <ul className="access-denied__list">
                  <li>Grant complaints view or modify permission for the logged-in role.</li>
                  <li>Row visibility will then follow the same RBAC/RLS behavior used by Service Advisor.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading && tickets.length === 0) {
    return <LoadingSpinner />
  }

  return (
    <div className="main complaints-staff">
      <div className="page">
        <div className="pagehead">
          <div>
            <p className="greet">Service · Customer Care</p>
            <h1>Complaints</h1>
            <p>Resolve customer complaints raised against service visits and close the loop with SLA discipline.</p>
          </div>
        </div>

        {success && <SuccessAlert message={success} />}
        {error && <ErrorAlert message={error} />}

        <div className="kpis" style={{ marginTop: 16 }}>
          <div className="kpi">
            <div className="kpi__top">
              <span className="kpi__ic">📥</span>
            </div>
            <div className="kpi__val">{inboxCount}</div>
            <div className="kpi__lab">Visible complaints</div>
          </div>
          <div className="kpi">
            <div className="kpi__top">
              <span className="kpi__ic">🆕</span>
            </div>
            <div className="kpi__val">{newCount}</div>
            <div className="kpi__lab">New complaints</div>
          </div>
          <div className="kpi">
            <div className="kpi__top">
              <span className="kpi__ic">🛠️</span>
            </div>
            <div className="kpi__val">{openCount}</div>
            <div className="kpi__lab">Open complaints</div>
          </div>
          <div className="kpi">
            <div className="kpi__top">
              <span className="kpi__ic">🚨</span>
            </div>
            <div className="kpi__val">{escalatedCount}</div>
            <div className="kpi__lab">Escalated complaints</div>
          </div>
          <div className="kpi">
            <div className="kpi__top">
              <span className="kpi__ic">⏱️</span>
            </div>
            <div className="kpi__val">{avgAgeHours}h</div>
            <div className="kpi__lab">Average age</div>
          </div>
        </div>

        {!canModifyComplaints && (
          <div className="access-note" style={{ marginBottom: 14 }}>
            <span className="ic">ℹ️</span>
            <div>
              <b>View-only profile active</b>
              <p>You can inspect tickets, conversation, and SLA context. Action controls are hidden until complaints modify access is granted.</p>
            </div>
          </div>
        )}

        {!selectedTicket && (
          <>
            <div className="row" style={{ borderBottom: '1px solid var(--border)', gap: 22 }}>
              <button type="button" className={`tabbtn ${currentTab === 'inbox' ? 'on' : ''}`} onClick={() => setCurrentTab('inbox')}>
                Inbox
              </button>
              <button type="button" className={`tabbtn ${currentTab === 'board' ? 'on' : ''}`} onClick={() => setCurrentTab('board')}>
                Board
              </button>
              <button type="button" className={`tabbtn ${currentTab === 'sla' ? 'on' : ''}`} onClick={() => setCurrentTab('sla')}>
                SLA breaches
              </button>
              <span className="sp" />
              <input
                className="inp"
                style={{ marginBottom: 8, width: 280, maxWidth: '100%' }}
                type="text"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder="Search reg, ticket, customer..."
              />
            </div>

            <div className="filterbar">
              <select
                className="sel"
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as ComplaintStatus | 'all' }))}
              >
                <option value="all">All statuses</option>
                <option value="new">New</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
                <option value="reopened">Reopened</option>
              </select>

              <select
                className="sel"
                value={filters.priority}
                onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as ComplaintPriority | 'all' }))}
              >
                <option value="all">All priorities</option>
                {PRIORITY_ORDER.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority[0].toUpperCase() + priority.slice(1)}
                  </option>
                ))}
              </select>

              <span className="sp" />
              <span className="text-muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
                {filteredTickets.length} ticket(s)
              </span>
            </div>

            {currentTab === 'inbox' && (
              <div className="card">
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{ width: 30 }} />
                        <th>Ticket</th>
                        <th>Vehicle</th>
                        <th>Customer</th>
                        <th>Category</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>SLA</th>
                        <th>Assignee</th>
                        <th>Age</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTickets.length === 0 && (
                        <tr>
                          <td colSpan={10} className="empty-state">No complaints match current filters.</td>
                        </tr>
                      )}

                      {filteredTickets.map((ticket) => {
                        const sla = buildSlaMeta(ticket)
                        return (
                          <tr
                            key={ticket.id.toString()}
                            onClick={() => openDetail(ticket.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td>
                              {ticket.status === 'new' && <span className="unread-dot" aria-label="Unread" />}
                            </td>
                            <td>
                              <div className="mono">{ticket.ticket_number}</div>
                              <div className="text-muted" style={{ fontSize: 12 }}>{ticket.title}</div>
                            </td>
                            <td>
                              <div className="strong">{ticket.reg_number}</div>
                              <div className="text-muted" style={{ fontSize: 12 }}>{ticket.model || '-'}</div>
                            </td>
                            <td>{ticket.customer_name || '-'}</td>
                            <td>{CATEGORY_LABELS[ticket.category] || ticket.category}</td>
                            <td><span className={priorityClass(ticket.priority)}>{ticket.priority}</span></td>
                            <td><span className={statusClass(ticket.status)}>{STATUS_LABELS[ticket.status]}</span></td>
                            <td>
                              <div className="sla">
                                <span className="sla-txt" style={{ color: sla.color }}>{sla.text}</span>
                              </div>
                            </td>
                            <td>{staffList.find((s) => s.id === ticket.assigned_to)?.full_name || 'Unassigned'}</td>
                            <td>{calculateAgeHours(ticket)}h</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {currentTab === 'board' && (
              <div className="board">
                {boardGroups.map((group) => (
                  <div className={`col col--${group.status.replace('_', '-')}`} key={group.status}>
                    <div className="col-head">
                      <h4>{group.label}</h4>
                      <span className="col-count">{group.items.length}</span>
                    </div>
                    <div className="col-body">
                      {group.items.length === 0 && <div className="empty-state">No tickets</div>}
                      {group.items.map((ticket) => (
                        <div key={ticket.id.toString()} className="tcard" onClick={() => openDetail(ticket.id)}>
                          <div className="tcard-num">{ticket.ticket_number}</div>
                          <div className="tcard-title">{ticket.title}</div>
                          <div className="tcard-veh">{ticket.reg_number} · {ticket.model || '-'}</div>
                          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className={priorityClass(ticket.priority)}>{ticket.priority}</span>
                            {ticket.is_escalated && <span style={{ fontSize: 11.5, color: '#d23a4b', fontWeight: 700 }}>Escalated</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {currentTab === 'sla' && (
              <div className="card">
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Ticket</th>
                        <th>Vehicle</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Breach</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breachedTickets.length === 0 && (
                        <tr>
                          <td colSpan={6} className="empty-state">No active SLA breaches.</td>
                        </tr>
                      )}
                      {breachedTickets.map((ticket) => (
                        <tr key={ticket.id.toString()} onClick={() => openDetail(ticket.id)} style={{ cursor: 'pointer' }}>
                          <td>
                            <div className="mono">{ticket.ticket_number}</div>
                            <div className="text-muted" style={{ fontSize: 12 }}>{ticket.title}</div>
                          </td>
                          <td>{ticket.reg_number}</td>
                          <td><span className={statusClass(ticket.status)}>{STATUS_LABELS[ticket.status]}</span></td>
                          <td><span className={priorityClass(ticket.priority)}>{ticket.priority}</span></td>
                          <td style={{ color: '#d23a4b', fontWeight: 700, fontSize: 12.5 }}>
                            {ticket.response_breached && ticket.resolution_breached
                              ? 'Response + Resolution'
                              : ticket.response_breached
                                ? 'Response'
                                : 'Resolution'}
                          </td>
                          <td>{formatDate(ticket.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {selectedTicket && (
          <div>
            <button type="button" className="btn btn--quiet btn--sm" style={{ marginBottom: 16 }} onClick={closeDetail}>
              ← Back to inbox
            </button>

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card__head" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span className="mono" style={{ color: 'var(--muted)' }}>{selectedTicket.ticket_number}</span>
                    <span className={statusClass(selectedTicket.status)}>{STATUS_LABELS[selectedTicket.status]}</span>
                    {selectedTicket.is_escalated && <span className="status-pill reopened">Escalated</span>}
                  </div>
                  <div style={{ marginTop: 8, fontWeight: 700, fontSize: 18 }}>{selectedTicket.title}</div>
                </div>

                {canEdit && (
                  <div className="tactions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {selectedTicket.status === 'new' && (
                      <button type="button" className="tbtn tbtn--accent" disabled={actionLoading} onClick={() => handleStatusChange('acknowledged')}>
                        Acknowledge
                      </button>
                    )}
                    {selectedTicket.status === 'acknowledged' && (
                      <button type="button" className="tbtn tbtn--warn" disabled={actionLoading} onClick={() => handleStatusChange('in_progress')}>
                        In Progress
                      </button>
                    )}
                    {selectedTicket.status === 'in_progress' && (
                      <button type="button" className="tbtn tbtn--ok" disabled={actionLoading} onClick={() => handleStatusChange('resolved')}>
                        Resolve
                      </button>
                    )}
                    {selectedTicket.status === 'resolved' && (
                      <button type="button" className="tbtn" disabled={actionLoading} onClick={() => handleStatusChange('closed')}>
                        Close
                      </button>
                    )}
                    {!selectedTicket.is_escalated && (
                      <button type="button" className="tbtn tbtn--danger" disabled={actionLoading} onClick={handleEscalate}>
                        Escalate
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="detail-grid">
              <div>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card__body">
                    <p className="sec-label">Status</p>
                    <div className="stepper">
                      {STATUS_ORDER.map((status, idx) => {
                        const activeIdx = activeStepIndex(selectedTicket.status)
                        const stateClass = idx < activeIdx ? 'done' : idx === activeIdx ? 'current' : ''
                        return (
                          <div className={`step-node ${stateClass}`} key={status}>
                            <div className="step-dot">{idx + 1}</div>
                            <div className="step-lab">{STATUS_LABELS[status]}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card__head">
                    <h3>Conversation & activity</h3>
                  </div>
                  <div className="card__body">
                    <div className="thread">
                      {ticketMessages.length === 0 && (
                        <div className="msg system">
                          <div className="msg-b">No messages yet.</div>
                        </div>
                      )}

                      {ticketMessages.map((message) => {
                        const mine = Boolean(currentUserId) && message.author_id === currentUserId
                        const kind = message.author_type === 'system' ? 'system' : mine ? 'me' : ''
                        return (
                          <div key={message.id.toString()} className={`msg ${kind}`}>
                            {message.author_type !== 'system' && (
                              <span className={`avatar-sm ${mine ? 'me' : ''}`}>
                                {(message.author_name || 'U').slice(0, 2).toUpperCase()}
                              </span>
                            )}
                            <div className="msg-b">
                              {message.author_type !== 'system' && (
                                <div className="msg-name">
                                  {message.author_name || 'Unknown'}
                                  {message.is_internal && ' · Internal'}
                                </div>
                              )}
                              <div className="msg-body">{message.body}</div>
                              <div className="msg-meta">{formatDate(message.created_at)}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {selectedTicket.status !== 'closed' && canEdit && (
                      <form className="composer" style={{ marginTop: 20 }} onSubmit={handleAddMessage}>
                        <textarea
                          rows={1}
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Reply to customer, or add an internal note..."
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#62708a' }}>
                            <input
                              type="checkbox"
                              checked={isInternal}
                              onChange={(e) => setIsInternal(e.target.checked)}
                            />
                            Internal
                          </label>
                          <button type="submit" className="btn btn--primary btn--sm" disabled={actionLoading || !newMessage.trim()}>
                            Send
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card__body">
                    <p className="sec-label">Vehicle & visit</p>
                    <div className="vcard">
                      <div className="vcard-row"><span className="k">Registration</span><span className="v">{selectedTicket.reg_number}</span></div>
                      <div className="vcard-row"><span className="k">Model</span><span className="v">{selectedTicket.model || '-'}</span></div>
                      <div className="vcard-row"><span className="k">JC Number</span><span className="v">{selectedTicket.jc_number || '-'}</span></div>
                      <div className="vcard-row"><span className="k">Service Type</span><span className="v">{selectedTicket.service_type || '-'}</span></div>
                      <div className="vcard-row"><span className="k">Branch</span><span className="v">{selectedTicket.branch || '-'}</span></div>
                      <div className="vcard-row"><span className="k">Created</span><span className="v">{formatDate(selectedTicket.created_at)}</span></div>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card__body">
                    <p className="sec-label">Properties</p>
                    <div className="propgrid">
                      <div className="prop">
                        <span className="prop-k">Category</span>
                        <span className="prop-v">{CATEGORY_LABELS[selectedTicket.category] || selectedTicket.category}</span>
                      </div>
                      <div className="prop">
                        <span className="prop-k">Priority</span>
                        <span className="prop-v">
                          {canEdit ? (
                            <select
                              className="sel"
                              style={{ height: 32, minWidth: 120 }}
                              value={selectedTicket.priority}
                              onChange={(e) => handleChangePriority(e.target.value as ComplaintPriority)}
                              disabled={actionLoading}
                            >
                              {PRIORITY_ORDER.map((priority) => (
                                <option key={priority} value={priority}>{priority}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={priorityClass(selectedTicket.priority)}>{selectedTicket.priority}</span>
                          )}
                        </span>
                      </div>
                      <div className="prop">
                        <span className="prop-k">Assigned To</span>
                        <span className="prop-v">
                          {canEdit ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <select
                                className="sel"
                                style={{ height: 32, minWidth: 170 }}
                                value={selectedStaffId || ''}
                                onChange={(e) => setSelectedStaffId(e.target.value || null)}
                                disabled={actionLoading}
                              >
                                <option value="">Unassigned</option>
                                {staffList.map((staff) => (
                                  <option key={staff.id} value={staff.id}>{staff.full_name}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="tbtn"
                                onClick={handleReassign}
                                disabled={actionLoading || !selectedStaffId || selectedStaffId === selectedTicket.assigned_to}
                              >
                                Assign
                              </button>
                            </div>
                          ) : (
                            staffList.find((s) => s.id === selectedTicket.assigned_to)?.full_name || 'Unassigned'
                          )}
                        </span>
                      </div>
                      <div className="prop">
                        <span className="prop-k">Customer</span>
                        <span className="prop-v">{selectedTicket.customer_name || '-'}</span>
                      </div>
                      <div className="prop">
                        <span className="prop-k">Phone</span>
                        <span className="prop-v">{selectedTicket.customer_phone || '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card__body">
                    <p className="sec-label">SLA</p>
                    {selectedSla && (
                      <div className="sla">
                        <span className="sla-ring" style={{ ['--p' as string]: selectedSla.pct, ['--c' as string]: selectedSla.color } as React.CSSProperties} />
                        <span className="sla-txt" style={{ color: selectedSla.color }}>
                          {selectedSla.text}
                          <small>{selectedSla.pct}% elapsed</small>
                        </span>
                      </div>
                    )}
                    <div style={{ marginTop: 12, fontSize: 12.5, color: '#62708a', lineHeight: 1.6 }}>
                      <div>Response due: {formatDate(selectedTicket.response_due_at)}</div>
                      <div>Resolution due: {formatDate(selectedTicket.resolution_due_at)}</div>
                      <div>Escalated: {selectedTicket.is_escalated ? 'Yes' : 'No'}</div>
                      <div style={{ marginTop: 8 }}>{selectedTicket.description || 'No description provided.'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ComplaintsPage
