import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateRepairPPT } from '../lib/generators/generatePPT'
import { generateEstimateExcel } from '../lib/generators/generateExcel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobRow {
  job_card_id:           string
  jc_number:             string
  reg_number:            string
  model:                 string | null
  vehicle_year:          number | null
  colour:                string | null
  complaint_date:        string
  status:                string
  warranty_age_days:     number | null
  tml_share_percent:     number | null
  total_estimate_amount: number | null
  panel_count:           number
  photo_count:           number
  has_ppt_pre:           boolean
  has_ppt_post:          boolean
}

type GenKey = `${'pre' | 'post' | 'xls'}-${string}`

const STATUS_COLOURS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  approved:  'bg-purple-100 text-purple-700',
  in_work:   'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
}

const SKELETON_COLS = 12

// ─── Component ────────────────────────────────────────────────────────────────

export default function AutoDocPage() {
  const [rows,         setRows]         = useState<JobRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [generating,   setGenerating]   = useState<Set<GenKey>>(new Set())
  const [toast,        setToast]        = useState<{ msg: string; ok: boolean } | null>(null)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatus]       = useState<string>('all')

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchRows = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else { setLoading(true); setError(null) }

    const { data, error: err } = await supabase
      .from('job_card_summary')
      .select([
        'job_card_id', 'jc_number', 'reg_number', 'model', 'vehicle_year',
        'colour', 'complaint_date', 'status', 'warranty_age_days',
        'tml_share_percent', 'total_estimate_amount', 'panel_count',
        'photo_count', 'has_ppt_pre', 'has_ppt_post',
      ].join(', '))
      .order('jc_created_at', { ascending: false })

    if (err) {
      setError(err.message)
    } else {
      setRows((data ?? []) as JobRow[])
      setError(null)
    }

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { void fetchRows() }, [fetchRows])

  // ── Generate PPT ───────────────────────────────────────────────────────────
  async function handleGenerate(jobCardId: string, type: 'pre-repair' | 'post-repair') {
    const key: GenKey = `${type === 'pre-repair' ? 'pre' : 'post'}-${jobCardId}`
    setGenerating(prev => new Set(prev).add(key))
    setToast(null)
    try {
      await generateRepairPPT(jobCardId, type)
      showToast('PPT downloaded successfully.', true)
    } catch (e) {
      showToast((e as Error).message ?? 'Failed to generate PPT.', false)
    } finally {
      setGenerating(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  // ── Generate Excel ─────────────────────────────────────────────────────────
  async function handleExcel(jobCardId: string) {
    const key: GenKey = `xls-${jobCardId}`
    setGenerating(prev => new Set(prev).add(key))
    setToast(null)
    try {
      await generateEstimateExcel(jobCardId)
      showToast('Excel estimate downloaded successfully.', true)
    } catch (e) {
      showToast((e as Error).message ?? 'Failed to generate Excel.', false)
    } finally {
      setGenerating(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase()
  const displayed = rows.filter(r => {
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    const matchSearch = !q
      || r.reg_number.toLowerCase().includes(q)
      || r.jc_number.toLowerCase().includes(q)
      || (r.model ?? '').toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-gray-50 p-4 pb-24 md:p-6 md:pb-6">

      {/* Page header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">AutoDoc — Body &amp; Paint</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Generate pre-repair and post-repair PPT reports for TML warranty claims.
          </p>
        </div>
        <button
          onClick={() => void fetchRows(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {refreshing
            ? <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
            : <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
          }
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search by Reg No, JC No, or Model…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-9 w-full sm:w-72 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 placeholder-gray-400 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <select
          value={statusFilter}
          onChange={e => setStatus(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="in_work">In Work</option>
          <option value="completed">Completed</option>
        </select>
        {!loading && (
          <span className="ml-auto text-xs text-gray-400">
            {displayed.length} job card{displayed.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Error state with retry */}
      {!loading && error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button
            onClick={() => void fetchRows()}
            className="ml-4 shrink-0 text-xs font-semibold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Skeleton loaders */}
      {loading && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {['JC Number', 'Reg No.', 'Model', 'Date', 'Status', 'Age', 'TML%', 'Panels', 'Photos', 'Estimate', 'PPT', 'Excel'].map(h => (
                  <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: SKELETON_COLS }).map((__, c) => (
                    <td key={c} className="px-4 py-3">
                      <div className={`h-4 rounded bg-gray-200 ${c === 1 ? 'w-20' : c >= 10 ? 'w-16' : 'w-24'}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && displayed.length === 0 && (
        <div className="py-16 text-center text-sm text-gray-400">
          No job cards found.{q || statusFilter !== 'all' ? ' Try clearing the filters.' : ''}
        </div>
      )}

      {/* Table */}
      {!loading && !error && displayed.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm print-table">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">JC Number</th>
                <th className="px-4 py-3">Reg No.</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Complaint Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Age (days)</th>
                <th className="px-4 py-3 text-center">TML %</th>
                <th className="px-4 py-3 text-center">Panels</th>
                <th className="px-4 py-3 text-center">Photos</th>
                <th className="px-4 py-3 text-right">Estimate</th>
                <th className="px-4 py-3 text-center">Generate PPT</th>
                <th className="px-4 py-3 text-center">Export Excel</th>
                <th className="px-4 py-3 print:hidden" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.map(row => {
                const preKey: GenKey  = `pre-${row.job_card_id}`
                const postKey: GenKey = `post-${row.job_card_id}`
                const xlsKey: GenKey  = `xls-${row.job_card_id}`
                const genPre  = generating.has(preKey)
                const genPost = generating.has(postKey)
                const genXls  = generating.has(xlsKey)
                const anyGen  = genPre || genPost || genXls

                return (
                  <tr key={row.job_card_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{row.jc_number}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.reg_number}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.model ?? '—'}
                      {row.vehicle_year
                        ? <span className="ml-1 text-gray-400">'{String(row.vehicle_year).slice(2)}</span>
                        : null}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(row.complaint_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_COLOURS[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {row.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">{row.warranty_age_days ?? '—'}</td>
                    <td className="px-4 py-3 text-center font-medium text-gray-700">
                      {row.tml_share_percent != null ? `${row.tml_share_percent}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{row.panel_count}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{row.photo_count}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {row.total_estimate_amount != null
                        ? `₹ ${row.total_estimate_amount.toLocaleString('en-IN')}`
                        : '—'}
                    </td>

                    {/* PPT Buttons */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <PptButton
                          label="Pre-Repair"
                          busy={genPre}
                          disabled={anyGen && !genPre}
                          onClick={() => void handleGenerate(row.job_card_id, 'pre-repair')}
                        />
                        <PptButton
                          label="Post-Repair"
                          busy={genPost}
                          disabled={anyGen && !genPost}
                          onClick={() => void handleGenerate(row.job_card_id, 'post-repair')}
                          variant="post"
                        />
                      </div>
                    </td>

                    {/* Excel Button */}
                    <td className="px-4 py-3 text-center">
                      <XlsButton
                        busy={genXls}
                        disabled={anyGen && !genXls}
                        onClick={() => void handleExcel(row.job_card_id)}
                      />
                    </td>

                    {/* View link */}
                    <td className="px-4 py-3 print:hidden">
                      <Link
                        to={`/autodoc/${row.job_card_id}`}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        View
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={[
          'fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm shadow-lg',
          toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
        ].join(' ')}>
          {toast.ok ? <CheckIcon /> : <XCircleIcon />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface PptButtonProps {
  label:    string
  busy:     boolean
  disabled: boolean
  onClick:  () => void
  variant?: 'pre' | 'post'
}

function PptButton({ label, busy, disabled, onClick, variant = 'pre' }: PptButtonProps) {
  const base    = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1'
  const colours = variant === 'post'
    ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400 disabled:opacity-40'
    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-300 disabled:opacity-40'
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled} className={`${base} ${colours}`}>
      {busy ? <Spinner /> : <DownloadIcon />}
      {busy ? 'Generating…' : label}
    </button>
  )
}

function XlsButton({ busy, disabled, onClick }: { busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} disabled={busy || disabled}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1 disabled:opacity-40"
    >
      {busy ? <Spinner /> : <TableIcon />}
      {busy ? 'Generating…' : 'Estimate'}
    </button>
  )
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Spinner()      { return <span className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin" /> }
function DownloadIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}
function TableIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M6 3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3z" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}
function XCircleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
