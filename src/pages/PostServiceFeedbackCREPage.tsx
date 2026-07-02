import { Fragment, useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueRow {
  id: number
  job_card_closed_data_id: number
  customer_name: string | null
  mobile_number: string
  vehicle_registration_number: string | null
  job_card_number: string | null
  closed_date: string
  rating: number
  feedback_text: string | null
  responded_at: string | null
  cre_status: 'open' | 'in_progress' | 'resolved'
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

interface Stats {
  total: number
  open: number
  in_progress: number
  resolved: number
}

interface Overview {
  totalSent: number
  positiveCount: number
  needsFollowupCount: number
}

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

function Stars({ rating }: { rating: number }) {
  return (
    <span className={rating <= 2 ? 'text-red-600' : 'text-yellow-600'}>
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

// ─── Row detail panel ───────────────────────────────────────────────────────

function RowDetail({ row, onUpdated, showActions }: { row: QueueRow; onUpdated: () => void; showActions: boolean }) {
  const [remarks, setRemarks] = useState<RemarkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (showActions) fetchRemarks()
    else setLoading(false)
  }, [row.id, showActions])

  async function fetchRemarks() {
    setLoading(true)
    const { data, error: e } = await supabase
      .from('post_service_feedback_remarks')
      .select('*')
      .eq('feedback_id', row.id)
      .order('created_at', { ascending: true })
    if (!e) setRemarks((data || []) as RemarkRow[])
    setLoading(false)
  }

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
  const [totalSent, setTotalSent] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const [tier, setTier] = useState<'low' | 'high'>('low')
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    setError(null)
    const [queueRes, sentRes] = await Promise.all([
      supabase
        .from('post_service_feedback_cre_queue')
        .select('*')
        .order('responded_at', { ascending: false })
        .limit(1000),
      supabase
        .from('post_service_feedback_messages')
        .select('id', { count: 'exact', head: true })
        .not('sent_at', 'is', null),
    ])
    if (queueRes.error) {
      setError(queueRes.error.message)
    } else {
      setRows((queueRes.data || []) as QueueRow[])
    }
    if (!sentRes.error) setTotalSent(sentRes.count || 0)
    setLoading(false)
  }

  const overview = useMemo<Overview>(() => ({
    totalSent,
    positiveCount:       rows.filter(r => r.rating >= 4).length,
    needsFollowupCount:  rows.filter(r => r.rating <= 3).length,
  }), [rows, totalSent])

  const tierRows = useMemo(
    () => rows.filter(r => (tier === 'low' ? r.rating <= 3 : r.rating >= 4)),
    [rows, tier],
  )

  const stats = useMemo<Stats>(() => ({
    total:       tierRows.length,
    open:        tierRows.filter(r => r.cre_status === 'open').length,
    in_progress: tierRows.filter(r => r.cre_status === 'in_progress').length,
    resolved:    tierRows.filter(r => r.cre_status === 'resolved').length,
  }), [tierRows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tierRows.filter(r => {
      if (tier === 'low' && filterStatus !== 'all' && r.cre_status !== filterStatus) return false
      if (q) {
        const hay = `${r.customer_name || ''} ${r.mobile_number} ${r.vehicle_registration_number || ''} ${r.branch || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [tierRows, tier, filterStatus, search])

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading Post Service Feedback queue…</div>
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
        <button onClick={fetchAll} className="mt-4 px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm">Retry</button>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Post Service Feedback</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Customers who responded to the post-service feedback message — follow up on low ratings, review the positive ones.
          </p>
        </div>
        <button
          onClick={fetchAll}
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

      <div className="border-b border-gray-200 flex gap-6">
        <button
          onClick={() => { setTier('low'); setExpandedId(null) }}
          className={`py-2 text-sm font-medium border-b-2 transition-colors ${tier === 'low' ? 'border-red-600 text-red-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Needs Follow-up (≤3★)
        </button>
        <button
          onClick={() => { setTier('high'); setExpandedId(null) }}
          className={`py-2 text-sm font-medium border-b-2 transition-colors ${tier === 'high' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Positive (≥4★)
        </button>
      </div>

      {tier === 'low' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Cases" value={stats.total} />
          <StatCard label="Open" value={stats.open} color="text-red-700" />
          <StatCard label="In Progress" value={stats.in_progress} color="text-yellow-700" />
          <StatCard label="Resolved" value={stats.resolved} color="text-green-700" />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {tier === 'low' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          )}
          <div className={tier === 'low' ? 'sm:col-span-2' : 'sm:col-span-3'}>
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
        <p className="text-xs text-gray-400 mt-2">{filtered.length} cases</p>
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
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3 font-medium">Remark</th>
                <th className="px-4 py-3 font-medium">{tier === 'low' ? 'Status' : 'Review Link'}</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No cases found.
                  </td>
                </tr>
              ) : filtered.map(r => (
                <Fragment key={r.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.customer_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono">{r.vehicle_registration_number || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.branch || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(r.closed_date)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.service_type || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.service_advisor_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono">{r.mobile_number}</td>
                    <td className="px-4 py-3"><Stars rating={r.rating} /></td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[220px] truncate" title={r.feedback_text || ''}>
                      {r.feedback_text || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {tier === 'low' ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.cre_status]}`}>
                          {STATUS_LABEL[r.cre_status]}
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.review_link_sent ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {r.review_link_sent ? 'Sent' : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{expandedId === r.id ? '▲' : '▼'}</td>
                  </tr>
                  {expandedId === r.id && (
                    <tr>
                      <td colSpan={11} className="p-0">
                        <RowDetail row={r} onUpdated={fetchAll} showActions={tier === 'low'} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
