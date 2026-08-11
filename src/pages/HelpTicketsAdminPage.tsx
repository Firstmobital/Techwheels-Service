import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  assignHelpTicket,
  escalateHelpTicket,
  getHelpTicketAuditLog,
  getHelpTicketDetail,
  holdHelpTicket,
  listHelpTicketAssignees,
  listHelpTicketsAdmin,
  sendHelpTicketMessage,
  updateHelpTicketPriority,
  updateHelpTicketStatus,
  type HelpTicket,
  type HelpTicketAuditRow,
  type HelpTicketDetail,
  type HelpTicketPriority,
  type HelpTicketStatus,
} from '../lib/api/helpTickets'
import './help/helpTickets.css'

const STATUS_OPTIONS: Array<HelpTicketStatus | 'all'> = [
  'all', 'new', 'open', 'in_progress', 'waiting_raiser', 'on_hold', 'escalated', 'resolved', 'reopened', 'closed',
]

export default function HelpTicketsAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('ticketId')

  const [tickets, setTickets] = useState<HelpTicket[]>([])
  const [detail, setDetail] = useState<HelpTicketDetail | null>(null)
  const [audit, setAudit] = useState<HelpTicketAuditRow[]>([])
  const [statusFilter, setStatusFilter] = useState<HelpTicketStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<HelpTicketPriority | 'all'>('all')
  const [search, setSearch] = useState('')
  const [assignees, setAssignees] = useState<Array<{ employee_code: string; employee_name: string }>>([])
  const [assignCode, setAssignCode] = useState('')
  const [escalateCode, setEscalateCode] = useState('')
  const [message, setMessage] = useState('')
  const [internal, setInternal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    const rows = await listHelpTicketsAdmin({
      status: statusFilter === 'all' ? null : [statusFilter],
      priority: priorityFilter === 'all' ? null : priorityFilter,
      limit: 100,
    })
    setTickets(rows)
  }, [statusFilter, priorityFilter])

  const loadDetail = useCallback(async (ticketId: string) => {
    const [d, a] = await Promise.all([
      getHelpTicketDetail(ticketId),
      getHelpTicketAuditLog(ticketId).catch(() => [] as HelpTicketAuditRow[]),
    ])
    setDetail(d)
    setAudit(a)
    setAssignCode(d.ticket.assigned_to_employee_code || '')
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        await loadList()
        const people = await listHelpTicketAssignees().catch(() => [])
        if (mounted) setAssignees(people)
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load inbox')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [loadList])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setAudit([])
      return
    }
    let mounted = true
    ;(async () => {
      try {
        await loadDetail(selectedId)
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load ticket')
      }
    })()
    return () => { mounted = false }
  }, [selectedId, loadDetail])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tickets
    return tickets.filter((t) =>
      t.ticket_number.toLowerCase().includes(q)
      || t.subject.toLowerCase().includes(q)
      || t.raised_by_name.toLowerCase().includes(q)
      || (t.assigned_to_name || '').toLowerCase().includes(q),
    )
  }, [tickets, search])

  function selectTicket(id: string) {
    setSearchParams({ ticketId: id })
  }

  async function run(action: () => Promise<unknown>) {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      await action()
      await Promise.all([loadList(), loadDetail(selectedId)])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ht-page" style={{ maxWidth: 1280 }}>
      <div className="ht-header">
        <div>
          <h1>Help Tickets</h1>
          <p className="ht-sub">Org-wide support inbox (dealer-agnostic)</p>
        </div>
      </div>

      {error && <div className="ht-error">{error}</div>}

      <div className="ht-filters">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as HelpTicketStatus | 'all')}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.replaceAll('_', ' ')}</option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as HelpTicketPriority | 'all')}>
          <option value="all">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        <input
          placeholder="Search number, subject, raiser…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 220 }}
        />
      </div>

      <div className="ht-split">
        <div>
          {loading && <div className="ht-empty">Loading…</div>}
          {!loading && filtered.length === 0 && <div className="ht-empty">No tickets match.</div>}
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              className="ht-card"
              style={{
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                borderColor: selectedId === t.id ? '#0f766e' : undefined,
              }}
              onClick={() => selectTicket(t.id)}
            >
              <div className="ht-row">
                <div>
                  <strong>{t.subject}</strong>
                  <div className="ht-meta">
                    <span>{t.ticket_number}</span>
                    <span>{t.raised_by_name}</span>
                    <span>{t.priority}</span>
                    {t.assigned_to_name && <span>{t.assigned_to_name}</span>}
                  </div>
                </div>
                <span className={`ht-pill ${t.status}`}>{t.status.replaceAll('_', ' ')}</span>
              </div>
            </button>
          ))}
        </div>

        <div>
          {!detail && <div className="ht-empty ht-card">Select a ticket to manage</div>}
          {detail && (
            <div className="ht-card">
              <div className="ht-row">
                <div>
                  <strong>{detail.ticket.subject}</strong>
                  <div className="ht-meta">
                    <span>{detail.ticket.ticket_number}</span>
                    <span>{detail.ticket.raised_by_name}</span>
                    <span>{detail.ticket.category_key}</span>
                    {detail.ticket.raiser_dealer_code && <span>Dealer snapshot: {detail.ticket.raiser_dealer_code}</span>}
                  </div>
                </div>
                <span className={`ht-pill ${detail.ticket.status}`}>{detail.ticket.status.replaceAll('_', ' ')}</span>
              </div>
              <p style={{ whiteSpace: 'pre-wrap', marginTop: '0.75rem' }}>{detail.ticket.description}</p>

              {detail.viewer.can_modify && (
                <>
                  <div className="ht-actions">
                    <select value={assignCode} onChange={(e) => setAssignCode(e.target.value)}>
                      <option value="">
                        {assignees.length === 0
                          ? 'No users with Help Tickets edit rights'
                          : 'Assign to…'}
                      </option>
                      {assignees.map((a) => (
                        <option key={a.employee_code} value={a.employee_code}>{a.employee_name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ht-btn"
                      disabled={busy || !assignCode}
                      onClick={() => run(() => assignHelpTicket(detail.ticket.id, assignCode))}
                    >
                      Assign
                    </button>
                  </div>

                  <div className="ht-actions">
                    {(['open', 'in_progress', 'waiting_raiser', 'resolved', 'cannot_reproduce'] as HelpTicketStatus[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="ht-btn"
                        disabled={busy}
                        onClick={() => run(() => updateHelpTicketStatus({ ticketId: detail.ticket.id, newStatus: s }))}
                      >
                        {s.replaceAll('_', ' ')}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="ht-btn"
                      disabled={busy}
                      onClick={() => run(() => holdHelpTicket({ ticketId: detail.ticket.id, holdReason: 'awaiting_info' }))}
                    >
                      Hold
                    </button>
                  </div>

                  <div className="ht-actions">
                    <select
                      value={detail.ticket.priority}
                      onChange={(e) => run(() => updateHelpTicketPriority(detail.ticket.id, e.target.value as HelpTicketPriority))}
                      disabled={busy}
                    >
                      <option value="low">low</option>
                      <option value="normal">normal</option>
                      <option value="high">high</option>
                      <option value="urgent">urgent</option>
                    </select>
                    <select value={escalateCode} onChange={(e) => setEscalateCode(e.target.value)}>
                      <option value="">
                        {assignees.length === 0
                          ? 'No users with Help Tickets edit rights'
                          : 'Escalate to…'}
                      </option>
                      {assignees.map((a) => (
                        <option key={a.employee_code} value={a.employee_code}>{a.employee_name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ht-btn danger"
                      disabled={busy || !escalateCode}
                      onClick={() => run(() => escalateHelpTicket(detail.ticket.id, escalateCode))}
                    >
                      Escalate
                    </button>
                  </div>
                </>
              )}

              <h3 style={{ fontSize: '0.95rem', margin: '1rem 0 0.5rem' }}>Messages</h3>
              <div className="ht-chat">
                {detail.messages.map((m) => (
                  <div key={m.id} className={`ht-msg ${m.visibility === 'internal' ? 'internal' : ''}`}>
                    <div className="ht-msg-head">
                      <span>{m.created_by_name}{m.visibility === 'internal' ? ' · internal' : ''}</span>
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.message_text}</div>
                  </div>
                ))}
              </div>

              {detail.viewer.can_modify && (
                <div className="ht-composer">
                  <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Reply or note…" />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                    Internal note (hidden from raiser)
                  </label>
                  <button
                    type="button"
                    className="ht-btn primary"
                    disabled={busy || !message.trim()}
                    onClick={() => run(async () => {
                      await sendHelpTicketMessage({
                        ticketId: detail.ticket.id,
                        messageText: message,
                        visibility: internal ? 'internal' : 'public',
                      })
                      setMessage('')
                    })}
                  >
                    Send
                  </button>
                </div>
              )}

              {audit.length > 0 && (
                <>
                  <h3 style={{ fontSize: '0.95rem', margin: '1rem 0 0.5rem' }}>Audit</h3>
                  <div className="ht-meta" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    {audit.slice(0, 12).map((a) => (
                      <div key={a.id}>
                        {new Date(a.changed_at).toLocaleString()} · {a.action_type}
                        {a.changed_by_name ? ` · ${a.changed_by_name}` : ''}
                        {a.old_value || a.new_value ? ` · ${a.old_value ?? '∅'} → ${a.new_value ?? '∅'}` : ''}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
