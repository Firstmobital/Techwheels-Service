import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseUrl } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Customer {
  id: number
  chassis_no: string | null
  vehicle_registration_number: string | null
  first_name: string | null
  last_name: string | null
  contact_phones: string | null
  model: string | null
  powertrain_type: string | null
  product_line: string | null
  assumed_next_service_date: string | null
  assumed_next_service_type: string | null
  scheduled_next_service_date: string | null
  scheduled_next_service_type: string | null
  last_service_date: string | null
  last_service_type: string | null
  last_service_km: string | null
  last_service_dealer: string | null
  sold_dealer: string | null
  extended_warranty_end_date: string | null
  extended_warranty_product: string | null
  extended_warranty_end_kms: string | null
  extended_warranty_policy_no: string | null
  extended_warranty_order_status: string | null
  last_insurance_expiry_date: string | null
  last_insurance_comapny: string | null
  last_insurance_policy_number: string | null
}

interface Assignment {
  id: number
  campaign_id: number
  status: string
  call_notes: string | null
  booking_date: string | null
  booking_time: string | null
  callback_date: string | null
  called_at: string | null
  call_count: number
  no_answer_count: number
  retry_after: string | null
  whatsapp_sent: boolean
  whatsapp_status: string | null
  assigned_at: string | null
  customer: Customer
}

interface Campaign {
  id: number
  campaign_name: string
  date_from: string
  date_to: string
  status: string
  total_leads: number
  pending_count: number
  in_progress_count: number
  out_of_window_count: number
  callback_later_count: number
  completed_count: number
  booked_count: number
  created_by: string | null
  created_at: string
  customer_segment?: string
  priority_mode?: string
  powertrain_filter?: string
}

interface DailySummary {
  total_calls: number
  booked: number
  no_answer: number
  not_interested: number
  callback_later: number
  wrong_number: number
  not_reachable: number
  already_serviced: number
  sold_vehicle: number
}

type CallStatus =
  | 'booked' | 'callback_later' | 'no_answer' | 'not_reachable'
  | 'wrong_number' | 'not_interested' | 'already_serviced' | 'sold_vehicle' | 'completed'

const EDGE_URL = `${supabaseUrl}/functions/v1/telecalling`

async function callEdge(action: string, body: Record<string, unknown> = {}) {
  const { data: session } = await supabase.auth.getSession()
  const token = session?.session?.access_token
  if (!token) throw new Error('Not authenticated')
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action, ...body }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Unknown error')
  return data
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return d }
}

function daysFromToday(d: string | null): number | null {
  if (!d) return null
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

function getWhatsAppLink(phone: string, message: string): string {
  const cleaned = phone.replace(/\D/g, '').slice(-10)
  return `https://wa.me/91${cleaned}?text=${encodeURIComponent(message)}`
}

function buildServiceReminderMsg(c: Customer): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
  return `Namaskar *${name}* ji! 🙏\n\nAapki *${c.model || ''}* (${c.vehicle_registration_number || ''}) ki next *${c.assumed_next_service_type || 'Service'}* *${formatDate(c.assumed_next_service_date)}* ko due hai.\n\nAbhi appointment book karein aur apni gaadi ko healthy rakhein! 🚗✨\n\n*Team Techwheels*`
}

function buildNoPickMsg(c: Customer): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
  return `Namaskar *${name}* ji! 🙏\n\nHumne aapko call kiya tha, par connect nahi ho paya.\n\nAapki *${c.model || ''}* (${c.vehicle_registration_number || ''}) ki service *${formatDate(c.assumed_next_service_date)}* ko due hai.\n\nKripya reply karein ya callback ka time batayein.\n\n*Team Techwheels* 🚗`
}

function buildBookingConfirmMsg(c: Customer, bDate: string, bTime: string, pickup: boolean): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
  const pickupLine = pickup ? '\n🚐 *Pickup:* Confirmed — driver samay par pahunchega.' : ''
  return `✅ *Booking Confirmed!*\n\nNamaskar *${name}* ji!\n\nAapki service booking confirmed hai:\n\n🚗 Vehicle: *${c.model || ''}* (${c.vehicle_registration_number || ''})\n📅 Date: *${formatDate(bDate)}*\n⏰ Time: *${bTime || 'As per schedule'}*\n🔧 Service: *${c.assumed_next_service_type || 'Service'}*${pickupLine}\n\nKoi bhi sawal ho toh call karein.\n\n*Team Techwheels* 🙏`
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  assigned: 'bg-blue-100 text-blue-700',
  calling: 'bg-blue-100 text-blue-700',
  booked: 'bg-green-100 text-green-700',
  callback_later: 'bg-purple-100 text-purple-700',
  no_answer: 'bg-orange-100 text-orange-700',
  not_reachable: 'bg-red-100 text-red-700',
  wrong_number: 'bg-red-100 text-red-700',
  not_interested: 'bg-gray-200 text-gray-600',
  already_serviced: 'bg-teal-100 text-teal-700',
  sold_vehicle: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>{label}</span>
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function TelecallingPage({ userRole }: { userRole?: string }) {
  const [role, setRole] = useState<string>(userRole || 'staff')
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
        const { data: camps } = await supabase.from('telecall_campaigns').select('*').order('created_at', { ascending: false })
        setCampaigns(camps || [])
        const active = camps?.find((c: Campaign) => c.status === 'active') || camps?.[0] || null
        setActiveCampaign(active)
      } catch (err) { console.error('Init error:', err) }
      finally { setLoading(false) }
    }
    init()
  }, [])

  const refreshCampaigns = useCallback(async () => {
    const { data: camps } = await supabase.from('telecall_campaigns').select('*').order('created_at', { ascending: false })
    setCampaigns(camps || [])
    const active = camps?.find((c: Campaign) => c.status === 'active') || camps?.[0] || null
    setActiveCampaign(active)
  }, [])

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="text-sm text-gray-400">Loading telecalling dashboard…</div>
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📞 Telecalling</h1>
          <p className="mt-1 text-sm text-gray-500">Service reminder calling team</p>
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
              <span className="text-green-600">✅ {activeCampaign.booked_count} booked</span>
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
  const [bookingConfirmation, setBookingConfirmation] = useState<{ id: number } | null>(null)
  // Queue search
  const [queueSearch, setQueueSearch] = useState('')
  // Call form
  const [notes, setNotes] = useState('')
  const [bookingDate, setBookingDate] = useState('')
  const [bookingTime, setBookingTime] = useState('')
  const [callbackDate, setCallbackDate] = useState('')
  const [pickupRequired, setPickupRequired] = useState(false)
  const [serviceCentre, setServiceCentre] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [altPhone, setAltPhone] = useState('')
  const [creName, setCreName] = useState('')
  const [driverName, setDriverName] = useState('')
  const [showBooking, setShowBooking] = useState(false)
  const [showCallback, setShowCallback] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  // CRE + driver users
  const [creUsers, setCreUsers] = useState<{ id: string; employee_name: string }[]>([])
  const [drivers, setDrivers] = useState<{ id: string; employee_name: string }[]>([])
  // Queue edit
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editBookingDate, setEditBookingDate] = useState('')
  const [editCallbackDate, setEditCallbackDate] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  const refreshQueue = useCallback(async () => {
    if (!activeCampaign) return
    try { const data = await callEdge('my_queue', { campaign_id: activeCampaign.id }); setQueue(data.queue || []) }
    catch (err) { console.error('Queue fetch error:', err) }
  }, [activeCampaign])

  const refreshSummary = useCallback(async () => {
    try { const data = await callEdge('my_summary', {}); setSummary(data.summary) }
    catch (err) { console.error('Summary fetch error:', err) }
  }, [])

  useEffect(() => { refreshQueue(); refreshSummary() }, [refreshQueue, refreshSummary])

  useEffect(() => {
    supabase.from('employee_master').select('id, employee_name').eq('role', 'CRE').order('employee_name')
      .then(({ data }) => { if (data) setCreUsers((data as { id: string; employee_name: string }[]).filter(u => u.employee_name)) })
    supabase.from('employee_master').select('id, employee_name').eq('role', 'DRIVER').order('employee_name')
      .then(({ data }) => { if (data) setDrivers((data as { id: string; employee_name: string }[]).filter(u => u.employee_name)) })
  }, [])

  const resetCallForm = () => {
    setNotes(''); setBookingDate(''); setBookingTime(''); setCallbackDate('')
    setPickupRequired(false); setServiceCentre(''); setPickupAddress('')
    setAltPhone(''); setCreName(''); setDriverName('')
    setShowBooking(false); setShowCallback(false); setShowNotes(false)
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

  const handleUpdateStatus = async (status: CallStatus) => {
    if (!currentAssignment || !activeCampaign) return
    setBusy(true); setError(null)
    try {
      const result = await callEdge('update_status', {
        assignment_id: currentAssignment.id,
        campaign_id: activeCampaign.id,
        status,
        call_notes: notes || undefined,
        booking_date: status === 'booked' ? bookingDate : undefined,
        booking_time: status === 'booked' ? bookingTime : undefined,
        callback_date: status === 'callback_later' ? callbackDate : undefined,
        pickup_required: status === 'booked' ? pickupRequired : undefined,
        service_centre: status === 'booked' ? serviceCentre : undefined,
        pickup_address: status === 'booked' && pickupRequired ? pickupAddress : undefined,
        alt_phone: status === 'booked' && altPhone ? altPhone : undefined,
        cre_name: status === 'booked' && creName ? creName : undefined,
        driver_name: status === 'booked' && pickupRequired && driverName ? driverName : undefined,
      })
      if (result?.service_booking_created && result?.service_booking_id) {
        setBookingConfirmation({ id: result.service_booking_id })
        setTimeout(() => setBookingConfirmation(null), 6000)
      }
      if (result?.retry_queued) {
        setError('📵 No answer — lead will return to queue tomorrow (attempt ' + (result?.no_answer_count ?? '') + '/3)')
        setTimeout(() => setError(null), 4000)
      }
      setCurrentAssignment(null); resetCallForm()
      refreshQueue(); refreshSummary()
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  const handleEditSave = async (assignmentId: number) => {
    setEditBusy(true)
    try {
      await callEdge('edit_assignment', { assignment_id: assignmentId, call_notes: editNotes, booking_date: editBookingDate || undefined, callback_date: editCallbackDate || undefined, status: editStatus || undefined })
      setEditingId(null); refreshQueue()
    } catch (err) { setError((err as Error).message) }
    finally { setEditBusy(false) }
  }

  const handleLogWA = async (assignmentId: number, waType: string) => {
    try { await callEdge('log_whatsapp', { assignment_id: assignmentId, wa_type: waType }) }
    catch (err) { console.error('WA log error:', err) }
  }

  if (!activeCampaign) return (
    <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
      <div className="text-4xl mb-3">📞</div>
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

      {bookingConfirmation && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-start gap-3 shadow-sm">
          <span className="text-xl">✅</span>
          <div className="flex-1">
            <div className="font-semibold text-green-800 text-sm">Service Booking Created Automatically</div>
            <div className="text-xs text-green-700 mt-0.5">Booking #{bookingConfirmation.id} is live in <a href="/service-booking" className="underline font-semibold">Service Booking →</a></div>
          </div>
          <button onClick={() => setBookingConfirmation(null)} className="text-green-500 hover:text-green-700 text-lg">✕</button>
        </div>
      )}

      {/* ── CALL VIEW ──────────────────────────────────────────────────────── */}
      {activeView === 'call' && (
        !currentAssignment ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
            <div className="text-5xl mb-4">🎯</div>
            <h2 className="text-lg font-semibold text-gray-900">Ready to call?</h2>
            <p className="mt-2 text-sm text-gray-500">Click below to get the next customer who needs a service reminder.</p>
            <button onClick={handleGetNext} disabled={busy} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-lg hover:bg-blue-700 disabled:opacity-50">
              {busy ? (<><svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Getting next…</>) : <>📞 Get Next Customer</>}
            </button>
          </div>
        ) : (
          <CallCard
            assignment={currentAssignment}
            busy={busy}
            notes={notes} setNotes={setNotes}
            showNotes={showNotes} setShowNotes={setShowNotes}
            bookingDate={bookingDate} setBookingDate={setBookingDate}
            bookingTime={bookingTime} setBookingTime={setBookingTime}
            callbackDate={callbackDate} setCallbackDate={setCallbackDate}
            pickupRequired={pickupRequired} setPickupRequired={setPickupRequired}
            serviceCentre={serviceCentre} setServiceCentre={setServiceCentre}
            pickupAddress={pickupAddress} setPickupAddress={setPickupAddress}
            altPhone={altPhone} setAltPhone={setAltPhone}
            creName={creName} setCreName={setCreName}
            driverName={driverName} setDriverName={setDriverName}
            creUsers={creUsers} drivers={drivers}
            showBooking={showBooking} setShowBooking={setShowBooking}
            showCallback={showCallback} setShowCallback={setShowCallback}
            onUpdateStatus={handleUpdateStatus}
            onLogWA={handleLogWA}
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
                  <div className="text-sm text-gray-500 mt-0.5">📱 {asgn.customer.contact_phones} · 🚗 {asgn.customer.model} · {asgn.customer.vehicle_registration_number || '—'}</div>
                  <div className="text-xs text-gray-400 mt-0.5">🔧 {asgn.customer.assumed_next_service_type || '—'} due {formatDate(asgn.customer.assumed_next_service_date)}</div>
                  {asgn.status === 'callback_later' && asgn.callback_date && <div className="mt-1 text-xs text-purple-600">📅 Callback on {formatDate(asgn.callback_date)}</div>}
                  {asgn.status === 'booked' && asgn.booking_date && <div className="mt-1 text-xs text-green-600">✅ Booked for {formatDate(asgn.booking_date)}{asgn.booking_time ? ` at ${asgn.booking_time}` : ''}</div>}
                  {asgn.call_notes && editingId !== asgn.id && <div className="mt-1 rounded bg-gray-50 px-3 py-1.5 text-xs text-gray-600">📝 {asgn.call_notes}</div>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                  <StatusBadge status={asgn.status} />
                  <button onClick={() => { setEditingId(asgn.id); setEditNotes(asgn.call_notes || ''); setEditBookingDate(asgn.booking_date || ''); setEditCallbackDate(asgn.callback_date || ''); setEditStatus(asgn.status) }} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50">✏️ Edit</button>
                  {asgn.status === 'no_answer' && asgn.customer.contact_phones && (
                    <a href={getWhatsAppLink(asgn.customer.contact_phones, buildNoPickMsg(asgn.customer))} target="_blank" rel="noreferrer" onClick={() => handleLogWA(asgn.id, 'not_picked')} className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-700 hover:bg-green-100">💬 WA</a>
                  )}
                  {asgn.status === 'booked' && asgn.customer.contact_phones && (
                    <a href={getWhatsAppLink(asgn.customer.contact_phones, buildBookingConfirmMsg(asgn.customer, asgn.booking_date || '', asgn.booking_time || '', false))} target="_blank" rel="noreferrer" onClick={() => handleLogWA(asgn.id, 'booking_confirmation')} className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-700 hover:bg-green-100">💬 Confirm WA</a>
                  )}
                </div>
              </div>

              {editingId === asgn.id && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
                  <div className="text-xs font-semibold text-blue-700">Edit Assignment</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600">Status</label>
                      <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm bg-white">
                        <option value="assigned">Assigned</option>
                        <option value="booked">Booked</option>
                        <option value="callback_later">Callback Later</option>
                        <option value="no_answer">No Answer</option>
                        <option value="not_reachable">Not Reachable</option>
                        <option value="wrong_number">Wrong Number</option>
                        <option value="not_interested">Not Interested</option>
                        <option value="already_serviced">Already Serviced</option>
                        <option value="sold_vehicle">Sold Vehicle</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Booking Date</label>
                      <input type="date" value={editBookingDate} onChange={e => setEditBookingDate(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" />
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
                    <button onClick={() => setEditingId(null)} className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
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
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          <SummaryCard label="Total Calls" value={summary.total_calls} color="blue" icon="📞" />
          <SummaryCard label="Booked" value={summary.booked} color="green" icon="✅" />
          <SummaryCard label="No Answer" value={summary.no_answer} color="orange" icon="📵" />
          <SummaryCard label="Callback" value={summary.callback_later} color="purple" icon="🔁" />
          <SummaryCard label="Not Interested" value={summary.not_interested} color="gray" icon="😐" />
          <SummaryCard label="Not Reachable" value={summary.not_reachable} color="red" icon="🚫" />
          <SummaryCard label="Wrong Number" value={summary.wrong_number} color="red" icon="⚠️" />
          <SummaryCard label="Already Serviced" value={summary.already_serviced} color="teal" icon="🔧" />
          <SummaryCard label="Sold Vehicle" value={summary.sold_vehicle} color="yellow" icon="🚗" />
        </div>
      )}
    </div>
  )
}

// ── Call Card ───────────────────────────────────────────────────────────────────
function CallCard({
  assignment, busy,
  notes, setNotes, showNotes, setShowNotes,
  bookingDate, setBookingDate, bookingTime, setBookingTime,
  callbackDate, setCallbackDate,
  pickupRequired, setPickupRequired,
  serviceCentre, setServiceCentre,
  pickupAddress, setPickupAddress,
  altPhone, setAltPhone,
  creName, setCreName,
  driverName, setDriverName,
  creUsers, drivers,
  showBooking, setShowBooking,
  showCallback, setShowCallback,
  onUpdateStatus, onLogWA,
}: {
  assignment: Assignment; busy: boolean
  notes: string; setNotes: (v: string) => void
  showNotes: boolean; setShowNotes: (v: boolean) => void
  bookingDate: string; setBookingDate: (v: string) => void
  bookingTime: string; setBookingTime: (v: string) => void
  callbackDate: string; setCallbackDate: (v: string) => void
  pickupRequired: boolean; setPickupRequired: (v: boolean) => void
  serviceCentre: string; setServiceCentre: (v: string) => void
  pickupAddress: string; setPickupAddress: (v: string) => void
  altPhone: string; setAltPhone: (v: string) => void
  creName: string; setCreName: (v: string) => void
  driverName: string; setDriverName: (v: string) => void
  creUsers: { id: string; employee_name: string }[]
  drivers: { id: string; employee_name: string }[]
  showBooking: boolean; setShowBooking: (v: boolean) => void
  showCallback: boolean; setShowCallback: (v: boolean) => void
  onUpdateStatus: (s: CallStatus) => void
  onLogWA: (id: number, type: string) => void
}) {
  const c = assignment.customer
  const phone = c.contact_phones || ''
  const daysLeft = daysFromToday(c.assumed_next_service_date)
  const isOverdue = daysLeft !== null && daysLeft < 0
  const isDueToday = daysLeft === 0
  const ewExpired = c.extended_warranty_end_date ? new Date(c.extended_warranty_end_date) < new Date() : false
  const insExpired = c.last_insurance_expiry_date ? new Date(c.last_insurance_expiry_date) < new Date() : false

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className={`px-6 py-4 text-white ${isOverdue ? 'bg-gradient-to-r from-red-600 to-red-700' : isDueToday ? 'bg-gradient-to-r from-orange-500 to-orange-600' : 'bg-gradient-to-r from-blue-600 to-blue-700'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{c.first_name} {c.last_name || ''}</h2>
            <p className="text-sm opacity-90 mt-0.5">🚗 {c.model} · {c.powertrain_type || 'N/A'} · {c.product_line || '—'}</p>
            {c.chassis_no && <p className="text-xs opacity-70 mt-0.5">Chassis: {c.chassis_no}</p>}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {c.vehicle_registration_number && <div className="rounded-lg bg-white/20 px-3 py-1 text-sm font-medium">{c.vehicle_registration_number}</div>}
            {isOverdue && <div className="rounded-full bg-red-900/40 px-2 py-0.5 text-xs font-semibold">⚠️ {Math.abs(daysLeft!)}d overdue</div>}
            {isDueToday && <div className="rounded-full bg-orange-900/30 px-2 py-0.5 text-xs font-semibold">⚡ Due Today</div>}
            {!isOverdue && !isDueToday && daysLeft !== null && <div className="rounded-full bg-white/20 px-2 py-0.5 text-xs">Due in {daysLeft}d</div>}
          </div>
        </div>
      </div>

      {/* Call + WhatsApp */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap gap-3">
        <a href={`tel:${phone}`} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 px-6 py-3 text-base font-semibold text-white hover:bg-green-600 min-w-0">
          📞 Call {phone}
        </a>
        <a href={getWhatsAppLink(phone, buildServiceReminderMsg(c))} target="_blank" rel="noreferrer" onClick={() => onLogWA(assignment.id, 'service_reminder')} className="flex items-center gap-1.5 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 hover:bg-green-100">
          💬 WA Reminder
        </a>
        <a href={getWhatsAppLink(phone, buildNoPickMsg(c))} target="_blank" rel="noreferrer" onClick={() => onLogWA(assignment.id, 'not_picked')} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">
          📵 WA No-Pick
        </a>
      </div>

      {/* Alert banners */}
      {(ewExpired || insExpired) && (
        <div className="px-6 py-2 bg-amber-50 border-b border-amber-100 flex flex-wrap gap-4">
          {ewExpired && <span className="text-xs text-amber-700 font-medium">⚠️ Extended Warranty Expired ({formatDate(c.extended_warranty_end_date)})</span>}
          {insExpired && <span className="text-xs text-red-700 font-medium">🚨 Insurance Expired ({formatDate(c.last_insurance_expiry_date)})</span>}
        </div>
      )}

      {/* Detail grid */}
      <div className="grid grid-cols-2 gap-px bg-gray-100">
        <DetailRow label="Service Due (Assumed)" value={formatDate(c.assumed_next_service_date)} highlight={isOverdue ? 'red' : isDueToday ? 'orange' : undefined} />
        <DetailRow label="Assumed Service Type" value={c.assumed_next_service_type || '—'} />
        <DetailRow label="Scheduled Next Service" value={formatDate(c.scheduled_next_service_date)} />
        <DetailRow label="Scheduled Service Type" value={c.scheduled_next_service_type || '—'} />
        <DetailRow label="Last Service Date" value={formatDate(c.last_service_date)} />
        <DetailRow label="Last Service Type" value={c.last_service_type || '—'} />
        <DetailRow label="Last Service KM" value={c.last_service_km ? `${c.last_service_km} km` : '—'} />
        <DetailRow label="Last Service Dealer" value={c.last_service_dealer || '—'} />
        <DetailRow label="Sold By" value={c.sold_dealer || '—'} />
        <DetailRow label="EW Product" value={c.extended_warranty_product || '—'} />
        <DetailRow label="EW Expiry" value={formatDate(c.extended_warranty_end_date)} highlight={ewExpired ? 'red' : undefined} />
        <DetailRow label="EW Policy No." value={c.extended_warranty_policy_no || '—'} />
        <DetailRow label="EW Status" value={c.extended_warranty_order_status || '—'} />
        <DetailRow label="Insurance Expiry" value={formatDate(c.last_insurance_expiry_date)} highlight={insExpired ? 'red' : undefined} />
        <DetailRow label="Insurance Company" value={c.last_insurance_comapny || '—'} />
        <DetailRow label="Insurance Policy" value={c.last_insurance_policy_number || '—'} />
      </div>

      {/* Previous call info */}
      {assignment.call_count > 0 && (
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-700">
          {assignment.retry_after ? `🔁 Retry attempt ${assignment.no_answer_count}/3 — did not answer previously` : `⚠️ Called ${assignment.call_count} time(s).`}{assignment.no_answer_count > 0 && !assignment.retry_after ? ` (${assignment.no_answer_count} no-answers — 3rd marks unreachable)` : ''}
          {assignment.call_notes && <div className="mt-1 text-xs">Last note: {assignment.call_notes}</div>}
          {assignment.whatsapp_sent && <div className="mt-1 text-xs text-green-700">✓ WhatsApp sent ({assignment.whatsapp_status || 'sent'})</div>}
        </div>
      )}

      {/* Action buttons */}
      <div className="px-6 py-4 space-y-4">
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          <button onClick={() => { setShowBooking(true); setShowNotes(true) }} disabled={busy} className="rounded-xl bg-green-500 px-4 py-3 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50">✅ Booked</button>
          <button onClick={() => { setShowCallback(true); setShowNotes(true) }} disabled={busy} className="rounded-xl bg-purple-500 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-600 disabled:opacity-50">🔁 Callback Later</button>
          <button onClick={() => onUpdateStatus('no_answer')} disabled={busy} className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">📵 No Answer</button>
          <button onClick={() => onUpdateStatus('not_reachable')} disabled={busy} className="rounded-xl bg-red-400 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">🚫 Not Reachable</button>
          <button onClick={() => { setShowNotes(true); onUpdateStatus('wrong_number') }} disabled={busy} className="rounded-xl bg-red-400 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">⚠️ Wrong Number</button>
          <button onClick={() => { setShowNotes(true); onUpdateStatus('not_interested') }} disabled={busy} className="rounded-xl bg-gray-400 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-500 disabled:opacity-50">😐 Not Interested</button>
          <button onClick={() => { setShowNotes(true); onUpdateStatus('already_serviced') }} disabled={busy} className="rounded-xl bg-teal-500 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50">🔧 Already Serviced</button>
          <button onClick={() => { setShowNotes(true); onUpdateStatus('sold_vehicle') }} disabled={busy} className="rounded-xl bg-yellow-500 px-4 py-3 text-sm font-semibold text-white hover:bg-yellow-600 disabled:opacity-50">🚗 Sold Vehicle</button>
        </div>

        {showNotes && (
          <div>
            <label className="text-xs font-medium text-gray-600">Remarks / Call Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What did the customer say?" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} />
          </div>
        )}

        {showBooking && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
            <div className="text-sm font-semibold text-green-800">📅 Booking Details</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Visit Date *</label>
                <input type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Visit Time</label>
                <input type="time" value={bookingTime} onChange={e => setBookingTime(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Service Centre</label>
                <select value={serviceCentre} onChange={e => setServiceCentre(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm bg-white">
                  <option value="">-- Select Centre --</option>
                  <option value="Techwheels Jaipur">Techwheels Jaipur</option>
                  <option value="Techwheels Ajmer">Techwheels Ajmer</option>
                  <option value="Techwheels Bhilwara">Techwheels Bhilwara</option>
                  <option value="Techwheels Kota">Techwheels Kota</option>
                  <option value="Techwheels Udaipur">Techwheels Udaipur</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="pickup_chk" checked={pickupRequired} onChange={e => setPickupRequired(e.target.checked)} className="rounded border-gray-300" />
                <label htmlFor="pickup_chk" className="text-sm font-medium text-gray-700">🚐 Pickup Required</label>
              </div>
            </div>
            {pickupRequired && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600">Pickup Address</label>
                  <input type="text" value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} placeholder="Customer pickup address…" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Driver Name</label>
                  <select value={driverName} onChange={e => setDriverName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm bg-white">
                    <option value="">Select driver…</option>
                    {drivers.map(d => <option key={d.id} value={d.employee_name}>{d.employee_name}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Alt Phone</label>
                <input type="text" inputMode="numeric" value={altPhone} onChange={e => setAltPhone(e.target.value)} placeholder="Alternative number…" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">CRE Name</label>
                <select value={creName} onChange={e => setCreName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm bg-white">
                  <option value="">Select CRE…</option>
                  {creUsers.map(u => <option key={u.id} value={u.employee_name}>{u.employee_name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => onUpdateStatus('booked')} disabled={busy || !bookingDate} className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                {busy ? 'Confirming…' : '✅ Confirm Booking'}
              </button>
              {bookingDate && phone && (
                <a href={getWhatsAppLink(phone, buildBookingConfirmMsg(c, bookingDate, bookingTime, pickupRequired))} target="_blank" rel="noreferrer" onClick={() => onLogWA(assignment.id, 'booking_confirmation')} className="flex items-center gap-1.5 rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50">
                  💬 Send Confirmation WA
                </a>
              )}
            </div>
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
  const [activeAdminTab, setActiveAdminTab] = useState<'campaigns' | 'performance' | 'bookings' | 'overdue'>('campaigns')
  const [showCreate, setShowCreate] = useState(false)
  const [showServiceInfo, setShowServiceInfo] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [editName, setEditName] = useState('')
  const [editDateFrom, setEditDateFrom] = useState('')
  const [editDateTo, setEditDateTo] = useState('')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [segment, setSegment] = useState('all')
  const [priorityMode, setPriorityMode] = useState('service_date')
  const [powertrainFilter, setPowertrainFilter] = useState('all')
  const [warrantyDays, setWarrantyDays] = useState(90)
  const [previewCounts, setPreviewCounts] = useState<any>(null)
  const [previewing, setPreviewing] = useState(false)
  const [campaignName, setCampaignName] = useState('')
  const [upcomingDays, setUpcomingDays] = useState<number>(20)
  const [customUpcomingDays, setCustomUpcomingDays] = useState<number>(20)
  const [useCustomDays, setUseCustomDays] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [agentStats, setAgentStats] = useState<any[]>([])
  const [refreshingCampaign, setRefreshingCampaign] = useState(false)
  const [refreshResult, setRefreshResult] = useState<string | null>(null)
  const [statsDateFrom, setStatsDateFrom] = useState('')
  const [statsDateTo, setStatsDateTo] = useState('')
  const [bookings, setBookings] = useState<any[]>([])
  const [overdueList, setOverdueList] = useState<any[]>([])
  const [loadingTab, setLoadingTab] = useState(false)

  useEffect(() => {
    // dateFrom/dateTo only needed for warranty/insurance modes
    if (!dateFrom) {
      const today = new Date(); const plus90 = new Date(); plus90.setDate(plus90.getDate() + 90)
      setDateFrom(today.toISOString().split('T')[0]); setDateTo(plus90.toISOString().split('T')[0])
    }
  }, [])

  useEffect(() => {
    if (activeAdminTab === 'performance') fetchAgentStats()
    else if (activeAdminTab === 'bookings') fetchBookings()
    else if (activeAdminTab === 'overdue') fetchOverdue()
  }, [activeAdminTab, activeCampaign, statsDateFrom, statsDateTo])

  async function fetchAgentStats() {
    setLoadingTab(true)
    try {
      const d = await callEdge('admin_stats', {
        campaign_id: activeCampaign?.id,
        date_from: statsDateFrom || undefined,
        date_to: statsDateTo || undefined,
      })
      setAgentStats(d.agent_stats || [])
    }
    catch (e) { console.error(e) } finally { setLoadingTab(false) }
  }

  async function refreshCampaignNow() {
    setRefreshingCampaign(true)
    setRefreshResult(null)
    try {
      const d = await callEdge('refresh_campaign', { campaign_id: activeCampaign?.id })
      const r = (d.refreshed || [])[0]
      if (r) {
        setRefreshResult(`✅ Refreshed "${r.campaign_name}" — window now ${r.window}. Added ${r.added} new leads, retired ${r.retired_out_of_window} out-of-window. Pending: ${r.pending_count}, Total: ${r.total_leads}.`)
      } else {
        setRefreshResult('No active service-date campaigns to refresh.')
      }
      await onRefresh()
    } catch (e: any) {
      setRefreshResult(`❌ Refresh failed: ${e.message}`)
    } finally {
      setRefreshingCampaign(false)
    }
  }

  function setStatsToday() {
    const today = new Date().toISOString().split('T')[0]
    setStatsDateFrom(today); setStatsDateTo(today)
  }

  function clearStatsRange() {
    setStatsDateFrom(''); setStatsDateTo('')
  }

  async function fetchBookings() {
    setLoadingTab(true)
    try { const d = await callEdge('booking_list', { campaign_id: activeCampaign?.id }); setBookings(d.bookings || []) }
    catch (e) { console.error(e) } finally { setLoadingTab(false) }
  }

  async function fetchOverdue() {
    setLoadingTab(true)
    try { const d = await callEdge('overdue_list', {}); setOverdueList(d.overdue || []) }
    catch (e) { console.error(e) } finally { setLoadingTab(false) }
  }

  async function handlePreview() {
    setPreviewing(true); setPreviewCounts(null)
    const effectiveDays = useCustomDays ? customUpcomingDays : upcomingDays
    const isServiceMode = priorityMode === 'service_date' || !priorityMode
    const computedFrom = new Date().toISOString().split('T')[0]
    const computedTo = new Date(Date.now() + effectiveDays * 86400000).toISOString().split('T')[0]
    const previewBody = isServiceMode
      ? { upcoming_days: effectiveDays, date_from: computedFrom, date_to: computedTo, customer_segment: segment, priority_mode: priorityMode, warranty_expiry_days: segment === 'warranty_expiring' ? warrantyDays : null, powertrain_filter: powertrainFilter !== 'all' ? powertrainFilter : null }
      : { date_from: dateFrom, date_to: dateTo, customer_segment: segment, priority_mode: priorityMode, warranty_expiry_days: segment === 'warranty_expiring' ? warrantyDays : null, powertrain_filter: powertrainFilter !== 'all' ? powertrainFilter : null }
    try { const d = await callEdge('preview_campaign', previewBody); setPreviewCounts(d) }
    catch (err) { setError((err as Error).message) } finally { setPreviewing(false) }
  }

  async function handleCreate() {
    if (!campaignName) { setError('Please fill campaign name'); return }
    const effectiveDays = useCustomDays ? customUpcomingDays : upcomingDays
    const isServiceMode = priorityMode === 'service_date' || !priorityMode
    if (!isServiceMode && (!dateFrom || !dateTo)) { setError('Please fill date range for this campaign type'); return }
    setCreating(true); setError(null)
    try {
      // Always compute date_from/date_to from upcoming_days for service mode.
      // We send BOTH upcoming_days (new edge) AND date_from/date_to (old edge fallback)
      // so it works regardless of which edge function version is live in Supabase.
      const computedFrom = new Date().toISOString().split('T')[0]
      const computedTo = new Date(Date.now() + effectiveDays * 86400000).toISOString().split('T')[0]
      const createBody = isServiceMode
        ? { campaign_name: campaignName, upcoming_days: effectiveDays, date_from: computedFrom, date_to: computedTo, customer_segment: segment, priority_mode: priorityMode, warranty_expiry_days: segment === 'warranty_expiring' ? warrantyDays : null, powertrain_filter: powertrainFilter !== 'all' ? powertrainFilter : null }
        : { campaign_name: campaignName, date_from: dateFrom, date_to: dateTo, customer_segment: segment, priority_mode: priorityMode, warranty_expiry_days: segment === 'warranty_expiring' ? warrantyDays : null, powertrain_filter: powertrainFilter !== 'all' ? powertrainFilter : null }
      const data = await callEdge('create_campaign', createBody)
      if (data.total_leads === 0) { setError(`No eligible customers found. Date range checked: ${computedFrom} → ${computedTo}`); return }
      const statsInfo = data.stats ? ` (${data.stats.raw_from_db} found → ${data.stats.after_chassis_dedup} unique → ${data.stats.after_segment_filter} added, range: ${data.stats.date_from} to ${data.stats.date_to})` : ''
      setSuccess(`Campaign created with ${data.total_leads} leads!${statsInfo}`)
      setShowCreate(false); setCampaignName(''); setPreviewCounts(null); setSegment('all'); setPriorityMode('service_date'); setPowertrainFilter('all'); setUseCustomDays(false); setUpcomingDays(20); onRefresh()
    } catch (err) { setError((err as Error).message) } finally { setCreating(false) }
  }

  async function handleClose(id: number) {
    if (!confirm('Close this campaign?')) return
    try { await callEdge('close_campaign', { campaign_id: id }); onRefresh() }
    catch (err) { setError((err as Error).message) }
  }

  async function handleEdit() {
    if (!editingCampaign || !editName || !editDateFrom || !editDateTo) return
    setEditing(true); setError(null)
    try { await callEdge('update_campaign', { campaign_id: editingCampaign.id, campaign_name: editName, date_from: editDateFrom, date_to: editDateTo }); setSuccess('Campaign updated!'); setEditingCampaign(null); onRefresh() }
    catch (err) { setError((err as Error).message) } finally { setEditing(false) }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete campaign "${name}"? All leads and call records will be permanently removed.`)) return
    setDeleting(id); setError(null)
    try { await callEdge('delete_campaign', { campaign_id: id }); setSuccess('Campaign deleted.'); onRefresh() }
    catch (err) { setError((err as Error).message) } finally { setDeleting(null) }
  }

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <div className="flex gap-2 flex-wrap">
        {(['campaigns', 'performance', 'bookings', 'overdue'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveAdminTab(tab)} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeAdminTab === tab ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {tab === 'campaigns' ? '📋 Campaigns' : tab === 'performance' ? '📊 Performance' : tab === 'bookings' ? '✅ Bookings' : '⚠️ Overdue'}
          </button>
        ))}
      </div>

      {/* ── Campaigns Tab ──────────────────────────────────────────────── */}
      {activeAdminTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Campaigns</h2>
              <button onClick={() => setShowServiceInfo(!showServiceInfo)} className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 border border-gray-300 text-gray-500 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600 text-xs font-bold">i</button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={refreshCampaignNow} disabled={refreshingCampaign} className="rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50">
                {refreshingCampaign ? '↻ Refreshing…' : '↻ Refresh Now'}
              </button>
              <button onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">+ New Campaign</button>
            </div>
          </div>
          {refreshResult && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700 flex items-center justify-between">
              <span>{refreshResult}</span>
              <button onClick={() => setRefreshResult(null)} className="text-gray-400 hover:text-gray-600 ml-3">×</button>
            </div>
          )}

          {showServiceInfo && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm relative">
              <button onClick={() => setShowServiceInfo(false)} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-lg">×</button>
              <h4 className="font-semibold text-blue-900 mb-2">ℹ️ How is Assumed Next Service Date calculated?</h4>
              <div className="grid gap-2 sm:grid-cols-3">
                {[['New Vehicle / No History', '+60 days'], ['First Free Service', '+120 days'], ['All Other Services', '+180 days']].map(([lbl, val]) => (
                  <div key={lbl} className="rounded-lg bg-white border border-blue-100 px-3 py-2">
                    <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">{lbl}</div>
                    <div className="text-xl font-bold text-blue-900">{val}</div>
                    <div className="text-xs text-blue-600 mt-0.5">from last service date</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showCreate && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="font-medium text-gray-900">Create New Campaign</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-gray-700">Campaign Name</label>
                  <input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="e.g. July Service Reminders" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </div>
                {/* Service due window — shown for service_date mode */}
                {(priorityMode === 'service_date' || !priorityMode) && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Service Due Window</label>
                    <div className="mt-1 flex gap-2">
                      <select
                        value={useCustomDays ? 'custom' : String(upcomingDays)}
                        onChange={e => {
                          if (e.target.value === 'custom') { setUseCustomDays(true) }
                          else { setUseCustomDays(false); setUpcomingDays(Number(e.target.value)) }
                        }}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      >
                        <option value="15">Next 15 days</option>
                        <option value="20">Next 20 days</option>
                        <option value="30">Next 30 days</option>
                        <option value="45">Next 45 days</option>
                        <option value="60">Next 60 days</option>
                        <option value="custom">Custom…</option>
                      </select>
                      {useCustomDays && (
                        <input
                          type="number"
                          min={1} max={365}
                          value={customUpcomingDays}
                          onChange={e => setCustomUpcomingDays(Number(e.target.value))}
                          className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          placeholder="Days"
                        />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      From today: customers due between{' '}
                      <span className="font-medium text-gray-600">
                        {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>{' '}→{' '}
                      <span className="font-medium text-gray-600">
                        {new Date(Date.now() + (useCustomDays ? customUpcomingDays : upcomingDays) * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </p>
                  </div>
                )}
              </div>
              {/* Date pickers for warranty/insurance modes only */}
              {priorityMode !== 'service_date' && priorityMode && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-gray-700">From Date</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">To Date</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Customer Segment</label>
                  <select value={segment} onChange={e => setSegment(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <option value="all">All Customers</option>
                    <option value="sold_us">Sold by Techwheels</option>
                    <option value="sold_others">Sold by Others (Conquest)</option>
                    <option value="last_svc_us">Last Serviced at Techwheels</option>
                    <option value="last_svc_others">Last Serviced Elsewhere</option>
                    <option value="warranty_expiring">Warranty Expiring Soon</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Call Priority</label>
                  <select value={priorityMode} onChange={e => setPriorityMode(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <option value="service_date">By Service Due Date</option>
                    <option value="warranty_expiry">By Warranty Expiry</option>
                    <option value="conquest">Conquest First</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Vehicle Type</label>
                  <select value={powertrainFilter} onChange={e => setPowertrainFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <option value="all">All (EV + PV)</option>
                    <option value="EV">EV Only</option>
                    <option value="PV">PV Only</option>
                  </select>
                </div>
                {segment === 'warranty_expiring' && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Warranty within (days)</label>
                    <input type="number" value={warrantyDays} onChange={e => setWarrantyDays(Number(e.target.value))} min={7} max={365} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
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
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-blue-900">Preview — <span className="text-blue-700">{previewCounts.filtered_count} customers</span></p>
                    <div className="text-right">
                      <p className="text-xs text-blue-600">Total in range: {previewCounts.counts?.total}</p>
                      {previewCounts.date_from && <p className="text-xs text-blue-500">{previewCounts.date_from} → {previewCounts.date_to}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[['🏆 Loyal', previewCounts.counts?.retain_loyal ?? 0, 'Sold + Svc us'], ['⚠️ At Risk', previewCounts.counts?.retain_atrisk ?? 0, 'Sold us, svc elsewhere'], ['💙 Svc Loyal', previewCounts.counts?.retain_service_loyal ?? 0, 'Sold others, svc us'], ['🎯 Conquest', previewCounts.counts?.conquest ?? 0, 'Sold + svc elsewhere']].map(([lbl, val, sub]) => (
                      <div key={String(lbl)} className="rounded-lg bg-white border border-blue-100 px-3 py-2 text-center">
                        <div className="text-xs text-gray-600 font-medium">{lbl}</div>
                        <div className="text-2xl font-bold text-gray-900">{val}</div>
                        <div className="text-xs text-gray-500">{sub}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-3 text-xs text-gray-500">
                    <span>⚡ EV: {previewCounts.counts?.ev ?? 0}</span>
                    <span>🚗 PV: {previewCounts.counts?.pv ?? 0}</span>
                    {(previewCounts.counts?.warranty_soon ?? 0) > 0 && <span className="text-amber-700">🔔 {previewCounts.counts?.warranty_soon} warranty expiring soon</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {campaigns.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">No campaigns yet. Click &quot;New Campaign&quot; to create one.</div>
            ) : campaigns.map(c => (
              <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{c.campaign_name}</h3>
                      <StatusBadge status={c.status} />
                      {c.powertrain_filter && c.powertrain_filter !== 'all' && <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs text-blue-700">{c.powertrain_filter}</span>}
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {(c as any).upcoming_days
                        ? <span>Next <strong>{(c as any).upcoming_days} days</strong> from creation · {formatDate(c.date_from)} → {formatDate(c.date_to)}</span>
                        : <span>{formatDate(c.date_from)} → {formatDate(c.date_to)}</span>
                      }
                      {' · by '}{c.created_by || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {c.status === 'active' && <button onClick={() => handleClose(c.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">Close</button>}
                    <button onClick={() => { setEditingCampaign(c); setEditName(c.campaign_name); setEditDateFrom(c.date_from); setEditDateTo(c.date_to) }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">✏️ Edit</button>
                    <button onClick={() => handleDelete(c.id, c.campaign_name)} disabled={deleting === c.id} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">{deleting === c.id ? 'Deleting…' : '🗑️'}</button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-7 gap-3">
                  {[['Total', c.total_leads, 'bg-gray-50 text-gray-500'], ['Pending', c.pending_count, 'bg-orange-50 text-orange-600'], ['In Progress', c.in_progress_count, 'bg-blue-50 text-blue-500'], ['Callback Later', c.callback_later_count, 'bg-purple-50 text-purple-500'], ['Booked', c.booked_count, 'bg-green-50 text-green-600'], ['Completed', c.completed_count, 'bg-blue-50 text-blue-600'], ['Out of Window', c.out_of_window_count, 'bg-gray-50 text-gray-400']].map(([lbl, val, cls]) => (
                    <div key={String(lbl)} className={`rounded-lg px-3 py-2 ${cls}`}>
                      <div className="text-xs">{lbl}</div>
                      <div className="text-xl font-bold text-gray-900">{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Performance Tab ─────────────────────────────────────────────── */}
      {activeAdminTab === 'performance' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={statsDateFrom}
                onChange={e => setStatsDateFrom(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={statsDateTo}
                onChange={e => setStatsDateTo(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
              />
            </div>
            <button onClick={setStatsToday} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
              Today's Calls
            </button>
            {(statsDateFrom || statsDateTo) && (
              <button onClick={clearStatsRange} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                Clear (All Time)
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {statsDateFrom || statsDateTo
                ? `Showing calls ${statsDateFrom ? formatDate(statsDateFrom) : '…'} → ${statsDateTo ? formatDate(statsDateTo) : '…'}`
                : 'Showing all-time performance'}
            </span>
          </div>

          {agentStats.length > 0 && (() => {
            const totals = agentStats.reduce((acc: any, a: any) => ({
              calls: acc.calls + (a.calls_made || 0),
              connected: acc.connected + (a.calls_connected || 0),
              booked: acc.booked + (a.booked || 0),
              no_answer: acc.no_answer + (a.no_answer || 0),
              callback: acc.callback + (a.callback_later || 0),
              sold: acc.sold + (a.sold_vehicle || 0),
            }), { calls: 0, connected: 0, booked: 0, no_answer: 0, callback: 0, sold: 0 })
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Total Calls', value: totals.calls, color: 'text-gray-900' },
                  { label: 'Connected', value: totals.connected, color: 'text-blue-700' },
                  { label: 'Booked', value: totals.booked, color: 'text-green-700' },
                  { label: 'Callback', value: totals.callback, color: 'text-purple-700' },
                  { label: 'No Answer', value: totals.no_answer, color: 'text-orange-700' },
                  { label: 'Sold Vehicle', value: totals.sold, color: 'text-yellow-700' },
                ].map(t => (
                  <div key={t.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                    <p className="text-xs text-gray-500">{t.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${t.color}`}>{t.value}</p>
                  </div>
                ))}
              </div>
            )
          })()}
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
                      {['#', 'Telecaller', 'Calls Made', 'Connected', 'Booked', 'Callback', 'No Answer', 'Not Interested', 'Wrong No.', 'Svc Done', 'Sold Car', 'In Progress', 'Book Rate'].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {agentStats.length === 0 ? (
                      <tr><td colSpan={13} className="px-4 py-8 text-center text-gray-400">
                        {statsDateFrom || statsDateTo ? 'No call activity in this date range' : 'No call activity yet for this campaign'}
                      </td></tr>
                    ) : agentStats.map((a: any, i: number) => {
                      const bookRate = a.calls_connected > 0 ? ((a.booked / a.calls_connected) * 100).toFixed(0) + '%' : '—'
                      return (
                        <tr key={i} className={`hover:bg-gray-50 ${i === 0 ? 'bg-green-50' : ''}`}>
                          <td className="px-3 py-3 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-3 font-medium text-gray-900">{a.email.split('@')[0]}<span className="text-gray-400 text-xs"> @{a.email.split('@')[1]}</span></td>
                          <td className="px-3 py-3 font-semibold text-gray-800">{a.calls_made || 0}</td>
                          <td className="px-3 py-3 text-blue-700 font-medium">{a.calls_connected || 0}</td>
                          <td className="px-3 py-3 font-bold text-green-700">{a.booked || 0}</td>
                          <td className="px-3 py-3 text-purple-700">{a.callback_later || 0}</td>
                          <td className="px-3 py-3 text-orange-700">{a.no_answer || 0}</td>
                          <td className="px-3 py-3 text-gray-500">{a.not_interested || 0}</td>
                          <td className="px-3 py-3 text-red-500">{a.wrong_number || 0}</td>
                          <td className="px-3 py-3 text-teal-700">{a.already_serviced || 0}</td>
                          <td className="px-3 py-3 text-yellow-700">{a.sold_vehicle || 0}</td>
                          <td className="px-3 py-3 text-gray-400">{a.still_assigned || 0}</td>
                          <td className="px-3 py-3 font-semibold text-blue-700">{bookRate}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bookings Tab ────────────────────────────────────────────────── */}
      {activeAdminTab === 'bookings' && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">✅ Bookings ({bookings.length})</h3>
            <button onClick={fetchBookings} className="text-sm text-blue-600 hover:text-blue-700">↻ Refresh</button>
          </div>
          {loadingTab ? <div className="p-8 text-center text-sm text-gray-400">Loading…</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Customer', 'Vehicle', 'Phone', 'Booking Date', 'Service Type', 'Telecaller', 'WA Sent', 'Notes'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bookings.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No bookings in this campaign</td></tr>
                  ) : bookings.map((b, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{b.customer?.first_name} {b.customer?.last_name || ''}</td>
                      <td className="px-4 py-3 text-gray-600">{b.customer?.model} · {b.customer?.vehicle_registration_number || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{b.customer?.contact_phones}</td>
                      <td className="px-4 py-3 font-medium text-green-700">{formatDate(b.booking_date)}{b.booking_time ? ` ${b.booking_time}` : ''}</td>
                      <td className="px-4 py-3 text-gray-600">{b.customer?.assumed_next_service_type || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{b.assigned_to || '—'}</td>
                      <td className="px-4 py-3">{b.whatsapp_sent ? <span className="text-green-600 font-medium">✓ {b.whatsapp_status || 'sent'}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{b.call_notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Overdue Tab ─────────────────────────────────────────────────── */}
      {activeAdminTab === 'overdue' && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">⚠️ Overdue Customers ({overdueList.length})</h3>
              <p className="text-xs text-gray-500 mt-0.5">Past assumed service date — within last 90 days</p>
            </div>
            <button onClick={fetchOverdue} className="text-sm text-blue-600 hover:text-blue-700">↻ Refresh</button>
          </div>
          {loadingTab ? <div className="p-8 text-center text-sm text-gray-400">Loading…</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Customer', 'Reg No.', 'Model', 'Phone', 'Due Date', 'Days Overdue', 'Service Type', 'Last Service Dealer', 'Sold By'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {overdueList.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No overdue customers found</td></tr>
                  ) : overdueList.map((o, i) => {
                    const days = daysFromToday(o.assumed_next_service_date)
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{o.first_name} {o.last_name || ''}</td>
                        <td className="px-4 py-3 text-gray-600">{o.vehicle_registration_number || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{o.model} <span className="text-xs text-gray-400">{o.powertrain_type || ''}</span></td>
                        <td className="px-4 py-3 text-gray-600">{o.contact_phones}</td>
                        <td className="px-4 py-3 text-red-600 font-medium">{formatDate(o.assumed_next_service_date)}</td>
                        <td className="px-4 py-3 font-bold text-red-700">{days !== null ? Math.abs(days) : '—'}d</td>
                        <td className="px-4 py-3 text-gray-600">{o.assumed_next_service_type || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{o.last_service_dealer || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{o.sold_dealer || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Edit Campaign</h3>
              <button onClick={() => setEditingCampaign(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Campaign Name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">From Date</label>
                  <input type="date" value={editDateFrom} onChange={e => setEditDateFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">To Date</label>
                  <input type="date" value={editDateTo} onChange={e => setEditDateTo(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </div>
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">⚠️ Editing dates does not re-pull leads. Use for display corrections only.</p>
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
