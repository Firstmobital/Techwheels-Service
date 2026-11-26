import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  fetchBodyshopAdvisorReplyReport,
  formatReplyDuration,
  getAdvisorChat,
  listAdvisorChats,
  sendAdvisorChatMessage,
  type AdvisorChatMessage,
  type AdvisorChatReplyReportRow,
  type AdvisorChatThread,
} from '../lib/api/advisorChat'
import {
  buildChatTimeline,
  formatChatListPreviewTime,
  formatChatMessageTime,
} from '../lib/chatTimestamps'
import './ChatPage.css'

function staffChatPeerSubtitle(row: AdvisorChatThread): string {
  const advisor = row.sa_name?.trim()
  const contact = (row.contact_key || 'advisor').toLowerCase()
  if (contact === 'advisor') {
    return advisor || row.phone_10
  }
  return advisor ? `${advisor} · ${row.phone_10}` : row.phone_10
}

function mergeMessage(current: AdvisorChatMessage[], next: AdvisorChatMessage): AdvisorChatMessage[] {
  if (current.some((row) => row.id === next.id)) return current
  return [...current, next].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export default function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeView = searchParams.get('view') === 'reports' ? 'reports' : 'chat'
  const [threads, setThreads] = useState<AdvisorChatThread[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AdvisorChatMessage[]>([])
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [reportRows, setReportRows] = useState<AdvisorChatReplyReportRow[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportSearch, setReportSearch] = useState('')
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

  const messageTimeline = useMemo(
    () => buildChatTimeline(messages),
    [messages],
  )

  const loadReport = useCallback(async (currentThreads?: AdvisorChatThread[]) => {
    setReportLoading(true)
    setError(null)
    try {
      const rows = await fetchBodyshopAdvisorReplyReport(currentThreads)
      setReportRows(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load advisor reply time report')
    } finally {
      setReportLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeView !== 'reports') return
    void loadReport(threads.length > 0 ? threads : undefined)
  }, [activeView, loadReport, threads])

  const filteredReportRows = useMemo(() => {
    const q = reportSearch.trim().toLowerCase()
    if (!q) return reportRows
    return reportRows.filter(
      (r) =>
        r.advisorName.toLowerCase().includes(q)
        || (r.employeeCode || '').toLowerCase().includes(q)
        || (r.location || '').toLowerCase().includes(q),
    )
  }, [reportRows, reportSearch])

  const reportSummary = useMemo(() => {
    const totalAdvisors = filteredReportRows.length
    const withReplies = filteredReportRows.filter((r) => r.avgReplySeconds != null && r.repliedTurns > 0)
    const totalRepliedTurns = filteredReportRows.reduce((s, r) => s + r.repliedTurns, 0)
    const totalPendingTurns = filteredReportRows.reduce((s, r) => s + r.pendingTurns, 0)
    const weightedSecondsSum = withReplies.reduce(
      (s, r) => s + (r.avgReplySeconds ?? 0) * r.repliedTurns,
      0,
    )
    const overallAvgSeconds =
      totalRepliedTurns > 0 ? weightedSecondsSum / totalRepliedTurns : null
    return {
      totalAdvisors,
      totalRepliedTurns,
      totalPendingTurns,
      overallAvgSeconds,
    }
  }, [filteredReportRows])

  function switchView(view: 'chat' | 'reports') {
    if (view === 'reports') {
      setSearchParams({ view: 'reports' })
    } else {
      setSearchParams({})
    }
  }

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
      <div className="chat-topbar">
        <div className="chat-topbar__title">
          {activeView === 'reports' ? 'Bodyshop Advisor Chat Reply Time Report' : 'Customer Chat'}
        </div>
        <div className="chat-topbar__actions">
          <button
            type="button"
            className={`chat-topbar__btn ${activeView === 'chat' ? 'is-active' : ''}`}
            onClick={() => switchView('chat')}
          >
            Chats
          </button>
          <button
            type="button"
            className={`chat-topbar__btn ${activeView === 'reports' ? 'is-active' : ''}`}
            onClick={() => switchView('reports')}
          >
            Reports
          </button>
        </div>
      </div>

      {error && <div className="chat-error">{error}</div>}

      {activeView === 'reports' ? (
        <div className="chat-report">
          <div className="chat-report__controls">
            <div className="chat-report__kpis">
              <div className="chat-report__kpi">
                <span className="chat-report__kpi-label">Bodyshop Advisors</span>
                <span className="chat-report__kpi-val">{reportSummary.totalAdvisors}</span>
              </div>
              <div className="chat-report__kpi">
                <span className="chat-report__kpi-label">Overall Avg Reply Time</span>
                <span className="chat-report__kpi-val">{formatReplyDuration(reportSummary.overallAvgSeconds)}</span>
              </div>
              <div className="chat-report__kpi">
                <span className="chat-report__kpi-label">Replied Messages</span>
                <span className="chat-report__kpi-val">{reportSummary.totalRepliedTurns}</span>
              </div>
              <div className="chat-report__kpi">
                <span className="chat-report__kpi-label">Pending Replies</span>
                <span className="chat-report__kpi-val">{reportSummary.totalPendingTurns}</span>
              </div>
            </div>
            <div className="chat-report__filter-row">
              <input
                className="chat-report__search"
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                placeholder="Search advisor name, code, or branch..."
                aria-label="Search bodyshop advisor"
              />
              <button
                type="button"
                className="chat-topbar__btn"
                disabled={reportLoading}
                onClick={() => void loadReport()}
              >
                {reportLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="chat-report__table-wrap">
            {reportLoading ? (
              <div className="chat-empty" style={{ padding: 24 }}>Loading bodyshop advisor reply time report...</div>
            ) : filteredReportRows.length === 0 ? (
              <div className="chat-empty" style={{ padding: 24 }}>No bodyshop advisors found.</div>
            ) : (
              <table className="chat-report__table">
                <thead>
                  <tr>
                    <th>Advisor Name</th>
                    <th>Employee Code</th>
                    <th>Branch</th>
                    <th>Active Chats</th>
                    <th>Customer Messages</th>
                    <th>Replied</th>
                    <th>Pending Reply</th>
                    <th>Average Reply Time</th>
                    <th>Fastest Reply</th>
                    <th>Slowest Reply</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReportRows.map((row) => (
                    <tr key={row.advisorKey}>
                      <td className="chat-report__name">{row.advisorName}</td>
                      <td>{row.employeeCode || '—'}</td>
                      <td>{row.location || '—'}</td>
                      <td>{row.totalThreads}</td>
                      <td>{row.customerTurns}</td>
                      <td>{row.repliedTurns}</td>
                      <td className={row.pendingTurns > 0 ? 'chat-report__pending' : ''}>
                        {row.pendingTurns}
                      </td>
                      <td className="chat-report__avg">{formatReplyDuration(row.avgReplySeconds)}</td>
                      <td>{formatReplyDuration(row.minReplySeconds)}</td>
                      <td>{formatReplyDuration(row.maxReplySeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
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
                  <div className="chat-row__sub">{staffChatPeerSubtitle(row)}</div>
                  <div className="chat-row__preview">{row.last_message_preview || ''}</div>
                </span>
                <span className="chat-row__side">
                  <span className="chat-meta">{formatChatListPreviewTime(row.last_message_at)}</span>
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
                  {staffChatPeerSubtitle(selected)}
                  {selected.customer_name ? ` · ${selected.customer_name}` : ''}
                  {selected.jc_number ? ` · ${selected.jc_number}` : ''}
                </div>
              </header>
              <div className="chat-thread__messages" ref={scrollerRef}>
                {messageTimeline.map((item) => (
                  item.type === 'day' ? (
                    <div key={item.key} className="chat-day-separator" role="separator">
                      {item.label}
                    </div>
                  ) : (
                    <div
                      key={item.key}
                      className={`chat-bubble ${item.message.author_side === 'staff' ? 'staff' : 'customer'}`}
                    >
                      <div className="chat-bubble__name">
                        {item.message.author_side === 'staff' ? item.message.author_name : 'Customer'}
                      </div>
                      <div className="chat-bubble__body">{item.message.body}</div>
                      <div className="chat-meta chat-bubble__time">{formatChatMessageTime(item.message.created_at)}</div>
                    </div>
                  )
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
      )}
    </div>
  )
}
