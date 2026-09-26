import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import {
  getAdvisorChat,
  listAdvisorChats,
  sendAdvisorChatMessage,
  type AdvisorChatMessage,
  type AdvisorChatThread,
} from '../lib/api/advisorChat'
import './ChatPage.css'

function formatWhen(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function mergeMessage(current: AdvisorChatMessage[], next: AdvisorChatMessage): AdvisorChatMessage[] {
  if (current.some((row) => row.id === next.id)) return current
  return [...current, next].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export default function ChatPage() {
  const [threads, setThreads] = useState<AdvisorChatThread[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AdvisorChatMessage[]>([])
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const selectedIdRef = useRef<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  const loadThreads = useCallback(async () => {
    const rows = await listAdvisorChats()
    setThreads(rows)
    return rows
  }, [])

  const openThread = useCallback(async (chatId: string) => {
    const detail = await getAdvisorChat(chatId)
    setSelectedId(chatId)
    setMessages(detail.messages || [])
    setThreads((prev) => prev.map((row) => (
      row.id === chatId ? { ...row, ...detail.chat, staff_unread_count: 0 } : row
    )))
  }, [])

  useEffect(() => {
    let mounted = true
    void loadThreads().catch((err) => {
      if (mounted) setError(err instanceof Error ? err.message : 'Failed to load chats')
    })
    return () => {
      mounted = false
    }
  }, [loadThreads])

  useEffect(() => {
    const channel = supabase
      .channel('advisor-chat-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'advisor_chats' }, () => {
        void loadThreads().catch(() => undefined)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'advisor_chat_messages' }, (payload) => {
        const row = payload.new as AdvisorChatMessage
        if (!row?.id || row.chat_id !== selectedIdRef.current) return
        setMessages((prev) => mergeMessage(prev, row))
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadThreads])

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, selectedId])

  const visibleThreads = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return threads
    return threads.filter((row) =>
      row.reg_number.toLowerCase().includes(needle)
      || row.phone_10.includes(needle)
      || (row.customer_name || '').toLowerCase().includes(needle)
      || (row.sa_name || '').toLowerCase().includes(needle)
      || (row.contact_key || '').toLowerCase().includes(needle)
    )
  }, [query, threads])

  const selected = threads.find((row) => row.id === selectedId) || null

  async function onSend(event: FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!selectedId || !body || sending) return
    setSending(true)
    setError(null)
    try {
      const result = await sendAdvisorChatMessage(selectedId, body)
      setDraft('')
      const sent = result.messages[0]
      if (sent) setMessages((prev) => mergeMessage(prev, sent))
      setThreads((prev) => {
        const next = prev.map((row) => row.id === result.chat.id ? { ...row, ...result.chat } : row)
        return next.sort((a, b) => (b.last_message_at || '').localeCompare(a.last_message_at || ''))
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="chat-page">
      {error && <div className="chat-error">{error}</div>}
      <div className={`chat-split ${selected ? 'has-thread' : ''}`}>
        <section className="chat-list">
          <input
            className="chat-list__search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search vehicle or phone"
            aria-label="Search chats"
          />
          <div className="chat-list__rows">
            {visibleThreads.length === 0 && (
              <div className="chat-empty" style={{ padding: 16 }}>No chats yet.</div>
            )}
            {visibleThreads.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`chat-row ${row.id === selectedId ? 'is-active' : ''}`}
                onClick={() => {
                  void openThread(row.id).catch((err) => {
                    setError(err instanceof Error ? err.message : 'Failed to open chat')
                  })
                }}
              >
                <span className="chat-row__main">
                  <div className="chat-row__title">{row.reg_number}</div>
                  <div className="chat-row__sub">
                    {row.contact_key && row.contact_key !== 'advisor' && row.sa_name
                      ? `${row.sa_name} · ${row.phone_10}`
                      : row.phone_10}
                  </div>
                  <div className="chat-row__preview">{row.last_message_preview || ''}</div>
                </span>
                <span className="chat-row__side">
                  <span className="chat-meta">{formatWhen(row.last_message_at)}</span>
                  {row.staff_unread_count > 0 && (
                    <span className="chat-badge">{row.staff_unread_count > 9 ? '9+' : row.staff_unread_count}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="chat-thread">
          {!selected && (
            <div className="chat-empty" style={{ padding: 24 }}>Select a vehicle to open the conversation.</div>
          )}
          {selected && (
            <>
              <header className="chat-thread__head">
                <div className="chat-thread__title">{selected.reg_number}</div>
                <div className="chat-thread__sub">
                  {selected.contact_key && selected.contact_key !== 'advisor' && selected.sa_name
                    ? `${selected.sa_name} · `
                    : ''}
                  {selected.phone_10}
                  {selected.customer_name ? ` · ${selected.customer_name}` : ''}
                  {selected.jc_number ? ` · ${selected.jc_number}` : ''}
                </div>
              </header>
              <div className="chat-thread__messages" ref={scrollerRef}>
                {messages.map((message) => (
                  <div key={message.id} className={`chat-bubble ${message.author_side === 'staff' ? 'staff' : 'customer'}`}>
                    <div className="chat-bubble__name">
                      {message.author_side === 'staff' ? message.author_name : 'Customer'}
                    </div>
                    <div className="chat-bubble__body">{message.body}</div>
                    <div className="chat-meta">{formatWhen(message.created_at)}</div>
                  </div>
                ))}
              </div>
              <form className="chat-composer" onSubmit={(event) => void onSend(event)}>
                <textarea
                  value={draft}
                  rows={1}
                  maxLength={2000}
                  placeholder="Message"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      event.currentTarget.form?.requestSubmit()
                    }
                  }}
                />
                <button type="submit" disabled={sending || !draft.trim()}>Send</button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
