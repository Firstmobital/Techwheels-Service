import { useEffect, useState } from 'react'
import {
  getCustomerThread,
  listCustomerThreads,
  postCustomerMessage,
  submitCustomerThread,
} from '../../lib/api/bodyshopCustomerApp'
import type { ThreadDetail, ThreadSummary, TicketType } from '../../components/customer-app/types'

const TYPE_LABEL: Record<TicketType, string> = { query: 'Query', complaint: 'Complaint', chat: 'Chat' }

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong'
}

export default function CommunicationTab({ sessionToken }: { sessionToken: string }) {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ThreadDetail | null>(null)
  const [composerType, setComposerType] = useState<TicketType | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshThreads = () => {
    listCustomerThreads(sessionToken).then(setThreads).catch((e) => setError(errorMessage(e)))
  }

  useEffect(refreshThreads, [sessionToken])

  useEffect(() => {
    if (activeThreadId == null) return
    getCustomerThread(sessionToken, activeThreadId).then(setDetail).catch((e) => setError(errorMessage(e)))
  }, [activeThreadId, sessionToken])

  function backToThreadList() {
    setActiveThreadId(null)
    setDetail(null)
  }

  async function handleStartThread() {
    if (!composerType || !title.trim() || !body.trim()) return
    setBusy(true)
    setError(null)
    try {
      const { ticket_id } = await submitCustomerThread(sessionToken, composerType, title.trim(), body.trim())
      setComposerType(null)
      setTitle('')
      setBody('')
      refreshThreads()
      setActiveThreadId(ticket_id)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleReply() {
    if (activeThreadId == null || !reply.trim()) return
    setBusy(true)
    setError(null)
    try {
      await postCustomerMessage(sessionToken, activeThreadId, reply.trim())
      setReply('')
      const updated = await getCustomerThread(sessionToken, activeThreadId)
      setDetail(updated)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (activeThreadId != null && detail) {
    return (
      <div className="twba-card">
        <button className="twba-btn-secondary twba-btn" style={{ marginBottom: 12 }} onClick={backToThreadList}>
          ← Back
        </button>
        <h2>{detail.ticket.title}</h2>
        <div style={{ fontSize: 12, color: 'var(--twba-muted)', marginBottom: 10 }}>
          {TYPE_LABEL[detail.ticket.ticket_type]} · {detail.ticket.ticket_number} · {detail.ticket.status}
        </div>
        <div>
          {detail.messages.map((m) => (
            <div key={m.id} className={`twba-msg ${m.author_type}`}>
              <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 2 }}>{m.author_name ?? m.author_type}</div>
              {m.body}
            </div>
          ))}
        </div>
        <textarea
          className="twba-input"
          rows={3}
          placeholder="Type a reply…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          style={{ marginTop: 10 }}
        />
        {error && <div className="twba-error">{error}</div>}
        <button className="twba-btn" style={{ marginTop: 8 }} disabled={busy || !reply.trim()} onClick={handleReply}>
          Send
        </button>
      </div>
    )
  }

  if (composerType) {
    return (
      <div className="twba-card">
        <h2>New {TYPE_LABEL[composerType]}</h2>
        <input
          className="twba-input"
          placeholder="Subject"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <textarea
          className="twba-input"
          rows={4}
          placeholder="Describe your query, complaint or message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && <div className="twba-error">{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="twba-btn-secondary twba-btn" onClick={() => setComposerType(null)}>
            Cancel
          </button>
          <button className="twba-btn" disabled={busy || !title.trim() || !body.trim()} onClick={handleStartThread}>
            Submit
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="twba-card">
      <h2>Query · Complaint · Chat</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['query', 'complaint', 'chat'] as TicketType[]).map((t) => (
          <button key={t} className="twba-btn-secondary twba-btn" onClick={() => setComposerType(t)}>
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {error && <div className="twba-error">{error}</div>}
      {threads == null ? (
        <div style={{ color: 'var(--twba-muted)', fontSize: 13 }}>Loading…</div>
      ) : threads.length === 0 ? (
        <div style={{ color: 'var(--twba-muted)', fontSize: 13 }}>No conversations yet.</div>
      ) : (
        threads.map((t) => (
          <div key={t.id} className="twba-thread" onClick={() => setActiveThreadId(t.id)}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{t.title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--twba-muted)' }}>
              {TYPE_LABEL[t.ticket_type]} · {t.status} · {t.message_count} message{t.message_count === 1 ? '' : 's'}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
