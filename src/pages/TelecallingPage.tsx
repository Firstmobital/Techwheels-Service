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
  last_service_date: string | null
  last_service_type: string | null
  last_service_km: string | null
  last_service_dealer: string | null
  sold_dealer: string | null
  extended_warranty_end_date: string | null
  extended_warranty_product: string | null
}

interface Assignment {
  id: number
  campaign_id: number
  status: string
  call_notes: string | null
  booking_date: string | null
  callback_date: string | null
  called_at: string | null
  call_count: number
  no_answer_count: number
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
  completed_count: number
  booked_count: number
  created_by: string | null
  created_at: string
}

interface DailySummary {
  total_calls: number
  booked: number
  no_answer: number
  not_interested: number
  callback_later: number
  wrong_number: number
  not_reachable: number
}

type CallStatus =
  | 'booked' | 'callback_later' | 'no_answer' | 'not_reachable'
  | 'wrong_number' | 'not_interested' | 'completed'

const EDGE_URL = `${supabaseUrl}/functions/v1/telecalling`

async function callEdge(action: string, body: Record<string, unknown> = {}) {
  const { data: session } = await supabase.auth.getSession()
  const token = session?.session?.access_token
  if (!token) throw new Error('Not authenticated')

  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...body }),
  })

  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Unknown error')
  return data
}

// ── Status badge colors ────────────────────────────────────────────────────────
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
  completed: 'bg-green-100 text-green-700',
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>{label}</span>
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function TelecallingPage({ userRole }: { userRole?: string }) {
  const [role, setRole] = useState<string>(userRole || 'staff')
  const [activeTab, setActiveTab] = useState<'dashboard' | 'admin'>('dashboard')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch user role + campaigns on mount
  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { data: user } = await supabase
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .single()

        if (user?.role) setRole(user.role)
        if (user?.role === 'admin') setActiveTab('admin')

        // Fetch campaigns
        const { data: camps } = await supabase
          .from('telecall_campaigns')
          .select('*')
          .order('created_at', { ascending: false })

        setCampaigns(camps || [])
        const active = camps?.find(c => c.status === 'active') || camps?.[0] || null
        setActiveCampaign(active)
      } catch (err) {
        console.error('Init error:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const refreshCampaigns = useCallback(async () => {
    const { data: camps } = await supabase
      .from('telecall_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
    setCampaigns(camps || [])
    const active = camps?.find(c => c.status === 'active') || camps?.[0] || null
    setActiveCampaign(active)
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-gray-400">Loading telecalling dashboard…</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📞 Telecalling</h1>
          <p className="mt-1 text-sm text-gray-500">Service reminder calling team</p>
        </div>
        {role === 'admin' && (
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
            >
              Telecaler View
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === 'admin' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
            >
              Admin Dashboard
            </button>
          </div>
        )}
      </div>

      {/* Campaign selector */}
      {campaigns.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm text-gray-500">Campaign:</span>
          <select
            value={activeCampaign?.id || ''}
            onChange={(e) => {
              const c = campaigns.find(c => c.id === Number(e.target.value))
              setActiveCampaign(c || null)
            }}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          >
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>
                {c.campaign_name} ({c.status}) — {c.total_leads} leads
              </option>
            ))}
          </select>
          {activeCampaign && (
            <div className="flex gap-4 text-xs">
              <span className="text-orange-600">⏳ {activeCampaign.pending_count} pending</span>
              <span className="text-green-600">✅ {activeCampaign.booked_count} booked</span>
              <span className="text-gray-500">📊 {activeCampaign.completed_count} completed</span>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {activeTab === 'admin' && role === 'admin' ? (
        <AdminDashboard campaigns={campaigns} activeCampaign={activeCampaign} onRefresh={refreshCampaigns} />
      ) : (
        <TelecalerDashboard activeCampaign={activeCampaign} />
      )}
    </div>
  )
}

// ── Telecaler Dashboard ─────────────────────────────────────────────────────────
function TelecalerDashboard({ activeCampaign }: { activeCampaign: Campaign | null }) {
  const [currentAssignment, setCurrentAssignment] = useState<Assignment | null>(null)
  const [queue, setQueue] = useState<Assignment[]>([])
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState('')
  const [bookingDate, setBookingDate] = useState('')
  const [callbackDate, setCallbackDate] = useState('')
  const [activeView, setActiveView] = useState<'call' | 'queue' | 'summary'>('call')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editBookingDate, setEditBookingDate] = useState('')
  const [editCallbackDate, setEditCallbackDate] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  // Fetch queue + summary on mount and campaign change
  const refreshQueue = useCallback(async () => {
    if (!activeCampaign) return
    try {
      const data = await callEdge('my_queue', { campaign_id: activeCampaign.id })
      setQueue(data.queue || [])
    } catch (err) {
      console.error('Queue fetch error:', err)
    }
  }, [activeCampaign])

  const refreshSummary = useCallback(async () => {
    try {
      const data = await callEdge('my_summary', {})
      setSummary(data.summary)
    } catch (err) {
      console.error('Summary fetch error:', err)
    }
  }, [])

  useEffect(() => {
    refreshQueue()
    refreshSummary()
  }, [refreshQueue, refreshSummary])

  // Get next customer
  const handleGetNext = async () => {
    if (!activeCampaign) return
    setBusy(true)
    setError(null)
    try {
      const data = await callEdge('get_next', { campaign_id: activeCampaign.id })
      if (data.assignment) {
        setCurrentAssignment(data.assignment)
        setActiveView('call')
      } else {
        setError('No more pending customers in this campaign. Great job! 🎉')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Update call status
  const handleUpdateStatus = async (status: CallStatus) => {
    if (!currentAssignment || !activeCampaign) return
    setBusy(true)
    setError(null)
    try {
      await callEdge('update_status', {
        assignment_id: currentAssignment.id,
        campaign_id: activeCampaign.id,
        status,
        call_notes: notes || undefined,
        booking_date: status === 'booked' ? bookingDate : undefined,
        callback_date: status === 'callback_later' ? callbackDate : undefined,
      })
      // Reset + refresh
      setCurrentAssignment(null)
      setNotes('')
      setBookingDate('')
      setCallbackDate('')
      setShowNotes(false)
      refreshQueue()
      refreshSummary()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleEditSave = async (assignmentId: number) => {
    setEditBusy(true)
    try {
      await callEdge('edit_assignment', {
        assignment_id: assignmentId,
        call_notes: editNotes,
        booking_date: editBookingDate || undefined,
        callback_date: editCallbackDate || undefined,
        status: editStatus || undefined,
      })
      setEditingId(null)
      refreshQueue()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setEditBusy(false)
    }
  }

  if (!activeCampaign) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <div className="text-4xl mb-3">📞</div>
        <p className="text-gray-600 font-medium">No active campaign</p>
        <p className="text-sm text-gray-400 mt-1">Please ask admin to create a campaign with service-due customers.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* View tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveView('call')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${activeView === 'call' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
        >
          📞 Call
        </button>
        <button
          onClick={() => { setActiveView('queue'); refreshQueue() }}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${activeView === 'queue' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
        >
          📋 My Queue ({queue.length})
        </button>
        <button
          onClick={() => { setActiveView('summary'); refreshSummary() }}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${activeView === 'summary' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
        >
          📊 Today's Summary
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      {/* ── CALL VIEW ──────────────────────────────────────────────────────── */}
      {activeView === 'call' && (
        <div>
          {!currentAssignment ? (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
              <div className="text-5xl mb-4">🎯</div>
              <h2 className="text-lg font-semibold text-gray-900">Ready to call?</h2>
              <p className="mt-2 text-sm text-gray-500">Click below to get the next customer who needs a service reminder.</p>
              <button
                onClick={handleGetNext}
                disabled={busy}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Getting next…
                  </>
                ) : (
                  <>📞 Get Next Customer</>
                )}
              </button>
            </div>
          ) : (
            <CallCard
              assignment={currentAssignment}
              busy={busy}
              notes={notes}
              setNotes={setNotes}
              showNotes={showNotes}
              setShowNotes={setShowNotes}
              bookingDate={bookingDate}
              setBookingDate={setBookingDate}
              callbackDate={callbackDate}
              setCallbackDate={setCallbackDate}
              onUpdateStatus={handleUpdateStatus}
            />
          )}
        </div>
      )}

      {/* ── QUEUE VIEW ─────────────────────────────────────────────────────── */}
      {activeView === 'queue' && (
        <div className="space-y-2">
          {queue.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
              No active assignments. Click "Get Next Customer" to start calling.
            </div>
          ) : (
            queue.map((asgn) => (
              <div key={asgn.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900">
                      {asgn.customer.first_name} {asgn.customer.last_name || ''}
                    </div>
                    <div className="text-sm text-gray-500">
                      📱 {asgn.customer.contact_phones} · 🚗 {asgn.customer.model} · 🔧 {asgn.customer.assumed_next_service_type} due {formatDate(asgn.customer.assumed_next_service_date)}
                    </div>
                    {asgn.status === 'callback_later' && asgn.callback_date && (
                      <div className="mt-1 text-xs text-purple-600">📅 Callback on {formatDate(asgn.callback_date)}</div>
                    )}
                    {asgn.status === 'booked' && asgn.booking_date && (
                      <div className="mt-1 text-xs text-green-600">✅ Booked for {formatDate(asgn.booking_date)}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <StatusBadge status={asgn.status} />
                    <button
                      onClick={() => {
                        setEditingId(asgn.id)
                        setEditNotes(asgn.call_notes || '')
                        setEditBookingDate(asgn.booking_date || '')
                        setEditCallbackDate(asgn.callback_date || '')
                        setEditStatus(asgn.status)
                      }}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    >
                      ✏️ Edit
                    </button>
                  </div>
                </div>
                {asgn.call_notes && editingId !== asgn.id && (
                  <div className="mt-2 rounded bg-gray-50 px-3 py-1.5 text-xs text-gray-600">📝 {asgn.call_notes}</div>
                )}
                {/* ── Inline Edit Panel ── */}
                {editingId === asgn.id && (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
                    <div className="text-xs font-semibold text-blue-700 mb-1">Edit Assignment</div>
                    {/* Status */}
                    <div>
                      <label className="text-xs font-medium text-gray-600">Status</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm bg-white"
                      >
                        <option value="assigned">Assigned</option>
                        <option value="booked">Booked</option>
                        <option value="callback_later">Callback Later</option>
                        <option value="no_answer">No Answer</option>
                        <option value="not_reachable">Not Reachable</option>
                        <option value="wrong_number">Wrong Number</option>
                        <option value="not_interested">Not Interested</option>
                      </select>
                    </div>
                    {/* Notes */}
                    <div>
                      <label className="text-xs font-medium text-gray-600">Remarks / Notes</label>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Update call notes or remarks…"
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm resize-none"
                      />
                    </div>
                    {/* Booking date if booked */}
                    {editStatus === 'booked' && (
                      <div>
                        <label className="text-xs font-medium text-gray-600">Booking Date</label>
                        <input
                          type="date"
                          value={editBookingDate}
                          onChange={(e) => setEditBookingDate(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
                        />
                      </div>
                    )}
                    {/* Callback date if callback_later */}
                    {editStatus === 'callback_later' && (
                      <div>
                        <label className="text-xs font-medium text-gray-600">Callback Date</label>
                        <input
                          type="date"
                          value={editCallbackDate}
                          onChange={(e) => setEditCallbackDate(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
                        />
                      </div>
                    )}
                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleEditSave(asgn.id)}
                        disabled={editBusy}
                        className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {editBusy ? 'Saving…' : '💾 Save'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── SUMMARY VIEW ───────────────────────────────────────────────────── */}
      {activeView === 'summary' && summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Total Calls Today" value={summary.total_calls} color="blue" icon="📞" />
          <SummaryCard label="Booked" value={summary.booked} color="green" icon="✅" />
          <SummaryCard label="Callback Later" value={summary.callback_later} color="purple" icon="📅" />
          <SummaryCard label="No Answer" value={summary.no_answer} color="orange" icon="📵" />
          <SummaryCard label="Not Reachable" value={summary.not_reachable} color="red" icon="🚫" />
          <SummaryCard label="Not Interested" value={summary.not_interested} color="gray" icon="😐" />
          <SummaryCard label="Wrong Number" value={summary.wrong_number} color="red" icon="⚠️" />
          <SummaryCard
            label="Conversion Rate"
            value={summary.total_calls > 0 ? `${Math.round((summary.booked / summary.total_calls) * 100)}%` : '0%'}
            color="green"
            icon="📈"
          />
        </div>
      )}
    </div>
  )
}

// ── Call Card ───────────────────────────────────────────────────────────────────
function CallCard({
  assignment, busy, notes, setNotes, showNotes, setShowNotes,
  bookingDate, setBookingDate, callbackDate, setCallbackDate, onUpdateStatus,
}: {
  assignment: Assignment
  busy: boolean
  notes: string
  setNotes: (v: string) => void
  showNotes: boolean
  setShowNotes: (v: boolean) => void
  bookingDate: string
  setBookingDate: (v: string) => void
  callbackDate: string
  setCallbackDate: (v: string) => void
  onUpdateStatus: (s: CallStatus) => void
}) {
  const c = assignment.customer
  const phone = c.contact_phones || ''
  const [showBooking, setShowBooking] = useState(false)
  const [showCallback, setShowCallback] = useState(false)

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Customer header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{c.first_name} {c.last_name || ''}</h2>
            <p className="text-sm text-blue-100">🚗 {c.model} · {c.powertrain_type || 'N/A'}</p>
          </div>
          {c.vehicle_registration_number && (
            <div className="rounded-lg bg-white/20 px-3 py-1 text-sm font-medium">
              {c.vehicle_registration_number}
            </div>
          )}
        </div>
      </div>

      {/* Call button */}
      <div className="px-6 py-4 border-b border-gray-100">
        <a
          href={`tel:${phone}`}
          className="flex items-center justify-center gap-2 rounded-xl bg-green-500 px-6 py-3 text-base font-semibold text-white hover:bg-green-600"
        >
          📞 Call {phone}
        </a>
        {assignment.whatsapp_sent && (
          <p className="mt-2 text-center text-xs text-green-600">
            ✓ WhatsApp reminder already sent to this customer
          </p>
        )}
      </div>

      {/* Service details */}
      <div className="grid grid-cols-2 gap-px bg-gray-100">
        <DetailRow label="Service Due Date" value={formatDate(c.assumed_next_service_date)} />
        <DetailRow label="Service Type" value={c.assumed_next_service_type || '—'} />
        <DetailRow label="Last Service Date" value={formatDate(c.last_service_date)} />
        <DetailRow label="Last Service Type" value={c.last_service_type || '—'} />
        <DetailRow label="Last Service KM" value={c.last_service_km ? `${c.last_service_km} km` : '—'} />
        <DetailRow label="Last Service Dealer" value={c.last_service_dealer || '—'} />
        {c.extended_warranty_product && (
          <DetailRow label="EW Product" value={c.extended_warranty_product} />
        )}
        {c.extended_warranty_end_date && (
          <DetailRow label="EW End Date" value={formatDate(c.extended_warranty_end_date)} />
        )}
      </div>

      {/* Previous call info */}
      {assignment.call_count > 0 && (
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-700">
          ⚠️ This customer has been called {assignment.call_count} time(s) before.
          {assignment.no_answer_count > 0 && ` (${assignment.no_answer_count} no-answers — auto-removes after 3)`}
          {assignment.call_notes && <div className="mt-1 text-xs">Last note: {assignment.call_notes}</div>}
        </div>
      )}

      {/* Action buttons */}
      <div className="px-6 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            onClick={() => { setShowBooking(true); setShowNotes(true) }}
            disabled={busy}
            className="rounded-xl bg-green-500 px-4 py-3 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
          >
            ✅ Booked
          </button>
          <button
            onClick={() => { setShowCallback(true); setShowNotes(true) }}
            disabled={busy}
            className="rounded-xl bg-purple-500 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-600 disabled:opacity-50"
          >
            📞 Callback Later
          </button>
          <button
            onClick={() => onUpdateStatus('no_answer')}
            disabled={busy}
            className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            📵 No Answer
          </button>
          <button
            onClick={() => onUpdateStatus('not_reachable')}
            disabled={busy}
            className="rounded-xl bg-red-400 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            🚫 Not Reachable
          </button>
          <button
            onClick={() => { setShowNotes(true); onUpdateStatus('wrong_number') }}
            disabled={busy}
            className="rounded-xl bg-red-400 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            ⚠️ Wrong Number
          </button>
          <button
            onClick={() => { setShowNotes(true); onUpdateStatus('not_interested') }}
            disabled={busy}
            className="rounded-xl bg-gray-400 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-500 disabled:opacity-50"
          >
            😐 Not Interested
          </button>
        </div>

        {/* Notes field */}
        {showNotes && (
          <div className="mt-4">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Call notes (what the customer said)…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              rows={2}
            />
          </div>
        )}

        {/* Booking date picker */}
        {showBooking && (
          <div className="mt-3 flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Visit date:</label>
            <input
              type="date"
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => onUpdateStatus('booked')}
              disabled={busy || !bookingDate}
              className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Confirm Booking
            </button>
          </div>
        )}

        {/* Callback date picker */}
        {showCallback && (
          <div className="mt-3 flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Callback on:</label>
            <input
              type="date"
              value={callbackDate}
              onChange={(e) => setCallbackDate(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => onUpdateStatus('callback_later')}
              disabled={busy || !callbackDate}
              className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Schedule Callback
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-gray-900">{value}</div>
    </div>
  )
}

function SummaryCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: string }) {
  const colors: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    green: 'border-green-200 bg-green-50 text-green-900',
    purple: 'border-purple-200 bg-purple-50 text-purple-900',
    orange: 'border-orange-200 bg-orange-50 text-orange-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    gray: 'border-gray-200 bg-gray-50 text-gray-900',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  )
}

// ── Admin Dashboard ─────────────────────────────────────────────────────────────
function AdminDashboard({ campaigns, activeCampaign, onRefresh }: {
  campaigns: Campaign[]
  activeCampaign: Campaign | null
  onRefresh: () => void
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [showServiceInfo, setShowServiceInfo] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [editName, setEditName] = useState('')
  const [editDateFrom, setEditDateFrom] = useState('')
  const [editDateTo, setEditDateTo] = useState('')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  // New campaign targeting state
  const [segment, setSegment] = useState('all')
  const [priorityMode, setPriorityMode] = useState('service_date')
  const [powertrainFilter, setPowertrainFilter] = useState('all')
  const [warrantyDays, setWarrantyDays] = useState(90)
  const [previewCounts, setPreviewCounts] = useState<any>(null)
  const [previewing, setPreviewing] = useState(false)
  const [campaignName, setCampaignName] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [telecalerStats, setTelecalerStats] = useState<Record<string, Record<string, number>>>({})
  const [bookings, setBookings] = useState<any[]>([])
  const [, setLoadingStats] = useState(false)

  // Fetch stats
  const fetchStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const data = await callEdge('campaign_stats', {})
      setTelecalerStats(data.telecaler_stats || {})
      setBookings(data.bookings || [])
    } catch (err) {
      console.error('Stats error:', err)
    } finally {
      setLoadingStats(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats, activeCampaign])

  // Preview leads before creating
  const handlePreview = async () => {
    if (!dateFrom || !dateTo) return
    setPreviewing(true)
    setPreviewCounts(null)
    try {
      const data = await callEdge('preview_campaign', {
        date_from: dateFrom,
        date_to: dateTo,
        customer_segment: segment,
        priority_mode: priorityMode,
        warranty_expiry_days: segment === 'warranty_expiring' ? warrantyDays : null,
        powertrain_filter: powertrainFilter !== 'all' ? powertrainFilter : null,
      })
      setPreviewCounts(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPreviewing(false)
    }
  }

  // Create campaign
  const handleCreate = async () => {
    if (!campaignName || !dateFrom || !dateTo) {
      setError('Please fill all fields')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const data = await callEdge('create_campaign', {
        campaign_name: campaignName,
        date_from: dateFrom,
        date_to: dateTo,
        customer_segment: segment,
        priority_mode: priorityMode,
        warranty_expiry_days: segment === 'warranty_expiring' ? warrantyDays : null,
        powertrain_filter: powertrainFilter !== 'all' ? powertrainFilter : null,
      })
      setSuccess(`Campaign created with ${data.total_leads} leads!`)
      setShowCreate(false)
      setCampaignName('')
      setDateFrom('')
      setDateTo('')
      setPreviewCounts(null)
      setSegment('all')
      setPriorityMode('service_date')
      setPowertrainFilter('all')
      onRefresh()
      fetchStats()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  // Close campaign
  const handleClose = async (id: number) => {
    if (!confirm('Close this campaign? No new calls can be made after closing.')) return
    try {
      await callEdge('close_campaign', { campaign_id: id })
      onRefresh()
      fetchStats()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Edit campaign
  const handleEdit = async () => {
    if (!editingCampaign || !editName || !editDateFrom || !editDateTo) return
    setEditing(true)
    setError(null)
    try {
      await callEdge('update_campaign', {
        campaign_id: editingCampaign.id,
        campaign_name: editName,
        date_from: editDateFrom,
        date_to: editDateTo,
      })
      setSuccess('Campaign updated!')
      setEditingCampaign(null)
      onRefresh()
      fetchStats()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setEditing(false)
    }
  }

  // Delete campaign
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete campaign "${name}"? This will permanently remove all ${campaigns.find(c => c.id === id)?.total_leads || 0} leads and call records. This cannot be undone.`)) return
    setDeleting(id)
    setError(null)
    try {
      await callEdge('delete_campaign', { campaign_id: id })
      setSuccess('Campaign deleted.')
      onRefresh()
      fetchStats()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  // Default dates: today + 20 days
  useEffect(() => {
    if (!dateFrom) {
      const today = new Date()
      const plus20 = new Date()
      plus20.setDate(plus20.getDate() + 20)
      setDateFrom(today.toISOString().split('T')[0])
      setDateTo(plus20.toISOString().split('T')[0])
    }
  }, [])

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      {/* Create campaign button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Campaigns</h2>
          <button
            onClick={() => setShowServiceInfo(!showServiceInfo)}
            title="How is service due date calculated?"
            className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 border border-gray-300 text-gray-500 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600 text-xs font-bold transition-colors"
          >
            i
          </button>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Campaign
        </button>
      </div>

      {/* Service due date info panel */}
      {showServiceInfo && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm relative">
          <button
            onClick={() => setShowServiceInfo(false)}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
          <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <span>ℹ️</span> How is <em>Assumed Next Service Date</em> calculated?
          </h4>
          <p className="text-sm text-blue-800 mb-3">
            When a customer has no scheduled service date set, the system <strong>estimates</strong> their next service due date based on their last service type:
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-white border border-blue-100 px-3 py-2">
              <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">New Vehicle / No History</div>
              <div className="text-xl font-bold text-blue-900">+60 days</div>
              <div className="text-xs text-blue-600 mt-0.5">from last service date</div>
            </div>
            <div className="rounded-lg bg-white border border-blue-100 px-3 py-2">
              <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">First Free Service</div>
              <div className="text-xl font-bold text-blue-900">+120 days</div>
              <div className="text-xs text-blue-600 mt-0.5">from last service date</div>
            </div>
            <div className="rounded-lg bg-white border border-blue-100 px-3 py-2">
              <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">All Other Services</div>
              <div className="text-xl font-bold text-blue-900">+180 days</div>
              <div className="text-xs text-blue-600 mt-0.5">rolling, based on days since last service</div>
            </div>
          </div>
          <p className="text-xs text-blue-700 mt-3 border-t border-blue-200 pt-2">
            📋 <strong>Campaign selection:</strong> When you create a campaign with a date range, the system pulls all customers whose <em>assumed next service date</em> falls within that range, and who have a valid phone number.
          </p>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-5">
          <h3 className="font-medium text-gray-900">Create New Campaign</h3>

          {/* Row 1: Name + Dates */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Campaign Name</label>
              <input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. July Service Reminders"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Service Due — From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Service Due — To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Row 2: Customer Segment + Priority Mode + Powertrain */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">Customer Targeting</span>
              <span className="text-xs text-gray-400">(who gets called, in what order)</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {/* Segment */}
              <div>
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Customer Segment</label>
                <select
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="all">All Customers</option>
                  <option value="sold_us">Sold by Techwheels (Retain)</option>
                  <option value="sold_others">Sold by Others (Conquest)</option>
                  <option value="last_svc_us">Last Serviced at Techwheels</option>
                  <option value="last_svc_others">Last Serviced Elsewhere</option>
                  <option value="warranty_expiring">Warranty Expiring Soon</option>
                </select>
              </div>

              {/* Priority mode */}
              <div>
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Call Priority</label>
                <select
                  value={priorityMode}
                  onChange={(e) => setPriorityMode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="service_date">By Service Due Date</option>
                  <option value="warranty_expiry">By Warranty Expiry</option>
                  <option value="conquest">Conquest First (Other Dealers)</option>
                </select>
              </div>

              {/* Powertrain */}
              <div>
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Vehicle Type</label>
                <select
                  value={powertrainFilter}
                  onChange={(e) => setPowertrainFilter(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="all">All (EV + PV)</option>
                  <option value="EV">EV Only</option>
                  <option value="PV">PV Only</option>
                </select>
              </div>
            </div>

            {/* Warranty days if segment = warranty_expiring */}
            {segment === 'warranty_expiring' && (
              <div className="mt-3 max-w-xs">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Warranty Expiring Within (days)</label>
                <input
                  type="number"
                  min="7"
                  max="365"
                  value={warrantyDays}
                  onChange={(e) => setWarrantyDays(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>

          {/* Priority legend */}
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">📞 Call Order Priority (auto-assigned)</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white text-xs font-bold">1</span>
                <span className="text-xs text-gray-700">Sold + Serviced at Techwheels</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-xs font-bold">2</span>
                <span className="text-xs text-gray-700">Sold by us, svc elsewhere</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-bold">3</span>
                <span className="text-xs text-gray-700">Sold others, svc at us</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-400 text-white text-xs font-bold">4</span>
                <span className="text-xs text-gray-700">Sold + serviced elsewhere</span>
              </div>
            </div>
          </div>

          {/* Preview + Create buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handlePreview}
              disabled={creating || previewing || !dateFrom || !dateTo}
              className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40"
            >
              {previewing ? 'Loading…' : '🔍 Preview Leads'}
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !campaignName || !dateFrom || !dateTo}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {creating ? 'Creating…' : '✅ Create Campaign'}
            </button>
            <span className="text-xs text-gray-400">
              Leads are auto-sorted by priority — highest-value customers called first.
            </span>
          </div>

          {/* Preview results */}
          {previewCounts && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-blue-900">Lead Preview — <span className="text-blue-700">{previewCounts.filtered_count} customers will be in this campaign</span></p>
                <p className="text-xs text-blue-600">Total in date range: {previewCounts.counts?.total}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-center">
                  <div className="text-xs text-green-700 font-medium">🏆 Loyal</div>
                  <div className="text-xl font-bold text-green-900">{previewCounts.counts?.retain_loyal ?? 0}</div>
                  <div className="text-xs text-green-600">Sold + Svc us</div>
                </div>
                <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-center">
                  <div className="text-xs text-orange-700 font-medium">⚠️ At Risk</div>
                  <div className="text-xl font-bold text-orange-900">{previewCounts.counts?.retain_atrisk ?? 0}</div>
                  <div className="text-xs text-orange-600">Sold us, svc elsewhere</div>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-center">
                  <div className="text-xs text-blue-700 font-medium">💙 Svc Loyal</div>
                  <div className="text-xl font-bold text-blue-900">{previewCounts.counts?.retain_service_loyal ?? 0}</div>
                  <div className="text-xs text-blue-600">Sold others, svc us</div>
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-center">
                  <div className="text-xs text-gray-600 font-medium">🎯 Conquest</div>
                  <div className="text-xl font-bold text-gray-900">{previewCounts.counts?.conquest ?? 0}</div>
                  <div className="text-xs text-gray-500">Sold + svc elsewhere</div>
                </div>
              </div>
              {(previewCounts.counts?.warranty_soon ?? 0) > 0 && (
                <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 border border-amber-200">
                  🔔 {previewCounts.counts?.warranty_soon} customers have warranty ending within 30 days (priority boosted)
                </p>
              )}
              <div className="mt-2 flex gap-3 text-xs text-gray-500">
                <span>⚡ EV: {previewCounts.counts?.ev ?? 0}</span>
                <span>🚗 PV: {previewCounts.counts?.pv ?? 0}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Campaign Modal */}
      {editingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Edit Campaign</h3>
              <button
                onClick={() => setEditingCampaign(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Campaign Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">From Date</label>
                  <input
                    type="date"
                    value={editDateFrom}
                    onChange={(e) => setEditDateFrom(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">To Date</label>
                  <input
                    type="date"
                    value={editDateTo}
                    onChange={(e) => setEditDateTo(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                ⚠️ Editing dates only updates the campaign label — it does <strong>not</strong> re-pull leads. Use this for name or date display corrections only.
              </p>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleEdit}
                disabled={editing}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {editing ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditingCampaign(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign list */}
      <div className="space-y-3">
        {campaigns.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            No campaigns yet. Click "New Campaign" to create one.
          </div>
        ) : (
          campaigns.map(c => (
            <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{c.campaign_name}</h3>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {formatDate(c.date_from)} → {formatDate(c.date_to)} · Created by {c.created_by || '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {c.status === 'active' && (
                    <button
                      onClick={() => handleClose(c.id)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      Close Campaign
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingCampaign(c)
                      setEditName(c.campaign_name)
                      setEditDateFrom(c.date_from)
                      setEditDateTo(c.date_to)
                    }}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => handleDelete(c.id, c.campaign_name)}
                    disabled={deleting === c.id}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deleting === c.id ? 'Deleting…' : '🗑️ Delete'}
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-4">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-xs text-gray-500">Total Leads</div>
                  <div className="text-xl font-bold text-gray-900">{c.total_leads}</div>
                </div>
                <div className="rounded-lg bg-orange-50 px-3 py-2">
                  <div className="text-xs text-orange-600">Pending</div>
                  <div className="text-xl font-bold text-orange-900">{c.pending_count}</div>
                </div>
                <div className="rounded-lg bg-green-50 px-3 py-2">
                  <div className="text-xs text-green-600">Booked</div>
                  <div className="text-xl font-bold text-green-900">{c.booked_count}</div>
                </div>
                <div className="rounded-lg bg-blue-50 px-3 py-2">
                  <div className="text-xs text-blue-600">Completed</div>
                  <div className="text-xl font-bold text-blue-900">{c.completed_count}</div>
                </div>
              </div>
              {/* Segment breakdown tags */}
              <div className="mt-2 flex flex-wrap gap-2 items-center">
                {(c as any).customer_segment && (c as any).customer_segment !== 'all' && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs text-blue-700 font-medium">
                    {({
                      sold_us: '🏠 Sold by Techwheels',
                      sold_others: '🎯 Conquest (Sold elsewhere)',
                      last_svc_us: '🔧 Last Serviced at Us',
                      last_svc_others: '🔧 Last Serviced Elsewhere',
                      warranty_expiring: '🔔 Warranty Expiring',
                    } as Record<string, string>)[(c as any).customer_segment] || (c as any).customer_segment}
                  </span>
                )}
                {(c as any).powertrain_filter && (c as any).powertrain_filter !== 'all' && (
                  <span className="inline-flex items-center rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-xs text-purple-700 font-medium">
                    {(c as any).powertrain_filter === 'EV' ? '⚡ EV Only' : '🚗 PV Only'}
                  </span>
                )}
                {(c as any).segment_counts && (
                  <span className="text-xs text-gray-400">
                    {[(c as any).segment_counts.retain_loyal && `${(c as any).segment_counts.retain_loyal} loyal`,
                      (c as any).segment_counts.retain_atrisk && `${(c as any).segment_counts.retain_atrisk} at-risk`,
                      (c as any).segment_counts.conquest && `${(c as any).segment_counts.conquest} conquest`
                    ].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Telecaler performance */}
      {Object.keys(telecalerStats).length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Telecaler Performance</h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Telecaler</th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">Assigned</th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">Booked</th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">Callback</th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">No Answer</th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">Not Interested</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {Object.entries(telecalerStats).map(([email, stats]) => {
                  const total = Object.values(stats).reduce((a, b) => a + b, 0)
                  return (
                    <tr key={email}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{email}</td>
                      <td className="px-4 py-3 text-center text-sm text-gray-700">{total}</td>
                      <td className="px-4 py-3 text-center text-sm font-medium text-green-600">{stats.booked || 0}</td>
                      <td className="px-4 py-3 text-center text-sm text-purple-600">{stats.callback_later || 0}</td>
                      <td className="px-4 py-3 text-center text-sm text-orange-600">{stats.no_answer || 0}</td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600">{stats.not_interested || 0}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent bookings */}
      {bookings.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Recent Bookings</h2>
          <div className="space-y-2">
            {bookings.slice(0, 10).map((b: any) => (
              <div key={b.id} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">
                    {b.customer?.first_name} {b.customer?.last_name || ''}
                  </div>
                  <div className="text-sm text-gray-500">
                    📱 {b.customer?.contact_phones} · 🚗 {b.customer?.model} · {b.customer?.vehicle_registration_number || 'No VRN'}
                  </div>
                  {b.call_notes && <div className="mt-1 text-xs text-gray-400">📝 {b.call_notes}</div>}
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-green-600">Visit: {formatDate(b.booking_date)}</div>
                  <div className="text-xs text-gray-400">By {b.assigned_to}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
