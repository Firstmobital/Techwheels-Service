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

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  New:           { bg: '#eff6ff', color: '#2563eb' },
  Confirmed:     { bg: '#f0fdf4', color: '#16a34a' },
  Rescheduled:   { bg: '#fffbeb', color: '#d97706' },
  Arrived:       { bg: '#f0f9ff', color: '#0284c7' },
  'In-Progress': { bg: '#faf5ff', color: '#7c3aed' },
  Completed:     { bg: '#dcfce7', color: '#15803d' },
  Cancelled:     { bg: '#fef2f2', color: '#dc2626' },
  'No-Show':     { bg: '#f8fafc', color: '#64748b' },
}

const SOURCE_ICON: Record<string, string> = {
  Telecalling: '📞', WhatsApp: '💬', 'Walk-in': '🚶', Self: '🙋',
  'Driver Pickup': '🚗', Referral: '👥',
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ServiceBooking {
  id: number
  lead_number: string
  booking_date: string
  booking_time: string | null
  appointment_date: string | null
  booking_source: string
  reg_number: string
  model: string | null
  variant: string | null
  fuel_type: string | null
  mfg_year: number | null
  km_reading: number | null
  customer_name: string
  customer_phone: string
  alt_phone: string | null
  customer_email: string | null
  customer_address: string | null
  service_type: string | null
  complaint_description: string | null
  special_requests: string | null
  pickup_required: boolean
  drop_required: boolean
  pickup_address: string | null
  branch: string | null
  assigned_sa: string | null
  assigned_sa_name: string | null
  status: string
  status_reason: string | null
  rescheduled_date: string | null
  caller_name: string | null
  call_attempt: number | null
  call_outcome: string | null
  wa_conversation_id: string | null
  wa_opt_in: boolean
  jc_number: string | null
  converted_at: string | null
  created_at: string
  updated_at: string
}

interface FollowUp {
  id: number
  booking_id: number
  follow_up_date: string
  channel: string | null
  note: string | null
  outcome: string | null
  next_follow_up: string | null
  done_by: string | null
  created_at: string
}

type DateRange = { from: string; to: string }

type FormMode = 'new' | 'edit'

const EMPTY_FORM: Partial<ServiceBooking> = {
  booking_source: 'Telecalling',
  status: 'New',
  booking_date: new Date().toISOString().split('T')[0],
  pickup_required: false,
  drop_required: false,
  wa_opt_in: false,
  call_attempt: 1,
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ServiceBookingPage() {
  const [bookings, setBookings] = useState<ServiceBooking[]>([])
  const [followups, setFollowups] = useState<FollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [branches, setBranches] = useState<string[]>([])
  const [saList, setSaList] = useState<{ code: string; name: string }[]>([])

  // Filters
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const todayStr = today.toISOString().split('T')[0]
  const [dateRange, setDateRange] = useState<DateRange>({ from: firstOfMonth, to: todayStr })
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Detail / form panel
  const [selectedBooking, setSelectedBooking] = useState<ServiceBooking | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>('new')
  const [form, setForm] = useState<Partial<ServiceBooking>>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [savingFollowup, setSavingFollowup] = useState(false)
  const [followupForm, setFollowupForm] = useState({ channel: 'Call', note: '', outcome: '', next_follow_up: '', done_by: '' })
  const [showFollowupForm, setShowFollowupForm] = useState(false)

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    void loadBranchesAndSAs()
  }, [])

  useEffect(() => {
    void loadBookings()
  }, [dateRange])

  async function loadBranchesAndSAs() {
    const [branchRes, saRes] = await Promise.all([
      supabase.from('service_branches').select('name').order('name'),
      supabase.from('employees').select('employee_code, name').eq('is_active', true).order('name'),
    ])
    if (branchRes.data) setBranches((branchRes.data as { name: string }[]).map(b => b.name))
    if (saRes.data) setSaList((saRes.data as { employee_code: string; name: string }[]).map(e => ({ code: e.employee_code, name: e.name })))
  }

  async function loadBookings() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('service_bookings')
      .select('*')
      .gte('booking_date', dateRange.from)
      .lte('booking_date', dateRange.to)
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setBookings((data ?? []) as ServiceBooking[])
    setLoading(false)
  }

  async function loadFollowups(bookingId: number) {
    const { data } = await supabase
      .from('service_booking_followups')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
    setFollowups((data ?? []) as FollowUp[])
  }

  // ── Filters ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = bookings
    if (sourceFilter !== 'all') rows = rows.filter(b => b.booking_source === sourceFilter)
    if (statusFilter !== 'all') rows = rows.filter(b => b.status === statusFilter)
    if (branchFilter !== 'all') rows = rows.filter(b => b.branch === branchFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      rows = rows.filter(b =>
        b.customer_name.toLowerCase().includes(q) ||
        b.customer_phone.includes(q) ||
        b.reg_number.toLowerCase().includes(q) ||
        (b.lead_number ?? '').toLowerCase().includes(q) ||
        (b.model ?? '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [bookings, sourceFilter, statusFilter, branchFilter, searchQuery])

  // ── Stats ───────────────────────────────────────────────────────────────────
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

  // ── Save booking ────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.reg_number?.trim()) { setError('Registration number is required'); return }
    if (!form.customer_name?.trim()) { setError('Customer name is required'); return }
    if (!form.customer_phone?.trim()) { setError('Customer phone is required'); return }
    if (form.customer_phone!.replace(/\D/g, '').length !== 10) { setError('Phone must be 10 digits'); return }
    if (!form.booking_source) { setError('Booking source is required'); return }

    setSaving(true)
    setError('')

    const payload = {
      ...form,
      reg_number: (form.reg_number ?? '').toUpperCase().trim(),
      customer_phone: (form.customer_phone ?? '').replace(/\D/g, ''),
    }

    let result
    if (formMode === 'edit' && selectedBooking) {
      result = await supabase.from('service_bookings').update(payload).eq('id', selectedBooking.id).select().single()
    } else {
      result = await supabase.from('service_bookings').insert([payload]).select().single()
    }

    if (result.error) {
      setError(result.error.message)
    } else {
      await loadBookings()
      const saved = result.data as ServiceBooking
      setSelectedBooking(saved)
      setShowForm(false)
      setForm(EMPTY_FORM)
    }
    setSaving(false)
  }

  // ── Save follow-up ──────────────────────────────────────────────────────────
  async function handleSaveFollowup() {
    if (!selectedBooking) return
    if (!followupForm.note.trim()) { setError('Please add a note for the follow-up'); return }
    setSavingFollowup(true)
    const { error: err } = await supabase.from('service_booking_followups').insert([{
      booking_id: selectedBooking.id,
      channel: followupForm.channel,
      note: followupForm.note,
      outcome: followupForm.outcome || null,
      next_follow_up: followupForm.next_follow_up || null,
      done_by: followupForm.done_by || null,
    }])
    if (err) { setError(err.message) }
    else {
      await loadFollowups(selectedBooking.id)
      setFollowupForm({ channel: 'Call', note: '', outcome: '', next_follow_up: '', done_by: '' })
      setShowFollowupForm(false)
    }
    setSavingFollowup(false)
  }

  // ── Quick status update ─────────────────────────────────────────────────────
  async function updateStatus(bookingId: number, status: string) {
    const { error: err } = await supabase
      .from('service_bookings')
      .update({ status })
      .eq('id', bookingId)
    if (!err) {
      await loadBookings()
      if (selectedBooking?.id === bookingId) {
        setSelectedBooking(prev => prev ? { ...prev, status } : prev)
      }
    }
  }

  // ── Open detail ─────────────────────────────────────────────────────────────
  function openDetail(booking: ServiceBooking) {
    setSelectedBooking(booking)
    setShowForm(false)
    void loadFollowups(booking.id)
  }

  function openNew() {
    setForm(EMPTY_FORM)
    setFormMode('new')
    setSelectedBooking(null)
    setShowForm(true)
    setFollowups([])
  }

  function openEdit(booking: ServiceBooking) {
    setForm({ ...booking })
    setFormMode('edit')
    setShowForm(true)
  }


  // ── WhatsApp send ───────────────────────────────────────────────────────────
  function openWhatsApp(booking: ServiceBooking) {
    const phone = '91' + booking.customer_phone.replace(/\D/g, '').slice(-10)

    const lines: string[] = []
    lines.push(`Hello ${booking.customer_name},`)
    lines.push('')
    lines.push(`📅 *Service Booking Confirmation*`)
    lines.push(`🔖 Booking ID: ${booking.lead_number || '#' + booking.id}`)
    lines.push('')
    lines.push(`🚗 *Vehicle Details*`)
    lines.push(`Reg. No.: *${booking.reg_number}*`)
    if (booking.model)      lines.push(`Model: ${booking.model}${booking.variant ? ' ' + booking.variant : ''}`)
    if (booking.fuel_type)  lines.push(`Fuel: ${booking.fuel_type}`)
    if (booking.km_reading) lines.push(`KM Reading: ${booking.km_reading.toLocaleString('en-IN')} km`)
    lines.push('')
    lines.push(`🔧 *Service Details*`)
    if (booking.service_type)          lines.push(`Service Type: ${booking.service_type}`)
    if (booking.appointment_date) {
      const d = new Date(booking.appointment_date).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      lines.push(`📆 Appointment: *${d}*`)
    }
    if (booking.booking_time)          lines.push(`⏰ Time: ${booking.booking_time.slice(0, 5)}`)
    if (booking.branch)                lines.push(`📍 Branch: ${booking.branch}`)
    if (booking.assigned_sa_name || booking.assigned_sa)
      lines.push(`👤 Service Advisor: ${booking.assigned_sa_name || booking.assigned_sa}`)
    if (booking.pickup_required)       lines.push(`🚐 Pickup: Arranged${booking.pickup_address ? ' from ' + booking.pickup_address : ''}`)
    if (booking.drop_required)         lines.push(`🏠 Drop: Arranged`)
    if (booking.complaint_description) lines.push(`\n📝 Concerns noted: ${booking.complaint_description}`)
    lines.push('')
    lines.push('Please arrive 10 minutes before your scheduled time.')
    lines.push('For any queries, contact us directly.')
    lines.push('')
    lines.push('Thank you,')
    lines.push('*Techwheels Service* 🚘')

    const message = lines.join('\n')
    const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent)
    const appUrl      = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`
    const fallbackUrl = isMobile
      ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
      : `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`

    const opened = window.open('', '_blank', 'noopener,noreferrer')
    if (opened) {
      opened.location.href = appUrl
      window.setTimeout(() => {
        try { if (!opened.closed) opened.location.href = fallbackUrl }
        catch { opened.location.href = fallbackUrl }
      }, 1400)
    } else {
      window.location.href = appUrl
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const hasPanel = selectedBooking || showForm

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
        padding: '0.55rem 0.85rem', background: '#fff', borderBottom: '1px solid #e2e8f0',
        flexShrink: 0, zIndex: 2,
      }}>
        <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1e293b', whiteSpace: 'nowrap' }}>📅 Service Booking</span>
        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>|</span>

        <DateRangeFilter range={dateRange} onChange={setDateRange} label="" />

        {/* Source pills */}
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {['all', ...BOOKING_SOURCES].map(s => (
            <button key={s} type="button"
              onClick={() => setSourceFilter(s)}
              style={{
                padding: '0.18rem 0.55rem', borderRadius: '20px', border: '1px solid',
                fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                background: sourceFilter === s ? '#2563eb' : '#f8fafc',
                color: sourceFilter === s ? '#fff' : '#64748b',
                borderColor: sourceFilter === s ? '#2563eb' : '#e2e8f0',
              }}>
              {s === 'all' ? 'All Sources' : `${SOURCE_ICON[s]} ${s}`}
            </button>
          ))}
        </div>

        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>|</span>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="inp"
          style={{ padding: '0.22rem 0.5rem', fontSize: '0.75rem', width: '140px' }}>
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>

        {/* Branch */}
        {branches.length > 0 && (
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            className="inp" style={{ padding: '0.22rem 0.5rem', fontSize: '0.75rem', width: '130px' }}>
            <option value="all">All Branches</option>
            {branches.map(b => <option key={b}>{b}</option>)}
          </select>
        )}

        {/* Search */}
        <input
          className="inp"
          placeholder="Search name / phone / reg…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ padding: '0.22rem 0.6rem', fontSize: '0.75rem', width: '190px' }}
        />

        <div style={{ flex: 1 }} />

        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={openNew}
          style={{ whiteSpace: 'nowrap' }}>
          + New Booking
        </button>
      </div>

      {/* ── Stats strip ── */}
      <div style={{
        display: 'flex', gap: '0.5rem', padding: '0.45rem 0.85rem', flexWrap: 'wrap',
        background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexShrink: 0,
      }}>
        {[
          { label: 'Total', value: stats.total, color: '#1e293b', bg: '#f1f5f9' },
          { label: 'New', value: stats.new, color: '#2563eb', bg: '#eff6ff' },
          { label: 'Confirmed', value: stats.confirmed, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Active', value: stats.arrived, color: '#7c3aed', bg: '#faf5ff' },
          { label: 'Completed', value: stats.completed, color: '#15803d', bg: '#dcfce7' },
          { label: 'Cancelled', value: stats.cancelled, color: '#dc2626', bg: '#fef2f2' },
          { label: '📞 Telecalling', value: stats.telecalling, color: '#0284c7', bg: '#f0f9ff' },
          { label: '💬 WhatsApp', value: stats.whatsapp, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Converted → JC', value: stats.converted, color: '#d97706', bg: '#fffbeb' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{ background: bg, borderRadius: '7px', padding: '0.3rem 0.65rem', border: `1px solid ${color}22`, minWidth: '72px', textAlign: 'center' }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: '0.65rem', color: '#64748b', whiteSpace: 'nowrap' }}>{label}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.4rem 0.85rem', fontSize: '0.78rem', borderBottom: '1px solid #fca5a5', flexShrink: 0 }}>
          ⚠️ {error} <button onClick={() => setError('')} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* ── Main 2-col layout ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 0 }}>

        {/* ── LEFT: List ── */}
        <div style={{
          width: hasPanel ? '42%' : '100%', flexShrink: 0, overflow: 'auto',
          borderRight: hasPanel ? '1px solid #e2e8f0' : 'none',
          transition: 'width 0.2s ease',
        }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
              <Icon name="spinner" size={22} className="spin" />
              <p style={{ marginTop: '0.5rem' }}>Loading bookings…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📋</div>
              <p style={{ fontWeight: 600 }}>No bookings found</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Try adjusting filters or create a new booking.</p>
              <button className="btn btn--primary btn--sm" style={{ marginTop: '0.75rem' }} onClick={openNew}>+ New Booking</button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                  {['Lead No.', 'Source', 'Customer', 'Vehicle', 'Appointment', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '0.45rem 0.6rem', textAlign: 'left', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => {
                  const sc = STATUS_COLOR[b.status] ?? { bg: '#f1f5f9', color: '#64748b' }
                  const isSelected = selectedBooking?.id === b.id
                  return (
                    <tr
                      key={b.id}
                      onClick={() => openDetail(b)}
                      style={{
                        cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                        background: isSelected ? '#eff6ff' : 'white',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'white' }}
                    >
                      <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap' }}>
                        {b.lead_number || `#${b.id}`}
                        {b.jc_number && <span style={{ display: 'block', fontSize: '0.65rem', color: '#16a34a', fontWeight: 600 }}>✓ JC: {b.jc_number}</span>}
                      </td>
                      <td style={{ padding: '0.45rem 0.6rem', whiteSpace: 'nowrap' }}>
                        <span title={b.booking_source} style={{ fontSize: '1rem' }}>{SOURCE_ICON[b.booking_source] ?? '📋'}</span>
                        {hasPanel ? '' : <span style={{ marginLeft: '0.3rem', color: '#64748b' }}>{b.booking_source}</span>}
                      </td>
                      <td style={{ padding: '0.45rem 0.6rem' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{b.customer_name}</div>
                        <div style={{ color: '#64748b', fontSize: '0.71rem' }}>{b.customer_phone}</div>
                      </td>
                      <td style={{ padding: '0.45rem 0.6rem' }}>
                        <div style={{ fontWeight: 600 }}>{b.reg_number}</div>
                        <div style={{ color: '#64748b', fontSize: '0.71rem' }}>{[b.model, b.fuel_type].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td style={{ padding: '0.45rem 0.6rem', whiteSpace: 'nowrap', color: '#475569' }}>
                        {b.appointment_date
                          ? new Date(b.appointment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                          : <span style={{ color: '#94a3b8' }}>—</span>}
                        {b.booking_time && <span style={{ display: 'block', fontSize: '0.68rem', color: '#94a3b8' }}>{b.booking_time.slice(0, 5)}</span>}
                      </td>
                      <td style={{ padding: '0.45rem 0.6rem' }}>
                        <span style={{ background: sc.bg, color: sc.color, padding: '0.15rem 0.5rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {b.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.45rem 0.4rem' }}>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); openEdit(b) }}
                          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem', padding: '0.2rem' }}
                          title="Edit">✏️</button>
                      <button
                          type="button"
                          onClick={e => { e.stopPropagation(); openWhatsApp(b) }}
                          style={{ background: 'none', border: 'none', color: '#16a34a', cursor: 'pointer', fontSize: '0.85rem', padding: '0.2rem' }}
                          title="Send WhatsApp Confirmation">💬</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── RIGHT: Detail or Form Panel ── */}
        {hasPanel && (
          <div style={{ flex: 1, overflow: 'auto', background: '#fff' }}>

            {/* ══ BOOKING FORM (New / Edit) ══ */}
            {showForm ? (
              <div style={{ padding: '1rem 1.2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>
                    {formMode === 'new' ? '➕ New Service Booking' : `✏️ Edit — ${form.lead_number || 'Booking'}`}
                  </h2>
                  <div style={{ flex: 1 }} />
                  <button className="btn btn--ghost btn--sm" onClick={() => { setShowForm(false); if (formMode === 'new') setSelectedBooking(null) }}>✕ Cancel</button>
                  <button className="btn btn--primary btn--sm" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : formMode === 'new' ? 'Create Booking' : 'Save Changes'}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>

                  {/* ── Section: Lead Info ── */}
                  <div style={{ gridColumn: 'span 2', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.3rem', marginBottom: '0.1rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>📋 Lead Information</span>
                  </div>

                  <label className="field">
                    <span className="label">Booking Source *</span>
                    <select className="inp" value={form.booking_source ?? 'Telecalling'} onChange={e => setForm(p => ({ ...p, booking_source: e.target.value }))}>
                      {BOOKING_SOURCES.map(s => <option key={s}>{SOURCE_ICON[s]} {s}</option>)}
                    </select>
                  </label>

                  <label className="field">
                    <span className="label">Status</span>
                    <select className="inp" value={form.status ?? 'New'} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </label>

                  <label className="field">
                    <span className="label">Booking Date *</span>
                    <input type="date" className="inp" value={form.booking_date ?? ''} onChange={e => setForm(p => ({ ...p, booking_date: e.target.value }))} />
                  </label>

                  <label className="field">
                    <span className="label">Appointment Date</span>
                    <input type="date" className="inp" value={form.appointment_date ?? ''} onChange={e => setForm(p => ({ ...p, appointment_date: e.target.value }))} />
                  </label>

                  <label className="field">
                    <span className="label">Preferred Time</span>
                    <input type="time" className="inp" value={form.booking_time ?? ''} onChange={e => setForm(p => ({ ...p, booking_time: e.target.value }))} />
                  </label>

                  <label className="field">
                    <span className="label">Branch</span>
                    <select className="inp" value={form.branch ?? ''} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))}>
                      <option value="">Select branch…</option>
                      {branches.map(b => <option key={b}>{b}</option>)}
                    </select>
                  </label>

                  {/* ── Section: Customer ── */}
                  <div style={{ gridColumn: 'span 2', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.3rem', marginBottom: '0.1rem', marginTop: '0.3rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>👤 Customer Details</span>
                  </div>

                  <label className="field">
                    <span className="label">Customer Name *</span>
                    <input className="inp" placeholder="Full name" value={form.customer_name ?? ''} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} />
                  </label>

                  <label className="field">
                    <span className="label">Mobile Number *</span>
                    <input className="inp" inputMode="numeric" placeholder="10-digit mobile" value={form.customer_phone ?? ''} onChange={e => setForm(p => ({ ...p, customer_phone: e.target.value }))} />
                  </label>

                  <label className="field">
                    <span className="label">Alternate Phone</span>
                    <input className="inp" inputMode="numeric" placeholder="Alt number" value={form.alt_phone ?? ''} onChange={e => setForm(p => ({ ...p, alt_phone: e.target.value }))} />
                  </label>

                  <label className="field">
                    <span className="label">Email</span>
                    <input className="inp" type="email" placeholder="email@example.com" value={form.customer_email ?? ''} onChange={e => setForm(p => ({ ...p, customer_email: e.target.value }))} />
                  </label>

                  <label className="field" style={{ gridColumn: 'span 2' }}>
                    <span className="label">Customer Address</span>
                    <input className="inp" placeholder="Full address" value={form.customer_address ?? ''} onChange={e => setForm(p => ({ ...p, customer_address: e.target.value }))} />
                  </label>

                  {/* ── Section: Vehicle ── */}
                  <div style={{ gridColumn: 'span 2', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.3rem', marginBottom: '0.1rem', marginTop: '0.3rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>🚗 Vehicle Details</span>
                  </div>

                  <label className="field">
                    <span className="label">Registration Number *</span>
                    <input className="inp" placeholder="e.g. RJ14XX1234" value={form.reg_number ?? ''} onChange={e => setForm(p => ({ ...p, reg_number: e.target.value.toUpperCase() }))} />
                  </label>

                  <label className="field">
                    <span className="label">Model</span>
                    <select className="inp" value={form.model ?? ''} onChange={e => setForm(p => ({ ...p, model: e.target.value }))}>
                      <option value="">Select model…</option>
                      {TATA_MODELS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </label>

                  <label className="field">
                    <span className="label">Variant</span>
                    <input className="inp" placeholder="e.g. XZ+, XMS" value={form.variant ?? ''} onChange={e => setForm(p => ({ ...p, variant: e.target.value }))} />
                  </label>

                  <label className="field">
                    <span className="label">Fuel Type</span>
                    <select className="inp" value={form.fuel_type ?? ''} onChange={e => setForm(p => ({ ...p, fuel_type: e.target.value }))}>
                      <option value="">Select…</option>
                      {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
                    </select>
                  </label>

                  <label className="field">
                    <span className="label">Mfg. Year</span>
                    <input className="inp" type="number" inputMode="numeric" placeholder="2022" value={form.mfg_year ?? ''} onChange={e => setForm(p => ({ ...p, mfg_year: parseInt(e.target.value) || undefined }))} />
                  </label>

                  <label className="field">
                    <span className="label">Current KM Reading</span>
                    <input className="inp" type="number" inputMode="numeric" placeholder="e.g. 15000" value={form.km_reading ?? ''} onChange={e => setForm(p => ({ ...p, km_reading: parseInt(e.target.value) || undefined }))} />
                  </label>

                  {/* ── Section: Service ── */}
                  <div style={{ gridColumn: 'span 2', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.3rem', marginBottom: '0.1rem', marginTop: '0.3rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>🔧 Service Details</span>
                  </div>

                  <label className="field">
                    <span className="label">Service Type</span>
                    <select className="inp" value={form.service_type ?? ''} onChange={e => setForm(p => ({ ...p, service_type: e.target.value }))}>
                      <option value="">Select type…</option>
                      {SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </label>

                  <label className="field">
                    <span className="label">Assigned SA</span>
                    <select className="inp" value={form.assigned_sa ?? ''} onChange={e => {
                      const sa = saList.find(s => s.code === e.target.value)
                      setForm(p => ({ ...p, assigned_sa: e.target.value, assigned_sa_name: sa?.name ?? '' }))
                    }}>
                      <option value="">Unassigned</option>
                      {saList.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                    </select>
                  </label>

                  <label className="field" style={{ gridColumn: 'span 2' }}>
                    <span className="label">Customer Complaints / Concerns</span>
                    <textarea className="inp" rows={2} placeholder="Describe what the customer reported…"
                      value={form.complaint_description ?? ''}
                      onChange={e => setForm(p => ({ ...p, complaint_description: e.target.value }))}
                      style={{ resize: 'vertical' }} />
                  </label>

                  <label className="field" style={{ gridColumn: 'span 2' }}>
                    <span className="label">Special Requests</span>
                    <textarea className="inp" rows={2} placeholder="Pickup/drop, specific parts, wash, etc."
                      value={form.special_requests ?? ''}
                      onChange={e => setForm(p => ({ ...p, special_requests: e.target.value }))}
                      style={{ resize: 'vertical' }} />
                  </label>

                  {/* Pickup / Drop */}
                  <div style={{ gridColumn: 'span 2', display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!form.pickup_required} onChange={e => setForm(p => ({ ...p, pickup_required: e.target.checked }))} />
                      🚐 Pickup Required
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!form.drop_required} onChange={e => setForm(p => ({ ...p, drop_required: e.target.checked }))} />
                      🏠 Drop Required
                    </label>
                  </div>

                  {(form.pickup_required || form.drop_required) && (
                    <label className="field" style={{ gridColumn: 'span 2' }}>
                      <span className="label">Pickup / Drop Address</span>
                      <input className="inp" placeholder="Full address for pickup/drop" value={form.pickup_address ?? ''} onChange={e => setForm(p => ({ ...p, pickup_address: e.target.value }))} />
                    </label>
                  )}

                  {/* ── Source-specific: Telecalling ── */}
                  {form.booking_source === 'Telecalling' && (
                    <>
                      <div style={{ gridColumn: 'span 2', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.3rem', marginBottom: '0.1rem', marginTop: '0.3rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0284c7', letterSpacing: '0.05em', textTransform: 'uppercase' }}>📞 Telecalling Details</span>
                      </div>
                      <label className="field">
                        <span className="label">Caller Name</span>
                        <input className="inp" placeholder="Who made the call" value={form.caller_name ?? ''} onChange={e => setForm(p => ({ ...p, caller_name: e.target.value }))} />
                      </label>
                      <label className="field">
                        <span className="label">Call Attempt #</span>
                        <select className="inp" value={form.call_attempt ?? 1} onChange={e => setForm(p => ({ ...p, call_attempt: parseInt(e.target.value) }))}>
                          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}{n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} Call</option>)}
                        </select>
                      </label>
                      <label className="field">
                        <span className="label">Call Outcome</span>
                        <select className="inp" value={form.call_outcome ?? ''} onChange={e => setForm(p => ({ ...p, call_outcome: e.target.value }))}>
                          <option value="">Select…</option>
                          {CALL_OUTCOMES.map(o => <option key={o}>{o}</option>)}
                        </select>
                      </label>
                    </>
                  )}

                  {/* ── Source-specific: WhatsApp ── */}
                  {form.booking_source === 'WhatsApp' && (
                    <>
                      <div style={{ gridColumn: 'span 2', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.3rem', marginBottom: '0.1rem', marginTop: '0.3rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#16a34a', letterSpacing: '0.05em', textTransform: 'uppercase' }}>💬 WhatsApp Details</span>
                      </div>
                      <label className="field">
                        <span className="label">Conversation ID / Reference</span>
                        <input className="inp" placeholder="WA thread ID or reference" value={form.wa_conversation_id ?? ''} onChange={e => setForm(p => ({ ...p, wa_conversation_id: e.target.value }))} />
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!form.wa_opt_in} onChange={e => setForm(p => ({ ...p, wa_opt_in: e.target.checked }))} />
                          Customer opted-in for WA updates
                        </label>
                      </div>
                    </>
                  )}

                  {/* ── JC Conversion (edit only) ── */}
                  {formMode === 'edit' && (
                    <>
                      <div style={{ gridColumn: 'span 2', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.3rem', marginBottom: '0.1rem', marginTop: '0.3rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#d97706', letterSpacing: '0.05em', textTransform: 'uppercase' }}>🔁 JC Conversion</span>
                      </div>
                      <label className="field">
                        <span className="label">Job Card Number (when converted)</span>
                        <input className="inp" placeholder="e.g. JCXXXX" value={form.jc_number ?? ''} onChange={e => setForm(p => ({ ...p, jc_number: e.target.value }))} />
                      </label>
                      {form.jc_number && (
                        <label className="field">
                          <span className="label">Conversion Date/Time</span>
                          <input type="datetime-local" className="inp" value={form.converted_at ? form.converted_at.slice(0, 16) : ''} onChange={e => setForm(p => ({ ...p, converted_at: e.target.value }))} />
                        </label>
                      )}
                    </>
                  )}

                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.2rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => { setShowForm(false); if (formMode === 'new') setSelectedBooking(null) }}>Cancel</button>
                  <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : formMode === 'new' ? '✅ Create Booking' : '💾 Save Changes'}
                  </button>
                </div>
              </div>

            ) : selectedBooking ? (

              /* ══ DETAIL VIEW ══ */
              <div style={{ padding: '1rem 1.2rem' }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>
                        {selectedBooking.lead_number || `Booking #${selectedBooking.id}`}
                      </h2>
                      <span style={{
                        background: STATUS_COLOR[selectedBooking.status]?.bg ?? '#f1f5f9',
                        color: STATUS_COLOR[selectedBooking.status]?.color ?? '#64748b',
                        padding: '0.2rem 0.65rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
                      }}>{selectedBooking.status}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                      {SOURCE_ICON[selectedBooking.booking_source]} {selectedBooking.booking_source} · Booked {new Date(selectedBooking.created_at).toLocaleDateString('en-IN')}
                    </div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <button className="btn btn--ghost btn--sm" onClick={() => openEdit(selectedBooking)}>✏️ Edit</button>
                  <button
                    className="btn btn--sm"
                    onClick={() => openWhatsApp(selectedBooking)}
                    style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    💬 Send WhatsApp
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => setSelectedBooking(null)}>✕</button>
                </div>

                {/* Quick status update */}
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.85rem', padding: '0.5rem 0.65rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, alignSelf: 'center', marginRight: '0.3rem' }}>Update Status:</span>
                  {STATUSES.map(s => {
                    const sc = STATUS_COLOR[s] ?? { bg: '#f1f5f9', color: '#64748b' }
                    const isActive = selectedBooking.status === s
                    return (
                      <button key={s} type="button"
                        onClick={() => void updateStatus(selectedBooking.id, s)}
                        style={{
                          padding: '0.2rem 0.55rem', borderRadius: '20px', border: `1px solid ${isActive ? sc.color : '#e2e8f0'}`,
                          fontSize: '0.69rem', fontWeight: 700, cursor: 'pointer',
                          background: isActive ? sc.bg : '#fff', color: isActive ? sc.color : '#64748b',
                        }}>{s}</button>
                    )
                  })}
                </div>

                {/* Info grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.85rem' }}>

                  {/* Customer Card */}
                  <InfoCard title="👤 Customer" items={[
                    { label: 'Name', value: selectedBooking.customer_name },
                    { label: 'Phone', value: selectedBooking.customer_phone },
                    { label: 'Alt Phone', value: selectedBooking.alt_phone },
                    { label: 'Email', value: selectedBooking.customer_email },
                    { label: 'Address', value: selectedBooking.customer_address },
                    { label: 'WA Opt-in', value: selectedBooking.wa_opt_in ? '✅ Yes' : undefined },
                  ]} />

                  {/* Vehicle Card */}
                  <InfoCard title="🚗 Vehicle" items={[
                    { label: 'Reg. No.', value: selectedBooking.reg_number, bold: true },
                    { label: 'Model', value: selectedBooking.model },
                    { label: 'Variant', value: selectedBooking.variant },
                    { label: 'Fuel', value: selectedBooking.fuel_type },
                    { label: 'Mfg. Year', value: selectedBooking.mfg_year?.toString() },
                    { label: 'KM Reading', value: selectedBooking.km_reading ? `${selectedBooking.km_reading.toLocaleString('en-IN')} km` : undefined },
                  ]} />

                  {/* Service Card */}
                  <InfoCard title="🔧 Service" items={[
                    { label: 'Type', value: selectedBooking.service_type },
                    { label: 'Appointment', value: selectedBooking.appointment_date ? new Date(selectedBooking.appointment_date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : undefined },
                    { label: 'Time', value: selectedBooking.booking_time?.slice(0, 5) },
                    { label: 'Branch', value: selectedBooking.branch },
                    { label: 'Assigned SA', value: selectedBooking.assigned_sa_name || selectedBooking.assigned_sa },
                    { label: 'Pickup', value: selectedBooking.pickup_required ? `✅ ${selectedBooking.pickup_address || 'Yes'}` : undefined },
                    { label: 'Drop', value: selectedBooking.drop_required ? '✅ Yes' : undefined },
                  ]} />

                  {/* Source-specific Card */}
                  {selectedBooking.booking_source === 'Telecalling' ? (
                    <InfoCard title="📞 Telecalling" items={[
                      { label: 'Caller', value: selectedBooking.caller_name },
                      { label: 'Attempt', value: selectedBooking.call_attempt?.toString() },
                      { label: 'Outcome', value: selectedBooking.call_outcome },
                    ]} />
                  ) : selectedBooking.booking_source === 'WhatsApp' ? (
                    <InfoCard title="💬 WhatsApp" items={[
                      { label: 'Conversation ID', value: selectedBooking.wa_conversation_id },
                      { label: 'WA Opt-in', value: selectedBooking.wa_opt_in ? '✅ Yes' : '❌ No' },
                    ]} />
                  ) : (
                    <InfoCard title="📋 Booking Info" items={[
                      { label: 'Source', value: `${SOURCE_ICON[selectedBooking.booking_source]} ${selectedBooking.booking_source}` },
                      { label: 'Booking Date', value: new Date(selectedBooking.booking_date).toLocaleDateString('en-IN') },
                    ]} />
                  )}

                </div>

                {/* Complaints / Special requests */}
                {(selectedBooking.complaint_description || selectedBooking.special_requests) && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.65rem 0.85rem', marginBottom: '0.85rem', fontSize: '0.8rem' }}>
                    {selectedBooking.complaint_description && (
                      <div style={{ marginBottom: selectedBooking.special_requests ? '0.4rem' : 0 }}>
                        <span style={{ fontWeight: 700, color: '#92400e' }}>⚠️ Complaints: </span>{selectedBooking.complaint_description}
                      </div>
                    )}
                    {selectedBooking.special_requests && (
                      <div><span style={{ fontWeight: 700, color: '#92400e' }}>💡 Special Requests: </span>{selectedBooking.special_requests}</div>
                    )}
                  </div>
                )}

                {/* JC Conversion badge */}
                {selectedBooking.jc_number && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '0.55rem 0.85rem', marginBottom: '0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700, color: '#15803d' }}>✅ Converted to Job Card:</span>
                    <span style={{ fontWeight: 800, color: '#15803d' }}>{selectedBooking.jc_number}</span>
                    {selectedBooking.converted_at && <span style={{ color: '#64748b', fontSize: '0.72rem' }}>on {new Date(selectedBooking.converted_at).toLocaleDateString('en-IN')}</span>}
                  </div>
                )}

                {/* ── Follow-ups ── */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>🔄 Follow-ups ({followups.length})</span>
                    <div style={{ flex: 1 }} />
                    <button className="btn btn--primary btn--sm" onClick={() => setShowFollowupForm(p => !p)}>
                      {showFollowupForm ? '✕ Cancel' : '+ Add Follow-up'}
                    </button>
                  </div>

                  {/* Add follow-up form */}
                  {showFollowupForm && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <label className="field">
                        <span className="label">Channel</span>
                        <select className="inp" value={followupForm.channel} onChange={e => setFollowupForm(p => ({ ...p, channel: e.target.value }))}>
                          {['Call', 'WhatsApp', 'Email', 'In-Person'].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </label>
                      <label className="field">
                        <span className="label">Outcome</span>
                        <select className="inp" value={followupForm.outcome} onChange={e => setFollowupForm(p => ({ ...p, outcome: e.target.value }))}>
                          <option value="">Select…</option>
                          {['Confirmed', 'Rescheduled', 'Declined', 'No-Response', 'Callback'].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </label>
                      <label className="field" style={{ gridColumn: 'span 2' }}>
                        <span className="label">Note *</span>
                        <textarea className="inp" rows={2} placeholder="What happened in this follow-up…" value={followupForm.note}
                          onChange={e => setFollowupForm(p => ({ ...p, note: e.target.value }))} style={{ resize: 'vertical' }} />
                      </label>
                      <label className="field">
                        <span className="label">Next Follow-up Date</span>
                        <input type="date" className="inp" value={followupForm.next_follow_up} onChange={e => setFollowupForm(p => ({ ...p, next_follow_up: e.target.value }))} />
                      </label>
                      <label className="field">
                        <span className="label">Done By</span>
                        <input className="inp" placeholder="Staff name" value={followupForm.done_by} onChange={e => setFollowupForm(p => ({ ...p, done_by: e.target.value }))} />
                      </label>
                      <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn--primary btn--sm" onClick={handleSaveFollowup} disabled={savingFollowup}>
                          {savingFollowup ? 'Saving…' : '✅ Save Follow-up'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Follow-up list */}
                  {followups.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.78rem', padding: '0.5rem 0' }}>No follow-ups yet. Add the first one above.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {followups.map(fu => (
                        <div key={fu.id} style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.55rem 0.75rem', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                            <span style={{ fontWeight: 700 }}>{fu.channel ?? 'Call'}</span>
                            {fu.outcome && (
                              <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '0.1rem 0.4rem', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 700 }}>{fu.outcome}</span>
                            )}
                            <span style={{ color: '#94a3b8', fontSize: '0.7rem', marginLeft: 'auto' }}>
                              {new Date(fu.follow_up_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                              {fu.done_by && ` · ${fu.done_by}`}
                            </span>
                          </div>
                          <div style={{ color: '#334155' }}>{fu.note}</div>
                          {fu.next_follow_up && (
                            <div style={{ color: '#d97706', fontSize: '0.7rem', marginTop: '0.2rem' }}>📅 Next follow-up: {new Date(fu.next_follow_up).toLocaleDateString('en-IN')}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Helper: InfoCard ─────────────────────────────────────────────────────────
function InfoCard({ title, items }: { title: string; items: { label: string; value?: string | null; bold?: boolean }[] }) {
  const visibleItems = items.filter(i => i.value != null && i.value !== '')
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
      <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#1e293b', marginBottom: '0.45rem' }}>{title}</div>
      {visibleItems.length === 0 ? (
        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>—</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', rowGap: '0.2rem', columnGap: '0.5rem', fontSize: '0.75rem' }}>
          {visibleItems.map(i => (
            <>
              <span key={`l-${i.label}`} style={{ color: '#94a3b8', whiteSpace: 'nowrap', alignSelf: 'start' }}>{i.label}</span>
              <span key={`v-${i.label}`} style={{ color: '#1e293b', fontWeight: i.bold ? 800 : 600 }}>{i.value}</span>
            </>
          ))}
        </div>
      )}
    </div>
  )
}
