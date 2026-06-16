import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/Icon'
import DateRangeFilter from '../components/DateRangeFilter'

// ─── Constants ────────────────────────────────────────────────────────────────
const BOOKING_SOURCES = ['Telecalling', 'WhatsApp', 'Walk-in', 'Self', 'Driver Pickup', 'Referral'] as const
const STATUSES = ['New', 'Confirmed', 'Rescheduled', 'Arrived', 'In-Progress', 'Completed', 'Cancelled', 'No-Show'] as const
const SERVICE_TYPES = [
  'Paid Service', 'First Free Service', 'Second Free Service', 'Third Free Service',
  'Running Repairs', 'Accident', 'PDI', 'Campaign', 'E Breakdown', 'Updation',
]
const FUEL_TYPES = ['Petrol', 'Diesel', 'CNG', 'EV', 'CNG+Petrol']
const CALL_OUTCOMES = ['Connected', 'Not Reachable', 'Callback', 'Declined']
const TATA_MODELS = [
  'Nexon', 'Nexon EV', 'Punch', 'Punch CNG', 'Tiago', 'Tigor', 'Tigor EV',
  'Altroz', 'Harrier', 'Harrier EV', 'Safari', 'Curvv', 'Curvv EV',
  'Hexa', 'Sierra', 'Xpres T Ev',
]

const STATUS_META: Record<string, { bg: string; color: string; dot: string }> = {
  New:           { bg: '#eff6ff', color: '#2563eb', dot: '#3b82f6' },
  Confirmed:     { bg: '#f0fdf4', color: '#16a34a', dot: '#22c55e' },
  Rescheduled:   { bg: '#fffbeb', color: '#d97706', dot: '#f59e0b' },
  Arrived:       { bg: '#f0f9ff', color: '#0284c7', dot: '#38bdf8' },
  'In-Progress': { bg: '#faf5ff', color: '#7c3aed', dot: '#a78bfa' },
  Completed:     { bg: '#dcfce7', color: '#15803d', dot: '#4ade80' },
  Cancelled:     { bg: '#fef2f2', color: '#dc2626', dot: '#f87171' },
  'No-Show':     { bg: '#f8fafc', color: '#64748b', dot: '#94a3b8' },
}

const SOURCE_ICON: Record<string, string> = {
  Telecalling: '📞', WhatsApp: '💬', 'Walk-in': '🚶', Self: '🙋',
  'Driver Pickup': '🚗', Referral: '👥',
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ServiceBooking {
  id: number; lead_number: string; booking_date: string; booking_time: string | null
  appointment_date: string | null; booking_source: string; reg_number: string
  model: string | null; variant: string | null; fuel_type: string | null
  mfg_year: number | null; km_reading: number | null; customer_name: string
  customer_phone: string; alt_phone: string | null; customer_email: string | null
  customer_address: string | null; service_type: string | null
  complaint_description: string | null; special_requests: string | null
  pickup_required: boolean; drop_required: boolean; pickup_address: string | null
  branch: string | null; assigned_sa: string | null; assigned_sa_name: string | null
  status: string; status_reason: string | null; rescheduled_date: string | null
  caller_name: string | null; call_attempt: number | null; call_outcome: string | null
  wa_conversation_id: string | null; wa_opt_in: boolean; jc_number: string | null
  converted_at: string | null; created_at: string; updated_at: string
}
interface FollowUp {
  id: number; booking_id: number; follow_up_date: string; channel: string | null
  note: string | null; outcome: string | null; next_follow_up: string | null
  done_by: string | null; created_at: string
}
type DateRange = { from: string; to: string }
type FormMode = 'new' | 'edit'

const EMPTY_FORM: Partial<ServiceBooking> = {
  booking_source: 'Telecalling', status: 'New',
  booking_date: new Date().toISOString().split('T')[0],
  pickup_required: false, drop_required: false, wa_opt_in: false, call_attempt: 1,
}

// ─── Reusable sub-components ──────────────────────────────────────────────────
function FieldGroup({ title, icon }: { title: string; icon: string }) {
  return (
    <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.6rem 0 0.2rem' }}>
      <span style={{ fontSize: '0.88rem' }}>{icon}</span>
      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{title}</span>
      <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
    </div>
  )
}

function Field({ label, required, children, span }: { label: string; required?: boolean; children: React.ReactNode; span?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', gridColumn: span ? 'span 2' : undefined }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569' }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
      </span>
      {children}
    </label>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ServiceBookingPage() {
  const [bookings, setBookings] = useState<ServiceBooking[]>([])
  const [followups, setFollowups] = useState<FollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [branches, setBranches] = useState<string[]>([])

  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const todayStr = today.toISOString().split('T')[0]
  const [dateRange, setDateRange] = useState<DateRange>({ from: firstOfMonth, to: todayStr })
  const [sourceFilter, setSourceFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [selectedBooking, setSelectedBooking] = useState<ServiceBooking | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>('new')
  const [form, setForm] = useState<Partial<ServiceBooking>>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [savingFollowup, setSavingFollowup] = useState(false)
  const [followupForm, setFollowupForm] = useState({ channel: 'Call', note: '', outcome: '', next_follow_up: '', done_by: '' })
  const [showFollowupForm, setShowFollowupForm] = useState(false)
  const [waModal, setWaModal] = useState<{ booking: ServiceBooking; message: string } | null>(null)

  useEffect(() => { void loadBranchesAndSAs() }, [])
  useEffect(() => { void loadBookings() }, [dateRange])

  async function loadBranchesAndSAs() {
    const branchRes = await supabase.from('service_branches').select('name').order('name')
    if (branchRes.data) setBranches((branchRes.data as { name: string }[]).map(b => b.name))
  }

  async function loadBookings() {
    setLoading(true); setError('')
    const { data, error: err } = await supabase
      .from('service_bookings').select('*')
      .gte('booking_date', dateRange.from).lte('booking_date', dateRange.to)
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setBookings((data ?? []) as ServiceBooking[])
    setLoading(false)
  }

  async function loadFollowups(bookingId: number) {
    const { data } = await supabase.from('service_booking_followups').select('*')
      .eq('booking_id', bookingId).order('created_at', { ascending: false })
    setFollowups((data ?? []) as FollowUp[])
  }

  const filtered = useMemo(() => {
    let rows = bookings
    if (sourceFilter !== 'all') rows = rows.filter(b => b.booking_source === sourceFilter)
    if (statusFilter !== 'all') rows = rows.filter(b => b.status === statusFilter)
    if (branchFilter !== 'all') rows = rows.filter(b => b.branch === branchFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      rows = rows.filter(b =>
        b.customer_name.toLowerCase().includes(q) || b.customer_phone.includes(q) ||
        b.reg_number.toLowerCase().includes(q) || (b.lead_number ?? '').toLowerCase().includes(q) ||
        (b.model ?? '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [bookings, sourceFilter, statusFilter, branchFilter, searchQuery])

  const stats = useMemo(() => ({
    total: filtered.length,
    new: filtered.filter(b => b.status === 'New').length,
    confirmed: filtered.filter(b => b.status === 'Confirmed').length,
    arrived: filtered.filter(b => b.status === 'Arrived' || b.status === 'In-Progress').length,
    completed: filtered.filter(b => b.status === 'Completed').length,
    cancelled: filtered.filter(b => b.status === 'Cancelled' || b.status === 'No-Show').length,
    converted: filtered.filter(b => b.jc_number).length,
    telecalling: filtered.filter(b => b.booking_source === 'Telecalling').length,
    whatsapp: filtered.filter(b => b.booking_source === 'WhatsApp').length,
  }), [filtered])

  async function handleSave() {
    if (!form.reg_number?.trim()) { setError('Registration number is required'); return }
    if (!form.customer_name?.trim()) { setError('Customer name is required'); return }
    if (!form.customer_phone?.trim()) { setError('Customer phone is required'); return }
    if (form.customer_phone!.replace(/\D/g, '').length !== 10) { setError('Phone must be 10 digits'); return }
    if (!form.booking_source) { setError('Booking source is required'); return }
    setSaving(true); setError('')
    const payload = { ...form, reg_number: (form.reg_number ?? '').toUpperCase().trim(), customer_phone: (form.customer_phone ?? '').replace(/\D/g, '') }
    let result
    if (formMode === 'edit' && selectedBooking) {
      result = await supabase.from('service_bookings').update(payload).eq('id', selectedBooking.id).select().single()
    } else {
      result = await supabase.from('service_bookings').insert([payload]).select().single()
    }
    if (result.error) { setError(result.error.message) }
    else { await loadBookings(); setSelectedBooking(result.data as ServiceBooking); setShowForm(false); setForm(EMPTY_FORM) }
    setSaving(false)
  }

  async function handleSaveFollowup() {
    if (!selectedBooking) return
    if (!followupForm.note.trim()) { setError('Please add a note for the follow-up'); return }
    setSavingFollowup(true)
    const { error: err } = await supabase.from('service_booking_followups').insert([{
      booking_id: selectedBooking.id, channel: followupForm.channel, note: followupForm.note,
      outcome: followupForm.outcome || null, next_follow_up: followupForm.next_follow_up || null,
      done_by: followupForm.done_by || null,
    }])
    if (err) { setError(err.message) }
    else { await loadFollowups(selectedBooking.id); setFollowupForm({ channel: 'Call', note: '', outcome: '', next_follow_up: '', done_by: '' }); setShowFollowupForm(false) }
    setSavingFollowup(false)
  }

  async function updateStatus(booking: ServiceBooking, newStatus: string) {
    const payload: Partial<ServiceBooking> = { status: newStatus }
    if (newStatus === 'Rescheduled') payload.rescheduled_date = new Date().toISOString().split('T')[0]
    if (newStatus === 'Completed' && !booking.jc_number) {
      const jc = prompt('Enter Job Card Number to convert:')
      if (jc) { payload.jc_number = jc.trim(); payload.converted_at = new Date().toISOString() }
    }
    await supabase.from('service_bookings').update(payload).eq('id', booking.id)
    await loadBookings()
    setSelectedBooking(b => b?.id === booking.id ? { ...b, ...payload } as ServiceBooking : b)
  }

  function openNew() { setFormMode('new'); setForm(EMPTY_FORM); setShowForm(true); setSelectedBooking(null) }
  function openEdit(b: ServiceBooking) { setFormMode('edit'); setForm({ ...b }); setSelectedBooking(b); setShowForm(true) }
  function openDetail(b: ServiceBooking) { setSelectedBooking(b); setShowForm(false); void loadFollowups(b.id) }

  function openWhatsApp(b: ServiceBooking) {
    const lines = [
      `🚗 *Service Appointment Confirmation*`,
      `Hi ${b.customer_name},`,
      `Your service booking is confirmed!`,
      ``,
      `📅 *Date:* ${b.appointment_date ? new Date(b.appointment_date).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : 'TBD'}`,
      b.booking_time ? `⏰ *Time:* ${b.booking_time.slice(0, 5)}` : '',
      `🚗 *Vehicle:* ${b.reg_number}${b.model ? ` — ${b.model}` : ''}`,
      b.service_type ? `🔧 *Service:* ${b.service_type}` : '',
      b.branch ? `📍 *Branch:* ${b.branch}` : '',
      ``,
      `Please arrive 5-10 min early. For queries, reply to this message.`,
      ``,
      `Thank you for choosing Techwheels! 🙏`,
    ].filter(l => l !== undefined && l !== null && !(l === '' && !b.appointment_date))
    setWaModal({ booking: b, message: lines.filter(Boolean).join('\n') })
  }

  const hasPanel = showForm || !!selectedBooking
  const inp: React.CSSProperties = {
    border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.45rem 0.65rem',
    fontSize: '0.82rem', outline: 'none', background: '#fff', color: '#1e293b',
    width: '100%', boxSizing: 'border-box', transition: 'border-color 0.15s',
  }
  const selInp: React.CSSProperties = { ...inp, cursor: 'pointer' }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#f8fafc', fontFamily: 'inherit' }}>

      {/* ── Header ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.7rem 1rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>📋 Service Bookings</h1>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>Manage appointments, telecalling & walk-ins</p>
          </div>
          <div style={{ flex: 1 }} />
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
          <button onClick={openNew} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '1rem' }}>＋</span> New Booking
          </button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>
        {[
          { label: 'Total', value: stats.total, color: '#334155', bg: '#f1f5f9', border: '#cbd5e1' },
          { label: 'New', value: stats.new, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
          { label: 'Confirmed', value: stats.confirmed, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
          { label: 'Active', value: stats.arrived, color: '#7c3aed', bg: '#faf5ff', border: '#e9d5ff' },
          { label: 'Completed', value: stats.completed, color: '#15803d', bg: '#dcfce7', border: '#86efac' },
          { label: 'Cancelled', value: stats.cancelled, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
          { label: 'Converted →JC', value: stats.converted, color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
          { label: '📞 Telecalling', value: stats.telecalling, color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
          { label: '💬 WhatsApp', value: stats.whatsapp, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: '8px', padding: '0.3rem 0.7rem', textAlign: 'center', minWidth: '68px' }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
            <div style={{ fontSize: '0.62rem', color: '#64748b', whiteSpace: 'nowrap', marginTop: '1px' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Filter Bar ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.45rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: '240px' }}>
          <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}>🔍</span>
          <input style={{ ...inp, paddingLeft: '1.8rem', fontSize: '0.78rem' }}
            placeholder="Name / Phone / Reg…"
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>

        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          style={{ ...selInp, width: 'auto', fontSize: '0.78rem', padding: '0.38rem 0.6rem' }}>
          <option value="all">All Sources</option>
          {BOOKING_SOURCES.map(s => <option key={s}>{s}</option>)}
        </select>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ ...selInp, width: 'auto', fontSize: '0.78rem', padding: '0.38rem 0.6rem' }}>
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>

        {branches.length > 0 && (
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            style={{ ...selInp, width: 'auto', fontSize: '0.78rem', padding: '0.38rem 0.6rem' }}>
            <option value="all">All Branches</option>
            {branches.map(b => <option key={b}>{b}</option>)}
          </select>
        )}

        <div style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: 'auto' }}>
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.4rem 1rem', fontSize: '0.78rem', borderBottom: '1px solid #fca5a5', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ⚠️ {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.9rem' }}>✕</button>
        </div>
      )}

      {/* ── Main 2-col layout ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── LEFT: List ── */}
        <div style={{ width: hasPanel ? '44%' : '100%', flexShrink: 0, overflow: 'auto', borderRight: hasPanel ? '1px solid #e2e8f0' : 'none', transition: 'width 0.2s' }}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              <Icon name="spinner" size={24} className="spin" />
              <p style={{ marginTop: '0.6rem', fontSize: '0.85rem' }}>Loading bookings…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📋</div>
              <p style={{ fontWeight: 700, color: '#475569', fontSize: '0.95rem' }}>No bookings found</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>Adjust filters or create a new booking.</p>
              <button onClick={openNew} style={{ marginTop: '1rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.45rem 1.1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>+ New Booking</button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid #e2e8f0' }}>
                  {(hasPanel
                    ? ['Lead #', 'Customer', 'Vehicle', 'Appt.', 'Status', '']
                    : ['Lead #', 'Source', 'Customer', 'Vehicle', 'Appointment', 'Status', '']
                  ).map(h => (
                    <th key={h} style={{ padding: '0.5rem 0.65rem', textAlign: 'left', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap', fontSize: '0.7rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => {
                  const sc = STATUS_META[b.status] ?? { bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' }
                  const isSelected = selectedBooking?.id === b.id
                  return (
                    <tr key={b.id} onClick={() => openDetail(b)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: isSelected ? '#eff6ff' : '#fff', transition: 'background 0.1s' }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#fff' }}>
                      {/* Lead # */}
                      <td style={{ padding: '0.5rem 0.65rem', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: '#2563eb', fontSize: '0.78rem' }}>{b.lead_number || `#${b.id}`}</div>
                        {b.jc_number && <div style={{ fontSize: '0.63rem', color: '#16a34a', fontWeight: 600 }}>✓ {b.jc_number}</div>}
                      </td>
                      {/* Source (full view only) */}
                      {!hasPanel && (
                        <td style={{ padding: '0.5rem 0.65rem', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.9rem' }}>{SOURCE_ICON[b.booking_source] ?? '📋'}</span>
                          <span style={{ marginLeft: '0.3rem', color: '#64748b', fontSize: '0.75rem' }}>{b.booking_source}</span>
                        </td>
                      )}
                      {/* Customer */}
                      <td style={{ padding: '0.5rem 0.65rem' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{b.customer_name}</div>
                        <div style={{ color: '#64748b', fontSize: '0.7rem' }}>{b.customer_phone}</div>
                      </td>
                      {/* Vehicle */}
                      <td style={{ padding: '0.5rem 0.65rem' }}>
                        <div style={{ fontWeight: 700, color: '#334155', fontSize: '0.78rem' }}>{b.reg_number}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.68rem' }}>{[b.model, b.fuel_type].filter(Boolean).join(' · ')}</div>
                      </td>
                      {/* Appointment */}
                      <td style={{ padding: '0.5rem 0.65rem', whiteSpace: 'nowrap' }}>
                        {b.appointment_date
                          ? <><div style={{ color: '#334155', fontWeight: 600, fontSize: '0.75rem' }}>{new Date(b.appointment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
                            {b.booking_time && <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{b.booking_time.slice(0, 5)}</div>}</>
                          : <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>—</span>}
                      </td>
                      {/* Status */}
                      <td style={{ padding: '0.5rem 0.65rem' }}>
                        <span style={{ background: sc.bg, color: sc.color, padding: '0.18rem 0.55rem', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: sc.dot, display: 'inline-block' }} />
                          {b.status}
                        </span>
                      </td>
                      {/* Actions */}
                      <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>
                        <button type="button" title="Edit" onClick={e => { e.stopPropagation(); openEdit(b) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', fontSize: '0.9rem', borderRadius: '4px' }}>✏️</button>
                        <button type="button" title="WhatsApp" onClick={e => { e.stopPropagation(); openWhatsApp(b) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', fontSize: '0.9rem', borderRadius: '4px' }}>💬</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── RIGHT Panel ── */}
        {hasPanel && (
          <div style={{ flex: 1, overflow: 'auto', background: '#fff' }}>

            {/* ══ BOOKING FORM ══ */}
            {showForm ? (
              <div style={{ padding: '1.1rem 1.25rem' }}>
                {/* Form Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: formMode === 'new' ? '#eff6ff' : '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                    {formMode === 'new' ? '➕' : '✏️'}
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>
                      {formMode === 'new' ? 'New Service Booking' : `Edit — ${form.lead_number || 'Booking'}`}
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8' }}>
                      {formMode === 'new' ? 'Fill in the details to create a booking' : 'Update booking details below'}
                    </p>
                  </div>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => { setShowForm(false); if (formMode === 'new') setSelectedBooking(null) }}
                    style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '0.35rem 0.75rem', fontSize: '0.78rem', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving}
                    style={{ background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.35rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                    {saving ? 'Saving…' : formMode === 'new' ? 'Create Booking' : 'Save Changes'}
                  </button>
                </div>

                {/* Form Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>

                  <FieldGroup title="Booking Info" icon="📅" />

                  <Field label="Booking Source" required>
                    <select style={selInp} value={form.booking_source ?? ''} onChange={e => setForm(p => ({ ...p, booking_source: e.target.value }))}>
                      <option value="">Select source…</option>
                      {BOOKING_SOURCES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </Field>

                  <Field label="Booking Date" required>
                    <input type="date" style={inp} value={form.booking_date ?? ''} onChange={e => setForm(p => ({ ...p, booking_date: e.target.value }))} />
                  </Field>

                  <Field label="Appointment Date">
                    <input type="date" style={inp} value={form.appointment_date ?? ''} onChange={e => setForm(p => ({ ...p, appointment_date: e.target.value }))} />
                  </Field>

                  <Field label="Preferred Time">
                    <input type="time" style={inp} value={form.booking_time ?? ''} onChange={e => setForm(p => ({ ...p, booking_time: e.target.value }))} />
                  </Field>

                  <Field label="Branch" span>
                    <select style={selInp} value={form.branch ?? ''} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))}>
                      <option value="">Select branch…</option>
                      {branches.map(b => <option key={b}>{b}</option>)}
                    </select>
                  </Field>

                  <FieldGroup title="Customer Details" icon="👤" />

                  <Field label="Customer Name" required>
                    <input style={inp} placeholder="Full name" value={form.customer_name ?? ''} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} />
                  </Field>

                  <Field label="Mobile Number" required>
                    <input style={inp} inputMode="numeric" placeholder="10-digit mobile" value={form.customer_phone ?? ''} onChange={e => setForm(p => ({ ...p, customer_phone: e.target.value }))} />
                  </Field>

                  <FieldGroup title="Vehicle Details" icon="🚗" />

                  <Field label="Registration Number" required>
                    <input style={inp} placeholder="e.g. RJ14XX1234" value={form.reg_number ?? ''} onChange={e => setForm(p => ({ ...p, reg_number: e.target.value.toUpperCase() }))} />
                  </Field>

                  <Field label="Model">
                    <select style={selInp} value={form.model ?? ''} onChange={e => setForm(p => ({ ...p, model: e.target.value }))}>
                      <option value="">Select model…</option>
                      {TATA_MODELS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </Field>

                  <Field label="Fuel Type">
                    <select style={selInp} value={form.fuel_type ?? ''} onChange={e => setForm(p => ({ ...p, fuel_type: e.target.value }))}>
                      <option value="">Select…</option>
                      {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
                    </select>
                  </Field>

                  <Field label="KM Reading">
                    <input type="number" style={inp} placeholder="Current odometer" value={form.km_reading ?? ''} onChange={e => setForm(p => ({ ...p, km_reading: parseInt(e.target.value) || null }))} />
                  </Field>

                  <FieldGroup title="Service Details" icon="🔧" />

                  <Field label="Service Type" span>
                    <select style={selInp} value={form.service_type ?? ''} onChange={e => setForm(p => ({ ...p, service_type: e.target.value }))}>
                      <option value="">Select type…</option>
                      {SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </Field>

                  {/* Pickup / Drop */}
                  <div style={{ gridColumn: 'span 2', display: 'flex', gap: '1.5rem', alignItems: 'center', background: '#f8fafc', borderRadius: '8px', padding: '0.55rem 0.8rem', border: '1px solid #e2e8f0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 500, color: '#475569' }}>
                      <input type="checkbox" checked={!!form.pickup_required} onChange={e => setForm(p => ({ ...p, pickup_required: e.target.checked }))} style={{ width: '14px', height: '14px' }} />
                      🚐 Pickup Required
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 500, color: '#475569' }}>
                      <input type="checkbox" checked={!!form.drop_required} onChange={e => setForm(p => ({ ...p, drop_required: e.target.checked }))} style={{ width: '14px', height: '14px' }} />
                      🏠 Drop Required
                    </label>
                  </div>

                  {(form.pickup_required || form.drop_required) && (
                    <Field label="Pickup / Drop Address" span>
                      <input style={inp} placeholder="Full address for pickup/drop" value={form.pickup_address ?? ''} onChange={e => setForm(p => ({ ...p, pickup_address: e.target.value }))} />
                    </Field>
                  )}

                  {/* Telecalling section */}
                  {form.booking_source === 'Telecalling' && (<>
                    <FieldGroup title="Telecalling Details" icon="📞" />
                    <Field label="Caller Name">
                      <input style={inp} placeholder="Who made the call" value={form.caller_name ?? ''} onChange={e => setForm(p => ({ ...p, caller_name: e.target.value }))} />
                    </Field>
                    <Field label="Call Attempt">
                      <select style={selInp} value={form.call_attempt ?? 1} onChange={e => setForm(p => ({ ...p, call_attempt: parseInt(e.target.value) }))}>
                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}{n===1?'st':n===2?'nd':n===3?'rd':'th'} Call</option>)}
                      </select>
                    </Field>
                    <Field label="Call Outcome">
                      <select style={selInp} value={form.call_outcome ?? ''} onChange={e => setForm(p => ({ ...p, call_outcome: e.target.value }))}>
                        <option value="">Select…</option>
                        {CALL_OUTCOMES.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </Field>
                  </>)}

                  {/* WhatsApp section */}
                  {form.booking_source === 'WhatsApp' && (<>
                    <FieldGroup title="WhatsApp Details" icon="💬" />
                    <Field label="Conversation ID / Reference">
                      <input style={inp} placeholder="WA thread ID or reference" value={form.wa_conversation_id ?? ''} onChange={e => setForm(p => ({ ...p, wa_conversation_id: e.target.value }))} />
                    </Field>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 500 }}>
                        <input type="checkbox" checked={!!form.wa_opt_in} onChange={e => setForm(p => ({ ...p, wa_opt_in: e.target.checked }))} />
                        Customer opted-in for WA updates
                      </label>
                    </div>
                  </>)}

                  {/* JC Conversion (edit only) */}
                  {formMode === 'edit' && (<>
                    <FieldGroup title="JC Conversion" icon="🔁" />
                    <Field label="Job Card Number">
                      <input style={inp} placeholder="e.g. JCXXXX" value={form.jc_number ?? ''} onChange={e => setForm(p => ({ ...p, jc_number: e.target.value }))} />
                    </Field>
                    <Field label="Status">
                      <select style={selInp} value={form.status ?? ''} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                        {STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </Field>
                  </>)}

                </div>
              </div>

            ) : selectedBooking ? (
              /* ══ DETAIL VIEW ══ */
              <div style={{ padding: '1.1rem 1.25rem' }}>

                {/* Detail Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.85rem', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>
                        {selectedBooking.lead_number || `Booking #${selectedBooking.id}`}
                      </h2>
                      {(() => { const sc = STATUS_META[selectedBooking.status] ?? { bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' }; return (
                        <span style={{ background: sc.bg, color: sc.color, padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: sc.dot }} />
                          {selectedBooking.status}
                        </span>
                      )})()}
                      <span style={{ fontSize: '0.78rem' }}>{SOURCE_ICON[selectedBooking.booking_source] ?? '📋'}</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{selectedBooking.booking_source}</span>
                    </div>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                      Created {new Date(selectedBooking.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <button onClick={() => openEdit(selectedBooking)}
                    style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '7px', padding: '0.35rem 0.8rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', color: '#b45309' }}>
                    ✏️ Edit
                  </button>
                  <button onClick={() => { setSelectedBooking(null); setFollowups([]) }}
                    style={{ background: '#f1f5f9', border: 'none', borderRadius: '7px', padding: '0.35rem 0.6rem', fontSize: '0.82rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
                </div>

                {/* Quick Status Change */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick Status Update</div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {STATUSES.map(s => {
                      const sc = STATUS_META[s] ?? { bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' }
                      const isActive = selectedBooking.status === s
                      return (
                        <button key={s} onClick={() => updateStatus(selectedBooking, s)}
                          style={{ background: isActive ? sc.bg : '#f8fafc', color: isActive ? sc.color : '#64748b', border: `1px solid ${isActive ? sc.dot + '60' : '#e2e8f0'}`, borderRadius: '20px', padding: '0.2rem 0.6rem', fontSize: '0.7rem', fontWeight: isActive ? 800 : 500, cursor: 'pointer', transition: 'all 0.1s' }}>
                          {s}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Details grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1rem' }}>

                  {/* Customer Card */}
                  <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.85rem', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.55rem' }}>👤 Customer</div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>{selectedBooking.customer_name}</div>
                    <div style={{ fontSize: '0.82rem', color: '#2563eb', fontWeight: 600, marginTop: '0.2rem' }}>{selectedBooking.customer_phone}</div>
                    {selectedBooking.alt_phone && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Alt: {selectedBooking.alt_phone}</div>}
                    {selectedBooking.customer_email && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.15rem' }}>{selectedBooking.customer_email}</div>}
                  </div>

                  {/* Vehicle Card */}
                  <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.85rem', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.55rem' }}>🚗 Vehicle</div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1e293b', letterSpacing: '0.03em' }}>{selectedBooking.reg_number}</div>
                    <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '0.15rem' }}>{[selectedBooking.model, selectedBooking.variant].filter(Boolean).join(' ')}</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.15rem' }}>{[selectedBooking.fuel_type, selectedBooking.km_reading ? `${selectedBooking.km_reading.toLocaleString()} km` : null].filter(Boolean).join(' · ')}</div>
                  </div>

                  {/* Appointment Card */}
                  <div style={{ background: '#eff6ff', borderRadius: '10px', padding: '0.85rem', border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.55rem' }}>📅 Appointment</div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                      {selectedBooking.appointment_date ? new Date(selectedBooking.appointment_date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : 'Not scheduled'}
                    </div>
                    {selectedBooking.booking_time && <div style={{ fontSize: '0.78rem', color: '#2563eb', fontWeight: 600 }}>⏰ {selectedBooking.booking_time.slice(0, 5)}</div>}
                    {selectedBooking.branch && <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.15rem' }}>📍 {selectedBooking.branch}</div>}
                  </div>

                  {/* Service Card */}
                  <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '0.85rem', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.55rem' }}>🔧 Service</div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>{selectedBooking.service_type || 'Not specified'}</div>
                    {selectedBooking.jc_number && (
                      <div style={{ marginTop: '0.35rem', display: 'inline-block', background: '#dcfce7', color: '#15803d', borderRadius: '20px', padding: '0.15rem 0.55rem', fontSize: '0.7rem', fontWeight: 800 }}>
                        ✓ JC: {selectedBooking.jc_number}
                      </div>
                    )}
                    {(selectedBooking.pickup_required || selectedBooking.drop_required) && (
                      <div style={{ fontSize: '0.72rem', color: '#16a34a', marginTop: '0.25rem' }}>
                        {[selectedBooking.pickup_required && '🚐 Pickup', selectedBooking.drop_required && '🏠 Drop'].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* JC Conversion highlight */}
                {selectedBooking.jc_number && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '0.65rem 0.85rem', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>✅</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#15803d' }}>Converted to Job Card</div>
                      <div style={{ fontSize: '0.72rem', color: '#16a34a' }}>JC: {selectedBooking.jc_number}{selectedBooking.converted_at ? ` · ${new Date(selectedBooking.converted_at).toLocaleDateString('en-IN')}` : ''}</div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => openWhatsApp(selectedBooking)}
                      style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.3rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                      💬 Send Confirmation
                    </button>
                  </div>
                )}

                {/* Pickup address */}
                {selectedBooking.pickup_address && (
                  <div style={{ background: '#faf5ff', borderRadius: '8px', padding: '0.6rem 0.85rem', marginBottom: '0.85rem', fontSize: '0.8rem', color: '#7c3aed', border: '1px solid #e9d5ff' }}>
                    📍 <strong>Pickup/Drop Address:</strong> {selectedBooking.pickup_address}
                  </div>
                )}

                {/* Source-specific info */}
                {selectedBooking.booking_source === 'Telecalling' && (selectedBooking.caller_name || selectedBooking.call_outcome) && (
                  <div style={{ background: '#f0f9ff', borderRadius: '8px', padding: '0.6rem 0.85rem', marginBottom: '0.85rem', border: '1px solid #bae6fd', fontSize: '0.78rem', color: '#0369a1' }}>
                    📞 <strong>Call:</strong> {[selectedBooking.caller_name, selectedBooking.call_attempt ? `Attempt #${selectedBooking.call_attempt}` : null, selectedBooking.call_outcome].filter(Boolean).join(' · ')}
                  </div>
                )}

                {/* Follow-ups section */}
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔁 Follow-ups ({followups.length})</span>
                    <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                    <button onClick={() => setShowFollowupForm(p => !p)}
                      style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.25rem 0.65rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                      {showFollowupForm ? '✕ Cancel' : '+ Add'}
                    </button>
                  </div>

                  {showFollowupForm && (
                    <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.85rem', marginBottom: '0.75rem', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>Channel</span>
                          <select style={selInp} value={followupForm.channel} onChange={e => setFollowupForm(p => ({ ...p, channel: e.target.value }))}>
                            {['Call', 'WhatsApp', 'SMS', 'Email', 'Visit'].map(c => <option key={c}>{c}</option>)}
                          </select>
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>Outcome</span>
                          <select style={selInp} value={followupForm.outcome} onChange={e => setFollowupForm(p => ({ ...p, outcome: e.target.value }))}>
                            <option value="">Select…</option>
                            {['Confirmed', 'Callback', 'Not Reachable', 'Rescheduled', 'Cancelled'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', gridColumn: 'span 2' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>Note *</span>
                          <textarea style={{ ...inp, resize: 'vertical' }} rows={2} placeholder="What happened in this follow-up?" value={followupForm.note} onChange={e => setFollowupForm(p => ({ ...p, note: e.target.value }))} />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>Next Follow-up Date</span>
                          <input type="date" style={inp} value={followupForm.next_follow_up} onChange={e => setFollowupForm(p => ({ ...p, next_follow_up: e.target.value }))} />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>Done By</span>
                          <input style={inp} placeholder="Your name" value={followupForm.done_by} onChange={e => setFollowupForm(p => ({ ...p, done_by: e.target.value }))} />
                        </label>
                      </div>
                      <div style={{ marginTop: '0.65rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button onClick={handleSaveFollowup} disabled={savingFollowup}
                          style={{ background: savingFollowup ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.38rem 1rem', fontSize: '0.8rem', fontWeight: 700, cursor: savingFollowup ? 'not-allowed' : 'pointer' }}>
                          {savingFollowup ? 'Saving…' : '✓ Save Follow-up'}
                        </button>
                      </div>
                    </div>
                  )}

                  {followups.length === 0 && !showFollowupForm && (
                    <div style={{ textAlign: 'center', padding: '1.2rem', color: '#94a3b8', fontSize: '0.8rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                      No follow-ups yet. Add the first one above.
                    </div>
                  )}

                  {followups.map(f => (
                    <div key={f.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.85rem', marginBottom: '0.45rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e293b' }}>{f.channel ?? 'Note'}</span>
                        {f.outcome && <span style={{ background: '#f0fdf4', color: '#16a34a', borderRadius: '20px', padding: '0.1rem 0.4rem', fontSize: '0.65rem', fontWeight: 700 }}>{f.outcome}</span>}
                        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#94a3b8' }}>{new Date(f.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#475569' }}>{f.note}</div>
                      {f.next_follow_up && <div style={{ fontSize: '0.68rem', color: '#0284c7', marginTop: '0.2rem' }}>📅 Next: {new Date(f.next_follow_up).toLocaleDateString('en-IN')}</div>}
                      {f.done_by && <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.15rem' }}>by {f.done_by}</div>}
                    </div>
                  ))}
                </div>

              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* ── WhatsApp Modal ── */}
      {waModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '440px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ background: '#16a34a', color: '#fff', padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.2rem' }}>💬</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Send WhatsApp Confirmation</div>
                <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>{waModal.booking.customer_name} · {waModal.booking.customer_phone}</div>
              </div>
              <button onClick={() => setWaModal(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>
            <div style={{ padding: '1rem' }}>
              <textarea
                style={{ ...inp, fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical', minHeight: '180px' }}
                value={waModal.message}
                onChange={e => setWaModal(m => m ? { ...m, message: e.target.value } : null)}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button onClick={() => setWaModal(null)}
                  style={{ flex: 1, background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '0.5rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', color: '#64748b' }}>
                  Cancel
                </button>
                <a href={`https://wa.me/91${waModal.booking.customer_phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(waModal.message)}`}
                  target="_blank" rel="noreferrer"
                  style={{ flex: 2, background: '#16a34a', color: '#fff', borderRadius: '8px', padding: '0.5rem', fontSize: '0.85rem', fontWeight: 700, textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                  <span>💬</span> Open WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
