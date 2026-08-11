import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listMyHelpTickets, type HelpTicket } from '../../lib/api/helpTickets'
import './helpTickets.css'

export default function MyHelpTicketsPage() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState<HelpTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const rows = await listMyHelpTickets({ limit: 50 })
        if (mounted) setTickets(rows)
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load tickets')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  return (
    <div className="ht-page">
      <div className="ht-header">
        <div>
          <h1>My Help Tickets</h1>
          <p className="ht-sub">Track issues you raised with support</p>
        </div>
        <button type="button" className="ht-btn primary" onClick={() => navigate('/help/tickets/new')}>
          Raise a ticket
        </button>
      </div>

      {error && <div className="ht-error">{error}</div>}
      {loading && <div className="ht-empty">Loading…</div>}
      {!loading && !error && tickets.length === 0 && (
        <div className="ht-empty">
          No tickets yet.{' '}
          <button type="button" className="ht-btn primary" onClick={() => navigate('/help/tickets/new')}>
            Raise your first ticket
          </button>
        </div>
      )}

      {tickets.map((t) => (
        <Link key={t.id} to={`/help/tickets/${t.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="ht-card">
            <div className="ht-row">
              <div>
                <strong>{t.subject}</strong>
                <div className="ht-meta">
                  <span>{t.ticket_number}</span>
                  <span>{t.category_key}</span>
                  <span>{new Date(t.created_at).toLocaleString()}</span>
                  {t.assigned_to_name && <span>Assignee: {t.assigned_to_name}</span>}
                </div>
              </div>
              <span className={`ht-pill ${t.status}`}>{t.status.replaceAll('_', ' ')}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
