import { Fragment, useCallback, useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { getWhatsAppLink, whatsappLocal10 } from '../lib/whatsappLink'

// ─── Types ────────────────────────────────────────────────────────────────────

type CreStatus = 'open' | 'in_progress' | 'resolved'
type Tier = 'low' | 'unrated' | 'high' | 'today'

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
  cre_rating: number | null
  effective_rating: number | null
  feedback_text: string | null
  responded_at: string | null
  cre_status: CreStatus
  resolved_at: string | null
  resolved_by_name: string | null
  service_advisor_name: string | null
  service_type: string | null
  review_link_sent: boolean
  branch: string | null
  next_follow_up_date: string | null
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
  todayCount: number
}

interface StatusStats {
  total: number
  open: number
  in_progress: number
  resolved: number
}

interface TodayProductivity {
  positive: number
  needsFollowup: number
  inProgress: number
  callNotPicked: number
  resolved: number
  total: number
  waSent: number
}

const PAGE_SIZE = 50

const PSF_WA_MESSAGE = `नमस्ते! 🚗
टाटा टेकव्हील्स, सीतापुरा की ओर से नमस्कार।

हाल ही में आपकी गाड़ी हमारे वर्कशॉप में सर्विस के लिए आई थी। हम जानना चाहेंगे कि सर्विस के बाद आपकी गाड़ी कैसी चल रही है।

🔹 सब ठीक है: जवाब में A लिखें।
🔹 कोई समस्या है: जवाब में B लिखें या हमें इसी नंबर पर कॉल करें।

आपका फीडबैक हमारे लिए बहुत महत्वपूर्ण है।

धन्यवाद! 🙏
टीम टाटा टेकव्हील्स, सीतापुरा`

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

function getTodayKolkataRange() {
  const now = new Date()
  const opts = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' } as const
  const tzDateStr = now.toLocaleString('en-US', opts)
  const [mm, dd, yyyy] = tzDateStr.split('/')
  const start = `${yyyy}-${mm}-${dd}T00:00:00+05:30`
  
  const startDate = new Date(start)
  startDate.setDate(startDate.getDate() + 1)
  const tm = startDate.getMonth() + 1
  const td = startDate.getDate()
  const ty = startDate.getFullYear()
  const end = `${ty}-${String(tm).padStart(2, '0')}-${String(td).padStart(2, '0')}T00:00:00+05:30`
  
  return { start, end }
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

function starColor(rating: number): string {
  return rating <= 2 ? 'text-red-600' : rating <= 3 ? 'text-yellow-600' : 'text-green-600'
}

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-gray-400 text-xs">—</span>
  return (
    <span className={starColor(rating)}>
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  )
}

function PsfWhatsAppButton({ mobile }: { mobile: string }) {
  const chip = 'rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 whitespace-nowrap'
  const local10 = whatsappLocal10(mobile || '')
  if (!local10) {
    return (
      <span onClick={e => e.stopPropagation()}>
        <button
          type="button"
          disabled
          title="Mobile number missing or invalid"
          className={`${chip} cursor-not-allowed opacity-50`}
        >
          💬 WA
        </button>
      </span>
    )
  }
  return (
    <a
      href={getWhatsAppLink(mobile, PSF_WA_MESSAGE)}
      target="_blank"
      rel="noreferrer"
      title="Open WhatsApp"
      onClick={e => e.stopPropagation()}
      className={`${chip} hover:bg-green-100`}
    >
      💬 WA
    </a>
  )
}

function RatingPicker({
  value,
  disabled,
  onSelect,
}: {
  value: number | null
  disabled: boolean
  onSelect: (rating: number) => void
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Rating">
      <span className="text-xs text-gray-500 mr-1">Rating</span>
      {[1, 2, 3, 4, 5].map(n => {
        const selected = value != null && n <= value
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            aria-pressed={value === n}
            disabled={disabled}
            onClick={() => onSelect(n)}
            className={`text-lg leading-none disabled:opacity-50 ${selected ? starColor(value) : 'text-gray-300 hover:text-gray-500'}`}
          >
            {selected ? '★' : '☆'}
          </button>
        )
      })}
    </div>
  )
}

type MetricVariant = 'neutral' | 'positive' | 'negative' | 'warn' | 'info' | 'orange' | 'purple'

const METRIC_ELEVATION =
  'shadow-[0_1px_2px_rgba(14,23,38,0.06),0_2px_6px_rgba(14,23,38,0.05)]'

const METRIC_VARIANT_CLASS: Record<MetricVariant, { shell: string; value: string }> = {
  neutral:  { shell: 'bg-white border-slate-200/90',        value: 'text-slate-900' },
  positive: { shell: 'bg-emerald-50/95 border-emerald-200/80', value: 'text-emerald-900' },
  negative: { shell: 'bg-red-50/95 border-red-200/80',         value: 'text-red-900' },
  warn:     { shell: 'bg-amber-50/95 border-amber-200/80',     value: 'text-amber-900' },
  info:     { shell: 'bg-sky-50/95 border-sky-200/80',         value: 'text-sky-900' },
  orange:   { shell: 'bg-orange-50/95 border-orange-200/80',   value: 'text-orange-900' },
  purple:   { shell: 'bg-violet-50/95 border-violet-200/80',   value: 'text-violet-900' },
}

function MetricTile({
  label,
  value,
  variant = 'neutral',
  overview = false,
}: {
  label: string
  value: number | string
  variant?: MetricVariant
  /** Fixed-width tile for the top summary row (never wraps within the trio). */
  overview?: boolean
}) {
  const v = METRIC_VARIANT_CLASS[variant]
  const sizeClass = overview
    ? 'w-[6.75rem] shrink-0 flex-none px-2 py-1'
    : 'min-w-[6.5rem] flex-1 basis-[7.5rem] max-w-[11rem] px-2.5 py-1.5'
  return (
    <div
      className={`rounded-md border ${sizeClass} ${METRIC_ELEVATION} ${v.shell}`}
    >
      <div className={`${overview ? 'text-sm' : 'text-base'} font-bold tabular-nums leading-none ${v.value}`}>{value}</div>
      <div className="text-[10px] font-medium leading-tight text-slate-700 mt-0.5">{label}</div>
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

function applyListFilters<Q extends {
  eq: (column: string, value: string) => Q
  or: (filters: string) => Q
  gte: (column: string, value: string) => Q
  lte: (column: string, value: string) => Q
}>(
  query: Q,
  opts: {
    search: string
    filterStatus: 'all' | CreStatus
    statusEnabled: boolean
    serviceDateFrom: string
    serviceDateTo: string
  },
): Q {
  let next = query
  if (opts.statusEnabled && opts.filterStatus !== 'all') {
    next = next.eq('cre_status', opts.filterStatus)
  }
  // closed_date is a Postgres date. Compare calendar dates only — no timestamps.
  if (opts.serviceDateFrom) next = next.gte('closed_date', opts.serviceDateFrom)
  if (opts.serviceDateTo) next = next.lte('closed_date', opts.serviceDateTo)
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
  const [callNotPicked, setCallNotPicked] = useState(false)
  const [followUpDate, setFollowUpDate] = useState(row.next_follow_up_date ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [savingRating, setSavingRating] = useState(false)
  const [selectedRating, setSelectedRating] = useState<number | null>(row.effective_rating)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setFollowUpDate(row.next_follow_up_date ?? '')
    setSelectedRating(row.effective_rating)
  }, [row.id, row.next_follow_up_date, row.effective_rating])

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
      const { error: e } = await supabase.rpc('psf_add_remark', {
        p_feedback_id: row.id,
        p_remark: draft.trim(),
        p_next_follow_up_date: followUpDate || null,
        p_set_next_follow_up_date: true,
        p_call_outcome: callNotPicked ? 'call_not_picked' : 'contacted'
      })
      if (e) throw e
      setDraft('')
      setCallNotPicked(false)
      await fetchRemarks()
      onUpdated()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add remark')
    } finally {
      setSubmitting(false)
    }
  }

  async function saveRating(next: number) {
    if (savingRating || submitting) return
    if (next === row.cre_rating) return
    setSavingRating(true)
    setSelectedRating(next)
    setError(null)
    try {
      const { error: e } = await supabase.rpc('psf_set_cre_rating', {
        p_feedback_id: row.id,
        p_cre_rating: next,
      })
      if (e) throw e
      onUpdated()
    } catch (e: unknown) {
      setSelectedRating(row.effective_rating)
      setError(e instanceof Error ? e.message : 'Failed to save rating')
    } finally {
      setSavingRating(false)
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
      const { error: e } = await supabase.rpc('psf_mark_resolved', {
        p_feedback_id: row.id,
        p_remark: draft.trim(),
        p_next_follow_up_date: followUpDate || null,
        p_set_next_follow_up_date: true,
      })
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
        {row.rating != null && (
          <p className="text-sm text-gray-600 mb-2">
            Customer rating: <Stars rating={row.rating} />
          </p>
        )}
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
          <div className="flex flex-col md:flex-row gap-2 md:items-end">
            <div className="flex-1 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={callNotPicked}
                  onChange={e => {
                    setCallNotPicked(e.target.checked)
                    if (e.target.checked) setDraft('Call Not Picked')
                  }}
                />
                <span className="text-sm font-medium text-gray-700">Call Not Picked</span>
              </label>
              <textarea
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                rows={2}
                placeholder="Add a call remark…"
                value={draft}
                onChange={e => setDraft(e.target.value)}
              />
            </div>
            <label className="md:w-52 shrink-0">
              <span className="block text-xs text-gray-500 mb-1">Next Follow-up Date</span>
              <input
                type="date"
                aria-label="Next Follow-up Date"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                value={followUpDate}
                onChange={e => setFollowUpDate(e.target.value)}
              />
            </label>
          </div>
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
            <RatingPicker
              value={selectedRating}
              disabled={savingRating || submitting}
              onSelect={next => { void saveRating(next) }}
            />
            {savingRating && <span className="text-xs text-gray-400">Saving…</span>}
          </div>
        </div>
      )}

      {showActions && row.cre_status === 'resolved' && (
        <div className="space-y-1">
          <p className="text-sm text-green-700">
            ✓ Resolved by <span className="font-medium">{row.resolved_by_name}</span> on {fmtDateTime(row.resolved_at)}
          </p>
          <p className="text-sm text-gray-600">
            Next Follow-up Date: <span className="font-medium">{fmtDate(row.next_follow_up_date)}</span>
          </p>
        </div>
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
    totalSent: 0, positiveCount: 0, needsFollowupCount: 0, unratedCount: 0, todayCount: 0,
  })
  const [statusStats, setStatusStats] = useState<StatusStats>({
    total: 0, open: 0, in_progress: 0, resolved: 0,
  })
  const [todayProductivity, setTodayProductivity] = useState<TodayProductivity>({
    positive: 0, needsFollowup: 0, inProgress: 0, callNotPicked: 0, resolved: 0, total: 0, waSent: 0,
  })
  const [filteredTotal, setFilteredTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const [tier, setTier] = useState<Tier>('low')
  const [filterStatus, setFilterStatus] = useState<'all' | CreStatus>('all')
  const [serviceDateFrom, setServiceDateFrom] = useState('')
  const [serviceDateTo, setServiceDateTo] = useState('')
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
    const statusEnabled = tier === 'low' || tier === 'unrated' || tier === 'today'
    const table = tier === 'today'
      ? 'post_service_feedback_cre_due_today'
      : tier === 'unrated'
        ? 'post_service_feedback_cre_unrated'
        : 'post_service_feedback_cre_queue'

    let query = supabase.from(table).select('*', { count: 'exact' })
    if (tier === 'low') query = query.lte('effective_rating', 3)
    if (tier === 'high') query = query.gte('effective_rating', 4)
    query = applyListFilters(query, {
      search: debouncedSearch,
      filterStatus,
      statusEnabled,
      serviceDateFrom,
      serviceDateTo,
    })
    query = tier === 'unrated'
      ? query.order('sent_at', { ascending: false })
      : tier === 'today'
        ? query.order('closed_date', { ascending: false })
        : query.order('responded_at', { ascending: false })

    const statusBase = () => {
      let q = tier === 'today'
        ? supabase.from('post_service_feedback_cre_due_today').select('id', { count: 'exact', head: true })
        : tier === 'low'
          ? baseCount().lte('effective_rating', 3)
          : baseCount().is('effective_rating', null)
      if (serviceDateFrom) q = q.gte('closed_date', serviceDateFrom)
      if (serviceDateTo) q = q.lte('closed_date', serviceDateTo)
      return q
    }

    const dueTodayCount = () =>
      supabase.from('post_service_feedback_cre_due_today').select('id', { count: 'exact', head: true })

    const kolkataRange = getTodayKolkataRange()
    const waSentCount = () =>
      supabase.from('post_service_feedback_messages')
        .select('id', { count: 'exact', head: true })
        .not('sent_at', 'is', null)
        .gte('sent_at', kolkataRange.start)
        .lt('sent_at', kolkataRange.end)

    const [
      totalSent, positiveCount, needsFollowupCount, unratedCount, todayCount, pageRes, statusTotal, statusOpen, statusInProgress, statusResolved,
      prodRes, todayWaSentCount
    ] = await Promise.all([
      readCount(baseCount()),
      readCount(baseCount().gte('effective_rating', 4)),
      readCount(baseCount().lte('effective_rating', 3)),
      readCount(baseCount().is('effective_rating', null)),
      readCount(dueTodayCount()),
      query.range(from, to),
      tier === 'high' ? Promise.resolve(0) : readCount(statusBase()),
      tier === 'high' ? Promise.resolve(0) : readCount(statusBase().eq('cre_status', 'open')),
      tier === 'high' ? Promise.resolve(0) : readCount(statusBase().eq('cre_status', 'in_progress')),
      tier === 'high' || tier === 'today' ? Promise.resolve(0) : readCount(statusBase().eq('cre_status', 'resolved')),
      supabase.rpc('psf_get_today_productivity'),
      readCount(waSentCount()),
    ])

    if (pageRes.error) throw pageRes.error
    if (prodRes.error) throw prodRes.error

    const prod = prodRes.data as { positive: number, needsFollowup: number, inProgress: number, callNotPicked: number, resolved: number, total: number } || { positive: 0, needsFollowup: 0, inProgress: 0, callNotPicked: 0, resolved: 0, total: 0 }

    return {
      overview: { totalSent, positiveCount, needsFollowupCount, unratedCount, todayCount },
      statusStats: {
        total: statusTotal,
        open: statusOpen,
        in_progress: statusInProgress,
        resolved: statusResolved,
      },
      todayProductivity: {
        positive: prod.positive,
        needsFollowup: prod.needsFollowup,
        inProgress: prod.inProgress,
        callNotPicked: prod.callNotPicked,
        resolved: prod.resolved,
        total: prod.total,
        waSent: todayWaSentCount,
      },
      rows: (pageRes.data || []) as QueueRow[],
      filteredTotal: pageRes.count || 0,
    }
  }, [tier, filterStatus, serviceDateFrom, serviceDateTo, debouncedSearch, page])

  const applyQueue = useCallback((result: Awaited<ReturnType<typeof fetchQueue>>) => {
    setOverview(result.overview)
    setStatusStats(result.statusStats)
    setTodayProductivity(result.todayProductivity)
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
    if (tier === 'today') return overview.todayCount
    return overview.positiveCount
  }, [tier, overview])

  const showStatusFilter = tier === 'low' || tier === 'unrated' || tier === 'today'
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
    <div className="flex w-full max-w-none flex-col gap-1.5 min-h-0 h-[calc(100dvh-var(--util-h)-var(--nav-h)-5.25rem)]">
      <div className="shrink-0 grid grid-cols-1 gap-1.5 lg:grid-cols-[auto_auto_minmax(0,1fr)_auto] lg:items-end lg:gap-x-2.5">
        <h1 className="text-lg font-semibold text-gray-900 leading-tight lg:pr-1">Post Service Feedback</h1>
        <div className="flex flex-nowrap gap-1.5">
          <MetricTile overview label="Messages Sent" value={overview.totalSent} variant="neutral" />
          <MetricTile overview label="4★ & Above" value={overview.positiveCount} variant="positive" />
          <MetricTile overview label="3★ & Below" value={overview.needsFollowupCount} variant="negative" />
        </div>
        <div className="flex min-w-0 flex-nowrap items-end gap-2 overflow-x-auto pb-px lg:justify-end">
          {showStatusFilter && (
            <label className="flex shrink-0 flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-slate-700">Status</span>
              <select
                className="w-[6.75rem] border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 bg-white"
                value={filterStatus}
                onChange={e => { setFilterStatus(e.target.value as typeof filterStatus); setPage(1); setExpandedId(null) }}
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
          )}
          <div className="flex shrink-0 flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-slate-700 whitespace-nowrap">Service Date</span>
              {(serviceDateFrom || serviceDateTo) && (
                <button
                  type="button"
                  className="text-[10px] font-medium text-slate-600 hover:text-slate-900"
                  onClick={() => {
                    setServiceDateFrom('')
                    setServiceDateTo('')
                    setPage(1)
                    setExpandedId(null)
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <input
                type="date"
                aria-label="Service Date from"
                className="w-[7.75rem] min-w-0 border border-gray-300 rounded px-1.5 py-1 text-sm text-gray-900 bg-white"
                value={serviceDateFrom}
                onChange={e => { setServiceDateFrom(e.target.value); setPage(1); setExpandedId(null) }}
              />
              <span className="text-xs text-slate-500 shrink-0">–</span>
              <input
                type="date"
                aria-label="Service Date to"
                className="w-[7.75rem] min-w-0 border border-gray-300 rounded px-1.5 py-1 text-sm text-gray-900 bg-white"
                value={serviceDateTo}
                onChange={e => { setServiceDateTo(e.target.value); setPage(1); setExpandedId(null) }}
              />
            </div>
          </div>
          <label className="flex shrink-0 flex-col gap-0.5">
            <span className="text-[10px] font-semibold text-slate-700">Search</span>
            <input
              type="text"
              title="Search by name, mobile, reg no, branch"
              aria-label="Search name, mobile, reg no, branch"
              className="w-[10.5rem] border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 bg-white"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
            />
          </label>
        </div>
        <button
          onClick={() => void load()}
          className="shrink-0 justify-self-end px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium text-gray-800 lg:justify-self-auto"
        >
          Refresh
        </button>
      </div>
      {error && <p className="shrink-0 text-xs text-red-600">{error}</p>}

      <div className="shrink-0 border-b border-gray-200 flex flex-wrap gap-x-4 gap-y-0">
        <button
          onClick={() => { setTier('low'); setFilterStatus('all'); setPage(1); setExpandedId(null) }}
          className={`py-1.5 text-sm font-medium border-b-2 transition-colors ${tier === 'low' ? 'border-red-600 text-red-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Needs Follow-up (≤3★)
          <span className="ml-1.5 text-xs text-gray-400">{overview.needsFollowupCount}</span>
        </button>
        <button
          onClick={() => { setTier('unrated'); setFilterStatus('all'); setPage(1); setExpandedId(null) }}
          className={`py-1.5 text-sm font-medium border-b-2 transition-colors ${tier === 'unrated' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          No Rating / No Response
          <span className="ml-1.5 text-xs text-gray-400">{overview.unratedCount}</span>
        </button>
        <button
          onClick={() => { setTier('high'); setFilterStatus('all'); setPage(1); setExpandedId(null) }}
          className={`py-1.5 text-sm font-medium border-b-2 transition-colors ${tier === 'high' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Positive (≥4★)
          <span className="ml-1.5 text-xs text-gray-400">{overview.positiveCount}</span>
        </button>
        <button
          onClick={() => { setTier('today'); setFilterStatus('all'); setPage(1); setExpandedId(null) }}
          className={`py-1.5 text-sm font-medium border-b-2 transition-colors ${tier === 'today' ? 'border-sky-600 text-sky-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Today's Follow-ups
          <span className="ml-1.5 text-xs text-gray-400">{overview.todayCount}</span>
        </button>
      </div>

      <div className="shrink-0 flex gap-1.5 overflow-x-auto pb-0.5">
        {showStatusFilter && (
          <>
            <MetricTile label="Total Cases" value={statusStats.total} variant="neutral" />
            <MetricTile label="Open" value={statusStats.open} variant="negative" />
            <MetricTile label="In Progress" value={statusStats.in_progress} variant="warn" />
            <MetricTile label="Resolved" value={statusStats.resolved} variant="positive" />
          </>
        )}
        <MetricTile label="Today's 4★ & Above" value={todayProductivity.positive} variant="positive" />
        <MetricTile label="Today's 3★ & Below" value={todayProductivity.needsFollowup} variant="negative" />
        <MetricTile label="Today's In Progress" value={todayProductivity.inProgress} variant="warn" />
        <MetricTile label="Today's Call Not Picked" value={todayProductivity.callNotPicked} variant="orange" />
        <MetricTile label="Today's Resolved" value={todayProductivity.resolved} variant="positive" />
        <MetricTile label="Today's Total Unique Calls" value={todayProductivity.total} variant="info" />
        <MetricTile label="Today's WA Sent" value={todayProductivity.waSent} variant="purple" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_1px_2px_rgba(14,23,38,0.05)]">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50/98 shadow-[0_1px_0_0_rgb(229,231,235),0_2px_4px_rgba(14,23,38,0.04)]">
              <tr className="border-b border-gray-200 text-left text-[11px] text-slate-700 uppercase tracking-wide">
                <th className="px-3 py-2 font-semibold">Customer</th>
                <th className="px-3 py-2 font-semibold">Reg No</th>
                <th className="px-3 py-2 font-semibold">Branch</th>
                <th className="px-3 py-2 font-semibold">Service Date</th>
                <th className="px-3 py-2 font-semibold">Service Type</th>
                <th className="px-3 py-2 font-semibold">Service Advisor</th>
                <th className="px-3 py-2 font-semibold">Mobile</th>
                {tier === 'unrated' ? (
                  <>
                    <th className="px-3 py-2 font-semibold">Message Sent At</th>
                    <th className="px-3 py-2 font-semibold">Days Since Sent</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-2 font-semibold">Rating</th>
                    <th className="px-3 py-2 font-semibold">Remark</th>
                  </>
                )}
                <th className="px-3 py-2 font-semibold">{tier === 'high' ? 'Review Link' : 'Status'}</th>
                <th className="px-3 py-2 font-semibold"></th>
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
                    <td className="px-3 py-2 font-medium text-gray-800">{r.customer_name || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 font-mono">{r.vehicle_registration_number || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{r.branch || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{fmtDate(r.closed_date)}</td>
                    <td className="px-3 py-2 text-gray-600">{r.service_type || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{r.service_advisor_name || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 font-mono">{r.mobile_number}</td>
                    {tier === 'unrated' ? (
                      <>
                        <td className="px-3 py-2 text-gray-600 text-xs">{fmtDateTime(r.sent_at)}</td>
                        <td className="px-3 py-2 text-gray-600">{daysSinceSent(r.sent_at)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2"><Stars rating={r.effective_rating} /></td>
                        <td className="px-3 py-2 text-xs text-gray-600 max-w-[220px] truncate" title={r.feedback_text || ''}>
                          {r.feedback_text || '—'}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2">
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
                    <td className="px-3 py-2 text-gray-400 text-xs">
                      <div className="flex items-center justify-end gap-2">
                        <PsfWhatsAppButton mobile={r.mobile_number} />
                        <span>{expandedId === r.id ? '▲' : '▼'}</span>
                      </div>
                    </td>
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
        <div className="shrink-0 px-3 py-1.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span className="font-medium tabular-nums">
            {filteredTotal} cases
            {filteredTotal !== tabCount ? ` of ${tabCount}` : ''}
            {loading ? ' · Updating…' : ''}
          </span>
          {totalPages > 1 && (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-gray-500">Page {page} of {totalPages}</span>
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
    </div>
  )
}
