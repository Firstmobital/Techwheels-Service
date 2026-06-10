import { useEffect, useState, useMemo } from 'react'
import DateRangeFilter, { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'
import {
  listRepairCards,
  createRepairCard,
  advanceStage,
  holdStage,
  listStageLogs,
  listRepairDocs,
  listRepairPhotos,
  getSurvey,
  upsertSurvey,
  getBilling,
  upsertBilling,
  getQc,
  upsertQc,
  STAGE_LABELS,
  MANDATORY_DOCS,
  OPTIONAL_DOCS,
  type RepairCard,
  type StageLog,
  type RepairDoc,
  type RepairPhoto,
  type SurveyDetail,
  type BillingRecord,
  type QcRecord,
  type CustomerType,
} from '../lib/api/bodyshopRepair'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(v: string | null | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function stageBadgeClass(stage: number): string {
  if (stage <= 5)  return 'badge badge--blue'
  if (stage <= 10) return 'badge badge--purple'
  if (stage <= 14) return 'badge badge--orange'
  return 'badge badge--green'
}

function overallBadge(status: string): string {
  if (status === 'delivered')  return 'badge badge--green'
  if (status === 'cancelled')  return 'badge badge--red'
  return 'badge badge--blue'
}

const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  individual: 'Individual',
  firm: 'Firm',
  foc: 'FOC',
  cash: 'Cash',
}

const DOC_LABELS: Record<string, string> = {
  claim_form: 'Claim Form', rc: 'RC', insurance: 'Insurance Copy',
  dl: 'Driving Licence', aadhaar: 'Aadhaar Card', pan: 'PAN Card',
  kyc: 'KYC', gst: 'GST', company_pan: 'Company PAN',
  bank_detail: 'Bank Detail', third_party_affidavit: 'Third Party Affidavit', kyc_form: 'KYC Form',
}

// Stage groups for pipeline view
const STAGE_GROUPS = [
  { label: 'SA Intake',    stages: [1,2,3,4,5,6,7,8,9,10], color: '#3b82f6' },
  { label: 'Floor Work',   stages: [11,12],                  color: '#8b5cf6' },
  { label: 'QC & Inspect', stages: [13,14],                  color: '#f59e0b' },
  { label: 'Billing',      stages: [15,16],                  color: '#10b981' },
  { label: 'Delivery',     stages: [17,18],                  color: '#6b7280' },
]

function getGroupForStage(stage: number): typeof STAGE_GROUPS[0] {
  return STAGE_GROUPS.find((g) => g.stages.includes(stage)) ?? STAGE_GROUPS[0]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StepperProps { card: RepairCard; logs: StageLog[] }
function StageStepper({ card, logs }: StepperProps) {
  return (
    <div className="stage-stepper">
      {Object.entries(STAGE_LABELS).map(([numStr, label]) => {
        const num = Number(numStr)
        const log = logs.find((l) => l.stage_no === num && l.status === 'done')
        const isCurrent = card.current_stage === num
        const isDone    = card.current_stage > num
        const isHold    = logs.some((l) => l.stage_no === num && l.status === 'hold')
        const group     = getGroupForStage(num)

        return (
          <div
            key={num}
            className={`stage-step ${isDone ? 'stage-step--done' : ''} ${isCurrent ? 'stage-step--current' : ''} ${isHold ? 'stage-step--hold' : ''}`}
          >
            <div className="stage-step__dot" style={{ background: isCurrent || isDone ? group.color : undefined }} />
            <div className="stage-step__body">
              <span className="stage-step__num">{num}.</span>
              <span className="stage-step__label">{label}</span>
              {isDone && log && (
                <span className="stage-step__meta">
                  ✓ {log.done_by_name ?? '—'} · {fmtDate(log.logged_at)}
                </span>
              )}
              {isHold && <span className="stage-step__hold">⚠ Hold</span>}
              {isCurrent && <span className="stage-step__current-pill">← Current</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

type ModalMode = 'new' | 'detail' | null
type DetailTab = 'overview' | 'docs' | 'photos' | 'survey' | 'billing' | 'qc'

export default function BodyshopRepairPage() {
  const [dateRange, setDateRange]   = useState<DateRange>(currentMonthRange())
  const [cards, setCards]           = useState<RepairCard[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'delivered'>('all')
  const [toast, setToast]           = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Modal state
  const [modalMode, setModalMode]   = useState<ModalMode>(null)
  const [selectedCard, setSelectedCard] = useState<RepairCard | null>(null)
  const [detailTab, setDetailTab]   = useState<DetailTab>('overview')

  // Detail data
  const [stageLogs, setStageLogs]   = useState<StageLog[]>([])
  const [docs, setDocs]             = useState<RepairDoc[]>([])
  const [photos, setPhotos]         = useState<RepairPhoto[]>([])
  const [survey, setSurvey]         = useState<SurveyDetail | null>(null)
  const [billing, setBilling]       = useState<BillingRecord | null>(null)
  const [qc, setQc]                 = useState<QcRecord | null>(null)

  // New card form
  const [newForm, setNewForm] = useState({
    job_card_no: '', reg_number: '', customer_name: '', customer_phone: '',
    customer_type: 'individual' as CustomerType, branch: '', sa_name: '',
  })
  const [saving, setSaving] = useState(false)

  // Branches
  const [branches, setBranches] = useState<string[]>([])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadAll() }, [dateRange])

  async function loadAll() {
    setLoading(true)
    const [cardsRes, branchesRes] = await Promise.all([
      listRepairCards({
        from: dateRange.from?.toISOString(),
        to: dateRange.to?.toISOString(),
      }),
      supabase.from('service_branches').select('name').order('name'),
    ])
    if (cardsRes.data)  setCards(cardsRes.data)
    if (branchesRes.data) setBranches((branchesRes.data as { name: string }[]).map((b) => b.name))
    setLoading(false)
  }

  async function openDetail(card: RepairCard) {
    setSelectedCard(card)
    setDetailTab('overview')
    setModalMode('detail')

    const [logsRes, docsRes, photosRes, surveyRes, billingRes, qcRes] = await Promise.all([
      listStageLogs(card.id),
      listRepairDocs(card.id),
      listRepairPhotos(card.id),
      getSurvey(card.id),
      getBilling(card.id),
      getQc(card.id),
    ])
    if (logsRes.data)    setStageLogs(logsRes.data)
    if (docsRes.data)    setDocs(docsRes.data)
    if (photosRes.data)  setPhotos(photosRes.data)
    if (surveyRes.data)  setSurvey(surveyRes.data)
    if (billingRes.data) setBilling(billingRes.data)
    if (qcRes.data)      setQc(qcRes.data)
  }

  async function handleCreateCard() {
    if (!newForm.job_card_no.trim()) {
      showToast('Job card number is required', 'error'); return
    }
    setSaving(true)
    const res = await createRepairCard({ ...newForm })
    setSaving(false)
    if (res.error) { showToast(res.error, 'error'); return }
    showToast('Repair card created', 'success')
    setModalMode(null)
    resetNewForm()
    void loadAll()
  }

  async function handleAdvanceStage(card: RepairCard) {
    const res = await advanceStage(card.id, card.current_stage + 1, 'staff', 'User')
    if (res.error) { showToast(res.error, 'error'); return }
    showToast(`Advanced to Stage ${card.current_stage + 1}`, 'success')
    void loadAll()
    if (selectedCard?.id === card.id) void openDetail({ ...card, current_stage: card.current_stage + 1 })
  }

  async function handleHold(card: RepairCard, reason: string) {
    const res = await holdStage(card.id, card.current_stage, reason, 'staff', 'User')
    if (res.error) { showToast(res.error, 'error'); return }
    showToast('Stage put on hold', 'success')
    void openDetail(card)
  }

  function resetNewForm() {
    setNewForm({ job_card_no: '', reg_number: '', customer_name: '', customer_phone: '', customer_type: 'individual', branch: '', sa_name: '' })
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Filtered cards ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (branchFilter !== 'all' && c.branch !== branchFilter) return false
      if (statusFilter !== 'all'  && c.overall_status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          c.job_card_no?.toLowerCase().includes(q) ||
          c.reg_number?.toLowerCase().includes(q)  ||
          c.customer_name?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [cards, branchFilter, statusFilter, search])

  // ── Pipeline summary ───────────────────────────────────────────────────────
  const pipeline = useMemo(() => {
    return STAGE_GROUPS.map((g) => ({
      ...g,
      count: cards.filter((c) => g.stages.includes(c.current_stage) && c.overall_status === 'active').length,
    }))
  }, [cards])

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      {/* Toast */}
      {toast && (
        <div className={`toast toast--${toast.type}`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="page__header">
        <div className="page__title-row">
          <h1 className="page__title">🔧 Bodyshop Repair Tracker</h1>
          <button className="btn btn--primary" onClick={() => setModalMode('new')}>
            + New Car Intake
          </button>
        </div>

        {/* Date filter */}
        <div className="toolbar toolbar--tight mt-8">
          <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />
        </div>

        {/* Pipeline summary chips */}
        <div className="pipeline-chips">
          {pipeline.map((g) => (
            <div key={g.label} className="pipeline-chip" style={{ borderColor: g.color }}>
              <span className="pipeline-chip__count" style={{ color: g.color }}>{g.count}</span>
              <span className="pipeline-chip__label">{g.label}</span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="toolbar toolbar--tight mt-8">
          <input
            className="inp inp--search"
            placeholder="Search job card, reg, customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="sel" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="all">All Branches</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="sel" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="delivered">Delivered</option>
          </select>
        </div>
      </div>

      {/* Cards list */}
      <div className="page__body">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No repair cards found</div>
        ) : (
          <div className="repair-grid">
            {filtered.map((card) => {
              const group = getGroupForStage(card.current_stage)
              return (
                <div
                  key={card.id}
                  className="repair-card"
                  onClick={() => void openDetail(card)}
                  style={{ borderLeftColor: group.color }}
                >
                  <div className="repair-card__header">
                    <span className="repair-card__jc">{card.job_card_no}</span>
                    <span className={overallBadge(card.overall_status)}>
                      {card.overall_status}
                    </span>
                  </div>
                  <div className="repair-card__reg">{card.reg_number ?? '—'}</div>
                  <div className="repair-card__customer">{card.customer_name ?? '—'}</div>
                  <div className="repair-card__meta">
                    {card.branch && <span className="chip">{card.branch}</span>}
                    {card.customer_type && (
                      <span className="chip chip--grey">
                        {CUSTOMER_TYPE_LABELS[card.customer_type as CustomerType]}
                      </span>
                    )}
                  </div>
                  <div className="repair-card__stage">
                    <span className={stageBadgeClass(card.current_stage)}>
                      Stage {card.current_stage} — {STAGE_LABELS[card.current_stage]}
                    </span>
                    <span className="repair-card__group" style={{ color: group.color }}>
                      {group.label}
                    </span>
                  </div>
                  <div className="repair-card__footer">
                    <span className="repair-card__date">In: {fmtDate(card.received_at)}</span>
                    {card.sa_name && <span className="repair-card__sa">SA: {card.sa_name}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── New Car Modal ─────────────────────────────────────────────────── */}
      {modalMode === 'new' && (
        <div className="modal-overlay" onClick={() => setModalMode(null)}>
          <div className="modal modal--md" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h2 className="modal__title">New Car Intake</h2>
              <button className="modal__close" onClick={() => setModalMode(null)}>✕</button>
            </div>
            <div className="modal__body">
              <div className="form-grid">
                <label className="form-field">
                  <span>Job Card No. *</span>
                  <input className="inp" value={newForm.job_card_no}
                    onChange={(e) => setNewForm((f) => ({ ...f, job_card_no: e.target.value }))} />
                </label>
                <label className="form-field">
                  <span>Reg. Number</span>
                  <input className="inp" value={newForm.reg_number}
                    onChange={(e) => setNewForm((f) => ({ ...f, reg_number: e.target.value }))} />
                </label>
                <label className="form-field">
                  <span>Customer Name</span>
                  <input className="inp" value={newForm.customer_name}
                    onChange={(e) => setNewForm((f) => ({ ...f, customer_name: e.target.value }))} />
                </label>
                <label className="form-field">
                  <span>Customer Phone</span>
                  <input className="inp" value={newForm.customer_phone}
                    onChange={(e) => setNewForm((f) => ({ ...f, customer_phone: e.target.value }))} />
                </label>
                <label className="form-field">
                  <span>Customer Type</span>
                  <select className="sel" value={newForm.customer_type}
                    onChange={(e) => setNewForm((f) => ({ ...f, customer_type: e.target.value as CustomerType }))}>
                    <option value="individual">Individual</option>
                    <option value="firm">Firm</option>
                    <option value="foc">FOC</option>
                    <option value="cash">Cash</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Branch</span>
                  <select className="sel" value={newForm.branch}
                    onChange={(e) => setNewForm((f) => ({ ...f, branch: e.target.value }))}>
                    <option value="">Select branch</option>
                    {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </label>
                <label className="form-field">
                  <span>SA Name</span>
                  <input className="inp" value={newForm.sa_name}
                    onChange={(e) => setNewForm((f) => ({ ...f, sa_name: e.target.value }))} />
                </label>
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => setModalMode(null)}>Cancel</button>
              <button className="btn btn--primary" onClick={() => void handleCreateCard()} disabled={saving}>
                {saving ? 'Creating…' : 'Create Repair Card'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ──────────────────────────────────────────────────── */}
      {modalMode === 'detail' && selectedCard && (
        <div className="modal-overlay" onClick={() => setModalMode(null)}>
          <div className="modal modal--xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <div>
                <h2 className="modal__title">{selectedCard.job_card_no} — {selectedCard.reg_number ?? '—'}</h2>
                <p className="modal__subtitle">
                  {selectedCard.customer_name} · {selectedCard.branch} ·{' '}
                  {selectedCard.customer_type && CUSTOMER_TYPE_LABELS[selectedCard.customer_type as CustomerType]}
                </p>
              </div>
              <button className="modal__close" onClick={() => setModalMode(null)}>✕</button>
            </div>

            {/* Stage progress bar */}
            <div className="stage-bar">
              {STAGE_GROUPS.map((g) => {
                const inGroup = g.stages.includes(selectedCard.current_stage)
                const pastGroup = g.stages[g.stages.length - 1] < selectedCard.current_stage
                return (
                  <div
                    key={g.label}
                    className={`stage-bar__seg ${inGroup ? 'stage-bar__seg--active' : ''} ${pastGroup ? 'stage-bar__seg--done' : ''}`}
                    style={{ '--seg-color': g.color } as React.CSSProperties}
                  >
                    {g.label}
                  </div>
                )
              })}
            </div>

            {/* Tabs */}
            <div className="tabs">
              {(['overview','docs','photos','survey','billing','qc'] as DetailTab[]).map((t) => (
                <button
                  key={t}
                  className={`tab ${detailTab === t ? 'tab--active' : ''}`}
                  onClick={() => setDetailTab(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div className="modal__body modal__body--tabs">

              {/* ── Overview ── */}
              {detailTab === 'overview' && (
                <div className="detail-overview">
                  <div className="detail-meta-grid">
                    <div><span className="detail-label">Job Card</span><strong>{selectedCard.job_card_no}</strong></div>
                    <div><span className="detail-label">Reg No.</span><strong>{selectedCard.reg_number ?? '—'}</strong></div>
                    <div><span className="detail-label">SA</span><strong>{selectedCard.sa_name ?? '—'}</strong></div>
                    <div><span className="detail-label">Received</span><strong>{fmtDate(selectedCard.received_at)}</strong></div>
                    <div><span className="detail-label">Current Stage</span>
                      <span className={stageBadgeClass(selectedCard.current_stage)}>
                        {selectedCard.current_stage} — {STAGE_LABELS[selectedCard.current_stage]}
                      </span>
                    </div>
                    <div><span className="detail-label">Status</span>
                      <span className={overallBadge(selectedCard.overall_status)}>{selectedCard.overall_status}</span>
                    </div>
                  </div>

                  <div className="detail-actions mt-16">
                    {selectedCard.overall_status === 'active' && selectedCard.current_stage < 18 && (
                      <button
                        className="btn btn--primary"
                        onClick={() => void handleAdvanceStage(selectedCard)}
                      >
                        ✓ Mark Stage {selectedCard.current_stage} Done → Stage {selectedCard.current_stage + 1}
                      </button>
                    )}
                  </div>

                  <div className="mt-24">
                    <h3 className="section-title">Stage History</h3>
                    <StageStepper card={selectedCard} logs={stageLogs} />
                  </div>
                </div>
              )}

              {/* ── Docs ── */}
              {detailTab === 'docs' && (
                <div className="detail-docs">
                  <h3 className="section-title">Document Checklist</h3>
                  <table className="tbl">
                    <thead>
                      <tr><th>Document</th><th>Required</th><th>Uploaded</th></tr>
                    </thead>
                    <tbody>
                      {docs.map((d) => (
                        <tr key={d.id}>
                          <td>{DOC_LABELS[d.doc_type] ?? d.doc_type}</td>
                          <td>{d.is_mandatory ? <span className="badge badge--red">Mandatory</span> : <span className="badge badge--grey">Optional</span>}</td>
                          <td>
                            {d.is_uploaded
                              ? <span className="badge badge--green">✓ Uploaded</span>
                              : <span className="badge badge--orange">Pending</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="detail-progress mt-12">
                    {docs.filter((d) => d.is_mandatory).filter((d) => d.is_uploaded).length} /&nbsp;
                    {docs.filter((d) => d.is_mandatory).length} mandatory docs uploaded
                  </div>
                </div>
              )}

              {/* ── Photos ── */}
              {detailTab === 'photos' && (
                <div className="detail-photos">
                  {(['pre_repair','under_repair','post_repair'] as const).map((stage) => {
                    const stagePhotos = photos.filter((p) => p.photo_stage === stage)
                    const stageLabel = stage === 'pre_repair' ? '📸 Pre-Repair (SA)' : stage === 'under_repair' ? '🔧 Under-Repair (Floor)' : '✅ Post-Repair (Floor)'
                    return (
                      <div key={stage} className="photo-section">
                        <h4 className="photo-section__title">
                          {stageLabel}
                          <span className="photo-count">{stagePhotos.length}{stage === 'pre_repair' ? '/20' : ''}</span>
                        </h4>
                        {stagePhotos.length === 0 ? (
                          <div className="photo-empty">No photos yet</div>
                        ) : (
                          <div className="photo-grid">
                            {stagePhotos.map((p) => (
                              <a key={p.id} href={p.file_url} target="_blank" rel="noreferrer" className="photo-thumb">
                                <img src={p.file_url} alt="repair" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Survey ── */}
              {detailTab === 'survey' && survey && (
                <div className="detail-section">
                  <h3 className="section-title">Survey & Estimation</h3>
                  <div className="detail-meta-grid">
                    <div><span className="detail-label">Survey Status</span>
                      <span className={`badge ${survey.survey_status === 'approved' ? 'badge--green' : survey.survey_status === 'hold' ? 'badge--red' : 'badge--grey'}`}>
                        {survey.survey_status}
                      </span>
                    </div>
                    <div><span className="detail-label">Claim Intimation No.</span><strong>{survey.claim_intimation_no ?? '—'}</strong></div>
                    <div><span className="detail-label">Estimation By</span><strong>{survey.estimation_by ?? '—'}</strong></div>
                    <div><span className="detail-label">Estimation Approved By</span><strong>{survey.estimation_approved_by ?? '—'}</strong></div>
                    <div><span className="detail-label">Surveyor</span><strong>{survey.surveyor_name ?? '—'}</strong></div>
                    <div><span className="detail-label">Surveyor Contact</span><strong>{survey.surveyor_contact ?? '—'}</strong></div>
                    <div><span className="detail-label">Approved Parts</span><strong>{survey.approved_parts ?? '—'}</strong></div>
                    <div><span className="detail-label">Customer Approved</span><strong>{survey.customer_approved ? 'Yes' : 'No'}</strong></div>
                    {survey.hold_reason && (
                      <div className="span-2"><span className="detail-label">Hold Reason</span>
                        <span className="badge badge--red">{survey.hold_reason}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Billing ── */}
              {detailTab === 'billing' && billing && (
                <div className="detail-section">
                  <h3 className="section-title">Billing & DO (EDP)</h3>
                  <div className="detail-meta-grid">
                    <div><span className="detail-label">Parts Entry</span>
                      <span className={`badge ${billing.parts_entry_status === 'billed' ? 'badge--green' : 'badge--orange'}`}>
                        {billing.parts_entry_status ?? 'pending'}
                      </span>
                    </div>
                    <div><span className="detail-label">Billed Amount</span>
                      <strong>₹{billing.billed_amount?.toLocaleString('en-IN') ?? '—'}</strong>
                    </div>
                    <div><span className="detail-label">DO Status</span>
                      <span className={`badge ${billing.do_status === 'received' ? 'badge--green' : 'badge--orange'}`}>
                        {billing.do_status ?? 'pending'}
                      </span>
                    </div>
                    <div><span className="detail-label">DO Amount</span>
                      <strong>₹{billing.do_amount?.toLocaleString('en-IN') ?? '—'}</strong>
                    </div>
                    <div><span className="detail-label">Customer Diff. Amount</span>
                      <strong>₹{billing.customer_diff_amount?.toLocaleString('en-IN') ?? '—'}</strong>
                    </div>
                    <div><span className="detail-label">Payment Status</span>
                      <span className={`badge ${billing.payment_status === 'received' ? 'badge--green' : 'badge--red'}`}>
                        {billing.payment_status ?? 'pending'}
                      </span>
                    </div>
                    {billing.payment_slip_url && (
                      <div><span className="detail-label">Payment Slip</span>
                        <a href={billing.payment_slip_url} target="_blank" rel="noreferrer" className="link">View</a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── QC ── */}
              {detailTab === 'qc' && qc && (
                <div className="detail-section">
                  <h3 className="section-title">Quality Check & Re-Inspection</h3>
                  <div className="detail-meta-grid">
                    <div><span className="detail-label">QC Status</span>
                      <span className={`badge ${qc.qc_status === 'pass' ? 'badge--green' : qc.qc_status === 'fail' ? 'badge--red' : 'badge--grey'}`}>
                        {qc.qc_status ?? 'pending'}
                      </span>
                    </div>
                    <div><span className="detail-label">QC By</span><strong>{qc.qc_checked_by ?? '—'}</strong></div>
                    <div><span className="detail-label">QC At</span><strong>{fmtDate(qc.qc_checked_at)}</strong></div>
                    {qc.qc_fail_reason && (
                      <div className="span-2"><span className="detail-label">Fail Reason</span>
                        <span className="badge badge--red">{qc.qc_fail_reason}</span>
                      </div>
                    )}
                    <div><span className="detail-label">Re-Inspection Type</span><strong>{qc.reinspection_type ?? '—'}</strong></div>
                    <div><span className="detail-label">Re-Inspected By</span><strong>{qc.reinspection_by ?? '—'}</strong></div>
                    <div><span className="detail-label">Delivery Status</span>
                      <span className={`badge ${qc.delivery_status === 'done' ? 'badge--green' : 'badge--orange'}`}>
                        {qc.delivery_status ?? 'pending'}
                      </span>
                    </div>
                    {qc.delivery_marked_at && (
                      <div><span className="detail-label">Delivered At</span><strong>{fmtDate(qc.delivery_marked_at)}</strong></div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
