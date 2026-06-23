import { useEffect, useRef, useState } from 'react'
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
  reg_number:         string | null
  vin:                string | null
  model:              string | null
  colour:             string | null
  warranty_age_days:  number | null
  has_ppt_pre:        boolean
  has_ppt_post:       boolean
  has_excel_estimate: boolean
  gdc_status?:        'none' | 'pending' | 'done' | null
  claim_hidden?:      boolean | null
  pre_pics?:          number
  under_repair_pics?: number
  post_pics?:         number
}

type PhotoType = 'defect' | 'primer' | 'paint'

interface PhotoEntry {
  id:           string
  photo_type:   string
  storage_path: string
  drive_url:    string | null
  url:          string | null
}

interface ViewerState {
  jobCardId:  string
  regNumber:  string
  photoType:  PhotoType
}

interface DocEntry {
  id:           string
  doc_type:     string
  storage_path: string
  drive_url:    string | null
  url:          string | null
  filename:     string
}

interface DocViewerState {
  jobCardId:  string
  regNumber:  string
  docType:    'ppt_pre' | 'ppt_post' | 'excel_estimate'
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function ageLabel(days: number | null): { text: string; years: number } {
  if (days == null) return { text: '—', years: 0 }
  const y = Math.floor(days / 365)
  const m = Math.floor((days % 365) / 30)
  return { text: y > 0 ? `${y}Y ${m}M` : `${m}M`, years: y + m / 12 }
}

// Clickable chip — shows cursor:pointer when count > 0
function PicChip({
  count, label, color, onClick,
}: { count: number; label: string; color: string; onClick?: () => void }) {
  const ok = count > 0
  return (
    <button
      type="button"
      disabled={!ok}
      onClick={ok ? onClick : undefined}
      title={ok ? `Click to view ${label} photos` : `No ${label} photos`}
      className={[
        'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition',
        ok
          ? `bg-${color}-50 border-${color}-200 text-${color}-700 hover:bg-${color}-100 cursor-pointer shadow-sm`
          : 'bg-red-50 border-red-200 text-red-500 cursor-default opacity-70',
      ].join(' ')}>
      {ok ? '✓' : '✗'} {label} {ok ? `(${count})` : ''}
      {ok && <span className="ml-0.5 opacity-60 text-[10px]">▶</span>}
    </button>
  )
}

function DocChip({ ok, label, onClick }: { ok: boolean; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={!ok}
      onClick={ok ? onClick : undefined}
      title={ok ? `Click to open ${label}` : `${label} not uploaded`}
      className={[
        'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition',
        ok
          ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 cursor-pointer shadow-sm'
          : 'bg-red-50 border-red-200 text-red-500 cursor-default opacity-70',
      ].join(' ')}>
      {ok ? '✓' : '✗'} {label}
      {ok && <span className="ml-0.5 opacity-60 text-[10px]">↗</span>}
    </button>
  )
}

// ── Document Viewer Modal ─────────────────────────────────────────────────────
function DocViewer({ state, onClose }: { state: DocViewerState; onClose: () => void }) {
  const [doc, setDoc]       = useState<DocEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr]       = useState<string | null>(null)

  const DOC_META: Record<string, { label: string; icon: string; color: string }> = {
    ppt_pre:        { label: 'Pre-Repair PPT',  icon: '📊', color: 'blue'  },
    ppt_post:       { label: 'Post-Repair PPT', icon: '📊', color: 'green' },
    excel_estimate: { label: 'Estimate (Excel)',icon: '📋', color: 'indigo'},
  }
  const meta = DOC_META[state.docType] ?? { label: state.docType, icon: '📄', color: 'gray' }

  useEffect(() => { loadDoc() }, [])

  async function loadDoc() {
    setLoading(true); setErr(null)
    try {
      const { data, error: e } = await sb
        .from('documents')
        .select('id, doc_type, storage_path, drive_url')
        .eq('job_card_id', state.jobCardId)
        .eq('doc_type', state.docType)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (e || !data) { setErr('Document not found'); setLoading(false); return }

      const d = data as { id: string; doc_type: string; storage_path: string; drive_url: string | null }
      let url = d.drive_url || null

      // If no drive_url, get signed URL from storage
      if (!url && d.storage_path && !/^https?:\/\//i.test(d.storage_path)) {
        const { data: signed } = await sb.storage.from('autodoc').createSignedUrl(d.storage_path, 7200)
        url = signed?.signedUrl ?? null
      }

      const filename = d.storage_path?.split('/').pop() ?? `${state.docType}.file`
      setDoc({ id: d.id, doc_type: d.doc_type, storage_path: d.storage_path, drive_url: d.drive_url, url, filename })
    } catch (ex) {
      setErr('Failed to load document')
      console.error('[DocViewer]', ex)
    }
    setLoading(false)
  }

  const isPPT  = state.docType === 'ppt_pre' || state.docType === 'ppt_post'
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-${meta.color}-100 flex items-center justify-center text-xl`}>
              {meta.icon}
            </div>
            <div>
              <div className="font-bold text-gray-900 text-sm">{meta.label}</div>
              <div className="text-xs text-gray-400 font-mono">{state.regNumber}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 text-xl font-bold transition">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
          ) : err || !doc ? (
            <div className="flex flex-col items-center gap-2 h-32 justify-center">
              <span className="text-red-500 text-sm">{err ?? 'Document unavailable'}</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* File info */}
              <div className="bg-gray-50 rounded-xl p-4 flex items-start gap-3">
                <div className="text-3xl mt-0.5">{isPPT ? '📊' : '📋'}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{doc.filename}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{isPPT ? 'PowerPoint Presentation' : 'Excel Spreadsheet'}</div>
                  {doc.drive_url && (
                    <div className="text-[11px] text-green-600 mt-1">✓ Available on Google Drive</div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-2">
                {doc.drive_url && (
                  <a
                    href={doc.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition">
                    <span>↗</span> Open in Google Drive
                  </a>
                )}
                {doc.url && (
                  <a
                    href={doc.url}
                    download={doc.filename}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition">
                    <span>↓</span> Download {isPPT ? '.pptx' : '.xlsx'} File
                  </a>
                )}
                {!doc.drive_url && !doc.url && (
                  <div className="text-center text-sm text-gray-400 py-4">No download link available</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Photo Viewer Modal ────────────────────────────────────────────────────────
function PhotoViewer({
  state, onClose,
}: { state: ViewerState; onClose: () => void }) {
  const [photos, setPhotos]       = useState<PhotoEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [activeType, setActiveType] = useState<PhotoType>(state.photoType)
  const [lightbox, setLightbox]   = useState<string | null>(null)
  const didLoad                   = useRef(false)

  useEffect(() => {
    if (didLoad.current) return
    didLoad.current = true
    loadPhotos()
  }, [])

  async function loadPhotos() {
    setLoading(true)
    try {
      const { data: rows } = await sb
        .from('panel_photos')
        .select('id, photo_type, storage_path, drive_url')
        .eq('job_card_id', state.jobCardId)
        .order('created_at', { ascending: true })

      if (!rows || rows.length === 0) { setPhotos([]); setLoading(false); return }

      // Build signed URLs for storage-path entries
      const paths = rows
        .map((r: { storage_path: string }) => r.storage_path)
        .filter((p: string) => typeof p === 'string' && p.length > 0 && !/^https?:\/\//i.test(p))

      const urlMap: Record<string, string> = {}
      if (paths.length > 0) {
        const { data: signed } = await sb.storage.from('autodoc').createSignedUrls(paths, 7200)
        for (const e of signed ?? []) {
          if (e.path && e.signedUrl) urlMap[e.path] = e.signedUrl
        }
      }

      setPhotos(rows.map((r: { id: string; photo_type: string; storage_path: string; drive_url: string | null }) => ({
        id:           r.id,
        photo_type:   r.photo_type,
        storage_path: r.storage_path,
        drive_url:    r.drive_url,
        url:          r.drive_url || urlMap[r.storage_path] || null,
      })))
    } catch (e) {
      console.error('[PhotoViewer]', e)
    }
    setLoading(false)
  }

  const TYPE_META: Record<PhotoType, { label: string; dbKey: string; color: string }> = {
    defect: { label: 'Pre-Repair',    dbKey: 'defect', color: 'blue'   },
    primer: { label: 'Under Repair',  dbKey: 'primer', color: 'orange' },
    paint:  { label: 'Post-Repair',   dbKey: 'paint',  color: 'green'  },
  }

  const tabs: PhotoType[] = ['defect', 'primer', 'paint']
  const counts = (t: PhotoType) => photos.filter(p => p.photo_type === t).length
  const visible = photos.filter(p => p.photo_type === activeType && p.url)
  const meta = TYPE_META[activeType]

  function downloadAll() {
    visible.forEach((p, i) => {
      if (!p.url) return
      const a = document.createElement('a')
      a.href     = p.url
      a.download = `${state.regNumber}_${meta.label}_${i + 1}.jpg`
      a.target   = '_blank'
      a.click()
    })
  }

  const TAB_ACTIVE: Record<PhotoType, string> = {
    defect: 'border-blue-500 text-blue-700',
    primer: 'border-orange-500 text-orange-700',
    paint:  'border-green-500 text-green-700',
  }
  const BADGE: Record<PhotoType, string> = {
    defect: 'bg-blue-100 text-blue-700',
    primer: 'bg-orange-100 text-orange-700',
    paint:  'bg-green-100 text-green-700',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <span className="font-bold text-gray-900 font-mono text-lg">{state.regNumber}</span>
            <span className="ml-2 text-xs text-gray-400">· B&P Photos</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 text-xl font-bold transition">
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-4 gap-1">
          {tabs.map(t => {
            const cnt = counts(t)
            const isActive = t === activeType
            return (
              <button
                key={t}
                onClick={() => setActiveType(t)}
                className={[
                  'px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap',
                  isActive ? TAB_ACTIVE[t] : 'border-transparent text-gray-400 hover:text-gray-600',
                ].join(' ')}>
                {TYPE_META[t].label}
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-bold
                  ${cnt > 0 ? BADGE[t] : 'bg-gray-100 text-gray-400'}`}>
                  {cnt}
                </span>
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              Loading photos…
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-400">
              <span className="text-3xl">📷</span>
              <span className="text-sm">No {meta.label} photos</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {visible.map((p, i) => (
                <div
                  key={p.id}
                  className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-square cursor-pointer"
                  onClick={() => setLightbox(p.url!)}>
                  <img
                    src={p.url!}
                    alt={`${meta.label} ${i + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    onError={e => {
                      (e.target as HTMLImageElement).src =
                        'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect fill=%22%23f3f4f6%22 width=%22100%22 height=%22100%22/><text y=%2250%25%22 x=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%239ca3af%22 font-size=%2212%22>No preview</text></svg>'
                    }}
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-between p-2 opacity-0 group-hover:opacity-100">
                    <span className="text-white text-[11px] font-semibold">#{i + 1}</span>
                    <a
                      href={p.url!}
                      download={`${state.regNumber}_${meta.label}_${i + 1}.jpg`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-white text-[11px] bg-black/40 hover:bg-black/60 rounded px-2 py-0.5 transition">
                      ↓
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && visible.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-400">
              {visible.length} photo{visible.length !== 1 ? 's' : ''} · {meta.label}
            </span>
            <button
              onClick={downloadAll}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition">
              ↓ Download All {meta.label} Photos
            </button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4"
          onClick={() => setLightbox(null)}>
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-xl font-bold transition">
            ×
          </button>
          <img
            src={lightbox}
            alt="Full size"
            className="max-w-[90vw] max-h-[88vh] object-contain rounded-xl shadow-2xl"
          />
          <a
            href={lightbox}
            download="photo.jpg"
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="absolute bottom-6 text-white text-sm bg-white/20 hover:bg-white/30 px-5 py-2 rounded-full transition">
            ↓ Download Full Size
          </a>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ClaimTrackerView() {
  const [rows, setRows]             = useState<ClaimRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [busyId, setBusyId]         = useState<string | null>(null)
  const [viewer, setViewer]         = useState<ViewerState | null>(null)
  const [docViewer, setDocViewer]   = useState<DocViewerState | null>(null)

  useEffect(() => { fetchClaims() }, [])

  async function fetchClaims() {
    setLoading(true); setError(null)
    try {
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
      const base: ClaimRow[] = (data ?? []).map((r: ClaimRow) => ({
        ...r,
        pre_pics:          0,
        under_repair_pics: 0,
        post_pics:         0,
      }))

      if (base.length > 0) {
        const ids = base.map(r => r.job_card_id)
        const { data: photos } = await sb
          .from('panel_photos')
          .select('job_card_id, photo_type')
          .in('job_card_id', ids)

        if (photos) {
          const counts: Record<string, { defect: number; primer: number; paint: number }> = {}
          for (const p of photos as { job_card_id: string; photo_type: string }[]) {
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

  async function toggleGdc(id: string, current: string) {
    const next = current === 'done' ? 'none' : 'done'
    setBusyId(id)
    await sb.from('job_cards').update({ gdc_status: next }).eq('id', id)
    setRows(prev => prev.map(r => r.job_card_id === id ? { ...r, gdc_status: next as ClaimRow['gdc_status'] } : r))
    setBusyId(null)
  }

  async function markSubmitted(id: string) {
    setBusyId(id)
    await sb.from('job_cards').update({
      claim_hidden:       true,
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

  // ── CSV download ────────────────────────────────────────────────────────────
  function downloadCSV(exportRows: ClaimRow[]) {
    const ageStr = (days: number | null) => {
      if (days == null) return '—'
      const y = Math.floor(days / 365)
      const m = Math.floor((days % 365) / 30)
      return y > 0 ? `${y}Y ${m}M` : `${m}M`
    }
    const yn = (v: boolean | null | undefined) => v ? 'Yes' : 'No'
    const headers = [
      'JC Number', 'Reg No', 'Chassis No (VIN)', 'Model', 'Colour',
      'Vehicle Age',
      'Pre-Repair Pics', 'Under-Repair Pics', 'Post-Repair Pics',
      'PPT Pre', 'PPT Post', 'Estimate (Excel)',
      'GDC Status', 'Claim Submitted',
    ]
    const csvRows = [headers.join(',')]
    for (const r of exportRows) {
      csvRows.push([
        r.jc_number ?? '',
        r.reg_number ?? '',
        r.vin ?? '',
        r.model ?? '',
        r.colour ?? '',
        ageStr(r.warranty_age_days),
        r.pre_pics ?? 0,
        r.under_repair_pics ?? 0,
        r.post_pics ?? 0,
        yn(r.has_ppt_pre),
        yn(r.has_ppt_post),
        yn(r.has_excel_estimate),
        r.gdc_status ?? 'none',
        yn(r.claim_hidden),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `claims_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const visible = rows.filter(r => !r.claim_hidden)
  const hidden  = rows.filter(r =>  r.claim_hidden)

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Loading claims…</div>
  if (error)   return (
    <div className="flex flex-col items-center gap-3 h-64 justify-center">
      <div className="text-red-600 text-sm">{error}</div>
      <button onClick={fetchClaims} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Retry</button>
    </div>
  )
  if (rows.length === 0) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">No submitted claims yet.</div>

  const renderCard = (row: ClaimRow) => {
    const { text: ageText, years: ageYears } = ageLabel(row.warranty_age_days)
    const needsGdc  = ageYears >= 3
    const gdcDone   = (row.gdc_status ?? 'none') === 'done'
    const canSubmit = !needsGdc || gdcDone
    const busy      = busyId === row.job_card_id

    const allPhotosOk = (row.pre_pics ?? 0) > 0 && (row.under_repair_pics ?? 0) > 0 && (row.post_pics ?? 0) > 0
    const allDocsOk   = row.has_ppt_pre && row.has_ppt_post && row.has_excel_estimate

    const openViewer = (photoType: PhotoType) =>
      setViewer({ jobCardId: row.job_card_id, regNumber: row.reg_number ?? '—', photoType })

    const openDocViewer = (docType: DocViewerState['docType']) =>
      setDocViewer({ jobCardId: row.job_card_id, regNumber: row.reg_number ?? '—', docType })

    return (
      <div key={row.job_card_id}
        className={`border rounded-xl p-4 bg-white shadow-sm space-y-3
          ${row.claim_hidden ? 'opacity-60 border-dashed' : 'border-gray-200'}`}>

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold text-gray-900 font-mono">{row.reg_number ?? '—'}</span>
              {row.jc_number && <span className="text-xs text-gray-400">#{row.jc_number}</span>}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{row.model ?? ''} {row.colour ? `· ${row.colour}` : ''}</div>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className={`text-sm font-bold px-2 py-0.5 rounded
              ${ageYears >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
              {ageText}
            </span>
            <span className="text-[10px] text-gray-400 mt-0.5">vehicle age</span>
          </div>
        </div>

        {/* Chassis */}
        <div className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-16">Chassis</span>
          <span className="text-xs font-mono text-gray-800">{row.vin ?? '—'}</span>
        </div>

        {/* Photos — each chip is clickable */}
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Photos <span className="normal-case font-normal text-gray-300">(click to view)</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <PicChip count={row.pre_pics ?? 0}          label="Pre-Repair"   color="blue"   onClick={() => openViewer('defect')} />
            <PicChip count={row.under_repair_pics ?? 0} label="Under Repair" color="orange" onClick={() => openViewer('primer')} />
            <PicChip count={row.post_pics ?? 0}         label="Post-Repair"  color="green"  onClick={() => openViewer('paint')} />
          </div>
        </div>

        {/* Documents */}
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Documents <span className="normal-case font-normal text-gray-300">(click to open)</span></div>
          <div className="flex flex-wrap gap-1.5">
            <DocChip ok={row.has_ppt_pre}       label="Pre-PPT"  onClick={() => openDocViewer('ppt_pre')} />
            <DocChip ok={row.has_ppt_post}       label="Post-PPT" onClick={() => openDocViewer('ppt_post')} />
            <DocChip ok={row.has_excel_estimate} label="Estimate" onClick={() => openDocViewer('excel_estimate')} />
          </div>
        </div>

        {/* Readiness warning */}
        {(!allPhotosOk || !allDocsOk) && (
          <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            ⚠ {[!allPhotosOk && 'Missing photos', !allDocsOk && 'Missing documents'].filter(Boolean).join(' · ')}
          </div>
        )}

        {/* Actions */}
        {!row.claim_hidden ? (
          <div className="flex gap-2 flex-wrap pt-1">
            {needsGdc && (
              <button
                onClick={() => toggleGdc(row.job_card_id, row.gdc_status ?? 'none')}
                disabled={busy}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition
                  ${gdcDone ? 'bg-green-600 text-white' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
                {gdcDone ? '✓ GDC Done' : 'Create GDC'}
              </button>
            )}
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
      <div className="flex items-center justify-between flex-wrap gap-2 text-sm">
        <span className="text-gray-600 font-medium">
          {visible.length} active claim{visible.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {hidden.length > 0 && (
            <button onClick={() => setShowHidden(v => !v)} className="text-xs text-indigo-600 underline">
              {showHidden ? 'Hide' : `Show ${hidden.length} submitted`}
            </button>
          )}
          <button
            onClick={() => downloadCSV(visible)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition">
            ↓ Active Claims
          </button>
          <button
            onClick={() => downloadCSV(rows)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition">
            ↓ All Claims
          </button>
        </div>
      </div>

      {/* Active claims */}
      {visible.map(renderCard)}

      {/* Submitted claims (toggle) */}
      {showHidden && hidden.length > 0 && (
        <div className="space-y-4">
          <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold border-t pt-3">
            Submitted to TML ({hidden.length})
          </div>
          {hidden.map(renderCard)}
        </div>
      )}

      {/* Photo viewer modal */}
      {viewer    && <PhotoViewer state={viewer}    onClose={() => setViewer(null)} />}
      {docViewer && <DocViewer    state={docViewer} onClose={() => setDocViewer(null)} />}
    </div>
  )
}
