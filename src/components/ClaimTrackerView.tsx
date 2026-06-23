/**
 * ClaimTrackerView — Claim Submission tracker for AutoDoc
 *
 * Shows all job cards with status 'submitted' or 'completed' as cards.
 * Each card shows:
 *   - Chassis (VIN), Reg No, Chassis Age
 *   - Doc checklist: Pre-PPT, Post-PPT, Excel Estimate
 *   - "Create GDC" button (only when chassis age > 3 years / 1095 days)
 *   - "Claim Submitted" button → hides the card
 */

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// ── types ─────────────────────────────────────────────────────────────────────
interface ClaimRow {
  job_card_id:        string
  jc_number:          string
  reg_number:         string | null
  vin:                string | null
  model:              string | null
  colour:             string | null
  complaint_date:     string
  date_of_sale:       string | null
  warranty_age_days:  number | null
  has_ppt_pre:        boolean
  has_ppt_post:       boolean
  has_excel_estimate: boolean
  total_estimate_amount: number | null
  owner_name:         string | null
  km_reading:         number | null
  // live DB columns (may not exist yet — handled gracefully)
  gdc_status?:        'none' | 'pending' | 'done' | null
  claim_hidden?:      boolean | null
  claim_submitted_at?: string | null
}

interface Props {
  supabaseUrl: string
  supabaseKey: string
}

// ── helpers ───────────────────────────────────────────────────────────────────
function ageLabel(days: number | null | undefined): { text: string; years: number } {
  if (days == null || isNaN(days)) return { text: '—', years: 0 }
  const years  = Math.floor(days / 365)
  const months = Math.round((days % 365) / 30)
  const text   = years > 0
    ? `${years}Y ${months}M (${days}d)`
    : `${months} months (${days}d)`
  return { text, years }
}

function DocChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={[
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
      ok
        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
        : 'bg-red-50 text-red-600 ring-1 ring-red-200',
    ].join(' ')}>
      {ok
        ? <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
        : <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
      }
      {label}
    </span>
  )
}

// ── LOCAL STORAGE fallback (until DB migration runs) ─────────────────────────
const LS_GDC    = 'autodoc_gdc_status'
const LS_HIDDEN = 'autodoc_claim_hidden'

function lsGet(key: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}') } catch { return {} }
}
function lsSet(key: string, map: Record<string, string>) {
  try { localStorage.setItem(key, JSON.stringify(map)) } catch {}
}

// ── component ────────────────────────────────────────────────────────────────
export function ClaimTrackerView({ supabaseUrl, supabaseKey }: Props) {
  const [rows,        setRows]        = useState<ClaimRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [gdcMap,      setGdcMap]      = useState<Record<string, string>>({})   // jobCardId → 'none'|'pending'|'done'
  const [hiddenMap,   setHiddenMap]   = useState<Record<string, boolean>>({})  // jobCardId → true/false
  const [busyId,      setBusyId]      = useState<string | null>(null)
  const [showHidden,  setShowHidden]  = useState(false)
  const [hasDbCols,   setHasDbCols]   = useState(false)    // true once DB migration ran

  const sb = createClient(supabaseUrl, supabaseKey)

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchRows = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: err } = await sb
        .from('job_card_summary')
        .select(`
          job_card_id, jc_number, reg_number, vin, model, colour,
          complaint_date, date_of_sale, warranty_age_days,
          has_ppt_pre, has_ppt_post, has_excel_estimate,
          total_estimate_amount, owner_name, km_reading,
          gdc_status, claim_hidden, claim_submitted_at
        `)
        .in('status', ['submitted', 'completed'])
        .order('complaint_date', { ascending: false })

      if (err) throw err

      const fetched = (data ?? []) as ClaimRow[]

      // Check if DB columns exist
      const firstRow = fetched[0]
      const dbHasCols = firstRow != null && 'gdc_status' in firstRow
      setHasDbCols(dbHasCols)

      setRows(fetched)

      if (dbHasCols) {
        // Build maps from DB data
        const gdc: Record<string, string> = {}
        const hidden: Record<string, boolean> = {}
        for (const r of fetched) {
          gdc[r.job_card_id]    = r.gdc_status ?? 'none'
          hidden[r.job_card_id] = r.claim_hidden ?? false
        }
        setGdcMap(gdc)
        setHiddenMap(hidden)
      } else {
        // Fall back to localStorage
        setGdcMap(lsGet(LS_GDC))
        const hm: Record<string, boolean> = {}
        const raw = lsGet(LS_HIDDEN)
        for (const [k, v] of Object.entries(raw)) hm[k] = v === 'true'
        setHiddenMap(hm)
      }
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to load claim data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchRows() }, [fetchRows])

  // ── update GDC status ──────────────────────────────────────────────────────
  async function toggleGdc(id: string, currentGdc: string) {
    const next = currentGdc === 'done' ? 'pending' : 'done'
    setBusyId(id)
    try {
      if (hasDbCols) {
        await sb.from('job_cards').update({ gdc_status: next }).eq('id', id)
      }
      const m = { ...gdcMap, [id]: next }
      setGdcMap(m)
      if (!hasDbCols) lsSet(LS_GDC, m)
    } finally {
      setBusyId(null)
    }
  }

  // ── mark claim submitted (hide card) ──────────────────────────────────────
  async function markSubmitted(id: string) {
    setBusyId(id)
    try {
      if (hasDbCols) {
        await sb.from('job_cards').update({
          claim_hidden:      true,
          claim_submitted_at: new Date().toISOString(),
        }).eq('id', id)
      }
      const hm = { ...hiddenMap, [id]: true }
      setHiddenMap(hm)
      if (!hasDbCols) {
        const raw = lsGet(LS_HIDDEN)
        raw[id] = 'true'
        lsSet(LS_HIDDEN, raw)
      }
    } finally {
      setBusyId(null)
    }
  }

  // ── undo hide ──────────────────────────────────────────────────────────────
  async function unhideRow(id: string) {
    setBusyId(id)
    try {
      if (hasDbCols) {
        await sb.from('job_cards').update({
          claim_hidden:      false,
          claim_submitted_at: null,
        }).eq('id', id)
      }
      const hm = { ...hiddenMap, [id]: false }
      setHiddenMap(hm)
      if (!hasDbCols) {
        const raw = lsGet(LS_HIDDEN)
        raw[id] = 'false'
        lsSet(LS_HIDDEN, raw)
      }
    } finally {
      setBusyId(null)
    }
  }

  // ── derived ────────────────────────────────────────────────────────────────
  const visible = rows.filter(r => showHidden || !hiddenMap[r.job_card_id])
  const hiddenCount = rows.filter(r => hiddenMap[r.job_card_id]).length

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="card animate-pulse">
            <div className="card__body p-5 space-y-3">
              <div className="h-4 w-32 rounded bg-gray-200" />
              <div className="h-3 w-24 rounded bg-gray-200" />
              <div className="h-3 w-40 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
        <span>{error}</span>
        <button onClick={() => void fetchRows()} className="underline text-xs ml-4">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Claim Submission Tracker</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {rows.length} submitted claim{rows.length !== 1 ? 's' : ''}
            {hiddenCount > 0 && ` · ${hiddenCount} completed hidden`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hiddenCount > 0 && (
            <button
              className="btn btn--soft btn--sm"
              onClick={() => setShowHidden(v => !v)}
            >
              {showHidden ? 'Hide completed' : `Show ${hiddenCount} completed`}
            </button>
          )}
          <button className="btn btn--soft btn--sm" onClick={() => void fetchRows()}>
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {visible.length === 0 && !showHidden && (
        <div className="py-20 text-center text-sm text-gray-400">
          No submitted claims yet. Claims appear here once the email is sent from the Submit tab.
        </div>
      )}

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map(row => {
          const gdcStatus  = (gdcMap[row.job_card_id] ?? 'none') as 'none' | 'pending' | 'done'
          const isHidden   = hiddenMap[row.job_card_id] ?? false
          const isBusy     = busyId === row.job_card_id
          const { text: ageText, years: ageYears } = ageLabel(row.warranty_age_days)
          const needsGdc   = ageYears >= 3
          const allDocsOk  = row.has_ppt_pre && row.has_ppt_post && row.has_excel_estimate

          return (
            <div
              key={row.job_card_id}
              className={[
                'card flex flex-col transition-opacity',
                isHidden ? 'opacity-60' : '',
              ].join(' ')}
            >
              {/* Card header */}
              <div className="card__head !py-3 !px-4 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-gray-700 truncate">
                      {row.jc_number}
                    </span>
                    {isHidden && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        ✓ Submitted
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{row.owner_name ?? '—'}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm font-bold text-gray-900">{row.reg_number ?? '—'}</div>
                  <div className="text-xs text-gray-400">{row.model ?? '—'} · {row.colour ?? '—'}</div>
                </div>
              </div>

              {/* Body */}
              <div className="card__body p-4 flex-1 space-y-3">
                {/* Key figures */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <div className="text-gray-400 mb-0.5">Chassis (VIN)</div>
                    <div className="font-mono font-semibold text-gray-800 text-[11px] leading-tight break-all">
                      {row.vin ?? '—'}
                    </div>
                  </div>
                  <div className={[
                    'rounded-lg px-3 py-2',
                    needsGdc ? 'bg-amber-50' : 'bg-gray-50',
                  ].join(' ')}>
                    <div className="text-gray-400 mb-0.5">Chassis Age</div>
                    <div className={[
                      'font-semibold text-[11px] leading-tight',
                      needsGdc ? 'text-amber-700' : 'text-gray-800',
                    ].join(' ')}>
                      {ageText}
                    </div>
                    {needsGdc && (
                      <div className="text-[10px] text-amber-600 mt-0.5 font-medium">
                        GDC required (age &gt; 3Y)
                      </div>
                    )}
                  </div>
                </div>

                {/* Doc checklist */}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                    Documents
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <DocChip ok={row.has_ppt_pre}        label="Pre-Repair PPT" />
                    <DocChip ok={row.has_ppt_post}       label="Post-Repair PPT" />
                    <DocChip ok={row.has_excel_estimate} label="Estimate Excel" />
                  </div>
                  {!allDocsOk && (
                    <p className="mt-1.5 text-[10px] text-red-500">
                      ⚠ Missing documents — upload before submitting to TML
                    </p>
                  )}
                </div>

                {/* Estimate value */}
                {row.total_estimate_amount != null && row.total_estimate_amount > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-1.5 text-xs">
                    <span className="text-blue-600">Claim Value</span>
                    <span className="font-bold text-blue-800">
                      Rs {row.total_estimate_amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
              </div>

              {/* Footer — action buttons */}
              <div className="border-t border-gray-100 p-3 flex flex-col gap-2">
                {/* GDC button — shown only for age > 3 years */}
                {needsGdc && (
                  <button
                    disabled={isBusy}
                    onClick={() => void toggleGdc(row.job_card_id, gdcStatus)}
                    className={[
                      'w-full rounded-lg px-3 py-2 text-sm font-semibold transition-all flex items-center justify-center gap-2',
                      gdcStatus === 'done'
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-amber-500 text-white hover:bg-amber-600',
                      isBusy ? 'opacity-60 cursor-not-allowed' : '',
                    ].join(' ')}
                  >
                    {isBusy ? (
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                    ) : gdcStatus === 'done' ? (
                      <>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                        </svg>
                        GDC Done
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                        </svg>
                        Create GDC
                      </>
                    )}
                  </button>
                )}

                {/* Claim Submitted button */}
                {isHidden ? (
                  <button
                    disabled={isBusy}
                    onClick={() => void unhideRow(row.job_card_id)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    Undo — Reopen Claim
                  </button>
                ) : (
                  <button
                    disabled={isBusy || (needsGdc && gdcStatus !== 'done')}
                    onClick={() => void markSubmitted(row.job_card_id)}
                    title={needsGdc && gdcStatus !== 'done' ? 'Complete GDC first for chassis older than 3 years' : undefined}
                    className={[
                      'w-full rounded-lg px-3 py-2 text-sm font-semibold transition-all flex items-center justify-center gap-2',
                      needsGdc && gdcStatus !== 'done'
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700',
                      isBusy ? 'opacity-60 cursor-not-allowed' : '',
                    ].join(' ')}
                  >
                    {isBusy ? (
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        Claim Submitted to TML
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
