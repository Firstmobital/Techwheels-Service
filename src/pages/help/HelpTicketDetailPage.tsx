import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getHelpTicketDetail,
  sendHelpTicketMessage,
  verifyHelpTicketResolution,
  type HelpTicketDetail,
} from '../../lib/api/helpTickets'
import { uploadHelpTicketAttachment } from '../../lib/helpTicketUpload'
import './helpTickets.css'

export default function HelpTicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [detail, setDetail] = useState<HelpTicketDetail | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!id) return
    const data = await getHelpTicketDetail(id)
    setDetail(data)
  }, [id])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        await reload()
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load ticket')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [reload])

  async function onSend() {
    if (!id || !message.trim()) return
    setBusy(true)
    setError(null)
    try {
      await sendHelpTicketMessage({ ticketId: id, messageText: message, visibility: 'public' })
      setMessage('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setBusy(false)
    }
  }

  async function onVerify(verified: boolean) {
    if (!id) return
    setBusy(true)
    setError(null)
    try {
      await verifyHelpTicketResolution({ ticketId: id, verified })
      setSuccess(verified ? 'Marked as verified and closed.' : 'Ticket reopened.')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update resolution')
    } finally {
      setBusy(false)
    }
  }

  async function onAttach(fileList: FileList | null) {
    if (!id || !fileList?.length) return
    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(fileList)) {
        await uploadHelpTicketAttachment({ ticketId: id, file })
      }
      setSuccess('Attachment uploaded.')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="ht-page ht-empty">Loading…</div>
  if (!detail) return <div className="ht-page ht-error">{error || 'Ticket not found'}</div>

  const { ticket, messages, attachments, viewer } = detail
  const canReply = ticket.status !== 'closed'
  const canVerify = viewer.is_raiser && (ticket.status === 'resolved' || ticket.status === 'cannot_reproduce')

  return (
    <div className="ht-page">
      <div className="ht-header">
        <div>
          <h1>{ticket.subject}</h1>
          <p className="ht-sub">
            {ticket.ticket_number} · {ticket.category_key}
            {ticket.assigned_to_name ? ` · Assigned to ${ticket.assigned_to_name}` : ''}
          </p>
        </div>
        <div className="ht-actions">
          <span className={`ht-pill ${ticket.status}`}>{ticket.status.replaceAll('_', ' ')}</span>
          <Link className="ht-btn" to="/help/tickets">My tickets</Link>
        </div>
      </div>

      {error && <div className="ht-error">{error}</div>}
      {success && <div className="ht-success">{success}</div>}

      <div className="ht-card">
        <div className="ht-meta" style={{ marginTop: 0 }}>
          <span>Raised by {ticket.raised_by_name}</span>
          <span>{new Date(ticket.created_at).toLocaleString()}</span>
          <span>Priority: {ticket.priority}</span>
        </div>
        <p style={{ margin: '0.75rem 0 0', whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
        {attachments.length > 0 && (
          <div className="ht-attach-list">
            {attachments.map((a) => (
              <div key={a.id}>
                {a.drive_url ? (
                  <a href={a.drive_url} target="_blank" rel="noreferrer">{a.original_filename}</a>
                ) : (
                  <span>
                    {a.original_filename} ({a.status})
                    {a.error_message ? ` — ${a.error_message}` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canVerify && (
        <div className="ht-card">
          <strong>Resolution ready — please confirm</strong>
          <div className="ht-actions">
            <button type="button" className="ht-btn primary" disabled={busy} onClick={() => onVerify(true)}>
              Fixed — close ticket
            </button>
            <button type="button" className="ht-btn danger" disabled={busy} onClick={() => onVerify(false)}>
              Not fixed — reopen
            </button>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: '1.05rem', margin: '1.25rem 0 0.5rem' }}>Conversation</h2>
      <div className="ht-chat">
        {messages.length === 0 && <div className="ht-empty">No messages yet.</div>}
        {messages.map((m) => (
          <div key={m.id} className={`ht-msg ${m.visibility === 'internal' ? 'internal' : ''}`}>
            <div className="ht-msg-head">
              <span>{m.created_by_name}{m.visibility === 'internal' ? ' · internal' : ''}</span>
              <span>{new Date(m.created_at).toLocaleString()}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.message_text}</div>
          </div>
        ))}
      </div>

      {canReply && (
        <div className="ht-composer ht-card">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write a reply…"
            rows={4}
          />
          <div className="ht-actions">
            <button type="button" className="ht-btn primary" disabled={busy || !message.trim()} onClick={onSend}>
              Send reply
            </button>
            <label className="ht-btn" style={{ cursor: 'pointer' }}>
              Attach file
              <input
                type="file"
                style={{ display: 'none' }}
                onChange={(e) => {
                  void onAttach(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
