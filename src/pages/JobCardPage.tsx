import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/Icon'
import { AUTODOC_BUCKET } from '../lib/autodocStorage'
import { useDirty } from '../context/DirtyContext'
import {
  addDocument,
  addEstimateRow,
  createAutodocSignedUrlMap,
  createPanel,
  createPanelPhoto,
  deleteEstimateRow,
  fetchActivityLogsForJobCard,
  generateClaimEmailContent,
  getJobCardSummary,
  listDocuments,
  listEstimateRows,
  listPanelPhotos,
  listPanels,
  logActivity,
  sendClaimEmail,
  type ActivityLogEntry,
  type DocType,
} from '../lib/api'
import { generateRepairPPT } from '../lib/generators/generatePPT'
import { generateEstimateExcel } from '../lib/generators/generateExcel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobSummary {
  job_card_id: string; jc_number: string; reg_number: string
  model: string | null; colour: string | null; complaint_date: string
  status: string; dealer_code: string | null; dealer_name: string | null
  warranty_age_days: number | null; tml_share_percent: number | null
  total_estimate_amount: number | null
}

interface Panel { id: string; panel_name: string; action: string | null }

interface PanelPhoto {
  id: string; panel_id: string
  photo_type: 'defect' | 'primer' | 'paint'
  repair_stage?: 'pre-repair' | 'post-repair'
  drive_url?: string | null
  drive_file_id?: string | null
  storage_path: string; gps_city: string | null; captured_at: string | null
}

interface EstRow {
  id: string; sr_no: number; part_description: string | null
  defect: string | null; action: string | null; qty: number
  ndp_value: number; cut_weld_charges: number; paint_charges: number
  total_special_charges: number; job_code: string | null
  job_code_desc: string | null; no_off: number; labour_charges: number
  row_total: number
}

interface DocRow {
  id: string
  job_card_id: string
  doc_type: DocType
  storage_path: string
  drive_url: string | null
  drive_file_id: string | null
  file_size_mb: number | null
  created_at: string
}

const BLANK_ROW = {
  part_description: '', defect: '', action: '', qty: 1, ndp_value: 0,
  cut_weld_charges: 0, paint_charges: 0, total_special_charges: 0, job_code: '', job_code_desc: '',
  no_off: 1, labour_charges: 0,
}

const PHOTO_TYPES: { type: 'defect' | 'primer' | 'paint'; label: string; hdr: string }[] = [
  { type: 'defect', label: 'Defect', hdr: 'bg-red-50 text-red-700 border-red-100' },
  { type: 'primer', label: 'Primer', hdr: 'bg-amber-50 text-amber-700 border-amber-100' },
  { type: 'paint',  label: 'Paint',  hdr: 'bg-green-50 text-green-700 border-green-100' },
]

const DOC_TYPES: { type: DocType; label: string; accept: string }[] = [
  { type: 'service_history', label: 'Service History', accept: '.pdf,image/*' },
  { type: 'video_job_card', label: 'Job Card Video', accept: 'video/*' },
  { type: 'video_delivery', label: 'Delivery Video', accept: 'video/*' },
  { type: 'ppt_pre', label: 'PPT Pre-Repair', accept: '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { type: 'ppt_post', label: 'PPT Post-Repair', accept: '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { type: 'excel_estimate', label: 'Estimate Excel', accept: '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
]

// ─── XHR upload with real progress ───────────────────────────────────────────

async function xhrUpload(
  path: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  const base    = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const token   = session?.access_token ?? anonKey

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) { resolve({ error: null }); return }
      try {
        const r = JSON.parse(xhr.responseText) as { message?: string }
        const msg = r.message ?? `Upload failed (${xhr.status})`
        if (msg.toLowerCase().includes('bucket not found')) {
          resolve({ error: `Storage bucket '${AUTODOC_BUCKET}' not found. Create it in Supabase Storage or set VITE_SUPABASE_AUTODOC_BUCKET correctly.` })
          return
        }
        resolve({ error: msg })
      } catch { resolve({ error: `Upload failed (${xhr.status})` }) }
    })
    xhr.addEventListener('error', () => resolve({ error: 'Network error during upload' }))
    xhr.open('POST', `${base}/storage/v1/object/${AUTODOC_BUCKET}/${path}`)
    xhr.setRequestHeader('authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', anonKey)
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.send(file)
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function JobCardPage() {
  const { id }     = useParams<{ id: string }>()
  const { setDirty } = useDirty()

  const [jc,        setJc]        = useState<JobSummary | null>(null)
  const [panels,    setPanels]    = useState<Panel[]>([])
  const [photos,    setPhotos]    = useState<PanelPhoto[]>([])
  const [estRows,   setEstRows]   = useState<EstRow[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [documents, setDocuments] = useState<DocRow[]>([])
  const [docUrls, setDocUrls] = useState<Record<string, string>>({})
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([])

  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [selPanel,     setSelPanel]     = useState<string | null>(null)
  const [repairStage,  setRepairStage]  = useState<'pre-repair' | 'post-repair'>('pre-repair')
  const [uploadProg,   setUploadProg]   = useState<Record<string, number>>({})
  const [uploadErr,    setUploadErr]    = useState<Record<string, string>>({})
  const [docUploadProg, setDocUploadProg] = useState<Record<string, number>>({})
  const [docUploadErr, setDocUploadErr] = useState<Record<string, string>>({})
  const [deleteRow,    setDeleteRow]    = useState<EstRow | null>(null)
  const [addingRow,    setAddingRow]    = useState(false)
  const [addingPanel,  setAddingPanel]  = useState(false)
  const [newPanelName, setNewPanelName] = useState('')
  const [rowForm,      setRowForm]      = useState({ ...BLANK_ROW })
  const [saving,       setSaving]       = useState(false)
  const [exporting, setExporting] = useState<Set<string>>(new Set())
  const [composingEmail, setComposingEmail] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailForm, setEmailForm] = useState({
    to: 'claims@tatamotors.com',
    subject: '',
    body: '',
  })
  const [localDirty,   setLocalDirty]   = useState(false)
  const [lastSaved,    setLastSaved]    = useState<Date | null>(null)

  const estRowsRef   = useRef(estRows)
  const dirtyRef     = useRef(false)
  const initedPanel  = useRef(false)
  useEffect(() => { estRowsRef.current = estRows }, [estRows])
  useEffect(() => { dirtyRef.current = localDirty }, [localDirty])

  const markDirty = () => { setLocalDirty(true); setDirty(true) }

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!id) return
    setLoading(true); setError(null)
    const [jcRes, panelRes, photoRes, estRes, docRes, actRes] = await Promise.all([
      getJobCardSummary(id),
      listPanels(id),
      listPanelPhotos(id),
      listEstimateRows(id),
      listDocuments(id),
      fetchActivityLogsForJobCard(id),
    ])

    if (jcRes.error || !jcRes.data) {
      setError(jcRes.error ?? 'Job card not found')
      setLoading(false); return
    }
    if (panelRes.error) { setError(panelRes.error); setLoading(false); return }
    if (photoRes.error) { setError(photoRes.error); setLoading(false); return }
    if (estRes.error) { setError(estRes.error); setLoading(false); return }
    if (docRes.error) { setError(docRes.error); setLoading(false); return }
    if (actRes.error) { setError(actRes.error); setLoading(false); return }

    setJc(jcRes.data as unknown as JobSummary)
    const pnls = (panelRes.data ?? []) as unknown as Panel[]
    setPanels(pnls)
    if (pnls.length && !initedPanel.current) { setSelPanel(pnls[0].id); initedPanel.current = true }
    const phts = (photoRes.data ?? []) as unknown as PanelPhoto[]
    setPhotos(phts)

    const photoDriveUrls: Record<string, string> = {}
    phts.forEach((photo) => {
      if (photo.drive_url) photoDriveUrls[photo.storage_path] = photo.drive_url
    })
    const photosNeedingSignedUrls = phts
      .filter((photo) => !photo.drive_url)
      .map((photo) => photo.storage_path)

    setEstRows((estRes.data ?? []) as unknown as EstRow[])
    const docs = (docRes.data ?? []) as unknown as DocRow[]
    setDocuments(docs)
    setActivityLogs(actRes.data ?? [])

    const docDriveUrls: Record<string, string> = {}
    docs.forEach((doc) => {
      if (doc.drive_url) docDriveUrls[doc.storage_path] = doc.drive_url
    })

    const docsNeedingSignedUrls = docs
      .filter((doc) => !doc.drive_url)
      .map((doc) => doc.storage_path)

    const [photoUrlRes, docUrlRes] = await Promise.all([
      createAutodocSignedUrlMap(photosNeedingSignedUrls),
      createAutodocSignedUrlMap(docsNeedingSignedUrls),
    ])
    setPhotoUrls({
      ...(photoUrlRes.data ?? {}),
      ...photoDriveUrls,
    })
    setDocUrls({
      ...(docUrlRes.data ?? {}),
      ...docDriveUrls,
    })
    setLoading(false)
  }, [id])

  useEffect(() => { void fetchAll() }, [fetchAll])

  // ── Auto-save 30 s ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    const t = setInterval(() => {
      if (!dirtyRef.current) return
      if (id) localStorage.setItem(`autodoc_draft_${id}`, JSON.stringify({
        rows: estRowsRef.current, savedAt: Date.now(),
      }))
      setLastSaved(new Date())
      setLocalDirty(false)
      setDirty(false)
    }, 30_000)
    return () => clearInterval(t)
  }, [id, setDirty])

  // ── Upload photo ──────────────────────────────────────────────────────────
  async function handleUpload(panelId: string, photoType: 'defect' | 'primer' | 'paint', file: File) {
    const key  = `${panelId}-${photoType}`
    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${jc?.dealer_code ?? 'unknown'}/${id ?? 'unknown'}/${panelId}/${photoType}_${Date.now()}.${ext}`

    setUploadProg(p => ({ ...p, [key]: 0 }))
    setUploadErr(e => { const n = { ...e }; delete n[key]; return n })

    const { error: upErr } = await xhrUpload(path, file, pct => {
      setUploadProg(p => ({ ...p, [key]: pct }))
    })

    setUploadProg(p => { const n = { ...p }; delete n[key]; return n })

    if (upErr) { setUploadErr(e => ({ ...e, [key]: upErr })); return }

    const sizeMb = Number((file.size / (1024 * 1024)).toFixed(3))

    const dbRes = await createPanelPhoto({
      jobCardId: id ?? '',
      panelId,
      photoType,
      storagePath: path,
      fileSizeMb: sizeMb,
      repairStage,
    })
    if (dbRes.error) { setUploadErr(e => ({ ...e, [key]: dbRes.error as string })); return }

    const listRes = await listPanelPhotos(id ?? '')
    if (listRes.error) { setUploadErr(e => ({ ...e, [key]: listRes.error as string })); return }
    const phts = (listRes.data ?? []) as unknown as PanelPhoto[]
    setPhotos(phts)

    const photoDriveUrls: Record<string, string> = {}
    phts.forEach((photo) => {
      if (photo.drive_url) photoDriveUrls[photo.storage_path] = photo.drive_url
    })
    const photosNeedingSignedUrls = phts
      .filter((photo) => !photo.drive_url)
      .map((photo) => photo.storage_path)

    const urlRes = await createAutodocSignedUrlMap(photosNeedingSignedUrls)
    setPhotoUrls({
      ...(urlRes.data ?? {}),
      ...photoDriveUrls,
    })
    
    // Log activity
    await logActivity('photo_uploaded', {
      resourceType: 'job_card',
      resourceId: id,
      details: { photoType, panelId, repairStage },
    })
    markDirty()
  }

  async function handleDocumentUpload(docType: DocType, file: File) {
    if (!id) return
    const key = docType
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const safeExt = (ext ?? 'bin').replace(/[^a-zA-Z0-9]/g, '')
    const path = `${jc?.dealer_code ?? 'unknown'}/${id}/documents/${docType}_${Date.now()}.${safeExt}`

    setDocUploadProg((p) => ({ ...p, [key]: 0 }))
    setDocUploadErr((e) => { const next = { ...e }; delete next[key]; return next })

    const { error: upErr } = await xhrUpload(path, file, (pct) => {
      setDocUploadProg((p) => ({ ...p, [key]: pct }))
    })

    setDocUploadProg((p) => { const next = { ...p }; delete next[key]; return next })
    if (upErr) { setDocUploadErr((e) => ({ ...e, [key]: upErr })); return }

    const sizeMb = Number((file.size / (1024 * 1024)).toFixed(3))
    const dbRes = await addDocument({
      jobCardId: id,
      docType,
      storagePath: path,
      fileSizeMb: sizeMb,
    })
    if (dbRes.error) { setDocUploadErr((e) => ({ ...e, [key]: dbRes.error as string })); return }

    const listRes = await listDocuments(id)
    if (listRes.error) { setDocUploadErr((e) => ({ ...e, [key]: listRes.error as string })); return }
    const docs = (listRes.data ?? []) as unknown as DocRow[]
    setDocuments(docs)

    const docDriveUrls: Record<string, string> = {}
    docs.forEach((doc) => {
      if (doc.drive_url) docDriveUrls[doc.storage_path] = doc.drive_url
    })

    const docsNeedingSignedUrls = docs
      .filter((doc) => !doc.drive_url)
      .map((doc) => doc.storage_path)

    const urls = await createAutodocSignedUrlMap(docsNeedingSignedUrls)
    setDocUrls({
      ...(urls.data ?? {}),
      ...docDriveUrls,
    })
  }

  // ── Delete row ────────────────────────────────────────────────────────────
  async function confirmDelete() {
    if (!deleteRow) return
    setSaving(true)
    const res = await deleteEstimateRow(deleteRow.id)
    setSaving(false)
    if (!res.error) { setEstRows(r => r.filter(x => x.id !== deleteRow.id)); setDeleteRow(null); markDirty() }
  }

  // ── Add row ───────────────────────────────────────────────────────────────
  async function handleAddRow() {
    if (!id) return
    setSaving(true)
    const nextSr = (estRows.at(-1)?.sr_no ?? 0) + 1
    const res = await addEstimateRow({
      jobCardId: id,
      srNo: nextSr,
      partDescription: rowForm.part_description,
      defect: rowForm.defect,
      action: rowForm.action,
      qty: rowForm.qty,
      ndpValue: rowForm.ndp_value,
      cutWeldCharges: rowForm.cut_weld_charges,
      paintCharges: rowForm.paint_charges,
      totalSpecialCharges: rowForm.total_special_charges,
      jobCode: rowForm.job_code,
      jobCodeDesc: rowForm.job_code_desc,
      noOff: rowForm.no_off,
      labourCharges: rowForm.labour_charges,
    })
    setSaving(false)
    if (res.error || !res.data) return
    setEstRows(r => [...r, res.data as unknown as EstRow])
    setAddingRow(false); setRowForm({ ...BLANK_ROW }); markDirty()
    
    // Log activity
    await logActivity('estimate_row_added', {
      resourceType: 'job_card',
      resourceId: id,
      details: { description: rowForm.part_description, amount: rowForm.ndp_value },
    })
  }

  // ── Add panel ─────────────────────────────────────────────────────────────
  async function handleAddPanel() {
    if (!id || !newPanelName.trim()) return
    const res = await createPanel(id, newPanelName.trim())
    if (!res.error && res.data) {
      const p = res.data as unknown as Panel
      setPanels(prev => [...prev, p]); setSelPanel(p.id)
      setAddingPanel(false); setNewPanelName('')
      
      // Log activity
      await logActivity('panel_added', {
        resourceType: 'job_card',
        resourceId: id,
        details: { panelName: newPanelName.trim() },
      })
    }
  }

  async function handleExport(kind: 'pre' | 'post' | 'excel') {
    if (!id) return
    const key = `export-${kind}`
    setExporting((prev) => new Set(prev).add(key))
    try {
      if (kind === 'excel') await generateEstimateExcel(id)
      else await generateRepairPPT(id, kind === 'pre' ? 'pre-repair' : 'post-repair')
      
      // Log activity
      await logActivity(`${kind === 'excel' ? 'excel' : 'ppt'}_exported`, {
        resourceType: 'job_card',
        resourceId: id,
        details: { exportType: kind },
      })
    } finally {
      setExporting((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <PageSkeleton />
  if (error || !jc) return (
    <div className="p-6">
      <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
        <span>{error ?? 'Job card not found'}</span>
        <button onClick={fetchAll} className="ml-4 text-xs font-medium underline hover:no-underline">Retry</button>
      </div>
      <Link to="/autodoc" className="inline-flex items-center text-sm text-blue-600 hover:underline">← Back to AutoDoc</Link>
    </div>
  )

  const panelPhotos = photos.filter(p => p.panel_id === selPanel)
  const grandTotal  = estRows.reduce((s, r) => s + r.row_total, 0)

  return (
    <div>
      <div className="pagehead">
        <div>
          <Link to="/autodoc" className="greet-link" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--muted)', fontSize: 12, textDecoration: 'none' }}>
            <Icon name="arrowl" size={14} />
            AutoDoc
          </Link>
          <h1>{jc.jc_number}</h1>
          <p>{[jc.reg_number, jc.model, jc.colour].filter(Boolean).join(' · ')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {localDirty && (
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--warn)' }}>● Unsaved changes</span>
          )}
          {lastSaved && !localDirty && (
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>
              Saved {lastSaved.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <span className={`badge ${jc.status === 'draft' ? 'badge--gray' : jc.status === 'submitted' ? 'badge--blue' : jc.status === 'approved' ? 'badge--purple' : jc.status === 'in_work' ? 'badge--amber' : 'badge--green'}`}>
            {jc.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Panel selector strip */}
      <section className="mb-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Panels</p>
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
          {panels.map(p => {
            const cnt = photos.filter(ph => ph.panel_id === p.id).length
            const sel = selPanel === p.id
            return (
              <button
                key={p.id}
                onClick={() => setSelPanel(p.id)}
                className={[
                  'flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors min-h-[2.5rem]',
                  sel ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                {p.panel_name}
                {cnt > 0 && (
                  <span className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold ${sel ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {cnt}
                  </span>
                )}
              </button>
            )
          })}
          <button
            onClick={() => setAddingPanel(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 min-h-[2.5rem] transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Panel
          </button>
        </div>
      </section>

      {/* Photo upload zones */}
      {selPanel && (
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Photos — {panels.find(p => p.id === selPanel)?.panel_name}
            </p>
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-1">
              <button
                onClick={() => setRepairStage('pre-repair')}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                  repairStage === 'pre-repair'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Pre-Repair
              </button>
              <button
                onClick={() => setRepairStage('post-repair')}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                  repairStage === 'post-repair'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Post-Repair
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PHOTO_TYPES.map(({ type, label, hdr }) => {
              const key      = `${selPanel}-${type}`
              const pct      = uploadProg[key]
              const err      = uploadErr[key]
              const existing = panelPhotos.filter(p => p.photo_type === type)

              return (
                <div key={type} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className={`border-b px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${hdr}`}>
                    {label} Photo
                    {existing.length > 0 && <span className="ml-1.5 font-normal opacity-70">({existing.length})</span>}
                  </div>

                  {/* Drop / tap zone */}
                  <label className="group flex min-h-28 cursor-pointer flex-col items-center justify-center border-b border-gray-100 p-3 transition-colors hover:bg-gray-50">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) void handleUpload(selPanel, type, file)
                        e.target.value = ''
                      }}
                    />
                    {pct != null ? (
                      <div className="w-full px-2">
                        <p className="mb-1.5 text-center text-xs font-medium text-blue-600">Uploading {pct}%</p>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                          <div className="h-2 rounded-full bg-blue-500 transition-all duration-200" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    ) : err ? (
                      <div className="text-center">
                        <p className="text-xs text-red-600">{err}</p>
                        <span className="mt-1 block text-xs font-medium text-blue-600">Tap to retry</span>
                      </div>
                    ) : (
                      <>
                        <svg className="mb-2 h-7 w-7 text-gray-300 transition-colors group-hover:text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                        </svg>
                        <span className="text-xs text-gray-400 group-hover:text-gray-600">
                          {existing.length > 0 ? `Add another ${label.toLowerCase()} photo` : `Upload ${label.toLowerCase()} photo`}
                        </span>
                      </>
                    )}
                  </label>

                  {/* Thumbnails */}
                  {existing.length > 0 && (
                    <div className="no-scrollbar flex gap-2 overflow-x-auto p-2">
                      {existing.map(ph => {
                        const url = photoUrls[ph.storage_path]
                        return (
                          <div key={ph.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                            {url
                              ? <img src={url} alt={label} className="h-full w-full object-cover" />
                              : <div className="flex h-full w-full items-center justify-center text-gray-300">
                                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M18.75 10.5h.008v.008h-.008V10.5z" />
                                  </svg>
                                </div>
                            }
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Estimate rows */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Estimate Rows ({estRows.length})
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleExport('pre')}
              disabled={exporting.size > 0}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting.has('export-pre') ? 'Generating…' : 'Pre PPT'}
            </button>
            <button
              onClick={() => void handleExport('post')}
              disabled={exporting.size > 0}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting.has('export-post') ? 'Generating…' : 'Post PPT'}
            </button>
            <button
              onClick={() => void handleExport('excel')}
              disabled={exporting.size > 0}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              {exporting.has('export-excel') ? 'Generating…' : 'Estimate Excel'}
            </button>
            <button
              onClick={() => {
                if (jc) {
                  const { subject, html } = generateClaimEmailContent({
                    ...jc,
                    vin: null,
                    km_reading: null,
                    date_of_sale: null,
                    claim_type: null,
                    complaint_text: null,
                    panel_names: null,
                  })
                  setEmailForm({ to: 'claims@tatamotors.com', subject, body: html })
                  setComposingEmail(true)
                }
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email
            </button>
            <button
              onClick={() => setAddingRow(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Row
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm print-table">
          {estRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">No estimate rows yet. Use the button above to add.</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2.5">Sr</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="px-3 py-2.5">Action</th>
                  <th className="px-3 py-2.5 text-right">QTY</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">NDP</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Special</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Labour</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Total</th>
                  <th className="px-3 py-2.5 print:hidden w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {estRows.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-gray-500">{row.sr_no}</td>
                    <td className="px-3 py-2.5 max-w-[200px]">
                      <div className="text-gray-800">{row.part_description ?? '—'}</div>
                      {row.defect && <div className="text-[10px] text-gray-400">{row.defect}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-xs capitalize text-gray-600 whitespace-nowrap">{row.action ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{row.qty}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700 whitespace-nowrap">₹{row.ndp_value.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700 whitespace-nowrap">₹{row.total_special_charges.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700 whitespace-nowrap">₹{row.labour_charges.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900 whitespace-nowrap">₹{row.row_total.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2.5 print:hidden">
                      <button
                        onClick={() => setDeleteRow(row)}
                        className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={7} className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Grand Total</td>
                  <td className="px-3 py-2.5 text-right font-bold text-gray-900 whitespace-nowrap">₹{grandTotal.toLocaleString('en-IN')}</td>
                  <td className="print:hidden" />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>

      {/* Documents */}
      <section className="mt-6">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Documents ({documents.length})
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DOC_TYPES.map(({ type, label, accept }) => {
            const docsOfType = documents.filter((doc) => doc.doc_type === type)
            const pct = docUploadProg[type]
            const err = docUploadErr[type]
            return (
              <div key={type} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                  {label}
                  {docsOfType.length > 0 && <span className="ml-1 text-gray-400">({docsOfType.length})</span>}
                </div>
                <label className="block cursor-pointer border-b border-gray-100 px-3 py-3 hover:bg-gray-50">
                  <input
                    type="file"
                    accept={accept}
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleDocumentUpload(type, file)
                      e.target.value = ''
                    }}
                  />
                  {pct != null ? (
                    <div>
                      <p className="mb-1 text-xs font-medium text-blue-600">Uploading {pct}%</p>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  ) : err ? (
                    <p className="text-xs text-red-600">{err}</p>
                  ) : (
                    <p className="text-xs text-gray-500">Upload {label.toLowerCase()} file</p>
                  )}
                </label>
                <div className="max-h-36 overflow-y-auto p-2">
                  {docsOfType.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-gray-400">No files</p>
                  ) : (
                    docsOfType.map((doc) => {
                      const url = docUrls[doc.storage_path]
                      return (
                        <a
                          key={doc.id}
                          href={url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className={`mb-1 flex items-center justify-between rounded-md px-2 py-1.5 text-xs ${url ? 'text-blue-600 hover:bg-blue-50' : 'cursor-not-allowed text-gray-400'}`}
                        >
                          <span className="truncate">{doc.storage_path.split('/').pop()}</span>
                          <span className="ml-2 shrink-0 text-[10px] text-gray-400">{doc.file_size_mb != null ? `${doc.file_size_mb} MB` : ''}</span>
                        </a>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Activity Log */}
      <section className="mt-6">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Activity Log ({activityLogs.length})
        </p>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {activityLogs.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No activities yet</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {activityLogs.map((log, idx) => {
                const actionLabel = log.action
                  .split('_')
                  .map((word, i) => i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)
                  .join(' ')
                
                const getIcon = (action: string) => {
                  if (action.includes('photo')) return '📷'
                  if (action.includes('panel')) return '📌'
                  if (action.includes('estimate')) return '📊'
                  if (action.includes('ppt')) return '📑'
                  if (action.includes('excel')) return '📊'
                  return '✓'
                }

                const timestamp = new Date(log.timestamp).toLocaleString('en-IN', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })

                return (
                  <div key={idx} className="flex items-start gap-3 px-4 py-3">
                    <div className="mt-1 text-lg">{getIcon(log.action)}</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{actionLabel}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{timestamp}</p>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <p className="text-xs text-gray-600 mt-1">
                          {Object.entries(log.details as Record<string, unknown>)
                            .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
                            .join(' • ')}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* Delete confirm modal */}
      {deleteRow && (
        <Overlay onClose={() => setDeleteRow(null)}>
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900">Delete estimate row?</h3>
            <p className="mt-1 text-sm text-gray-500">
              "{deleteRow.part_description ?? `Row ${deleteRow.sr_no}`}" will be permanently removed.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button onClick={() => setDeleteRow(null)} className={BTN_SEC}>Cancel</button>
              <button onClick={confirmDelete} disabled={saving} className={BTN_DANGER}>
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Add row modal */}
      {addingRow && (
        <Overlay onClose={() => setAddingRow(false)}>
          <h3 className="mb-4 text-base font-semibold text-gray-900">Add Estimate Row</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Part Description">
                <input value={rowForm.part_description} onChange={e => setRowForm(f => ({ ...f, part_description: e.target.value }))} className={INPUT} placeholder="e.g. Bonnet Panel" />
              </Field>
            </div>
            <Field label="Defect">
              <input value={rowForm.defect} onChange={e => setRowForm(f => ({ ...f, defect: e.target.value }))} className={INPUT} placeholder="e.g. Rusting" />
            </Field>
            <Field label="Action">
              <select value={rowForm.action} onChange={e => setRowForm(f => ({ ...f, action: e.target.value }))} className={INPUT}>
                <option value="">—</option>
                <option value="repair">Repair</option>
                <option value="replace">Replace</option>
                <option value="refinish">Refinish</option>
              </select>
            </Field>
            <Field label="QTY">
              <input type="number" min={1} value={rowForm.qty} onChange={e => setRowForm(f => ({ ...f, qty: Number(e.target.value) }))} className={INPUT} />
            </Field>
            <Field label="NDP Value (₹)">
              <input type="number" min={0} step={0.01} value={rowForm.ndp_value} onChange={e => setRowForm(f => ({ ...f, ndp_value: Number(e.target.value) }))} className={INPUT} />
            </Field>
            <Field label="Cut & Weld (₹)">
              <input type="number" min={0} step={0.01} value={rowForm.cut_weld_charges} onChange={e => setRowForm(f => ({ ...f, cut_weld_charges: Number(e.target.value) }))} className={INPUT} />
            </Field>
            <Field label="Paint Charges (₹)">
              <input type="number" min={0} step={0.01} value={rowForm.paint_charges} onChange={e => setRowForm(f => ({ ...f, paint_charges: Number(e.target.value) }))} className={INPUT} />
            </Field>
            <Field label="No. off">
              <input type="number" min={1} value={rowForm.no_off} onChange={e => setRowForm(f => ({ ...f, no_off: Number(e.target.value) }))} className={INPUT} />
            </Field>
            <Field label="Labour (₹)">
              <input type="number" min={0} step={0.01} value={rowForm.labour_charges} onChange={e => setRowForm(f => ({ ...f, labour_charges: Number(e.target.value) }))} className={INPUT} />
            </Field>
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setAddingRow(false)} className={BTN_SEC}>Cancel</button>
            <button onClick={handleAddRow} disabled={saving} className={BTN_PRI}>{saving ? 'Saving…' : 'Add Row'}</button>
          </div>
        </Overlay>
      )}

      {/* Add panel modal */}
      {addingPanel && (
        <Overlay onClose={() => setAddingPanel(false)}>
          <h3 className="mb-3 text-base font-semibold text-gray-900">Add Panel</h3>
          <Field label="Panel Name">
            <input
              value={newPanelName}
              onChange={e => setNewPanelName(e.target.value)}
              placeholder="e.g. Front LH Door"
              className={INPUT}
              onKeyDown={e => e.key === 'Enter' && void handleAddPanel()}
              autoFocus
            />
          </Field>
          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setAddingPanel(false)} className={BTN_SEC}>Cancel</button>
            <button onClick={handleAddPanel} disabled={!newPanelName.trim()} className={BTN_PRI}>Add Panel</button>
          </div>
        </Overlay>
      )}

      {/* Email compose modal */}
      {composingEmail && (
        <Overlay onClose={() => setComposingEmail(false)}>
          <h3 className="mb-1 text-base font-semibold text-gray-900">Compose Email to Tata Motors</h3>
          <p className="mb-4 text-xs text-gray-500">Send warranty claim documents for review and approval.</p>
          
          <div className="space-y-3">
            <Field label="To">
              <input
                value={emailForm.to}
                onChange={e => setEmailForm(f => ({ ...f, to: e.target.value }))}
                type="email"
                className={INPUT}
              />
            </Field>
            <Field label="Subject">
              <input
                value={emailForm.subject}
                onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))}
                className={INPUT}
              />
            </Field>
            <Field label="Message">
              <textarea
                value={emailForm.body}
                onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))}
                rows={10}
                className={INPUT}
              />
            </Field>
            
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900 mb-2">Attachments to be sent:</p>
              <ul className="text-xs text-amber-800 space-y-1">
                <li>✓ Pre-Repair PPT Report</li>
                <li>✓ Post-Repair PPT Report</li>
                <li>✓ Estimate & Quotation (Excel)</li>
              </ul>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setComposingEmail(false)} disabled={sendingEmail} className={BTN_SEC}>Cancel</button>
            <button
              onClick={async () => {
                if (!id || !jc) return
                setSendingEmail(true)
                try {
                  const sendRes = await sendClaimEmail(id, {
                    to: emailForm.to,
                    subject: emailForm.subject,
                    html: emailForm.body,
                  })

                  if (sendRes.error) {
                    alert('Failed to send email: ' + sendRes.error)
                    return
                  }

                  await logActivity('email_sent', {
                    resourceType: 'job_card',
                    resourceId: id,
                    details: { to: emailForm.to, subject: emailForm.subject },
                  })

                  setComposingEmail(false)
                  alert('✓ Email sent successfully to ' + emailForm.to)
                } catch (err) {
                  alert('Error sending email: ' + (err instanceof Error ? err.message : 'Unknown error'))
                } finally {
                  setSendingEmail(false)
                }
              }}
              disabled={sendingEmail}
              className={BTN_PRI}
            >
              {sendingEmail ? 'Sending…' : 'Send Email'}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="animate-pulse p-6">
      <div className="mb-1 h-3 w-24 rounded bg-gray-200" />
      <div className="mb-1 h-6 w-44 rounded bg-gray-200" />
      <div className="mb-6 h-4 w-60 rounded bg-gray-200" />
      <div className="mb-6 flex gap-2">
        {[80, 100, 90, 120].map(w => <div key={w} style={{ width: w }} className="h-10 rounded-full bg-gray-200 shrink-0" />)}
      </div>
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => <div key={i} className="h-44 rounded-xl bg-gray-200" />)}
      </div>
      <div className="h-48 rounded-xl bg-gray-200" />
    </div>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

const INPUT      = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const BTN_PRI    = 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors'
const BTN_SEC    = 'rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors'
const BTN_DANGER = 'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors'
