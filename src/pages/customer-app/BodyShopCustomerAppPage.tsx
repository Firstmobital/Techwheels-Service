import { useEffect, useState } from 'react'
import { CustomerSessionProvider, useCustomerSession } from '../../components/customer-app/session'
import { STAGE_ORDER, stageTone } from '../../components/customer-app/statusMap'
import type { CustomerRepairSummary } from '../../components/customer-app/types'
import { getCustomerRepairSummary, requestCustomerOtp, verifyCustomerOtp } from '../../lib/api/bodyshopCustomerApp'
import CommunicationTab from './CommunicationTab'
import DocumentsTab from './DocumentsTab'
import './BodyShopCustomerAppPage.css'

type TabKey = 'dashboard' | 'progress' | 'insurance' | 'floor' | 'billing' | 'documents' | 'communication'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'dashboard', label: 'Vehicle' },
  { key: 'progress', label: 'Progress' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'floor', label: 'Floor' },
  { key: 'billing', label: 'Billing' },
  { key: 'documents', label: 'Documents' },
  { key: 'communication', label: 'Help' },
]

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong'
}

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatAmount(value?: number | null) {
  if (value == null) return '—'
  return `₹${value.toLocaleString('en-IN')}`
}

function StageBadge({ label }: { label: string }) {
  const tone = stageTone(label)
  return (
    <span className="twba-badge" style={{ background: tone.bg, color: tone.color }}>
      {label}
    </span>
  )
}

function AccessScreen() {
  const { setSession } = useCustomerSession()
  const [step, setStep] = useState<'enter' | 'otp'>('enter')
  const [mobile, setMobile] = useState('')
  const [regNumber, setRegNumber] = useState('')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleRequestOtp() {
    setBusy(true)
    setError(null)
    try {
      const res = await requestCustomerOtp(mobile.trim(), regNumber.trim())
      setInfo(res.message)
      setStep('otp')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleVerify() {
    setBusy(true)
    setError(null)
    try {
      const res = await verifyCustomerOtp(mobile.trim(), otp.trim())
      const expiresAt = new Date(Date.now() + res.expires_in_seconds * 1000).toISOString()
      setSession({ sessionToken: res.session_token, expiresAt })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="twba-page">
      <div className="twba-shell">
        <div className="twba-head">
          <h1>Techwheels Body Shop</h1>
          <p>Track your vehicle repair, anytime.</p>
        </div>
        <div className="twba-card">
          {step === 'enter' ? (
            <>
              <h2>Verify your details</h2>
              <input
                className="twba-input"
                placeholder="Registered mobile number"
                inputMode="numeric"
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                style={{ marginBottom: 10 }}
              />
              <input
                className="twba-input"
                placeholder="Vehicle registration number"
                value={regNumber}
                onChange={(e) => setRegNumber(e.target.value.toUpperCase())}
              />
              {error && <div className="twba-error">{error}</div>}
              <button
                className="twba-btn"
                style={{ marginTop: 12 }}
                disabled={busy || mobile.length !== 10 || !regNumber.trim()}
                onClick={handleRequestOtp}
              >
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </>
          ) : (
            <>
              <h2>Enter verification code</h2>
              {info && <div style={{ fontSize: 13, color: 'var(--twba-muted)', marginBottom: 10 }}>{info}</div>}
              <input
                className="twba-input"
                placeholder="6-digit code"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              />
              {error && <div className="twba-error">{error}</div>}
              <button className="twba-btn" style={{ marginTop: 12 }} disabled={busy || otp.length !== 6} onClick={handleVerify}>
                {busy ? 'Verifying…' : 'Verify & continue'}
              </button>
              <button className="twba-btn-secondary twba-btn" style={{ marginTop: 8 }} onClick={() => setStep('enter')}>
                Change details
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function DashboardTab({ summary }: { summary: CustomerRepairSummary }) {
  const { entry, repair_card: card } = summary
  return (
    <>
      <div className="twba-card">
        <h2>My Vehicle</h2>
        <div className="twba-field-row">
          <span className="twba-field-label">Registration No.</span>
          <span className="twba-field-value">{entry.reg_number}</span>
        </div>
        <div className="twba-field-row">
          <span className="twba-field-label">Model</span>
          <span className="twba-field-value">{entry.model ?? '—'}</span>
        </div>
        {card && (
          <>
            <div className="twba-field-row">
              <span className="twba-field-label">Job Card No.</span>
              <span className="twba-field-value">{card.job_card_no}</span>
            </div>
            <div className="twba-field-row">
              <span className="twba-field-label">Current Stage</span>
              <span className="twba-field-value">{card.current_stage_name ?? '—'}</span>
            </div>
          </>
        )}
      </div>
      {!card && (
        <div className="twba-card">
          <div style={{ color: 'var(--twba-muted)', fontSize: 13 }}>
            No Body Shop repair card found yet for this reception. Once your vehicle is checked in, this dashboard
            will update automatically.
          </div>
        </div>
      )}
    </>
  )
}

function ProgressTab({ summary }: { summary: CustomerRepairSummary }) {
  if (!summary.repair_card) return <div className="twba-card">Repair progress will appear once your vehicle is checked in.</div>
  const stages = summary.repair_card.stages
  return (
    <div className="twba-card">
      <h2>Repair Progress</h2>
      {STAGE_ORDER.map(({ key, label }) => (
        <div key={key} className="twba-stage-row">
          <span>{label}</span>
          <StageBadge label={stages[key]} />
        </div>
      ))}
    </div>
  )
}

function InsuranceTab({ summary }: { summary: CustomerRepairSummary }) {
  const card = summary.repair_card
  if (!card) return <div className="twba-card">No insurance/survey details available yet.</div>
  return (
    <div className="twba-card">
      <h2>Insurance & Survey</h2>
      <div className="twba-field-row"><span className="twba-field-label">Estimate Amount</span><span className="twba-field-value">{formatAmount(card.estimate_amount)}</span></div>
      <div className="twba-field-row"><span className="twba-field-label">Estimate Date</span><span className="twba-field-value">{formatDate(card.estimate_date)}</span></div>
      <div className="twba-field-row"><span className="twba-field-label">Claim Intimation No.</span><span className="twba-field-value">{card.claim_intimation_no ?? '—'}</span></div>
      <div className="twba-field-row"><span className="twba-field-label">Intimation Date</span><span className="twba-field-value">{formatDate(card.claim_intimation_date)}</span></div>
      <div className="twba-field-row"><span className="twba-field-label">Survey Date</span><span className="twba-field-value">{formatDate(card.survey_date)}</span></div>
      <div className="twba-field-row"><span className="twba-field-label">Surveyor</span><span className="twba-field-value">{card.surveyor_name ?? '—'}</span></div>
      <div className="twba-field-row"><span className="twba-field-label">Surveyor Mobile</span><span className="twba-field-value">{card.surveyor_mobile ?? '—'}</span></div>
      <div className="twba-field-row"><span className="twba-field-label">Surveyor Email</span><span className="twba-field-value">{card.surveyor_email ?? '—'}</span></div>
      <div className="twba-field-row"><span className="twba-field-label">Survey Status</span><StageBadge label={card.survey_status} /></div>
      <div className="twba-field-row"><span className="twba-field-label">Approved Parts</span><span className="twba-field-value">{card.approved_parts ?? '—'}</span></div>
      <div className="twba-field-row"><span className="twba-field-label">Non-Approved Parts</span><span className="twba-field-value">{card.non_approved_parts ?? '—'}</span></div>
    </div>
  )
}

function FloorTab({ summary }: { summary: CustomerRepairSummary }) {
  const card = summary.repair_card
  if (!card) return <div className="twba-card">Floor details will appear once your vehicle is on the shop floor.</div>
  return (
    <div className="twba-card">
      <h2>Floor Information</h2>
      <div className="twba-field-row"><span className="twba-field-label">Floor</span><span className="twba-field-value">{card.bodyshop_floor ?? '—'}</span></div>
      <div className="twba-field-row"><span className="twba-field-label">Floor Incharge</span><span className="twba-field-value">{card.floor_incharge?.employee_name ?? '—'}</span></div>
      <div className="twba-field-row"><span className="twba-field-label">Floor Incharge Mobile</span><span className="twba-field-value">{card.floor_incharge?.employee_mobile ?? '—'}</span></div>
    </div>
  )
}

function BillingTab({ summary }: { summary: CustomerRepairSummary }) {
  const card = summary.repair_card
  if (!card) return <div className="twba-card">Billing details will appear once available.</div>
  return (
    <div className="twba-card">
      <h2>EDP / Billing Progress</h2>
      <div className="twba-field-row"><span className="twba-field-label">EDP Status</span><StageBadge label={card.stages.edp} /></div>
      <div className="twba-field-row"><span className="twba-field-label">Proforma Invoice</span><StageBadge label={card.pi_status} /></div>
      <div className="twba-field-row"><span className="twba-field-label">Invoice No.</span><span className="twba-field-value">{card.invoice?.invoice_number ?? '—'}</span></div>
      <div className="twba-field-row"><span className="twba-field-label">Invoice Date</span><span className="twba-field-value">{formatDate(card.invoice?.invoice_date)}</span></div>
      <div className="twba-field-row"><span className="twba-field-label">Invoice Amount</span><span className="twba-field-value">{formatAmount(card.invoice?.invoice_amount)}</span></div>
      <div className="twba-field-row"><span className="twba-field-label">Delivery Order</span>{card.invoice ? <StageBadge label={card.invoice.do_status} /> : <span className="twba-field-value">—</span>}</div>
    </div>
  )
}

function AppShell() {
  const { session, clearSession } = useCustomerSession()
  const [summary, setSummary] = useState<CustomerRepairSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('dashboard')

  useEffect(() => {
    if (!session) return
    getCustomerRepairSummary(session.sessionToken)
      .then(setSummary)
      .catch((e) => {
        const message = errorMessage(e)
        setError(message)
        if (/expired|invalid/i.test(message)) clearSession()
      })
  }, [session, clearSession])

  if (!session) return <AccessScreen />

  return (
    <div className="twba-page">
      <div className="twba-shell">
        <div className="twba-head">
          <h1>Techwheels Body Shop</h1>
          <p>{summary?.entry.reg_number ?? 'Loading your vehicle…'}</p>
        </div>

        {error && <div className="twba-card"><div className="twba-error">{error}</div></div>}

        {!summary ? (
          <div className="twba-card">Loading…</div>
        ) : tab === 'dashboard' ? (
          <DashboardTab summary={summary} />
        ) : tab === 'progress' ? (
          <ProgressTab summary={summary} />
        ) : tab === 'insurance' ? (
          <InsuranceTab summary={summary} />
        ) : tab === 'floor' ? (
          <FloorTab summary={summary} />
        ) : tab === 'billing' ? (
          <BillingTab summary={summary} />
        ) : tab === 'documents' ? (
          <DocumentsTab sessionToken={session.sessionToken} />
        ) : (
          <CommunicationTab sessionToken={session.sessionToken} />
        )}

        <div className="twba-tabbar">
          {TABS.map((t) => (
            <button key={t.key} className={`twba-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function BodyShopCustomerAppPage() {
  return (
    <CustomerSessionProvider>
      <AppShell />
    </CustomerSessionProvider>
  )
}
