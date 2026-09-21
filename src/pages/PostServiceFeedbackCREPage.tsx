import { Fragment, useCallback, useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type CreStatus = 'open' | 'in_progress' | 'resolved'
type Tier = 'low' | 'unrated' | 'high'

interface QueueRow {
  id: number
  job_card_closed_data_id: number
  customer_name: string | null
  mobile_number: string
  vehicle_registration_number: string | null
  job_card_number: string | null
  closed_date: string
  sent_at: string | null
  rating: number | null
  feedback_text: string | null
  responded_at: string | null
  cre_status: CreStatus
  resolved_at: string | null
  resolved_by_name: string | null
  service_advisor_name: string | null
  service_type: string | null
  review_link_sent: boolean
  branch: string | null
}

interface RemarkRow {
  id: number
  feedback_id: number
  remark: string
  created_by_name: string | null
  is_resolution: boolean
  created_at: string
}

interface Overview {
  totalSent: number
  positiveCount: number
  needsFollowupCount: number
  unratedCount: number
}

interface StatusStats {
  total: number
  open: number
  in_progress: number
  resolved: number
}

const PAGE_SIZE = 50

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s + (s.includes('T') ? '' : 'T00:00:00+05:30'))
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  })
}

function daysSinceSent(sentAt: string | null): string {
  if (!sentAt) return '—'
  const sent = new Date(sentAt)
  if (isNaN(sent.getTime())) return '—'
  const ms = Date.now() - sent.getTime()
  if (ms < 0) return '0'
  return String(Math.floor(ms / 86_400_000))
}

function sanitizeSearch(raw: string): string {
  return raw.trim().replace(/[%_,.()]/g, ' ').replace(/\s+/g, ' ').trim()
}

const STATUS_COLOR: Record<string, string> = {
  open:        'bg-red-100 text-red-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved:    'bg-green-100 text-green-700',
}

const STATUS_LABEL: Record<string, string> = {
  open:        'Open',
  in_progress: 'In Progress',
  resolved:    'Resolved',
}

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-gray-400 text-xs">—</span>
  return (
    <span className={rating <= 2 ? 'text-red-600' : rating <= 3 ? 'text-yellow-600' : 'text-green-600'}>
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  )
}

function StatCard({ label, value, color = 'text-gray-800' }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}

async function readCount(
  pending: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await pending
  if (error) throw error
  return count || 0
}

function applyListFilters<Q extends { eq: (column: string, value: string) => Q; or: (filters: string) => Q }>(
  query: Q,
  opts: { search: string; filterStatus: 'all' | CreStatus; statusEnabled: boolean },
): Q {
  let next = query
  if (opts.statusEnabled && opts.filterStatus !== 'all') {
    next = next.eq('cre_status', opts.filterStatus)
  }
  const q = sanitizeSearch(opts.search)
  if (q) {
    const pattern = `%${q}%`
    next = next.or(
      `customer_name.ilike.${pattern},mobile_number.ilike.${pattern},vehicle_registration_number.ilike.${pattern},branch.ilike.${pattern}`,
    )
  }
  return next
}

// ─── Row detail panel ───────────────────────────────────────────────────────

function RowDetail({ row, onUpdated, showActions }: { row: QueueRow; onUpdated: () => void; showActions: boolean }) {
  const [remarks, setRemarks] = useState<RemarkRow[]>([])
  const [loading, setLoading] = useState(showActions)
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRemarks = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('post_service_feedback_remarks')
      .select('*')
      .eq('feedback_id', row.id)
      .order('created_at', { ascending: true })
    if (!e) setRemarks((data || []) as RemarkRow[])
    setLoading(false)
  }, [row.id])

  useEffect(() => {
    if (!showActions) return
    let cancelled = false
    void (async () => {
      const { data, error: e } = await supabase
        .from('post_service_feedback_remarks')
        .select('*')
        .eq('feedback_id', row.id)
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (!e) setRemarks((data || []) as RemarkRow[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [showActions, row.id])

  async function addRemark() {
    if (!draft.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const { error: e } = await supabase.rpc('psf_add_remark', { p_feedback_id: row.id, p_remark: draft.trim() })
      if (e) throw e
      setDraft('')
      await fetchRemarks()
      onUpdated()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add remark')
    } finally {
      setSubmitting(false)
    }
  }

  async function markResolved() {
    if (!draft.trim()) {
      setError('A closing remark is required to mark this resolved.')
      return
    }
    if (!confirm('Mark this case as resolved? This will be logged with your name and the current time.')) return
    setSubmitting(true)
    setError(null)
    try {
      const { error: e } = await supabase.rpc('psf_mark_resolved', { p_feedback_id: row.id, p_remark: draft.trim() })
      if (e) throw e
      setDraft('')
      await fetchRemarks()
      onUpdated()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to mark resolved')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-gray-50 border-t border-gray-200 p-4 space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer's Original Feedback</h3>
        <div className="bg-white border border-gray-200 rounded p-3 text-sm text-gray-800 whitespace-pre-wrap">
          {row.feedback_text || <span className="text-gray-400">No remark text provided.</span>}
        </div>
      </div>

      {showActions && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Call Log</h3>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : remarks.length === 0 ? (
            <p className="text-sm text-gray-400">No remarks yet — this case hasn't been worked yet.</p>
          ) : (
            <ul className="space-y-2">
              {remarks.map(r => (
                <li key={r.id} className={`text-sm rounded p-2 ${r.is_resolution ? 'bg-green-50 border border-green-200' : 'bg-white border border-gray-200'}`}>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span className="font-medium text-gray-700">{r.created_by_name || 'Unknown'}{r.is_resolution ? ' · Resolved' : ''}</span>
                    <span>{fmtDateTime(r.created_at)}</span>
                  </div>
                  <p className="text-gray-800">{r.remark}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showActions && row.cre_status !== 'resolved' && (
        <div className="space-y-2">
          <textarea
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            rows={2}
            placeholder="Add a call remark…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={addRemark}
              disabled={submitting || !draft.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-sm font-medium"
            >
              {submitting ? 'Saving…' : 'Add Remark'}
            </button>
            <button
              onClick={markResolved}
              disabled={submitting || !draft.trim()}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded text-sm font-medium"
            >
              Mark Resolved
            </button>
          </div>
        </div>
      )}

      {showActions && row.cre_status === 'resolved' && (
        <p className="text-sm text-green-700">
          ✓ Resolved by <span className="font-medium">{row.resolved_by_name}</span> on {fmtDateTime(row.resolved_at)}
        </p>
      )}

      {!showActions && (
        <p className="text-sm text-gray-500">
          {row.review_link_sent
            ? '✓ A Google review link was sent to this customer.'
            : 'No Google review link was sent for this response.'}
        </p>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PostServiceFeedbackCREPage() {
  const [rows, setRows] = useState<QueueRow[]>([])
  const [overview, setOverview] = useState<Overview>({
    totalSent: 0, positiveCount: 0, needsFollowupCount: 0, unratedCount: 0,
  })
  const [statusStats, setStatusStats] = useState<StatusStats>({
    total: 0, open: 0, in_progress: 0, resolved: 0,
  })
  const [filteredTotal, setFilteredTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const [tier, setTier] = useState<Tier>('low')
  const [filterStatus, setFilterStatus] = useState<'all' | CreStatus>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
      setExpandedId(null)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  const fetchQueue = useCallback(async () => {
    const baseCount = () =>
      supabase.from('post_service_feedback_messages').select('id', { count: 'exact', head: true }).not('sent_at', 'is', null)

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const statusEnabled = tier === 'low' || tier === 'unrated'
    const table = tier === 'unrated'
      ? 'post_service_feedback_cre_unrated'
      : 'post_service_feedback_cre_queue'

    let query = supabase.from(table).select('*', { count: 'exact' })
    if (tier === 'low') query = query.lte('rating', 3)
    if (tier === 'high') query = query.gte('rating', 4)
    query = applyListFilters(query, {
      search: debouncedSearch,
      filterStatus,
      statusEnabled,
    })
    query = tier === 'unrated'
      ? query.order('sent_at', { ascending: false })
      : query.order('responded_at', { ascending: false })

    const statusBase = () => (tier === 'low' ? baseCount().lte('rating', 3) : baseCount().is('rating', null))

    const [totalSent, positiveCount, needsFollowupCount, unratedCount, pageRes, statusTotal, statusOpen, statusInProgress, statusResolved] = await Promise.all([
      readCount(baseCount()),
      readCount(baseCount().gte('rating', 4)),
      readCount(baseCount().lte('rating', 3)),
      readCount(baseCount().is('rating', null)),
      query.range(from, to),
      tier === 'high' ? Promise.resolve(0) : readCount(statusBase()),
      tier === 'high' ? Promise.resolve(0) : readCount(statusBase().eq('cre_status', 'open')),
      tier === 'high' ? Promise.resolve(0) : readCount(statusBase().eq('cre_status', 'in_progress')),
      tier === 'high' ? Promise.resolve(0) : readCount(statusBase().eq('cre_status', 'resolved')),
    ])

    if (pageRes.error) throw pageRes.error

    return {
      overview: { totalSent, positiveCount, needsFollowupCount, unratedCount },
      statusStats: {
        total: statusTotal,
        open: statusOpen,
        in_progress: statusInProgress,
        resolved: statusResolved,
      },
      rows: (pageRes.data || []) as QueueRow[],
      filteredTotal: pageRes.count || 0,
    }
  }, [tier, filterStatus, debouncedSearch, page])

  const applyQueue = useCallback((result: Awaited<ReturnType<typeof fetchQueue>>) => {
    setOverview(result.overview)
    setStatusStats(result.statusStats)
    setRows(result.rows)
    setFilteredTotal(result.filteredTotal)
    setError(null)
    setLoading(false)
  }, [])

  const load = useCallback(async () => {
    setError(null)
    try {
      applyQueue(await fetchQueue())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load Post Service Feedback queue')
      setLoading(false)
    }
  }, [fetchQueue, applyQueue])

  useEffect(() => {
    let cancelled = false
    void fetchQueue()
      .then((result) => {
        if (cancelled) return
        applyQueue(result)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load Post Service Feedback queue')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [fetchQueue, applyQueue])

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE))
  const tabCount = useMemo(() => {
    if (tier === 'low') return overview.needsFollowupCount
    if (tier === 'unrated') return overview.unratedCount
    return overview.positiveCount
  }, [tier, overview])

  const showStatusFilter = tier === 'low' || tier === 'unrated'
  const colCount = tier === 'unrated' ? 11 : 11

  if (loading && rows.length === 0) {
    return <div className="p-8 text-center text-gray-500">Loading Post Service Feedback queue…</div>
  }

  if (error && rows.length === 0) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
        <button onClick={() => void load()} className="mt-4 px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm">Retry</button>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Post Service Feedback</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Follow up on low ratings, call customers who have not responded, and review the positive ones.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-700"
        >
          Refresh
        </button>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Overview</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Messages Sent" value={overview.totalSent} />
          <StatCard label="4★ & Above" value={overview.positiveCount} color="text-green-700" />
          <StatCard label="3★ & Below" value={overview.needsFollowupCount} color="text-red-700" />
        </div>
      </div>

      <div className="border-b border-gray-200 flex flex-wrap gap-6">
        <button
          onClick={() => { setTier('low'); setFilterStatus('all'); setPage(1); setExpandedId(null) }}
          className={`py-2 text-sm font-medium border-b-2 transition-colors ${tier === 'low' ? 'border-red-600 text-red-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Needs Follow-up (≤3★)
          <span className="ml-2 text-xs text-gray-400">{overview.needsFollowupCount}</span>
        </button>
        <button
          onClick={() => { setTier('unrated'); setFilterStatus('all'); setPage(1); setExpandedId(null) }}
          className={`py-2 text-sm font-medium border-b-2 transition-colors ${tier === 'unrated' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          No Rating / No Response
          <span className="ml-2 text-xs text-gray-400">{overview.unratedCount}</span>
        </button>
        <button
          onClick={() => { setTier('high'); setFilterStatus('all'); setPage(1); setExpandedId(null) }}
          className={`py-2 text-sm font-medium border-b-2 transition-colors ${tier === 'high' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Positive (≥4★)
          <span className="ml-2 text-xs text-gray-400">{overview.positiveCount}</span>
        </button>
      </div>

      {showStatusFilter && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Cases" value={statusStats.total} />
          <StatCard label="Open" value={statusStats.open} color="text-red-700" />
          <StatCard label="In Progress" value={statusStats.in_progress} color="text-yellow-700" />
          <StatCard label="Resolved" value={statusStats.resolved} color="text-green-700" />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {showStatusFilter && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                value={filterStatus}
                onChange={e => { setFilterStatus(e.target.value as typeof filterStatus); setPage(1); setExpandedId(null) }}
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          )}
          <div className={showStatusFilter ? 'sm:col-span-2' : 'sm:col-span-3'}>
            <label className="block text-xs text-gray-500 mb-1">Search (name, mobile, reg no, branch)</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {filteredTotal} cases
          {filteredTotal !== tabCount ? ` of ${tabCount}` : ''}
          {loading ? ' · Updating…' : ''}
        </p>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Reg No</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Service Date</th>
                <th className="px-4 py-3 font-medium">Service Type</th>
                <th className="px-4 py-3 font-medium">Service Advisor</th>
                <th className="px-4 py-3 font-medium">Mobile</th>
                {tier === 'unrated' ? (
                  <>
                    <th className="px-4 py-3 font-medium">Message Sent At</th>
                    <th className="px-4 py-3 font-medium">Days Since Sent</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 font-medium">Rating</th>
                    <th className="px-4 py-3 font-medium">Remark</th>
                  </>
                )}
                <th className="px-4 py-3 font-medium">{tier === 'high' ? 'Review Link' : 'Status'}</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No cases found.
                  </td>
                </tr>
              ) : rows.map(r => (
                <Fragment key={r.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.customer_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono">{r.vehicle_registration_number || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.branch || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(r.closed_date)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.service_type || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.service_advisor_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono">{r.mobile_number}</td>
                    {tier === 'unrated' ? (
                      <>
                        <td className="px-4 py-3 text-gray-600 text-xs">{fmtDateTime(r.sent_at)}</td>
                        <td className="px-4 py-3 text-gray-600">{daysSinceSent(r.sent_at)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3"><Stars rating={r.rating} /></td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[220px] truncate" title={r.feedback_text || ''}>
                          {r.feedback_text || '—'}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      {tier === 'high' ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.review_link_sent ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {r.review_link_sent ? 'Sent' : '—'}
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.cre_status]}`}>
                          {STATUS_LABEL[r.cre_status]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{expandedId === r.id ? '▲' : '▼'}</td>
                  </tr>
                  {expandedId === r.id && (
                    <tr>
                      <td colSpan={colCount} className="p-0">
                        <RowDetail row={r} onUpdated={() => void load()} showActions={tier !== 'high'} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-xs"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
