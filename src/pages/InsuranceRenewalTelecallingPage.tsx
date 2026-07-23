import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Customer {
  id: number
  chassis_no: string | null
  vehicle_registration_number: string | null
  first_name: string | null
  last_name: string | null
  contact_phones: string | null
  model: string | null
  product_line: string | null
  powertrain_type: string | null
  vehicle_sale_date: string | null
  vehicle_age_in_years: string | null
  ex_showroom_price: number | null
  idv: number | null
  last_insurance_expiry_date: string | null
  last_insurance_comapny: string | null
  last_insurance_policy_number: string | null
  sold_dealer: string | null
}

interface Assignment {
  id: number
  campaign_id: number
  campaign_name?: string
  campaign_status?: string
  status: string
  call_notes: string | null
  callback_date: string | null
  called_at: string | null
  call_count: number
  no_answer_count: number
  retry_after: string | null
  whatsapp_sent: boolean
  whatsapp_status: string | null
  assigned_at: string | null
  quoted_premium: number | null
  renewal_company: string | null
  customer: Customer
  priority_score?: number
}

interface Campaign {
  id: number
  campaign_name: string
  window_days: number
  date_from: string
  date_to: string
  status: string
  total_leads: number
  pending_count: number
  in_progress_count: number
  callback_later_count: number
  out_of_window_count: number
  completed_count: number
  renewed_count: number
  created_by: string | null
  created_at: string
  sold_dealer_filter?: string[]
  last_service_dealer_filter?: string[]
  meta_enabled?: boolean
  meta_template_name?: string
  priority_mode?: string
  auto_refresh_enabled?: boolean
  drip_enabled?: boolean
  self_renewal_link_enabled?: boolean
  roi_target_premium?: number
}

interface DailySummary {
  total_calls: number
  renewed_via_us: number
  renewed_elsewhere: number
  no_answer: number
  not_interested: number
  callback_later: number
  wrong_number: number
  not_reachable: number
  already_renewed_unknown: number
}

type CallStatus =
  | 'renewed_via_us' | 'renewed_elsewhere' | 'callback_later' | 'no_answer'
  | 'not_reachable' | 'wrong_number' | 'not_interested' | 'already_renewed_unknown'

const EDGE_URL = `${supabaseUrl}/functions/v1/insurance-renewal-telecalling`

/** Supabase access token for edge calls (refresh if expired). */
async function getEdgeAccessToken(): Promise<string> {
  let { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    const { data: refreshed, error } = await supabase.auth.refreshSession()
    if (error) throw new Error('Not authenticated — please sign in again.')
    session = refreshed.session
  }
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated — please sign in again.')
  return token
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- edge actions return heterogeneous JSON (same pattern as TelecallingPage)
async function callEdge(action: string, body: Record<string, unknown> = {}): Promise<any> {
  const doFetch = async (token: string) => {
    let res: Response
    try {
      res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ action, ...body }),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(
        msg === 'Failed to fetch' || msg.includes('NetworkError')
          ? 'Could not reach Supabase Edge (network timeout or project under load — try Refresh, pause RC fetch/cron, wait a few minutes).'
          : msg,
      )
    }
    const text = await res.text()
    let data: any
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(`Edge returned non-JSON (HTTP ${res.status}). Project may be overloaded.`)
    }
    return { res, data }
  }

  let token = await getEdgeAccessToken()
  let { res, data } = await doFetch(token)
  if ((res.status === 401 || data.error === 'Not authenticated') && token) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    const retryToken = refreshed.session?.access_token
    if (retryToken && retryToken !== token) {
      ;({ res, data } = await doFetch(retryToken))
    }
  }
  if (!res.ok || !data.success) throw new Error(String(data.error || `Edge error (HTTP ${res.status})`))
  return data
}

/** RC fetch may return success:false with a body; never throw before caller reads customer / outcome. */
async function callEdgeRcFetchSingle(body: Record<string, unknown>): Promise<any> {
  const doFetch = async (token: string) => {
    let res: Response
    try {
      res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ action: 'rc_fetch_single', ...body }),
        signal: AbortSignal.timeout(90000),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('timeout') || msg.includes('aborted')) {
        throw new Error('RC fetch timed out (IDSPay can take up to ~2 min). Check Network tab, then try again.')
      }
      throw e
    }
    const text = await res.text()
    let data: any
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(`Edge returned non-JSON (HTTP ${res.status}).`)
    }
    return { res, data }
  }

  let token = await getEdgeAccessToken()
  let { res, data } = await doFetch(token)
  if (res.status === 401 || data.error === 'Not authenticated') {
    const { data: refreshed } = await supabase.auth.refreshSession()
    const retryToken = refreshed.session?.access_token
    if (retryToken) ({ res, data } = await doFetch(retryToken))
  }
  if (!res.ok && !data.customer) {
    throw new Error(String(data.error || `Edge error (HTTP ${res.status})`))
  }
  return data
}

function insuranceCustomerKey(c: Customer): string {
  return [
    c.last_insurance_expiry_date ?? '',
    c.last_insurance_comapny ?? '',
    c.last_insurance_policy_number ?? '',
  ].join('|')
}

function sleepMs(ms: number) {
  return new Promise<void>(resolve => { setTimeout(resolve, ms) })
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return d }
}

function daysFromToday(d: string | null): number | null {
  if (!d) return null
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

// Mirrors insurance_next_due_date() in the DB: insurance renews annually off
// the sale-date anniversary (sold 24-Jan-2025 -> due 23-Jan-2026 -> ...),
// rolled forward to whichever upcoming year applies. Used here only for
// display when last_insurance_expiry_date is missing — the actual campaign
// eligibility/ordering is computed server-side against the same logic.
function computeInsuranceDueDate(lastExpiry: string | null, saleDate: string | null): { date: string | null; estimated: boolean } {
  if (lastExpiry) return { date: lastExpiry, estimated: false }
  if (!saleDate) return { date: null, estimated: false }
  const sale = new Date(saleDate + 'T00:00:00Z')
  if (isNaN(sale.getTime())) return { date: null, estimated: false }
  let candidate = new Date(Date.UTC(sale.getUTCFullYear() + 1, sale.getUTCMonth(), sale.getUTCDate() - 1))
  const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00Z')
  while (candidate < today) {
    candidate = new Date(Date.UTC(candidate.getUTCFullYear() + 1, candidate.getUTCMonth(), candidate.getUTCDate()))
  }
  return { date: candidate.toISOString().split('T')[0], estimated: true }
}

function formatCurrency(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return `₹${v.toLocaleString('en-IN')}`
}

function getWhatsAppLink(phone: string, message: string): string {
  const cleaned = phone.replace(/\D/g, '').slice(-10)
  return `https://wa.me/91${cleaned}?text=${encodeURIComponent(message)}`
}

function buildRenewalReminderMsg(c: Customer): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
  const due = computeInsuranceDueDate(c.last_insurance_expiry_date, c.vehicle_sale_date).date
  return `Namaskar *${name}* ji! 🙏\n\nAapki *${c.model || ''}* (${c.vehicle_registration_number || ''}) ki insurance policy *${formatDate(due)}* ko expire ho rahi hai.\n\nAbhi renew karwayein aur bina rukawat drive karein! 🚗🛡️\n\n*Team Techwheels*`
}

function buildNoPickMsg(c: Customer): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
  const due = computeInsuranceDueDate(c.last_insurance_expiry_date, c.vehicle_sale_date).date
  return `Namaskar *${name}* ji! 🙏\n\nHumne aapko insurance renewal ke baare mein call kiya tha, par connect nahi ho paya.\n\nAapki *${c.model || ''}* (${c.vehicle_registration_number || ''}) ki insurance *${formatDate(due)}* ko expire ho rahi hai.\n\nKripya reply karein.\n\n*Team Techwheels* 🚗`
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  assigned: 'bg-blue-100 text-blue-700',
  renewed_via_us: 'bg-green-100 text-green-700',
  renewed_elsewhere: 'bg-amber-100 text-amber-700',
  callback_later: 'bg-purple-100 text-purple-700',
  no_answer: 'bg-orange-100 text-orange-700',
  not_reachable: 'bg-red-100 text-red-700',
  wrong_number: 'bg-red-100 text-red-700',
  not_interested: 'bg-gray-200 text-gray-600',
  already_renewed_unknown: 'bg-teal-100 text-teal-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-gray-200 text-gray-600',
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>{label}</span>
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function InsuranceRenewalTelecallingPage() {
  const [role, setRole] = useState<string>('staff')
  const [activeTab, setActiveTab] = useState<'dashboard' | 'admin'>('dashboard')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { data: user } = await supabase.from('users').select('role').eq('id', session.user.id).single()
        if (user?.role) setRole(user.role)
        if (user?.role === 'admin') setActiveTab('admin')
        const { data: camps } = await supabase.from('insurance_renewal_campaigns').select('*').order('created_at', { ascending: false })
        setCampaigns(camps || [])
        const active = camps?.find((c: Campaign) => c.status === 'active') || camps?.[0] || null
        setActiveCampaign(active)
      } catch (err) { console.error('Init error:', err) }
      finally { setLoading(false) }
    }
    init()
  }, [])

  const refreshCampaigns = useCallback(async () => {
    const { data: camps } = await supabase.from('insurance_renewal_campaigns').select('*').order('created_at', { ascending: false })
    setCampaigns(camps || [])
    const active = camps?.find((c: Campaign) => c.status === 'active') || camps?.[0] || null
    setActiveCampaign(active)
  }, [])

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="text-sm text-gray-400">Loading insurance renewal dashboard…</div>
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🛡️ Insurance Renewal Telecalling</h1>
          <p className="mt-1 text-sm text-gray-500">Proactive renewal calling team</p>
        </div>
        {role === 'admin' && (
          <div className="flex gap-2">
            <button onClick={() => setActiveTab('dashboard')} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Telecaller View</button>
            <button onClick={() => setActiveTab('admin')} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === 'admin' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Admin Dashboard</button>
          </div>
        )}
      </div>

      {campaigns.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-500">Campaign:</span>
          <select value={activeCampaign?.id || ''} onChange={e => { const c = campaigns.find(c => c.id === Number(e.target.value)); setActiveCampaign(c || null) }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm">
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.campaign_name} ({c.status}) — {c.total_leads} leads</option>)}
          </select>
          {activeCampaign && (
            <div className="flex gap-4 text-xs">
              <span className="text-orange-600">⏳ {activeCampaign.pending_count} pending</span>
              {activeCampaign.in_progress_count > 0 && <span className="text-blue-500">📞 {activeCampaign.in_progress_count} in progress</span>}
              {activeCampaign.callback_later_count > 0 && <span className="text-purple-500">🔁 {activeCampaign.callback_later_count} callback later</span>}
              <span className="text-green-600">✅ {activeCampaign.renewed_count} renewed via us</span>
              <span className="text-gray-500">📊 {activeCampaign.completed_count} completed</span>
              {activeCampaign.out_of_window_count > 0 && <span className="text-gray-400">🗓️ {activeCampaign.out_of_window_count} out of window</span>}
            </div>
          )}
        </div>
      )}

      {activeTab === 'admin' && role === 'admin'
        ? <AdminDashboard campaigns={campaigns} activeCampaign={activeCampaign} onRefresh={refreshCampaigns} />
        : <TelecallerDashboard activeCampaign={activeCampaign} />
      }
    </div>
  )
}

// ── Telecaller Dashboard ────────────────────────────────────────────────────────
function TelecallerDashboard({ activeCampaign }: { activeCampaign: Campaign | null }) {
  const [currentAssignment, setCurrentAssignment] = useState<Assignment | null>(null)
  const [queue, setQueue] = useState<Assignment[]>([])
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'call' | 'queue' | 'summary'>('call')
  const [queueSearch, setQueueSearch] = useState('')
  // Call form
  const [notes, setNotes] = useState('')
  const [callbackDate, setCallbackDate] = useState('')
  const [quotedPremium, setQuotedPremium] = useState('')
  const [renewalCompany, setRenewalCompany] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [showRenewed, setShowRenewed] = useState(false)
  const [showCallback, setShowCallback] = useState(false)
  // Queue edit
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editCallbackDate, setEditCallbackDate] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [rcFetchBusy, setRcFetchBusy] = useState(false)
  const [rcFetchMessage, setRcFetchMessage] = useState<string | null>(null)
  const [customerUiEpoch, setCustomerUiEpoch] = useState(0)

  const refreshQueue = useCallback(async () => {
    try {
      const data = await callEdge('my_queue', { all_campaigns: true })
      setQueue(data.queue || [])
    } catch (err) { console.error('Queue fetch error:', err) }
  }, [])

  const refreshSummary = useCallback(async () => {
    try { const data = await callEdge('my_summary', {}); setSummary(data.summary) }
    catch (err) { console.error('Summary fetch error:', err) }
  }, [])

  useEffect(() => { refreshQueue(); refreshSummary() }, [refreshQueue, refreshSummary])

  const resetCallForm = () => {
    setNotes(''); setCallbackDate(''); setQuotedPremium(''); setRenewalCompany('')
    setShowNotes(false); setShowRenewed(false); setShowCallback(false)
  }

  const handleGetNext = async () => {
    if (!activeCampaign) return
    setBusy(true); setError(null)
    try {
      const data = await callEdge('get_next', { campaign_id: activeCampaign.id })
      if (data.assignment) { setCurrentAssignment(data.assignment); setActiveView('call') }
      else setError('No more pending customers in this campaign. Great job! 🎉')
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  const handleUpdateStatus = async (status: CallStatus, fromQueue?: Assignment) => {
    const target = fromQueue ?? currentAssignment
    if (!target) return
    setBusy(true); setError(null)
    try {
      const result = await callEdge('update_status', {
        assignment_id: target.id,
        campaign_id: target.campaign_id,
        status,
        call_notes: notes || undefined,
        callback_date: status === 'callback_later' ? callbackDate : undefined,
        quoted_premium: status === 'renewed_via_us' && quotedPremium ? Number(quotedPremium) : undefined,
        renewal_company: status === 'renewed_via_us' && renewalCompany ? renewalCompany : undefined,
      })
      if (result?.retry_queued) {
        setError('📵 Couldn\'t connect — back to pool tomorrow (attempt ' + (result?.no_answer_count ?? '') + '/3, then marked not reachable)')
        setTimeout(() => setError(null), 4000)
      }
      if (fromQueue) {
        setEditingId(null)
      } else {
        setCurrentAssignment(null)
      }
      resetCallForm()
      refreshQueue(); refreshSummary()
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  const openQueueEdit = (asgn: Assignment) => {
    setEditingId(asgn.id)
    setEditNotes(asgn.call_notes || '')
    setEditCallbackDate(asgn.callback_date || '')
    setEditStatus(asgn.status)
    setNotes(asgn.call_notes || '')
    setCallbackDate(asgn.callback_date || '')
    setQuotedPremium(asgn.quoted_premium != null ? String(asgn.quoted_premium) : '')
    setRenewalCompany(asgn.renewal_company || '')
    setShowNotes(false)
    setShowRenewed(false)
    setShowCallback(false)
  }

  const handleEditSave = async (assignmentId: number) => {
    setEditBusy(true)
    try {
      await callEdge('edit_assignment', { assignment_id: assignmentId, call_notes: editNotes, callback_date: editCallbackDate || undefined, status: editStatus || undefined })
      setEditingId(null); refreshQueue()
    } catch (err) { setError((err as Error).message) }
    finally { setEditBusy(false) }
  }

  const handleLogWA = async (assignmentId: number, waType: string) => {
    try { await callEdge('log_whatsapp', { assignment_id: assignmentId, wa_type: waType }) }
    catch (err) { console.error('WA log error:', err) }
  }

  const mergeCustomer = (base: Customer, patch: Partial<Customer>): Customer => ({
    ...base,
    ...patch,
    last_insurance_expiry_date:
      patch.last_insurance_expiry_date !== undefined ? patch.last_insurance_expiry_date : base.last_insurance_expiry_date,
    last_insurance_comapny:
      patch.last_insurance_comapny !== undefined ? patch.last_insurance_comapny : base.last_insurance_comapny,
    last_insurance_policy_number:
      patch.last_insurance_policy_number !== undefined ? patch.last_insurance_policy_number : base.last_insurance_policy_number,
  })

  const applyAssignmentCustomer = (assignmentId: number, customer: Partial<Customer>) => {
    setQueue(prev => prev.map(a => (
      a.id === assignmentId ? { ...a, customer: mergeCustomer(a.customer, customer) } : a
    )))
    setCurrentAssignment(prev => (
      prev?.id === assignmentId
        ? { ...prev, customer: mergeCustomer(prev.customer, customer) }
        : prev
    ))
    setCustomerUiEpoch(e => e + 1)
  }

  /** Poll DB until insurance fields change (same edge action, refresh_only — no extra IDSPay). */
  const syncCustomerToUiAfterFetch = async (assignment: Assignment, baselineKey: string) => {
    for (let i = 0; i < 16; i++) {
      if (i > 0) await sleepMs(500)
      try {
        const snap = await callEdgeRcFetchSingle({
          campaign_id: assignment.campaign_id,
          assignment_id: assignment.id,
          refresh_only: true,
        })
        if (!snap.customer) continue
        applyAssignmentCustomer(assignment.id, snap.customer)
        const key = insuranceCustomerKey({ ...assignment.customer, ...snap.customer })
        if (key !== baselineKey) return true
      } catch (e) {
        console.error('RC refresh_only poll', e)
      }
    }
    return false
  }

  const handleRcFetchSingle = async (assignment: Assignment) => {
    setRcFetchBusy(true)
    setRcFetchMessage('Contacting IDSPay…')
    setError(null)
    const baselineKey = insuranceCustomerKey(assignment.customer)
    let res: Awaited<ReturnType<typeof callEdgeRcFetchSingle>> | undefined
    try {
      res = await callEdgeRcFetchSingle({
        campaign_id: assignment.campaign_id,
        assignment_id: assignment.id,
      })
      if (res.customer) applyAssignmentCustomer(assignment.id, res.customer as Partial<Customer>)
      if (res.success && res.outcome === 'success') {
        setRcFetchMessage(res.message || 'RC fetch completed.')
      } else if (res.outcome === 'skipped_fresh') {
        const c = res.customer as Customer | undefined
        const stillBlank = !String(c?.last_insurance_comapny ?? '').trim() && !String(c?.last_insurance_policy_number ?? '').trim()
        setRcFetchMessage(null)
        setError(
          stillBlank
            ? (res.message || 'Server skipped IDSPay (expiry looks recent) but insurer fields are still empty. Deploy latest edge function and retry.')
            : (res.message || 'Insurance already on file — no API call.'),
        )
      } else if (res.outcome === 'skipped_no_vrn') {
        setRcFetchMessage(null)
        setError(res.error || 'No vehicle registration number on this customer.')
      } else {
        setRcFetchMessage(null)
        setError(res.error || res.message || `RC fetch failed (${res.outcome || 'unknown'})`)
      }
    } catch (err) {
      setRcFetchMessage(null)
      const msg = (err as Error).message
      if (msg === 'Failed to fetch' || /network/i.test(msg)) {
        setError(
          'Network blocked or timed out. Open DevTools → Network → insurance-renewal-telecalling (rc_fetch_single). Deploy latest edge + hard-refresh.',
        )
      } else {
        setError(msg)
      }
    } finally {
      setRcFetchBusy(false)
    }

    if (res?.success && res.outcome === 'success') {
      const synced = await syncCustomerToUiAfterFetch(assignment, baselineKey)
      if (synced) {
        setRcFetchMessage((res.message || 'RC fetch completed.') + ' Card updated.')
      }
      setTimeout(() => setRcFetchMessage(null), 10000)
    }
  }

  if (!activeCampaign) return (
    <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
      <div className="text-4xl mb-3">🛡️</div>
      <p className="text-gray-600 font-medium">No active campaign</p>
      <p className="text-sm text-gray-400 mt-1">Please ask admin to create a campaign.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setActiveView('call')} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeView === 'call' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>📞 Call</button>
        <button onClick={() => { setActiveView('queue'); refreshQueue() }} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeView === 'queue' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>📋 My Queue ({queue.length})</button>
        <button onClick={() => { setActiveView('summary'); refreshSummary() }} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeView === 'summary' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>📊 Today&apos;s Summary</button>
      </div>

      {error && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{error}</div>}
      {rcFetchMessage && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{rcFetchMessage}</div>}
      {queue.some(a => a.campaign_id !== activeCampaign?.id) && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          You have {queue.filter(a => a.campaign_id !== activeCampaign?.id).length} open lead(s) from{' '}
          {[...new Set(queue.filter(a => a.campaign_id !== activeCampaign?.id).map(a => a.campaign_name || `campaign #${a.campaign_id}`))].join(', ')}.
          Open <strong>My Queue</strong> to continue those calls. <strong>Get next</strong> uses the campaign selected above ({activeCampaign?.campaign_name}).
        </div>
      )}

      {/* ── CALL VIEW ──────────────────────────────────────────────────────── */}
      {activeView === 'call' && (
        !currentAssignment ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
            <div className="text-5xl mb-4">🎯</div>
            <h2 className="text-lg font-semibold text-gray-900">Ready to call?</h2>
            <p className="mt-2 text-sm text-gray-500">Click below to get the next customer whose insurance is nearing expiry.</p>
            <button onClick={handleGetNext} disabled={busy} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-lg hover:bg-blue-700 disabled:opacity-50">
              {busy ? (<><svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Getting next…</>) : <>📞 Get Next Customer</>}
            </button>
          </div>
        ) : (
          <CallCard
            key={`call-${currentAssignment.id}-${customerUiEpoch}-${insuranceCustomerKey(currentAssignment.customer)}`}
            assignment={currentAssignment}
            busy={busy}
            notes={notes} setNotes={setNotes}
            showNotes={showNotes} setShowNotes={setShowNotes}
            callbackDate={callbackDate} setCallbackDate={setCallbackDate}
            quotedPremium={quotedPremium} setQuotedPremium={setQuotedPremium}
            renewalCompany={renewalCompany} setRenewalCompany={setRenewalCompany}
            showRenewed={showRenewed} setShowRenewed={setShowRenewed}
            showCallback={showCallback} setShowCallback={setShowCallback}
            onUpdateStatus={handleUpdateStatus}
            onLogWA={handleLogWA}
            rcFetchBusy={rcFetchBusy}
            rcFetchMessage={rcFetchMessage}
            rcFetchError={error}
            onRcFetch={() => { void handleRcFetchSingle(currentAssignment) }}
          />
        )
      )}

      {/* ── QUEUE VIEW ─────────────────────────────────────────────────────── */}
      {activeView === 'queue' && (
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={queueSearch}
              onChange={e => setQueueSearch(e.target.value)}
              placeholder="Search by name, phone or reg number…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            {queueSearch && (
              <button onClick={() => setQueueSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">✕</button>
            )}
          </div>
          {(() => {
            const q = queueSearch.trim().toLowerCase()
            const filtered = q ? queue.filter(a =>
              `${a.customer.first_name} ${a.customer.last_name || ''}`.toLowerCase().includes(q) ||
              (a.customer.contact_phones || '').toLowerCase().includes(q) ||
              (a.customer.vehicle_registration_number || '').toLowerCase().includes(q)
            ) : queue
            if (filtered.length === 0) return (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
                {q ? `No results for "${queueSearch}"` : 'No active assignments. Click "Get Next Customer" to start calling.'}
              </div>
            )
            return filtered.map((asgn: Assignment) => (
            <div key={asgn.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{asgn.customer.first_name} {asgn.customer.last_name || ''}</div>
                  {asgn.campaign_name && (
                    <div className="text-xs text-gray-500 mt-0.5">Campaign: {asgn.campaign_name}{asgn.campaign_status === 'closed' ? ' (closed)' : ''}</div>
                  )}
                  <div className="text-sm text-gray-500 mt-0.5">📱 {asgn.customer.contact_phones} · 🚗 {asgn.customer.model} · {asgn.customer.vehicle_registration_number || '—'}</div>
                  {(() => {
                    const due = computeInsuranceDueDate(asgn.customer.last_insurance_expiry_date, asgn.customer.vehicle_sale_date)
                    return <div className="text-xs text-gray-400 mt-0.5">🛡️ Insurance due {formatDate(due.date)}{due.estimated ? ' (estimated)' : ''}</div>
                  })()}
                  {asgn.status === 'callback_later' && asgn.callback_date && <div className="mt-1 text-xs text-purple-600">📅 Callback on {formatDate(asgn.callback_date)}</div>}
                  {asgn.status === 'renewed_via_us' && <div className="mt-1 text-xs text-green-600">✅ Renewed via us{asgn.quoted_premium ? ` — ${formatCurrency(asgn.quoted_premium)}` : ''}</div>}
                  {asgn.call_notes && editingId !== asgn.id && <div className="mt-1 rounded bg-gray-50 px-3 py-1.5 text-xs text-gray-600">📝 {asgn.call_notes}</div>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                  <StatusBadge status={asgn.status} />
                  <button onClick={() => openQueueEdit(asgn)} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50">✏️ Edit</button>
                  {asgn.status === 'no_answer' && asgn.customer.contact_phones && (
                    <a href={getWhatsAppLink(asgn.customer.contact_phones, buildNoPickMsg(asgn.customer))} target="_blank" rel="noreferrer" onClick={() => handleLogWA(asgn.id, 'not_picked')} className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-700 hover:bg-green-100">💬 WA</a>
                  )}
                </div>
              </div>

              {editingId === asgn.id && (
                <div className="mt-3 space-y-3">
                  <CallCard
                    key={`queue-${asgn.id}-${customerUiEpoch}-${insuranceCustomerKey(asgn.customer)}`}
                    assignment={asgn}
                    busy={busy}
                    notes={notes} setNotes={setNotes}
                    showNotes={showNotes} setShowNotes={setShowNotes}
                    callbackDate={callbackDate} setCallbackDate={setCallbackDate}
                    quotedPremium={quotedPremium} setQuotedPremium={setQuotedPremium}
                    renewalCompany={renewalCompany} setRenewalCompany={setRenewalCompany}
                    showRenewed={showRenewed} setShowRenewed={setShowRenewed}
                    showCallback={showCallback} setShowCallback={setShowCallback}
                    onUpdateStatus={status => handleUpdateStatus(status, asgn)}
                    onLogWA={handleLogWA}
                    rcFetchBusy={rcFetchBusy}
                    onRcFetch={() => { void handleRcFetchSingle(asgn) }}
                  />
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
                  <div className="text-xs font-semibold text-blue-700">Edit Assignment</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600">Status</label>
                      <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm bg-white">
                        <option value="assigned">Assigned</option>
                        <option value="renewed_via_us">Renewed via Us</option>
                        <option value="renewed_elsewhere">Renewed Elsewhere</option>
                        <option value="callback_later">Callback Later</option>
                        <option value="no_answer">No Answer</option>
                        <option value="wrong_number">Wrong Number</option>
                        <option value="not_interested">Not Interested</option>
                        <option value="already_renewed_unknown">Already Renewed (Unknown)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Callback Date</label>
                      <input type="date" value={editCallbackDate} onChange={e => setEditCallbackDate(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Remarks / Notes</label>
                    <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" rows={2} placeholder="Add or update remarks…" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEditSave(asgn.id)} disabled={editBusy} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">{editBusy ? 'Saving…' : 'Save'}</button>
                    <button onClick={() => { setEditingId(null); resetCallForm() }} className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
                </div>
              )}
            </div>
          ))
          })()}
        </div>
      )}

      {/* ── SUMMARY VIEW ──────────────────────────────────────────────────── */}
      {activeView === 'summary' && summary && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          <SummaryCard label="Total Calls" value={summary.total_calls} color="blue" icon="📞" />
          <SummaryCard label="Renewed via Us" value={summary.renewed_via_us} color="green" icon="✅" />
          <SummaryCard label="Renewed Elsewhere" value={summary.renewed_elsewhere} color="yellow" icon="🔀" />
          <SummaryCard label="No Answer" value={summary.no_answer} color="orange" icon="📵" />
          <SummaryCard label="Callback" value={summary.callback_later} color="purple" icon="🔁" />
          <SummaryCard label="Not Interested" value={summary.not_interested} color="gray" icon="😐" />
          <SummaryCard label="Not Reachable" value={summary.not_reachable} color="red" icon="🚫" />
          <SummaryCard label="Wrong Number" value={summary.wrong_number} color="red" icon="⚠️" />
          <SummaryCard label="Already Renewed" value={summary.already_renewed_unknown} color="teal" icon="🔧" />
        </div>
      )}
    </div>
  )
}

// ── Call Card ───────────────────────────────────────────────────────────────────
function CallCard({
  assignment, busy,
  notes, setNotes, showNotes, setShowNotes,
  callbackDate, setCallbackDate,
  quotedPremium, setQuotedPremium,
  renewalCompany, setRenewalCompany,
  showRenewed, setShowRenewed,
  showCallback, setShowCallback,
  onUpdateStatus, onLogWA,
  rcFetchBusy = false, rcFetchMessage, rcFetchError, onRcFetch,
}: {
  assignment: Assignment; busy: boolean
  notes: string; setNotes: (v: string) => void
  showNotes: boolean; setShowNotes: (v: boolean) => void
  callbackDate: string; setCallbackDate: (v: string) => void
  quotedPremium: string; setQuotedPremium: (v: string) => void
  renewalCompany: string; setRenewalCompany: (v: string) => void
  showRenewed: boolean; setShowRenewed: (v: boolean) => void
  showCallback: boolean; setShowCallback: (v: boolean) => void
  onUpdateStatus: (s: CallStatus) => void
  onLogWA: (id: number, type: string) => void
  rcFetchBusy?: boolean
  rcFetchMessage?: string | null
  rcFetchError?: string | null
  onRcFetch?: () => void
}) {
  const c = assignment.customer
  const phone = c.contact_phones || ''
  const dueInfo = computeInsuranceDueDate(c.last_insurance_expiry_date, c.vehicle_sale_date)
  const daysLeft = daysFromToday(dueInfo.date)
  const isExpired = daysLeft !== null && daysLeft < 0
  const isDueToday = daysLeft === 0

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className={`px-6 py-4 text-white ${isExpired ? 'bg-gradient-to-r from-red-600 to-red-700' : isDueToday ? 'bg-gradient-to-r from-orange-500 to-orange-600' : 'bg-gradient-to-r from-blue-600 to-blue-700'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 flex-wrap">
              {c.first_name} {c.last_name || ''}
              {assignment.priority_score && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-normal">
                  🎯 Priority: {assignment.priority_score}
                </span>
              )}
            </h2>
            <p className="text-sm opacity-90 mt-0.5">🚗 {c.model} · {c.powertrain_type || 'N/A'} · {c.product_line || '—'}</p>
            {c.chassis_no && <p className="text-xs opacity-70 mt-0.5">Chassis: {c.chassis_no}</p>}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {c.vehicle_registration_number && <div className="rounded-lg bg-white/20 px-3 py-1 text-sm font-medium">{c.vehicle_registration_number}</div>}
            {isExpired && <div className="rounded-full bg-red-900/40 px-2 py-0.5 text-xs font-semibold">⚠️ Expired {Math.abs(daysLeft!)}d ago</div>}
            {isDueToday && <div className="rounded-full bg-orange-900/30 px-2 py-0.5 text-xs font-semibold">⚡ Expires Today</div>}
            {!isExpired && !isDueToday && daysLeft !== null && <div className="rounded-full bg-white/20 px-2 py-0.5 text-xs">Expires in {daysLeft}d</div>}
            {dueInfo.estimated && <div className="rounded-full bg-white/20 px-2 py-0.5 text-xs">📅 Estimated from sale date</div>}
          </div>
        </div>
      </div>

      {/* Call + WhatsApp */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap gap-3">
        <a href={`tel:${phone}`} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 px-6 py-3 text-base font-semibold text-white hover:bg-green-600 min-w-0">
          📞 Call {phone}
        </a>
        <a href={getWhatsAppLink(phone, buildRenewalReminderMsg(c))} target="_blank" rel="noreferrer" onClick={() => onLogWA(assignment.id, 'renewal_reminder')} className="flex items-center gap-1.5 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 hover:bg-green-100">
          💬 WA Reminder
        </a>
        <a href={getWhatsAppLink(phone, buildNoPickMsg(c))} target="_blank" rel="noreferrer" onClick={() => onLogWA(assignment.id, 'not_picked')} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">
          📵 WA No-Pick
        </a>
      </div>

      {onRcFetch && (
        <div className="px-6 py-3 border-b border-gray-100 bg-slate-50 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onRcFetch}
            disabled={busy || rcFetchBusy}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
            title="Same IDSPay RC lookup as bulk campaign fetch — updates insurance on this customer only"
          >
            {rcFetchBusy ? 'Fetching from IDSPay…' : '🔄 Fetch insurance (IDSPay RC)'}
          </button>
          {dueInfo.estimated && (
            <span className="text-xs text-slate-600">Recommended when due date is estimated and company/policy are blank.</span>
          )}
          {rcFetchBusy && rcFetchMessage && (
            <span className="text-xs font-medium text-indigo-700">{rcFetchMessage}</span>
          )}
          {!rcFetchBusy && rcFetchMessage && (
            <span className="text-xs font-medium text-green-800">{rcFetchMessage}</span>
          )}
          {rcFetchError && (
            <span className="text-xs font-medium text-amber-800 max-w-xl">{rcFetchError}</span>
          )}
        </div>
      )}

      {/* Detail grid */}
      <div className="grid grid-cols-2 gap-px bg-gray-100">
        <DetailRow label={dueInfo.estimated ? 'Insurance Due (estimated)' : 'Insurance Expiry'} value={formatDate(dueInfo.date)} highlight={isExpired ? 'red' : isDueToday ? 'orange' : undefined} />
        <DetailRow label="Insurance Company" value={c.last_insurance_comapny || '—'} />
        <DetailRow label="Policy Number" value={c.last_insurance_policy_number || '—'} />
        <DetailRow label="IDV" value={formatCurrency(c.idv)} />
        <DetailRow label="Ex-Showroom Price" value={formatCurrency(c.ex_showroom_price)} />
        <DetailRow label="Vehicle Age" value={c.vehicle_age_in_years ? `${c.vehicle_age_in_years} yrs` : '—'} />
        <DetailRow label="Vehicle Sale Date" value={formatDate(c.vehicle_sale_date)} />
        <DetailRow label="Sold By" value={c.sold_dealer || '—'} />
      </div>

      {/* Previous call info */}
      {assignment.call_count > 0 && (
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-700">
          {assignment.retry_after ? `🔁 Retry attempt ${assignment.no_answer_count}/3 — no answer / not reachable previously` : `⚠️ Called ${assignment.call_count} time(s).`}{assignment.no_answer_count > 0 && !assignment.retry_after ? ` (${assignment.no_answer_count} failed attempts — 3rd marks not reachable)` : ''}
          {assignment.call_notes && <div className="mt-1 text-xs">Last note: {assignment.call_notes}</div>}
          {assignment.whatsapp_sent && <div className="mt-1 text-xs text-green-700">✓ WhatsApp sent ({assignment.whatsapp_status || 'sent'})</div>}
        </div>
      )}

      {/* Action buttons */}
      <div className="px-6 py-4 space-y-4">
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          <button onClick={() => { setShowRenewed(true); setShowNotes(true) }} disabled={busy} className="rounded-xl bg-green-500 px-4 py-3 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50">✅ Renewed via Us</button>
          <button onClick={() => { setShowNotes(true); onUpdateStatus('renewed_elsewhere') }} disabled={busy} className="rounded-xl bg-yellow-500 px-4 py-3 text-sm font-semibold text-white hover:bg-yellow-600 disabled:opacity-50">🔀 Renewed Elsewhere</button>
          <button onClick={() => { setShowCallback(true); setShowNotes(true) }} disabled={busy} className="rounded-xl bg-purple-500 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-600 disabled:opacity-50">🔁 Callback Later</button>
          <button onClick={() => onUpdateStatus('no_answer')} disabled={busy} className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">📵 No Answer</button>
          <button onClick={() => onUpdateStatus('not_reachable')} disabled={busy} className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50" title="Same 3-attempt retry as No Answer; 3rd attempt closes as Not Reachable">🚫 Not Reachable</button>
          <button onClick={() => { setShowNotes(true); onUpdateStatus('wrong_number') }} disabled={busy} className="rounded-xl bg-red-400 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">⚠️ Wrong Number</button>
          <button onClick={() => { setShowNotes(true); onUpdateStatus('not_interested') }} disabled={busy} className="rounded-xl bg-gray-400 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-500 disabled:opacity-50">😐 Not Interested</button>
          <button onClick={() => { setShowNotes(true); onUpdateStatus('already_renewed_unknown') }} disabled={busy} className="rounded-xl bg-teal-500 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50">🔧 Already Renewed</button>
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await callEdge('send_drip_message', {
                  assignment_id: assignment.id,
                  campaign_id: assignment.campaign_id,
                })
                if (res.success) alert(`WhatsApp drip step ${res.step} sent!`)
                else alert(`Failed: ${res.error}`)
              } catch (err: any) { alert(err.message) }
            }}
            disabled={busy}
            className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            💬 Send WA Drip
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await callEdge('generate_self_renewal_link', {
                  assignment_id: assignment.id,
                  campaign_id: assignment.campaign_id,
                })
                if (res.success) {
                  navigator.clipboard.writeText(res.link.link_url)
                  alert('Self-renewal link copied to clipboard!')
                }
              } catch (err: any) { alert(err.message) }
            }}
            disabled={busy}
            className="rounded-xl border border-purple-300 bg-purple-50 px-4 py-3 text-sm font-semibold text-purple-700 hover:bg-purple-100 disabled:opacity-50"
          >
            🔗 Self-Renewal Link
          </button>
        </div>

        {showNotes && (
          <div>
            <label className="text-xs font-medium text-gray-600">Remarks / Call Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What did the customer say?" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} />
          </div>
        )}

        {showRenewed && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
            <div className="text-sm font-semibold text-green-800">✅ Renewal Details (optional)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Quoted Premium</label>
                <input type="number" value={quotedPremium} onChange={e => setQuotedPremium(e.target.value)} placeholder="₹" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Renewal Company</label>
                <input type="text" value={renewalCompany} onChange={e => setRenewalCompany(e.target.value)} placeholder="Insurer name…" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
              </div>
            </div>
            <button onClick={() => onUpdateStatus('renewed_via_us')} disabled={busy} className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              {busy ? 'Confirming…' : '✅ Confirm Renewed via Us'}
            </button>
          </div>
        )}

        {showCallback && (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Callback Date *</label>
              <input type="date" value={callbackDate} onChange={e => setCallbackDate(e.target.value)} className="mt-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
            </div>
            <button onClick={() => onUpdateStatus('callback_later')} disabled={busy || !callbackDate} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy ? 'Saving…' : '🔁 Schedule Callback'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: 'red' | 'orange' }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-0.5 text-sm font-medium ${highlight === 'red' ? 'text-red-600' : highlight === 'orange' ? 'text-orange-600' : 'text-gray-900'}`}>{value}</div>
    </div>
  )
}

function SummaryCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: string }) {
  const colors: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50 text-blue-900', green: 'border-green-200 bg-green-50 text-green-900',
    purple: 'border-purple-200 bg-purple-50 text-purple-900', orange: 'border-orange-200 bg-orange-50 text-orange-900',
    red: 'border-red-200 bg-red-50 text-red-900', gray: 'border-gray-200 bg-gray-50 text-gray-900',
    teal: 'border-teal-200 bg-teal-50 text-teal-900', yellow: 'border-yellow-200 bg-yellow-50 text-yellow-900',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.gray}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  )
}

// ── Admin Dashboard ─────────────────────────────────────────────────────────────
function AdminDashboard({ campaigns, activeCampaign, onRefresh }: { campaigns: Campaign[]; activeCampaign: Campaign | null; onRefresh: () => void }) {
  const [activeAdminTab, setActiveAdminTab] = useState<'campaigns' | 'performance' | 'renewed' | 'leaderboard' | 'roi' | 'expired' | 'meta'>('campaigns')
  
  // Dealer filter state
  const [soldDealers, setSoldDealers] = useState<string[]>([])
  const [serviceDealers, setServiceDealers] = useState<string[]>([])
  const [selectedSoldDealers, setSelectedSoldDealers] = useState<string[]>([])
  const [selectedSvcDealers, setSelectedSvcDealers] = useState<string[]>([])
  const [showDealerFilter, setShowDealerFilter] = useState(false)

  // Priority mode state
  const [priorityMode, setPriorityMode] = useState('urgency') // urgency, idv_value, loyalty, mixed

  // Meta settings state
  const [metaSettings, setMetaSettings] = useState({
    meta_enabled: false,
    meta_template_name: '',
    meta_template_lang: 'en_US',
    drip_enabled: true,
    self_renewal_link_enabled: false,
  })

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [leaderboardDate, setLeaderboardDate] = useState(new Date().toISOString().split('T')[0])

  // ROI dashboard state
  const [roiData, setRoiData] = useState<any>(null)
  const [roiTarget, setRoiTarget] = useState(0)

  // Expired leads state
  const [expiredLeads, setExpiredLeads] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [editName, setEditName] = useState('')
  const [editWindowDays, setEditWindowDays] = useState(30)
  const [editPriorityMode, setEditPriorityMode] = useState('urgency')
  const [editSelectedSoldDealers, setEditSelectedSoldDealers] = useState<string[]>([])
  const [editSelectedSvcDealers, setEditSelectedSvcDealers] = useState<string[]>([])
  const [editShowDealerFilter, setEditShowDealerFilter] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [windowDays, setWindowDays] = useState(30)
  const [customWindowDays, setCustomWindowDays] = useState(30)
  const [useCustomDays, setUseCustomDays] = useState(false)
  const [previewCounts, setPreviewCounts] = useState<any>(null)
  const [previewing, setPreviewing] = useState(false)
  const [campaignName, setCampaignName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [agentStats, setAgentStats] = useState<any[]>([])
  const [refreshingCampaign, setRefreshingCampaign] = useState(false)
  const [refreshResult, setRefreshResult] = useState<string | null>(null)
  const [statsDateFrom, setStatsDateFrom] = useState('')
  const [statsDateTo, setStatsDateTo] = useState('')
  const [renewedList, setRenewedList] = useState<any[]>([])
  const [loadingTab, setLoadingTab] = useState(false)
  const [rcStatusByCampaign, setRcStatusByCampaign] = useState<Record<string, any>>({})
  const [rcEnqueueingId, setRcEnqueueingId] = useState<number | null>(null)
  const [rcStatusLoaded, setRcStatusLoaded] = useState(false)
  const [rcStatusLoadError, setRcStatusLoadError] = useState<string | null>(null)

  type RcCampaignStatus = {
    pending_with_vrn?: number
    pending_missing_vrn?: number
    pending_stale?: number
    fetch_enabled?: boolean
    active_job?: { id: string; status: string; stats?: Record<string, number> } | null
    last_job?: { status: string; stats?: Record<string, number> } | null
    diagnostics?: {
      assignment_total?: number
      stale_in_campaign?: number
      attempted_total?: number
    } | null
  }

  function isMissingSupabaseRpc(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false
    if (error.code === 'PGRST202') return true
    return /could not find the function/i.test(error.message ?? '')
  }

  function normalizeRcJobStats(st: RcCampaignStatus): RcCampaignStatus {
    if (st.active_job?.stats && typeof st.active_job.stats === 'object') {
      const s = st.active_job.stats as Record<string, unknown>
      st.active_job = {
        ...st.active_job,
        stats: {
          ok: Number(s.ok ?? 0),
          from_cache: Number(s.from_cache ?? 0),
          failed: Number(s.failed ?? 0),
          skipped_no_vrn: Number(s.skipped_no_vrn ?? 0),
          skipped_fresh: Number(s.skipped_fresh ?? 0),
        },
      }
    }
    return st
  }

  async function loadRcStatusForCampaign(campaignId: number): Promise<RcCampaignStatus> {
    const { data, error } = await supabase.rpc('insurance_renewal_rc_fetch_campaign_status', {
      p_campaign_id: campaignId,
    })
    if (!error && data) {
      return normalizeRcJobStats((data ?? {}) as RcCampaignStatus)
    }
    if (!isMissingSupabaseRpc(error)) {
      throw new Error(error?.message ?? 'RC status failed')
    }

    const { data: pendingRows, error: pendingErr } = await supabase.rpc(
      'insurance_renewal_rc_fetch_pending_counts',
      { p_campaign_id: campaignId },
    )
    if (pendingErr) throw new Error(pendingErr.message)
    const row = Array.isArray(pendingRows) ? pendingRows[0] : pendingRows
    const pendingWithVrn = Number(row?.pending_with_vrn ?? 0)
    return {
      pending_stale: Number(row?.pending_stale ?? 0),
      pending_with_vrn: pendingWithVrn,
      pending_missing_vrn: Number(row?.pending_missing_vrn ?? 0),
      fetch_enabled: pendingWithVrn > 0,
    }
  }

  const loadRcStatus = useCallback(async (): Promise<Record<string, any>> => {
    if (campaigns.length === 0) {
      setRcStatusByCampaign({})
      setRcStatusLoaded(true)
      setRcStatusLoadError(null)
      return {}
    }
    try {
      const map: Record<string, RcCampaignStatus> = {}
      for (const c of campaigns) {
        map[String(c.id)] = await loadRcStatusForCampaign(c.id)
      }
      setRcStatusByCampaign(map)
      setRcStatusLoadError(null)
      setRcStatusLoaded(true)
      return map
    } catch (e) {
      console.error('RC status load failed', e)
      const msg = (e as Error).message
      setRcStatusLoadError(
        msg.includes('Supabase Edge')
          ? msg
          : `Database (RPC): ${msg}. If this mentions a missing function, run supabase/scripts/apply_insurance_rc_fetch_ui_rpcs.sql in SQL Editor.`,
      )
      setRcStatusLoaded(true)
      return {}
    }
  }, [campaigns])

  useEffect(() => {
    if (activeAdminTab !== 'campaigns') return
    loadRcStatus().catch(() => {})
    const ms = rcStatusLoadError ? 60000 : 20000
    const t = setInterval(() => { loadRcStatus().catch(() => {}) }, ms)
    return () => clearInterval(t)
  }, [activeAdminTab, loadRcStatus, rcStatusLoadError])

  // Fetch distinct dealers for dropdown filters (public endpoint - no auth needed)
  useEffect(() => {
    fetch(`${supabaseUrl}/functions/v1/insurance-renewal-telecalling`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
      body: JSON.stringify({ action: 'get_dealers' }),
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setSoldDealers(res.dealers?.sold_dealers || [])
          setServiceDealers(res.dealers?.service_dealers || [])
        }
      })
      .catch(console.error)
  }, [])

  // Initialize meta settings when active campaign changes
  useEffect(() => {
    if (activeCampaign) {
      setMetaSettings({
        meta_enabled: activeCampaign.meta_enabled || false,
        meta_template_name: activeCampaign.meta_template_name || '',
        meta_template_lang: 'en_US',
        drip_enabled: activeCampaign.drip_enabled ?? true,
        self_renewal_link_enabled: activeCampaign.self_renewal_link_enabled || false,
      })
      setRoiTarget(activeCampaign.roi_target_premium || 0)
    }
  }, [activeCampaign])

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await callEdge('leaderboard', {
        campaign_id: activeCampaign?.id,
        date: leaderboardDate,
      })
      setLeaderboard(res.leaderboard || [])
    } catch (e) { console.error(e) }
  }, [activeCampaign?.id, leaderboardDate])

  const fetchRoi = useCallback(async () => {
    try {
      const res = await callEdge('roi_dashboard', { campaign_id: activeCampaign?.id })
      setRoiData(res.roi)
      if (res.roi?.roi_target_premium !== undefined) {
        setRoiTarget(res.roi.roi_target_premium)
      }
    } catch (e) { console.error(e) }
  }, [activeCampaign?.id])

  const fetchExpired = useCallback(async () => {
    try {
      const res = await callEdge('expired_leads', { campaign_id: activeCampaign?.id })
      setExpiredLeads(res.expired || [])
    } catch (e) { console.error(e) }
  }, [activeCampaign?.id])

  const saveMetaSettings = async () => {
    try {
      await callEdge('update_campaign_meta', {
        campaign_id: activeCampaign?.id,
        ...metaSettings,
        roi_target_premium: roiTarget || undefined,
      })
      setSuccess('✅ Meta WhatsApp settings saved!')
      onRefresh()
    } catch (e: any) { setError(e.message) }
  }

  useEffect(() => {
    if (activeAdminTab === 'performance') fetchAgentStats()
    else if (activeAdminTab === 'renewed') fetchRenewed()
    else if (activeAdminTab === 'leaderboard') fetchLeaderboard()
    else if (activeAdminTab === 'roi') fetchRoi()
    else if (activeAdminTab === 'expired') fetchExpired()
  }, [activeAdminTab, activeCampaign, statsDateFrom, statsDateTo, leaderboardDate, fetchLeaderboard, fetchRoi, fetchExpired])

  async function fetchAgentStats() {
    setLoadingTab(true)
    try {
      const d = await callEdge('admin_stats', { campaign_id: activeCampaign?.id, date_from: statsDateFrom || undefined, date_to: statsDateTo || undefined })
      setAgentStats(d.agent_stats || [])
    } catch (e) {
      console.error(e)
      setError((e as Error).message)
      setAgentStats([])
    } finally { setLoadingTab(false) }
  }

  async function fetchRenewed() {
    setLoadingTab(true)
    try { const d = await callEdge('renewed_list', { campaign_id: activeCampaign?.id }); setRenewedList(d.renewed || []) }
    catch (e) { console.error(e) } finally { setLoadingTab(false) }
  }

  async function refreshCampaignNow() {
    setRefreshingCampaign(true); setRefreshResult(null)
    try {
      const d = await callEdge('refresh_campaign', { campaign_id: activeCampaign?.id })
      const r = (d.refreshed || [])[0]
      if (r) {
        const dup = r.retired_cross_campaign_duplicates
          ? `, removed ${r.retired_cross_campaign_duplicates} duplicate lead(s) (owned by another active campaign)`
          : ''
        setRefreshResult(`✅ Refreshed "${r.campaign_name}" — window now ${r.window}. Added ${r.added} new, retired ${r.retired_out_of_window} out-of-window, re-opened ${r.reactivated_to_pending ?? 0} to pending${dup}. Pending: ${r.pending_count}, Total: ${r.total_leads}.`)
      }
      else setRefreshResult('No active campaigns to refresh.')
      await onRefresh()
      await loadRcStatus()
    } catch (e: any) { setRefreshResult(`❌ Refresh failed: ${e.message}`) }
    finally { setRefreshingCampaign(false) }
  }

  function setStatsToday() {
    const today = new Date().toISOString().split('T')[0]
    setStatsDateFrom(today); setStatsDateTo(today)
  }
  function clearStatsRange() { setStatsDateFrom(''); setStatsDateTo('') }

  async function handlePreview() {
    setPreviewing(true); setPreviewCounts(null)
    const effectiveDays = useCustomDays ? customWindowDays : windowDays
    try {
      const d = await callEdge('preview_campaign', {
        window_days: effectiveDays,
        sold_dealer_filter: selectedSoldDealers.length > 0 ? selectedSoldDealers : undefined,
        last_service_dealer_filter: selectedSvcDealers.length > 0 ? selectedSvcDealers : undefined,
      })
      setPreviewCounts(d)
    }
    catch (err) { setError((err as Error).message) } finally { setPreviewing(false) }
  }

  async function handleCreate() {
    if (!campaignName) { setError('Please fill campaign name'); return }
    const effectiveDays = useCustomDays ? customWindowDays : windowDays
    setCreating(true); setError(null)
    try {
      const data = await callEdge('create_campaign', {
        campaign_name: campaignName,
        window_days: effectiveDays,
        sold_dealer_filter: selectedSoldDealers.length > 0 ? selectedSoldDealers : undefined,
        last_service_dealer_filter: selectedSvcDealers.length > 0 ? selectedSvcDealers : undefined,
        priority_mode: priorityMode,
      })
      if (data.total_leads === 0) { setError(`No eligible customers found. ${data.message || ''}`); return }
      const statsInfo = data.stats ? ` (${data.stats.raw_from_db} found → ${data.stats.after_chassis_dedup} unique, range: ${data.stats.date_from} to ${data.stats.date_to})` : ''
      setSuccess(`Campaign created with ${data.total_leads} leads!${statsInfo}`)
      setShowCreate(false); setCampaignName(''); setPreviewCounts(null); setUseCustomDays(false); setWindowDays(30); onRefresh()
      setSelectedSoldDealers([]); setSelectedSvcDealers([]); setPriorityMode('urgency')
    } catch (err) { setError((err as Error).message) } finally { setCreating(false) }
  }

  async function handleClose(id: number) {
    if (!confirm('Close this campaign?')) return
    try { await callEdge('close_campaign', { campaign_id: id }); onRefresh() }
    catch (err) { setError((err as Error).message) }
  }

  async function handleEdit() {
    if (!editingCampaign || !editName) return
    setEditing(true); setError(null)
    try { await callEdge('update_campaign', { campaign_id: editingCampaign.id, campaign_name: editName, window_days: editWindowDays, priority_mode: editPriorityMode, sold_dealer_filter: editSelectedSoldDealers.length > 0 ? editSelectedSoldDealers : null, last_service_dealer_filter: editSelectedSvcDealers.length > 0 ? editSelectedSvcDealers : null }); setSuccess('Campaign updated!'); setEditingCampaign(null); onRefresh() }
    catch (err) { setError((err as Error).message) } finally { setEditing(false) }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete campaign "${name}"?\n\nThis permanently removes ALL leads and call history for this campaign (including in-progress and callbacks). To keep telecaller work, close the campaign instead — do not delete until My Queue is empty.`)) return
    setDeleting(id); setError(null)
    try { await callEdge('delete_campaign', { campaign_id: id }); setSuccess('Campaign deleted.'); onRefresh() }
    catch (err) { setError((err as Error).message) } finally { setDeleting(null) }
  }

  async function handleRcFetchCancel(campaign: Campaign) {
    const st: RcCampaignStatus = rcStatusByCampaign[String(campaign.id)] || {}
    if (!st.active_job) return
    if (!confirm(`Stop background RC fetch for "${campaign.campaign_name}"?\n\nNo further IDSPay calls will be made for this job. Calls already completed cannot be undone.`)) return
    setError(null)
    setSuccess(null)
    try {
      const { data, error } = await supabase.rpc('insurance_renewal_rc_fetch_cancel_admin', {
        p_campaign_id: campaign.id,
        p_job_id: st.active_job?.id ?? null,
      })
      if (error) throw new Error(error.message)
      const payload = (data ?? {}) as { message?: string }
      setSuccess(payload.message || 'RC fetch stopped.')
      await loadRcStatus()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleRcFetchEnqueue(campaign: Campaign) {
    if (rcEnqueueingId !== null) return
    setError(null)
    setSuccess(null)

    await loadRcStatus().catch(() => ({}))
    let st: RcCampaignStatus = rcStatusByCampaign[String(campaign.id)] || {}
    try {
      st = await loadRcStatusForCampaign(campaign.id)
    } catch {
      /* use cached st */
    }

    if (st.active_job) {
      setError('RC fetch is already queued or running. Use “Stop RC fetch” to cancel.')
      return
    }

    const withVrn = st.pending_with_vrn ?? 0
    const diag = st.diagnostics

    if (withVrn <= 0) {
      const total = diag?.assignment_total ?? campaign.total_leads
      const stale = diag?.stale_in_campaign ?? '—'
      const attempted = diag?.attempted_total ?? '—'
      setError(
        `Nothing to queue for “${campaign.campaign_name}”: 0 new stale leads with VRN. ` +
        `Campaign assignments: ${total}; with null or >365-day insurance on file: ${stale}; ` +
        `already attempted via RC job: ${attempted}. ` +
        `RC fetch does not run for every telecalling lead—only stale insurance not yet attempted.`,
      )
      return
    }

    const missingVrn = st.pending_missing_vrn ?? 0
    const msg = [
      `Queue background IDSPay RC fetch for "${campaign.campaign_name}"?`,
      '',
      `${withVrn} new lead(s) with VRN (insurance null or older than 365 days, never fetched before).`,
      missingVrn > 0 ? `${missingVrn} stale lead(s) without VRN will be marked skipped when the job reaches them.` : '',
      '',
      'Processing runs automatically every ~2 minutes — you can close this tab.',
    ].filter(Boolean).join('\n')
    if (!confirm(msg)) return

    setRcEnqueueingId(campaign.id)
    try {
      const { data, error } = await supabase.rpc('insurance_renewal_rc_fetch_enqueue_admin', {
        p_campaign_id: campaign.id,
      })
      if (error) throw new Error(error.message)
      const payload = (data ?? {}) as { message?: string }
      setSuccess(payload.message || 'RC fetch queued.')
      await loadRcStatus()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRcEnqueueingId(null)
    }
  }

  function rcFetchButtonLabel(c: Campaign): string {
    const st: RcCampaignStatus = rcStatusByCampaign[String(c.id)] || {}
    if (st.active_job) {
      const s = st.active_job.stats
      const ok = s?.ok ?? 0
      return st.active_job.status === 'queued' ? 'RC fetch queued…' : `RC fetch running… (${ok} OK)`
    }
    if ((st.pending_with_vrn ?? 0) > 0) {
      return `Queue RC fetch (${st.pending_with_vrn} new)`
    }
    return 'RC fetch up to date'
  }

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <div className="flex gap-2 flex-wrap">
        {(['campaigns', 'performance', 'renewed', 'leaderboard', 'roi', 'expired', 'meta'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveAdminTab(tab)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              activeAdminTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab === 'campaigns' ? '📋 Campaigns' :
             tab === 'performance' ? '📊 Performance' :
             tab === 'renewed' ? '✅ Renewed' :
             tab === 'leaderboard' ? '🏆 Leaderboard' :
             tab === 'roi' ? '💰 ROI Dashboard' :
             tab === 'expired' ? '🚨 Expired' :
             '💬 Meta Settings'}
          </button>
        ))}
      </div>

      {/* ── Campaigns Tab ──────────────────────────────────────────────── */}
      {activeAdminTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Campaigns</h2>
            <div className="flex items-center gap-2">
              <button onClick={refreshCampaignNow} disabled={refreshingCampaign} className="rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50">
                {refreshingCampaign ? '↻ Refreshing…' : '↻ Refresh Now'}
              </button>
              <button onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">+ New Campaign</button>
              <button
                type="button"
                onClick={async () => {
                  const name = prompt('Conquest campaign name:', 'Conquest - Insurance Renewals')
                  if (!name) return
                  try {
                    // Fetch all dealers and exclude Techwheels
                    const res = await callEdge('get_dealers', {})
                    const techwheelsDealers = (res.dealers.sold_dealers || []).filter(
                      (d: string) => d.toLowerCase().includes('techwheels') || d.toLowerCase().includes('firstmobital')
                    )
                    const conquestDealers = (res.dealers.sold_dealers || []).filter(
                      (d: string) => !techwheelsDealers.includes(d)
                    )
                    
                    const t = await callEdge('create_campaign', {
                      campaign_name: name,
                      window_days: 30,
                      sold_dealer_filter: conquestDealers,
                      priority_mode: 'idv_value',
                    })
                    alert(`Conquest campaign created with ${t.total_leads} leads!`)
                    onRefresh()
                  } catch (err: any) { alert(err.message) }
                }}
                className="rounded-lg border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100"
              >
                ⚔️ Conquest Campaign
              </button>
            </div>
          </div>
          {refreshResult && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700 flex items-center justify-between">
              <span>{refreshResult}</span>
              <button onClick={() => setRefreshResult(null)} className="text-gray-400 hover:text-gray-600 ml-3">×</button>
            </div>
          )}
          <p className="text-xs text-gray-500">
            RC fetch runs in the background (cron every ~2 min). Only campaign leads with null or 365+ day old insurance that have not been fetched before are processed.
          </p>

          {showCreate && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="font-medium text-gray-900">Create New Campaign</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-gray-700">Campaign Name</label>
                  <input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="e.g. August Insurance Renewals" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Renewal Window (before expiry)</label>
                  <div className="mt-1 flex gap-2">
                    <select
                      value={useCustomDays ? 'custom' : String(windowDays)}
                      onChange={e => { if (e.target.value === 'custom') setUseCustomDays(true); else { setUseCustomDays(false); setWindowDays(Number(e.target.value)) } }}
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    >
                      <option value="15">Next 15 days</option>
                      <option value="30">Next 30 days</option>
                      <option value="45">Next 45 days</option>
                      <option value="60">Next 60 days</option>
                      <option value="custom">Custom…</option>
                    </select>
                    {useCustomDays && (
                      <input type="number" min={1} max={365} value={customWindowDays} onChange={e => setCustomWindowDays(Number(e.target.value))} className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Days" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    Customers whose insurance expires between{' '}
                    <span className="font-medium text-gray-600">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>{' '}→{' '}
                    <span className="font-medium text-gray-600">{new Date(Date.now() + (useCustomDays ? customWindowDays : windowDays) * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </p>
                </div>

                {/* Priority Mode selector */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-sm font-medium text-gray-700">Lead Priority Mode</label>
                  <select
                    value={priorityMode}
                    onChange={e => setPriorityMode(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="urgency">⏰ Urgency (closest expiry first)</option>
                    <option value="idv_value">💰 Highest IDV Value first</option>
                    <option value="loyalty">🤝 Loyal customers first (sold/serviced by us)</option>
                    <option value="mixed">⚖️ Mixed (weighted combination)</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Controls the order telecallers receive leads.</p>
                </div>

                {/* Dealer Filter toggle */}
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => setShowDealerFilter(!showDealerFilter)}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium"
                  >
                    {showDealerFilter ? '▼' : '▶'} Advanced Filters (Dealer)
                  </button>
                </div>

                {showDealerFilter && (
                  <div className="col-span-2 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-medium text-gray-600 uppercase">Sold By Dealer</label>
                        <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2">
                          {soldDealers.map(d => (
                            <label key={d} className="flex items-center gap-2 py-0.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedSoldDealers.includes(d)}
                                onChange={e => {
                                  if (e.target.checked) setSelectedSoldDealers([...selectedSoldDealers, d])
                                  else setSelectedSoldDealers(selectedSoldDealers.filter(x => x !== d))
                                }}
                                className="w-3.5 h-3.5 accent-blue-600"
                              />
                              <span className="text-sm">{d}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 uppercase">Last Serviced At</label>
                        <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2">
                          {serviceDealers.map(d => (
                            <label key={d} className="flex items-center gap-2 py-0.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedSvcDealers.includes(d)}
                                onChange={e => {
                                  if (e.target.checked) setSelectedSvcDealers([...selectedSvcDealers, d])
                                  else setSelectedSvcDealers(selectedSvcDealers.filter(x => x !== d))
                                }}
                                className="w-3.5 h-3.5 accent-blue-600"
                              />
                              <span className="text-sm">{d}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    {(selectedSoldDealers.length > 0 || selectedSvcDealers.length > 0) && (
                      <button
                        type="button"
                        onClick={() => { setSelectedSoldDealers([]); setSelectedSvcDealers([]) }}
                        className="text-xs text-gray-500 hover:text-gray-700 font-semibold"
                      >Clear filters</button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-3 flex-wrap">
                <button onClick={handlePreview} disabled={previewing} className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50">{previewing ? 'Previewing…' : '🔍 Preview Leads'}</button>
                <button onClick={handleCreate} disabled={creating} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{creating ? 'Creating…' : '✅ Create Campaign'}</button>
                <button onClick={() => setShowCreate(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              </div>
              {previewCounts && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-semibold text-blue-900">Preview — <span className="text-blue-700">{previewCounts.filtered_count} customers</span></p>
                  <p className="text-xs text-blue-500 mt-1">{previewCounts.date_from} → {previewCounts.date_to} · raw match: {previewCounts.raw_count}</p>
                  {(previewCounts.excluded_cross_campaign ?? 0) > 0 && (
                    <p className="text-xs text-amber-700 mt-1">{previewCounts.excluded_cross_campaign} already in another active campaign — not counted.</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {campaigns.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">No campaigns yet. Click &quot;New Campaign&quot; to create one.</div>
            ) : campaigns.map(c => {
              const rcSt: RcCampaignStatus = rcStatusByCampaign[String(c.id)] || {}
              const canQueue = rcSt.fetch_enabled === true && rcEnqueueingId === null
              const diag = rcSt.diagnostics
              return (
              <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{c.campaign_name}</h3>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      Next <strong>{c.window_days} days</strong> · {formatDate(c.date_from)} → {formatDate(c.date_to)}{' '}· by {c.created_by || '—'}
                    </p>
                    {rcStatusLoadError && (
                      <p className="mt-1 text-xs text-red-600">RC status: {rcStatusLoadError}</p>
                    )}
                    {rcStatusLoaded && !rcStatusLoadError && (
                      <p className="mt-1 text-xs text-gray-600">
                        IDSPay RC: <strong>{rcSt.pending_with_vrn ?? '…'}</strong> new to fetch
                        {diag ? (
                          <> · {diag.assignment_total} in campaign · {diag.stale_in_campaign} stale (null/&gt;365d) · {diag.attempted_total} already attempted</>
                        ) : null}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {rcSt.active_job && (
                      <button
                        type="button"
                        onClick={() => handleRcFetchCancel(c)}
                        className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                      >
                        Stop RC fetch
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRcFetchEnqueue(c)}
                      disabled={rcEnqueueingId !== null || Boolean(rcSt.active_job)}
                      title={
                        rcSt.active_job
                          ? 'Background job in progress'
                          : canQueue
                            ? 'Queue IDSPay lookup for new stale leads only'
                            : 'Click for explanation if nothing to queue'
                      }
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                        canQueue
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                          : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {rcEnqueueingId === c.id ? 'Queuing…' : rcFetchButtonLabel(c)}
                    </button>
                    {c.status === 'active' && <button onClick={() => handleClose(c.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">Close</button>}
                    <button onClick={() => { setEditingCampaign(c); setEditName(c.campaign_name); setEditWindowDays(c.window_days); setEditPriorityMode(c.priority_mode || 'urgency'); setEditSelectedSoldDealers(c.sold_dealer_filter || []); setEditSelectedSvcDealers(c.last_service_dealer_filter || []); setEditShowDealerFilter(!!(c.sold_dealer_filter?.length || c.last_service_dealer_filter?.length)) }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">✏️ Edit</button>
                    <button onClick={() => handleDelete(c.id, c.campaign_name)} disabled={deleting === c.id} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">{deleting === c.id ? 'Deleting…' : '🗑️'}</button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                  {[['Total', c.total_leads, 'bg-gray-50 text-gray-500'], ['Pending', c.pending_count, 'bg-orange-50 text-orange-600'], ['In Progress', c.in_progress_count, 'bg-blue-50 text-blue-500'], ['Callback Later', c.callback_later_count, 'bg-purple-50 text-purple-500'], ['Renewed (Us)', c.renewed_count, 'bg-green-50 text-green-600'], ['Completed', c.completed_count, 'bg-teal-50 text-teal-700'], ['Out of Window', c.out_of_window_count, 'bg-gray-50 text-gray-400']].map(([lbl, val, cls]) => (
                    <div key={String(lbl)} className={`rounded-lg px-3 py-2 ${cls}`}>
                      <div className="text-xs">{lbl}</div>
                      <div className="text-xl font-bold text-gray-900">{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )})}
          </div>
        </div>
      )}

      {/* ── Performance Tab ─────────────────────────────────────────────── */}
      {activeAdminTab === 'performance' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
              <input type="date" value={statsDateFrom} onChange={e => setStatsDateFrom(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
              <input type="date" value={statsDateTo} onChange={e => setStatsDateTo(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
            </div>
            <button onClick={setStatsToday} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Today's Calls</button>
            {(statsDateFrom || statsDateTo) && <button onClick={clearStatsRange} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Clear (All Time)</button>}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">📊 Telecaller Performance</h3>
              <button onClick={fetchAgentStats} className="text-sm text-blue-600 hover:text-blue-700">↻ Refresh</button>
            </div>
            {loadingTab ? <div className="p-8 text-center text-sm text-gray-400">Loading…</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['#', 'Telecaller', 'Calls Made', 'Connected', 'Renewed (Us)', 'Renewed (Elsewhere)', 'Callback', 'No Answer', 'Not Interested', 'Wrong No.', 'In Progress'].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {agentStats.length === 0 ? (
                      <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">{statsDateFrom || statsDateTo ? 'No call activity in this date range (try Clear for all time).' : 'No telecaller activity yet — counts appear after Get next / dispositions (idle pending pool is excluded).'}</td></tr>
                    ) : agentStats.map((a: {
                      telecaller_id?: string
                      telecaller_name?: string
                      email?: string
                      calls_made?: number
                      calls_connected?: number
                      renewed_via_us?: number
                      renewed_elsewhere?: number
                      callback_later?: number
                      no_answer?: number
                      not_interested?: number
                      wrong_number?: number
                      in_progress?: number
                      still_assigned?: number
                    }, i: number) => {
                      const label = a.telecaller_name && a.telecaller_name !== 'Unknown'
                        ? a.telecaller_name
                        : a.email
                          ? a.email.includes('@')
                            ? a.email.split('@')[0]
                            : a.email
                          : a.telecaller_id && a.telecaller_id !== 'unassigned'
                            ? `${a.telecaller_id.slice(0, 8)}…`
                            : 'Unassigned'
                      const active = a.in_progress ?? a.still_assigned ?? 0
                      return (
                      <tr key={a.telecaller_id || String(i)} className={`hover:bg-gray-50 ${i === 0 ? 'bg-green-50' : ''}`}>
                        <td className="px-3 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-3 font-medium text-gray-900">{label}</td>
                        <td className="px-3 py-3 font-semibold text-gray-800">{a.calls_made || 0}</td>
                        <td className="px-3 py-3 text-blue-700 font-medium">{a.calls_connected || 0}</td>
                        <td className="px-3 py-3 font-bold text-green-700">{a.renewed_via_us || 0}</td>
                        <td className="px-3 py-3 text-yellow-700">{a.renewed_elsewhere || 0}</td>
                        <td className="px-3 py-3 text-purple-700">{a.callback_later || 0}</td>
                        <td className="px-3 py-3 text-orange-700">{a.no_answer || 0}</td>
                        <td className="px-3 py-3 text-gray-500">{a.not_interested || 0}</td>
                        <td className="px-3 py-3 text-red-500">{a.wrong_number || 0}</td>
                        <td className="px-3 py-3 text-gray-400">{active}</td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Renewed Tab ────────────────────────────────────────────────── */}
      {activeAdminTab === 'renewed' && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">✅ Renewed via Us ({renewedList.length})</h3>
            <button onClick={fetchRenewed} className="text-sm text-blue-600 hover:text-blue-700">↻ Refresh</button>
          </div>
          {loadingTab ? <div className="p-8 text-center text-sm text-gray-400">Loading…</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Customer', 'Vehicle', 'Phone', 'Renewed On', 'Premium', 'Company', 'Telecaller', 'Notes'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {renewedList.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No renewals in this campaign yet</td></tr>
                  ) : renewedList.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.customer?.first_name} {r.customer?.last_name || ''}</td>
                      <td className="px-4 py-3 text-gray-600">{r.customer?.model} · {r.customer?.vehicle_registration_number || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.customer?.contact_phones}</td>
                      <td className="px-4 py-3 font-medium text-green-700">{formatDate(r.called_at)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatCurrency(r.quoted_premium)}</td>
                      <td className="px-4 py-3 text-gray-600">{r.renewal_company || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.assigned_to || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{r.call_notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Leaderboard Tab ────────────────────────────────────────────── */}
      {activeAdminTab === 'leaderboard' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <input
              type="date"
              value={leaderboardDate}
              onChange={e => { setLeaderboardDate(e.target.value); fetchLeaderboard() }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
            />
            <button onClick={fetchLeaderboard} className="text-sm text-blue-600 font-semibold hover:text-blue-700">↻ Refresh</button>
          </div>
          
          {leaderboard.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
              No leaderboard data for this date.
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">🏆 Today's Leaderboard</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Rank', 'Telecaller', 'Calls', 'Connected', 'Renewed (Us)', 'Premium', 'Score', 'Conversion %'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leaderboard.map((agent: any, i: number) => (
                    <tr key={i} className={i === 0 ? 'bg-yellow-50' : i === 1 ? 'bg-gray-50' : i === 2 ? 'bg-orange-50' : ''}>
                      <td className="px-3 py-3 font-bold">{i + 1}{i === 0 ? ' 🥇' : i === 1 ? ' 🥈' : i === 2 ? ' 🥉' : ''}</td>
                      <td className="px-3 py-3 font-medium text-gray-900">{agent.telecaller_name}</td>
                      <td className="px-3 py-3 text-gray-600">{agent.calls_made}</td>
                      <td className="px-3 py-3 text-blue-600">{agent.calls_connected}</td>
                      <td className="px-3 py-3 text-green-600 font-medium">{agent.renewed_via_us}</td>
                      <td className="px-3 py-3 text-green-700">₹{agent.premium_collected?.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-3 font-bold text-gray-900">{agent.score}</td>
                      <td className="px-3 py-3 text-gray-600">{agent.conversion_rate?.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ROI Dashboard Tab ─────────────────────────────────────────── */}
      {activeAdminTab === 'roi' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-500">Total Premium Collected</div>
              <div className="mt-1 text-2xl font-bold text-green-600">₹{roiData?.total_premium_collected?.toLocaleString('en-IN') || 0}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-500">Conversion Rate</div>
              <div className="mt-1 text-2xl font-bold text-blue-600">{roiData?.conversion_rate?.toFixed(1) || 0}%</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-500">Avg Premium</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">₹{roiData?.avg_premium?.toLocaleString('en-IN') || 0}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-500">Target Achievement</div>
              <div className="mt-1 text-2xl font-bold text-purple-600">{roiData?.target_achievement?.toFixed(1) || 0}%</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-white p-3"><div className="text-xs text-gray-500">Total Leads</div><div className="text-lg font-semibold">{roiData?.total_leads || 0}</div></div>
            <div className="rounded-lg border bg-white p-3"><div className="text-xs text-gray-500">Renewed (Us)</div><div className="text-lg font-semibold text-green-600">{roiData?.renewed_via_us || 0}</div></div>
            <div className="rounded-lg border bg-white p-3"><div className="text-xs text-gray-500">Renewed (Elsewhere)</div><div className="text-lg font-semibold text-yellow-600">{roiData?.renewed_elsewhere || 0}</div></div>
            <div className="rounded-lg border bg-white p-3"><div className="text-xs text-gray-500">Pending</div><div className="text-lg font-semibold text-gray-600">{roiData?.pending || 0}</div></div>
          </div>
          
          {roiData?.by_company?.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-semibold text-gray-900">Revenue by Insurance Company</h3></div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Company</th>
                    <th className="px-4 py-2 text-right">Count</th>
                    <th className="px-4 py-2 text-right">Premium</th>
                  </tr>
                </thead>
                <tbody>
                  {roiData.by_company.map((c: any) => (
                    <tr key={c.company} className="border-b">
                      <td className="px-4 py-2 font-medium">{c.company}</td>
                      <td className="px-4 py-2 text-right">{c.count}</td>
                      <td className="px-4 py-2 text-right text-green-600">₹{c.premium?.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Expired Leads Tab ─────────────────────────────────────────── */}
      {activeAdminTab === 'expired' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            ⚠️ These customers' insurance has already expired. They are driving uninsured — highest urgency!
          </div>
          {expiredLeads.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">No expired leads 🎉</div>
          ) : (
            expiredLeads.map((lead: any) => (
              <div key={lead.customer.id} className="rounded-xl border border-red-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{lead.customer.first_name} {lead.customer.last_name || ''}</div>
                    <div className="text-sm text-gray-500">📱 {lead.customer.contact_phones} · 🚗 {lead.customer.model} · {lead.customer.vehicle_registration_number || '—'}</div>
                    <div className="text-xs text-red-600 font-medium mt-1">⚠️ Expired {lead.days_expired} days ago ({formatDate(lead.customer.last_insurance_expiry_date)})</div>
                  </div>
                  <a href={`tel:${lead.customer.contact_phones}`} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">📞 Call Now</a>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Meta WhatsApp Settings Tab ────────────────────────────────── */}
      {activeAdminTab === 'meta' && (
        <div className="max-w-2xl space-y-5">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="font-medium text-gray-900">💬 Meta WhatsApp Drip Settings</h3>
            <p className="text-xs text-gray-500">
              Uses the same Meta WhatsApp credentials from your WA Agent config (wa_agent_config).
              Meta Cloud API will send approved template messages automatically.
            </p>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={metaSettings.meta_enabled}
                onChange={e => setMetaSettings(s => ({...s, meta_enabled: e.target.checked}))} className="w-4 h-4 accent-green-600" />
              <span className="text-sm font-medium">Enable Meta WhatsApp for this campaign</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={metaSettings.drip_enabled}
                onChange={e => setMetaSettings(s => ({...s, drip_enabled: e.target.checked}))} className="w-4 h-4 accent-green-600" />
              <span className="text-sm font-medium">Enable 3-step drip on no-answer</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={metaSettings.self_renewal_link_enabled}
                onChange={e => setMetaSettings(s => ({...s, self_renewal_link_enabled: e.target.checked}))} className="w-4 h-4 accent-green-600" />
              <span className="text-sm font-medium">Send self-renewal link on final drip step</span>
            </label>
            
            <div>
              <label className="text-sm font-medium text-gray-700">Template Name Prefix</label>
              <input value={metaSettings.meta_template_name}
                onChange={e => setMetaSettings(s => ({...s, meta_template_name: e.target.value}))}
                placeholder="insurance_renewal (uses _reminder, _urgent, _final suffixes)"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <p className="text-xs text-gray-400 mt-1">Leave empty to use default: insurance_renewal_reminder, insurance_renewal_urgent, insurance_renewal_final</p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700">Template Language</label>
              <select value={metaSettings.meta_template_lang}
                onChange={e => setMetaSettings(s => ({...s, meta_template_lang: e.target.value}))}
                className="mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="en_US">English (US)</option>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="en_GB">English (UK)</option>
              </select>
            </div>
          </div>
          
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="font-medium text-gray-900">🎯 ROI Target</h3>
            <div>
              <label className="text-sm font-medium text-gray-700">Target Premium (₹)</label>
              <input type="number" value={roiTarget}
                onChange={e => setRoiTarget(Number(e.target.value))}
                placeholder="e.g. 500000"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
          </div>
          
          <button onClick={saveMetaSettings} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700">
            💾 Save Settings
          </button>
        </div>
      )}

      {editingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Edit Campaign</h3>
              <button onClick={() => setEditingCampaign(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="grid gap-4 max-h-[65vh] overflow-y-auto pr-1">
              <div>
                <label className="text-sm font-medium text-gray-700">Campaign Name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Renewal Window (days before expiry)</label>
                <input type="number" min={1} max={365} value={editWindowDays} onChange={e => setEditWindowDays(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-2 border border-amber-200">⚠️ Changing the window takes effect on the next "Refresh Now".</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Lead Priority Mode</label>
                <select
                  value={editPriorityMode}
                  onChange={e => setEditPriorityMode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                >
                  <option value="urgency">⏰ Urgency (closest expiry first)</option>
                  <option value="idv_value">💰 IDV Value (highest premium first)</option>
                  <option value="loyalty">⭐ Customer Loyalty (most visits first)</option>
                  <option value="mixed">🔀 Mixed (balanced scoring)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">Controls the order telecallers receive leads.</p>
              </div>

              {/* Dealer Filters */}
              <div>
                <button
                  type="button"
                  onClick={() => setEditShowDealerFilter(!editShowDealerFilter)}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium"
                >
                  {editShowDealerFilter ? '▼' : '▶'} Advanced Filters (Dealer)
                  {(editSelectedSoldDealers.length > 0 || editSelectedSvcDealers.length > 0) && (
                    <span className="ml-2 rounded-full bg-blue-100 text-blue-700 text-xs px-2 py-0.5">
                      {editSelectedSoldDealers.length + editSelectedSvcDealers.length} selected
                    </span>
                  )}
                </button>

                {editShowDealerFilter && (
                  <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-medium text-gray-600 uppercase">Sold By Dealer</label>
                        <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2">
                          {soldDealers.length === 0 ? (
                            <p className="text-xs text-gray-400 p-1">Loading dealers…</p>
                          ) : soldDealers.map(d => (
                            <label key={d} className="flex items-center gap-2 py-0.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editSelectedSoldDealers.includes(d)}
                                onChange={e => {
                                  if (e.target.checked) setEditSelectedSoldDealers([...editSelectedSoldDealers, d])
                                  else setEditSelectedSoldDealers(editSelectedSoldDealers.filter(x => x !== d))
                                }}
                                className="w-3.5 h-3.5 accent-blue-600"
                              />
                              <span className="text-sm">{d}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 uppercase">Last Serviced At</label>
                        <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2">
                          {serviceDealers.length === 0 ? (
                            <p className="text-xs text-gray-400 p-1">Loading dealers…</p>
                          ) : serviceDealers.map(d => (
                            <label key={d} className="flex items-center gap-2 py-0.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editSelectedSvcDealers.includes(d)}
                                onChange={e => {
                                  if (e.target.checked) setEditSelectedSvcDealers([...editSelectedSvcDealers, d])
                                  else setEditSelectedSvcDealers(editSelectedSvcDealers.filter(x => x !== d))
                                }}
                                className="w-3.5 h-3.5 accent-blue-600"
                              />
                              <span className="text-sm">{d}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    {(editSelectedSoldDealers.length > 0 || editSelectedSvcDealers.length > 0) && (
                      <button
                        type="button"
                        onClick={() => { setEditSelectedSoldDealers([]); setEditSelectedSvcDealers([]) }}
                        className="text-xs text-gray-500 hover:text-gray-700 font-semibold"
                      >Clear all filters</button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={handleEdit} disabled={editing} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{editing ? 'Saving…' : 'Save Changes'}</button>
              <button onClick={() => setEditingCampaign(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
