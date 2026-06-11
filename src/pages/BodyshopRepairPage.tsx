import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import DateRangeFilter, { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import {
  listRepairCards, createRepairCard, updateRepairCard, advanceStage,
  getGroupForStage, STAGE_LABELS, STAGE_GROUPS,
  type RepairCard, type CustomerType,
} from '../lib/api/bodyshopRepair'

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(v: string | null | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function inr(v: number | null | undefined) {
  if (v == null) return '—'
  return '₹' + v.toLocaleString('en-IN')
}
const CT_LABELS: Record<string, string> = { individual: 'Individual', firm: 'Firm', foc: 'FOC', cash: 'Cash' }

type DetailTab = 'overview' | 'docs' | 'survey' | 'floor' | 'qc' | 'billing'

// ── component ──────────────────────────────────────────────────────────────────
export default function BodyshopRepairPage() {
  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange())
  const [cards, setCards]         = useState<RepairCard[]>([])
  const [loading, setLoading]     = useState(true)
  const [branches, setBranches]   = useState<string[]>([])
  const [search, setSearch]       = useState('')
  const [branchFilter, setBranchFilter]   = useState('all')
  const [statusFilter, setStatusFilter]   = useState('active')
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null)

  // modals
  const [showNew, setShowNew]           = useState(false)
  const [selected, setSelected]         = useState<RepairCard | null>(null)
  const [detailTab, setDetailTab]       = useState<DetailTab>('overview')
  const [editPatch, setEditPatch]       = useState<Partial<RepairCard>>({})
  const [saving, setSaving]             = useState(false)

  // new form
  const [nf, setNf] = useState({
    job_card_no: '', reg_number: '', customer_name: '', customer_phone: '',
    customer_type: 'individual' as CustomerType, branch: '', sa_name: '',
  })

  useEffect(() => { void load() }, [dateRange])

  async function load() {
    setLoading(true)
    try {
      const [data, br] = await Promise.all([
        listRepairCards({ from: dateRange.from, to: dateRange.to }),
        supabase.from('service_branches').select('name').order('name'),
      ])
      setCards(data)
      setBranches((br.data ?? []).map((b: { name: string }) => b.name))
    } catch { /* ignore */ }
    setLoading(false)
  }

  function toast_(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleCreate() {
    if (!nf.job_card_no.trim()) { toast_('Job card number required', false); return }
    setSaving(true)
    try {
      await createRepairCard(nf)
      toast_('Repair card created ✅')
      setShowNew(false)
      setNf({ job_card_no: '', reg_number: '', customer_name: '', customer_phone: '', customer_type: 'individual', branch: '', sa_name: '' })
      void load()
    } catch (e: any) { toast_(e.message, false) }
    setSaving(false)
  }

  async function handleAdvance() {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await advanceStage(selected.id, selected)
      setSelected(updated)
      setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      toast_(`Advanced to Stage ${updated.current_stage}`)
    } catch (e: any) { toast_(e.message, false) }
    setSaving(false)
  }

  async function handleSavePatch() {
    if (!selected || !Object.keys(editPatch).length) return
    setSaving(true)
    try {
      const updated = await updateRepairCard(selected.id, editPatch)
      setSelected(updated)
      setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      setEditPatch({})
      toast_('Saved ✅')
    } catch (e: any) { toast_(e.message, false) }
    setSaving(false)
  }

  function patch(key: keyof RepairCard, val: any) {
    setEditPatch((p) => ({ ...p, [key]: val }))
    setSelected((s) => s ? { ...s, [key]: val } : s)
  }

  // filtered
  const filtered = useMemo(() => cards.filter((c) => {
    if (branchFilter !== 'all' && c.branch !== branchFilter) return false
    if (statusFilter !== 'all' && c.overall_status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        c.job_card_no?.toLowerCase().includes(q) ||
        (c.reg_number ?? '').toLowerCase().includes(q) ||
        (c.customer_name ?? '').toLowerCase().includes(q)
      )
    }
    return true
  }), [cards, branchFilter, statusFilter, search])

  // pipeline counts
  const pipeline = useMemo(() =>
    STAGE_GROUPS.map((g) => ({
      ...g,
      count: cards.filter((c) => g.stages.includes(c.current_stage) && c.overall_status === 'active').length,
    })),
  [cards])

  const tabs: DetailTab[] = ['overview', 'docs', 'survey', 'floor', 'qc', 'billing']

  return (
    <div className="page">
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: toast.ok ? '#16a34a' : '#dc2626',
          color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
        }}>{toast.msg}</div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="page__header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🔧 Bodyshop Repair Tracker</h1>
          <button className="btn btn--primary" onClick={() => setShowNew(true)}>+ New Intake</button>
        </div>

        <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />

        {/* pipeline chips */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {pipeline.map((g) => (
            <div key={g.label} style={{
              border: `1.5px solid ${g.color}`, borderRadius: 20,
              padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontWeight: 700, color: g.color, fontSize: 16 }}>{g.count}</span>
              <span style={{ fontSize: 12, color: g.color }}>{g.label}</span>
            </div>
          ))}
          <div style={{ border: '1.5px solid #6b7280', borderRadius: 20, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, color: '#6b7280', fontSize: 16 }}>{cards.filter(c => c.overall_status === 'delivered').length}</span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Delivered</span>
          </div>
        </div>

        {/* filters */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input className="inp" placeholder="Search job card / reg / customer…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200 }} />
          <select className="sel" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="all">All Branches</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="sel" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* ── Card Grid ─────────────────────────────────────────────────────── */}
      <div className="page__body">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No repair cards found</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
            {filtered.map((card) => {
              const grp = getGroupForStage(card.current_stage)
              return (
                <div key={card.id} onClick={() => { setSelected(card); setDetailTab('overview'); setEditPatch({}) }}
                  style={{
                    background: '#fff', borderRadius: 12, padding: 14, cursor: 'pointer',
                    borderLeft: `4px solid ${grp.color}`,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{card.job_card_no}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                      background: card.overall_status === 'active' ? '#dbeafe' : card.overall_status === 'delivered' ? '#d1fae5' : '#fee2e2',
                      color: card.overall_status === 'active' ? '#1d4ed8' : card.overall_status === 'delivered' ? '#065f46' : '#991b1b',
                    }}>{card.overall_status}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', marginBottom: 2 }}>
                    {card.reg_number ?? '—'} · {card.customer_name ?? '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>
                    {card.branch ?? '—'} · {CT_LABELS[card.customer_type ?? ''] ?? '—'} · SA: {card.sa_name ?? '—'}
                  </div>
                  <div style={{
                    display: 'inline-block', fontSize: 11, fontWeight: 600,
                    background: `${grp.color}18`, color: grp.color,
                    padding: '3px 8px', borderRadius: 6,
                  }}>
                    Stage {card.current_stage} — {STAGE_LABELS[card.current_stage]}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>In: {fmt(card.received_at)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── New Intake Modal ───────────────────────────────────────────────── */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal modal--md" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h2 className="modal__title">New Car Intake</h2>
              <button className="modal__close" onClick={() => setShowNew(false)}>✕</button>
            </div>
            <div className="modal__body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { k: 'job_card_no', label: 'Job Card No. *' },
                  { k: 'reg_number',  label: 'Reg. Number' },
                  { k: 'customer_name', label: 'Customer Name' },
                  { k: 'customer_phone', label: 'Customer Phone' },
                  { k: 'sa_name', label: 'SA Name' },
                ].map(({ k, label }) => (
                  <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{label}</span>
                    <input className="inp" value={(nf as any)[k]}
                      onChange={(e) => setNf((f) => ({ ...f, [k]: e.target.value }))} />
                  </label>
                ))}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Customer Type</span>
                  <select className="sel" value={nf.customer_type}
                    onChange={(e) => setNf((f) => ({ ...f, customer_type: e.target.value as CustomerType }))}>
                    <option value="individual">Individual</option>
                    <option value="firm">Firm</option>
                    <option value="foc">FOC</option>
                    <option value="cash">Cash</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Branch</span>
                  <select className="sel" value={nf.branch}
                    onChange={(e) => setNf((f) => ({ ...f, branch: e.target.value }))}>
                    <option value="">Select branch</option>
                    {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn btn--primary" onClick={() => void handleCreate()} disabled={saving}>
                {saving ? 'Creating…' : 'Create Repair Card'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ───────────────────────────────────────────────────── */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal modal--xl" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            {/* header */}
            <div className="modal__header" style={{ flexShrink: 0 }}>
              <div>
                <h2 className="modal__title">{selected.job_card_no} — {selected.reg_number ?? '—'}</h2>
                <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
                  {selected.customer_name} · {selected.branch} · {CT_LABELS[selected.customer_type ?? ''] ?? '—'} · SA: {selected.sa_name ?? '—'}
                </p>
              </div>
              <button className="modal__close" onClick={() => setSelected(null)}>✕</button>
            </div>

            {/* stage progress bar */}
            <div style={{ display: 'flex', padding: '0 20px 0', flexShrink: 0, gap: 4, marginBottom: 0 }}>
              {STAGE_GROUPS.map((g) => {
                const inGroup = g.stages.includes(selected.current_stage)
                const done    = g.stages[g.stages.length - 1] < selected.current_stage
                return (
                  <div key={g.label} style={{
                    flex: 1, padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600,
                    borderRadius: 6, marginTop: 8,
                    background: done ? g.color : inGroup ? `${g.color}25` : '#f3f4f6',
                    color: done ? '#fff' : inGroup ? g.color : '#9ca3af',
                    border: inGroup ? `1.5px solid ${g.color}` : '1.5px solid transparent',
                  }}>
                    {done ? '✓ ' : ''}{g.label}
                  </div>
                )
              })}
            </div>

            {/* tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', padding: '0 20px', flexShrink: 0, marginTop: 8 }}>
              {tabs.map((t) => (
                <button key={t} onClick={() => setDetailTab(t)} style={{
                  padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: detailTab === t ? '2px solid #2563eb' : '2px solid transparent',
                  color: detailTab === t ? '#2563eb' : '#6b7280',
                }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* tab content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

              {/* ── Overview ── */}
              {detailTab === 'overview' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    {[
                      ['Job Card', selected.job_card_no],
                      ['Reg No.', selected.reg_number ?? '—'],
                      ['Customer', selected.customer_name ?? '—'],
                      ['Phone', selected.customer_phone ?? '—'],
                      ['Branch', selected.branch ?? '—'],
                      ['SA', selected.sa_name ?? '—'],
                      ['Received', fmt(selected.received_at)],
                      ['Status', selected.overall_status],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{l}</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* current stage */}
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Current Stage</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: getGroupForStage(selected.current_stage).color }}>
                      Stage {selected.current_stage} — {STAGE_LABELS[selected.current_stage]}
                    </div>
                  </div>

                  {/* stage stepper */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {Object.entries(STAGE_LABELS).map(([numStr, label]) => {
                      const num     = Number(numStr)
                      const isDone  = selected.current_stage > num
                      const isCur   = selected.current_stage === num
                      const grp     = getGroupForStage(num)
                      return (
                        <div key={num} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 10px', borderRadius: 8,
                          background: isCur ? `${grp.color}15` : isDone ? '#f0fdf4' : '#fafafa',
                          border: isCur ? `1px solid ${grp.color}` : '1px solid #e5e7eb',
                        }}>
                          <div style={{
                            width: 14, height: 14, borderRadius: 7, flexShrink: 0,
                            background: isDone ? '#16a34a' : isCur ? grp.color : '#d1d5db',
                          }} />
                          <span style={{ fontSize: 11, fontWeight: isCur ? 700 : 500, color: isCur ? grp.color : isDone ? '#374151' : '#9ca3af' }}>
                            {num}. {label}
                          </span>
                          {isCur && <span style={{ fontSize: 10, marginLeft: 'auto', color: grp.color }}>←</span>}
                          {isDone && <span style={{ fontSize: 10, marginLeft: 'auto', color: '#16a34a' }}>✓</span>}
                        </div>
                      )
                    })}
                  </div>

                  {/* advance button */}
                  {selected.overall_status === 'active' && selected.current_stage < 18 && (
                    <button className="btn btn--primary" onClick={() => void handleAdvance()} disabled={saving}
                      style={{ marginTop: 16, width: '100%' }}>
                      {saving ? 'Saving…' : `✓ Mark Stage ${selected.current_stage} Done → Move to Stage ${selected.current_stage + 1}`}
                    </button>
                  )}
                </div>
              )}

              {/* ── Docs ── */}
              {detailTab === 'docs' && (() => {
                const ct = selected.customer_type ?? 'individual'
                const noDocsRequired = ct === 'cash' || ct === 'foc'

                // All possible docs with per-type mandatory flag
                const ALL_DOCS: { k: keyof RepairCard; label: string; mandatoryFor: CustomerType[] }[] = [
                  { k: 'doc_claim_form',  label: 'Claim Form',        mandatoryFor: ['individual', 'firm'] },
                  { k: 'doc_rc',          label: 'RC',                mandatoryFor: ['individual', 'firm'] },
                  { k: 'doc_insurance',   label: 'Insurance Copy',    mandatoryFor: ['individual', 'firm'] },
                  { k: 'doc_dl',          label: 'Driving Licence',   mandatoryFor: ['individual', 'firm'] },
                  { k: 'doc_aadhaar',     label: 'Aadhaar Card',      mandatoryFor: ['individual', 'firm'] },
                  { k: 'doc_pan',         label: 'PAN Card',          mandatoryFor: ['individual', 'firm'] },
                  { k: 'doc_kyc',         label: 'KYC',               mandatoryFor: ['individual'] },
                  { k: 'doc_gst',         label: 'GST',               mandatoryFor: ['firm'] },
                  { k: 'doc_company_pan', label: 'Company PAN Card',  mandatoryFor: ['firm'] },
                  { k: 'doc_bank_detail', label: 'Bank Detail',       mandatoryFor: [] },
                ]

                const visibleDocs = noDocsRequired ? [] : ALL_DOCS
                const mandatoryDocs = visibleDocs.filter(d => d.mandatoryFor.includes(ct as CustomerType))
                const optionalDocs  = visibleDocs.filter(d => !d.mandatoryFor.includes(ct as CustomerType))
                const collectedMandatory = mandatoryDocs.filter(d => (selected as any)[d.k]).length
                const allMandatoryDone = mandatoryDocs.length > 0 && collectedMandatory === mandatoryDocs.length

                return (
                  <div>
                    {/* Customer Type selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>Customer Type:</span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(['individual','firm','foc','cash'] as CustomerType[]).map(t => (
                          <button key={t} onClick={() => patch('customer_type', t)} style={{
                            padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                            border: '1.5px solid',
                            borderColor: selected.customer_type === t ? '#2563eb' : '#e5e7eb',
                            background: selected.customer_type === t ? '#2563eb' : '#fff',
                            color: selected.customer_type === t ? '#fff' : '#6b7280',
                            cursor: 'pointer',
                            textTransform: 'capitalize',
                          }}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {noDocsRequired ? (
                      <div style={{ textAlign: 'center', padding: '32px 16px', background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0' }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#15803d' }}>No Documents Required</div>
                        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                          {ct === 'cash' ? 'Cash customers' : 'FOC customers'} do not require any documentation.
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Progress bar */}
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                              Mandatory Documents
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: allMandatoryDone ? '#16a34a' : '#dc2626' }}>
                              {collectedMandatory} / {mandatoryDocs.length} {allMandatoryDone ? '✓ Complete' : '⚠ Pending'}
                            </span>
                          </div>
                          <div style={{ height: 6, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 4, transition: 'width 0.3s',
                              width: mandatoryDocs.length ? `${(collectedMandatory / mandatoryDocs.length) * 100}%` : '0%',
                              background: allMandatoryDone ? '#16a34a' : '#f59e0b',
                            }} />
                          </div>
                        </div>

                        {/* Mandatory docs */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                          {mandatoryDocs.map(({ k, label }) => {
                            const checked = (selected as any)[k] ?? false
                            return (
                              <label key={k} onClick={() => patch(k, !checked)} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                background: checked ? '#f0fdf4' : '#fff9f9',
                                border: `1.5px solid ${checked ? '#86efac' : '#fca5a5'}`,
                              }}>
                                <div style={{
                                  width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                                  border: `2px solid ${checked ? '#16a34a' : '#ef4444'}`,
                                  background: checked ? '#16a34a' : '#fff',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  {checked && <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>✓</span>}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{label}</div>
                                  <div style={{ fontSize: 10, color: checked ? '#16a34a' : '#ef4444', fontWeight: 600 }}>
                                    {checked ? 'Collected' : 'Required'}
                                  </div>
                                </div>
                              </label>
                            )
                          })}
                        </div>

                        {/* Optional docs */}
                        {optionalDocs.length > 0 && (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                              Optional
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              {optionalDocs.map(({ k, label }) => {
                                const checked = (selected as any)[k] ?? false
                                return (
                                  <label key={k} onClick={() => patch(k, !checked)} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                    background: checked ? '#f0fdf4' : '#fafafa',
                                    border: `1.5px solid ${checked ? '#86efac' : '#e5e7eb'}`,
                                  }}>
                                    <div style={{
                                      width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                                      border: `2px solid ${checked ? '#16a34a' : '#d1d5db'}`,
                                      background: checked ? '#16a34a' : '#fff',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                      {checked && <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>✓</span>}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{label}</div>
                                      <div style={{ fontSize: 10, color: '#9ca3af' }}>Optional</div>
                                    </div>
                                  </label>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </>
                    )}

                    {Object.keys(editPatch).length > 0 && (
                      <button className="btn btn--primary" onClick={() => void handleSavePatch()} disabled={saving}
                        style={{ marginTop: 16, width: '100%' }}>
                        {saving ? 'Saving…' : 'Save Documents'}
                      </button>
                    )}
                  </div>
                )
              })()}

              {/* ── Survey ── */}
              {detailTab === 'survey' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Survey Status</span>
                    <select className="sel" value={selected.survey_status ?? 'pending'}
                      onChange={(e) => patch('survey_status', e.target.value)}>
                      <option value="pending">Pending</option>
                      <option value="hold">Hold</option>
                      <option value="approved">Approved</option>
                    </select>
                  </label>
                  {[
                    { k: 'claim_intimation_no',    label: 'Claim Intimation No.' },
                    { k: 'surveyor_name',          label: 'Surveyor Name' },
                    { k: 'surveyor_contact',       label: 'Surveyor Contact' },
                    { k: 'approved_parts',         label: 'Approved Parts' },
                    { k: 'estimation_by',          label: 'Estimation By' },
                    { k: 'estimation_approved_by', label: 'Estimation Approved By' },
                    { k: 'survey_hold_reason',     label: 'Hold Reason' },
                  ].map(({ k, label }) => (
                    <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                      <input className="inp" value={(selected as any)[k] ?? ''}
                        onChange={(e) => patch(k as keyof RepairCard, e.target.value)} />
                    </label>
                  ))}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: '#fafafa', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    <input type="checkbox" checked={selected.customer_approved ?? false}
                      onChange={(e) => patch('customer_approved', e.target.checked)} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Customer Approved</span>
                  </label>
                  {Object.keys(editPatch).length > 0 && (
                    <div style={{ gridColumn: '1/-1' }}>
                      <button className="btn btn--primary" onClick={() => void handleSavePatch()} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Survey'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Floor ── */}
              {detailTab === 'floor' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {[
                    { k: 'denter_name',   label: 'Denter Name' },
                    { k: 'denter_code',   label: 'Denter Code' },
                    { k: 'painter_name',  label: 'Painter Name' },
                    { k: 'painter_code',  label: 'Painter Code' },
                    { k: 'technician_name', label: 'Technician Name' },
                    { k: 'technician_code', label: 'Technician Code' },
                    { k: 'additional_approval', label: 'Additional Approval' },
                    { k: 'floor_hold_reason',   label: 'Hold Reason' },
                  ].map(({ k, label }) => (
                    <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                      <input className="inp" value={(selected as any)[k] ?? ''}
                        onChange={(e) => patch(k as keyof RepairCard, e.target.value)} />
                    </label>
                  ))}
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Floor Status</span>
                    <select className="sel" value={selected.floor_status ?? 'work_inprocess'}
                      onChange={(e) => patch('floor_status', e.target.value)}>
                      <option value="work_inprocess">Work In Process</option>
                      <option value="hold">Hold</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                  {Object.keys(editPatch).length > 0 && (
                    <div style={{ gridColumn: '1/-1' }}>
                      <button className="btn btn--primary" onClick={() => void handleSavePatch()} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Floor'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── QC ── */}
              {detailTab === 'qc' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>QC Status</span>
                    <select className="sel" value={selected.qc_status ?? 'pending'}
                      onChange={(e) => patch('qc_status', e.target.value)}>
                      <option value="pending">Pending</option>
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                    </select>
                  </label>
                  {[
                    { k: 'qc_checked_by',   label: 'QC Checked By' },
                    { k: 'qc_fail_reason',  label: 'Fail Reason' },
                    { k: 'reinspection_by', label: 'Re-Inspection By' },
                  ].map(({ k, label }) => (
                    <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                      <input className="inp" value={(selected as any)[k] ?? ''}
                        onChange={(e) => patch(k as keyof RepairCard, e.target.value)} />
                    </label>
                  ))}
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Re-Inspection Type</span>
                    <select className="sel" value={selected.reinspection_type ?? ''}
                      onChange={(e) => patch('reinspection_type', e.target.value)}>
                      <option value="">— None —</option>
                      <option value="team_member">Team Member</option>
                      <option value="surveyor">Surveyor</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Delivery Status</span>
                    <select className="sel" value={selected.delivery_status ?? 'pending'}
                      onChange={(e) => patch('delivery_status', e.target.value)}>
                      <option value="pending">Pending</option>
                      <option value="done">Done</option>
                    </select>
                  </label>
                  {Object.keys(editPatch).length > 0 && (
                    <div style={{ gridColumn: '1/-1' }}>
                      <button className="btn btn--primary" onClick={() => void handleSavePatch()} disabled={saving}>
                        {saving ? 'Saving…' : 'Save QC'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Billing ── */}
              {detailTab === 'billing' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Parts Entry Status</span>
                    <select className="sel" value={selected.parts_entry_status ?? 'pending'}
                      onChange={(e) => patch('parts_entry_status', e.target.value)}>
                      <option value="pending">Pending</option>
                      <option value="entered">Entered</option>
                      <option value="billed">Billed</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Billed Amount (₹)</span>
                    <input className="inp" type="number" value={selected.billed_amount ?? ''}
                      onChange={(e) => patch('billed_amount', e.target.value ? Number(e.target.value) : null)} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>DO Status</span>
                    <select className="sel" value={selected.do_status ?? 'pending'}
                      onChange={(e) => patch('do_status', e.target.value)}>
                      <option value="pending">Pending</option>
                      <option value="received">Received</option>
                      <option value="not_received">Not Received</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>DO Amount (₹)</span>
                    <input className="inp" type="number" value={selected.do_amount ?? ''}
                      onChange={(e) => patch('do_amount', e.target.value ? Number(e.target.value) : null)} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Customer Diff Amount (₹)</span>
                    <input className="inp" type="number" value={selected.customer_diff_amount ?? ''}
                      onChange={(e) => patch('customer_diff_amount', e.target.value ? Number(e.target.value) : null)} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Payment Status</span>
                    <select className="sel" value={selected.payment_status ?? 'pending'}
                      onChange={(e) => patch('payment_status', e.target.value)}>
                      <option value="pending">Pending</option>
                      <option value="received">Received</option>
                      <option value="not_received">Not Received</option>
                    </select>
                  </label>
                  {/* summary */}
                  <div style={{ gridColumn: '1/-1', background: '#f8fafc', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#374151' }}>Billing Summary</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {[['Billed', selected.billed_amount], ['DO', selected.do_amount], ['Customer Diff', selected.customer_diff_amount]].map(([l, v]) => (
                        <div key={String(l)}>
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{l}</div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{inr(v as number | null)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {Object.keys(editPatch).length > 0 && (
                    <div style={{ gridColumn: '1/-1' }}>
                      <button className="btn btn--primary" onClick={() => void handleSavePatch()} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Billing'}
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
