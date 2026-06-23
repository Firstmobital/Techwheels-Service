import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// ── Supabase client ──────────────────────────────────────────────────────────
const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
)

// ── Types ────────────────────────────────────────────────────────────────────
interface ClaimRow {
  job_card_id:        string
  jc_number:          string | null
  reg_number:         string | null   // 1. Reg No
  vin:                string | null   // 2. Chassis No
  model:              string | null
  colour:             string | null
  warranty_age_days:  number | null   // 8. Age of vehicle
  // docs
  has_ppt_pre:        boolean         // 6a. Final PPT - Pre
  has_ppt_post:       boolean         // 6b. Final PPT - Post
  has_excel_estimate: boolean         // 7. Estimate
  // GDC / hidden (stored in DB)
  gdc_status?:        'none' | 'pending' | 'done' | null
  claim_hidden?:      boolean | null
  // photo counts (fetched separately)
  pre_pics?:          number          // 3. Pre pic (defect)
  under_repair_pics?: number          // 4. Under repair pic (primer)
  post_pics?:         number          // 5. Post pic (paint)
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function ageLabel(days: number | null): { text: string; years: number } {
  if (days == null) return { text: '—', years: 0 }
  const y = Math.floor(days / 365)
  const m = Math.floor((days % 365) / 30)
  return { text: y > 0 ? `${y}Y ${m}M` : `${m}M`, years: y + m / 12 }
}

function PicChip({ count, label, color }: { count: number; label: string; color: string }) {
  const ok = count > 0
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border
      ${ok ? `bg-${color}-50 border-${color}-200 text-${color}-700` : 'bg-red-50 border-red-200 text-red-600'}`}>
      {ok ? '✓' : '✗'} {label} {ok ? `(${count})` : ''}
    </div>
  )
}

function DocChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border
      ${ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
      {ok ? '✓' : '✗'} {label}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ClaimTrackerView() {
  const [rows, setRows]           = useState<ClaimRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [busyId, setBusyId]       = useState<string | null>(null)

  // ── fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => { fetchClaims() }, [])

  async function fetchClaims() {
    setLoading(true); setError(null)
    try {
      // 1. Main job card data
      const { data, error: err } = await sb
        .from('job_card_summary')
        .select(`
          job_card_id, jc_number, reg_number, vin, model, colour,
          warranty_age_days, has_ppt_pre, has_ppt_post, has_excel_estimate,
          gdc_status, claim_hidden
        `)
        .in('status', ['submitted', 'completed'])
        .order('warranty_age_days', { ascending: false })

      if (err) throw new Error(err.message)
      const base: ClaimRow[] = (data ?? []).map(r => ({
        ...r,
        pre_pics:          0,
        under_repair_pics: 0,
        post_pics:         0,
      }))

      // 2. Photo counts per job card
      if (base.length > 0) {
        const ids = base.map(r => r.job_card_id)
        const { data: photos } = await sb
          .from('panel_photos')
          .select('job_card_id, photo_type')
          .in('job_card_id', ids)

        if (photos) {
          const counts: Record<string, { defect: number; primer: number; paint: number }> = {}
          for (const p of photos) {
            if (!counts[p.job_card_id]) counts[p.job_card_id] = { defect: 0, primer: 0, paint: 0 }
            if (p.photo_type === 'defect') counts[p.job_card_id].defect++
            if (p.photo_type === 'primer') counts[p.job_card_id].primer++
            if (p.photo_type === 'paint')  counts[p.job_card_id].paint++
          }
          for (const r of base) {
            const c = counts[r.job_card_id]
            if (c) {
              r.pre_pics          = c.defect
              r.under_repair_pics = c.primer
              r.post_pics         = c.paint
            }
          }
        }
      }

      setRows(base)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // ── GDC toggle ─────────────────────────────────────────────────────────────
  async function toggleGdc(id: string, current: string) {
    const next = current === 'done' ? 'none' : 'done'
    setBusyId(id)
    await sb.from('job_cards').update({ gdc_status: next }).eq('id', id)
    setRows(prev => prev.map(r => r.job_card_id === id ? { ...r, gdc_status: next as ClaimRow['gdc_status'] } : r))
    setBusyId(null)
  }

  // ── Claim submitted ────────────────────────────────────────────────────────
  async function markSubmitted(id: string) {
    setBusyId(id)
    await sb.from('job_cards').update({
      claim_hidden:      true,
      claim_submitted_at: new Date().toISOString(),
    }).eq('id', id)
    setRows(prev => prev.map(r => r.job_card_id === id ? { ...r, claim_hidden: true } : r))
    setBusyId(null)
  }

  async function undoSubmitted(id: string) {
    setBusyId(id)
    await sb.from('job_cards').update({ claim_hidden: false, claim_submitted_at: null }).eq('id', id)
    setRows(prev => prev.map(r => r.job_card_id === id ? { ...r, claim_hidden: false } : r))
    setBusyId(null)
  }

  // ── Derived lists ──────────────────────────────────────────────────────────
  const visible  = rows.filter(r => !r.claim_hidden)
  const hidden   = rows.filter(r => r.claim_hidden)

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Loading claims…</div>
  )
  if (error) return (
    <div className="flex flex-col items-center gap-3 h-64 justify-center">
      <div className="text-red-600 text-sm">{error}</div>
      <button onClick={fetchClaims} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Retry</button>
    </div>
  )
  if (rows.length === 0) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">No submitted claims yet.</div>
  )

  const renderCard = (row: ClaimRow) => {
    const { text: ageText, years: ageYears } = ageLabel(row.warranty_age_days)
    const needsGdc   = ageYears >= 3
    const gdcDone    = (row.gdc_status ?? 'none') === 'done'
    const canSubmit  = !needsGdc || gdcDone
    const busy       = busyId === row.job_card_id

    const allPhotosOk = (row.pre_pics ?? 0) > 0 && (row.under_repair_pics ?? 0) > 0 && (row.post_pics ?? 0) > 0
    const allDocsOk   = row.has_ppt_pre && row.has_ppt_post && row.has_excel_estimate

    return (
      <div key={row.job_card_id}
        className={`border rounded-lg p-4 bg-white shadow-sm space-y-3
          ${row.claim_hidden ? 'opacity-60 border-dashed' : 'border-gray-200'}`}>

        {/* ── Row 1: Header – Reg No + JC No + Age ── */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gray-900 font-mono">{row.reg_number ?? '—'}</span>
              {row.jc_number && <span className="text-xs text-gray-400">#{row.jc_number}</span>}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{row.model ?? ''} {row.colour ? `· ${row.colour}` : ''}</div>
          </div>

          {/* 8. Age of vehicle */}
          <div className={`flex flex-col items-end`}>
            <span className={`text-sm font-bold px-2 py-0.5 rounded
              ${ageYears >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
              {ageText}
            </span>
            <span className="text-[10px] text-gray-400 mt-0.5">vehicle age</span>
          </div>
        </div>

        {/* ── Row 2: Chassis No ── */}
        <div className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-16">Chassis</span>
          <span className="text-xs font-mono text-gray-800">{row.vin ?? '—'}</span>
        </div>

        {/* ── Row 3: Photos – Pre / Under Repair / Post ── */}
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Photos</div>
          <div className="flex flex-wrap gap-1.5">
            <PicChip count={row.pre_pics ?? 0}          label="Pre-Repair"   color="blue" />
            <PicChip count={row.under_repair_pics ?? 0} label="Under Repair" color="orange" />
            <PicChip count={row.post_pics ?? 0}         label="Post-Repair"  color="green" />
          </div>
        </div>

        {/* ── Row 4: Documents – PPT Pre, PPT Post, Estimate ── */}
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Documents</div>
          <div className="flex flex-wrap gap-1.5">
            <DocChip ok={row.has_ppt_pre}        label="Pre-PPT" />
            <DocChip ok={row.has_ppt_post}        label="Post-PPT" />
            <DocChip ok={row.has_excel_estimate}  label="Estimate" />
          </div>
        </div>

        {/* ── Readiness indicator ── */}
        {(!allPhotosOk || !allDocsOk) && (
          <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            ⚠ {[
              !allPhotosOk && 'Missing photos',
              !allDocsOk   && 'Missing documents',
            ].filter(Boolean).join(' · ')}
          </div>
        )}

        {/* ── Actions ── */}
        {!row.claim_hidden ? (
          <div className="flex gap-2 flex-wrap pt-1">
            {/* GDC button — only if age ≥ 3 years */}
            {needsGdc && (
              <button
                onClick={() => toggleGdc(row.job_card_id, row.gdc_status ?? 'none')}
                disabled={busy}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition
                  ${gdcDone
                    ? 'bg-green-600 text-white'
                    : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
                {gdcDone ? '✓ GDC Done' : 'Create GDC'}
              </button>
            )}

            {/* Claim submitted */}
            <button
              onClick={() => markSubmitted(row.job_card_id)}
              disabled={busy || !canSubmit}
              title={!canSubmit ? 'Complete GDC first' : ''}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition
                ${!canSubmit
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
              ✓ Claim Submitted to TML
            </button>
          </div>
        ) : (
          <button
            onClick={() => undoSubmitted(row.job_card_id)}
            disabled={busy}
            className="px-3 py-1.5 rounded text-xs font-semibold text-gray-600 border border-gray-300 hover:bg-gray-50">
            ↩ Undo — Reopen Claim
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 max-w-2xl mx-auto">

      {/* Summary bar */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600 font-medium">{visible.length} active claim{visible.length !== 1 ? 's' : ''}</span>
        {hidden.length > 0 && (
          <button
            onClick={() => setShowHidden(v => !v)}
            className="text-xs text-indigo-600 underline">
            {showHidden ? 'Hide' : `Show ${hidden.length} submitted`}
          </button>
        )}
      </div>

      {/* Active claims */}
      {visible.map(renderCard)}

      {/* Submitted / hidden claims */}
      {showHidden && hidden.length > 0 && (
        <div className="space-y-4">
          <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold border-t pt-3">
            Submitted to TML ({hidden.length})
          </div>
          {hidden.map(renderCard)}
        </div>
      )}
    </div>
  )
}
