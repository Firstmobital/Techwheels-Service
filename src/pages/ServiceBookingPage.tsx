import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/Icon'
import DateRangeFilter from '../components/DateRangeFilter'
import { exportToCSV, generateExportFilename } from '../lib/exportUtils'
import { hasBusinessRole } from '../lib/businessRoles'
import { listReceptionRegCreatedSince } from '../lib/api'

// ─── Constants ────────────────────────────────────────────────────────────────
const BOOKING_SOURCES = ['Customer App', 'Telecalling', 'WhatsApp', 'Walk-in', 'Self', 'Driver Pickup', 'Referral'] as const
const STATUSES = ['New', 'Confirmed', 'Rescheduled', 'Arrived', 'In-Progress', 'Completed', 'Cancelled', 'No-Show'] as const
const SERVICE_TYPES = [
  'Paid Service', 'Mini Paid Service', 'First Free Service', 'Second Free Service', 'Third Free Service',
  'Running Repairs', 'Accident', 'PDI', 'Campaign', 'E Breakdown', 'Updation',
]
const FUEL_TYPES = ['PV', 'EV']
const CALL_OUTCOMES = ['Connected', 'Not Reachable', 'Callback', 'Declined']
const PV_MODELS = [
  'Nexon', 'Punch', 'Punch CNG', 'Tiago', 'Tigor', 'Altroz',
  'Harrier', 'Safari', 'Curvv', 'Hexa', 'Sierra',
]
const EV_MODELS = [
  'Nexon EV', 'Punch EV', 'Tigor EV', 'Harrier EV', 'Curvv EV', 'Xpres T EV',
]

const TIME_SLOTS = [
  '9:00 – 10:00', '9:30 – 10:30', '10:00 – 11:00', '10:30 – 11:30',
  '11:00 – 12:00', '11:30 – 12:30', '12:00 – 13:00', '12:30 – 13:30',
  '13:00 – 14:00', '14:00 – 15:00', '14:30 – 15:30', '15:00 – 16:00',
  '15:30 – 16:30', '16:00 – 17:00',
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
  'Customer App': '📱', Telecalling: '📞', WhatsApp: '💬', 'Walk-in': '🚶', Self: '🙋',
  'Driver Pickup': '🚗', Referral: '👥',
}

// ─── Helper: Parse Customer App Booking from post_feedback_bot_data ──────────
function parseBotBookingToServiceBooking(bot: any): Partial<ServiceBooking> {
  const text = bot.feedback_text || ''
  const typeMatch = text.match(/Type:\s*([^\n\r]+)/i)
  const dateMatch = text.match(/Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i)
  const slotMatch = text.match(/Slot:\s*([^\n\r]+)/i)
  const branchMatch = text.match(/Branch:\s*([^\n\r]+)/i)
  const pickupMatch = text.match(/Pickup:\s*([^\n\r]+)/i)
  const complaintsMatch = text.match(/Complaints:\s*([\s\S]+)/i)

  const isPickup = pickupMatch ? pickupMatch[1].toLowerCase().startsWith('yes') : false
  let pickupAddress: string | null = null
  if (isPickup && pickupMatch) {
    const addrInParen = pickupMatch[1].match(/\((.+)\)/)
    pickupAddress = addrInParen ? addrInParen[1].trim() : null
  }

  const bookingDate = (bot.created_at || bot.complaint_date_time || new Date().toISOString()).slice(0, 10)
  const appointmentDate = dateMatch ? dateMatch[1] : bookingDate
  const bookingTime = slotMatch ? slotMatch[1].trim() : '09:30 – 10:30'
  const serviceType = typeMatch ? typeMatch[1].trim() : (bot.service_type || 'Running Repairs')
  const branch = branchMatch ? branchMatch[1].trim() : (bot.branch || 'Sitapura')
  const complaint = complaintsMatch ? complaintsMatch[1].trim() : (text.includes('Complaints:') ? null : text)

  return {
    booking_source: 'Customer App',
    status: 'New',
    booking_date: bookingDate,
    appointment_date: appointmentDate,
    booking_time: bookingTime,
    reg_number: (bot.vehicle_registration_number || '').trim().toUpperCase().replace(/\s+/g, ''),
    customer_name: bot.customer_name || 'Customer',
    customer_phone: (bot.mobile_number || '').replace(/\D/g, '').slice(-10),
    service_type: serviceType,
    branch: branch,
    model: bot.model || null,
    pickup_required: isPickup,
    drop_required: false,
    pickup_address: pickupAddress,
    complaint_description: complaint,
  }
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
  telecall_assignment_id: number | null; telecall_campaign_id: number | null
  call_notes: string | null; cre_name: string | null; driver_name: string | null
}
interface FollowUp {
  id: number; booking_id: number; follow_up_date: string; channel: string | null
  note: string | null; outcome: string | null; next_follow_up: string | null
  done_by: string | null; created_at: string
}
type DateRange = { from: string; to: string }
type FormMode = 'new' | 'edit'

const EMPTY_FORM: Partial<ServiceBooking> = {
  booking_source: 'Customer App', status: 'New',
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

function timeLabel(t: string | null): string | null {
  if (!t) return null
  if (t === 'Morning' || t === 'Afternoon' || t === 'Evening') return t
  // Legacy HH:MM:SS stored before the label fix
  const hour = parseInt(t.split(':')[0])
  if (isNaN(hour)) return t
  if (hour < 12) return 'Morning'
  if (hour < 16) return 'Afternoon'
  return 'Evening'
}

// Normalize registration numbers for comparison (Reception vs Booking may differ in casing/spacing)
function normReg(reg: string | null | undefined): string {
  return (reg ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ServiceBookingPage() {
  const [bookings, setBookings] = useState<ServiceBooking[]>([])
  const [followups, setFollowups] = useState<FollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [branches, setBranches] = useState<string[]>([])
  const [creUsers, setCreUsers] = useState<{ id: string; employee_name: string }[]>([])
  const [drivers, setDrivers] = useState<{ id: string; employee_name: string }[]>([])
  const [receptionEntries, setReceptionEntries] = useState<{ reg_number: string; created_at: string }[]>([])

  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const todayStr = today.toISOString().split('T')[0]
  const [dateRange, setDateRange] = useState<DateRange>({ from: firstOfMonth, to: todayStr })
  const [appointmentDateRange, setAppointmentDateRange] = useState<DateRange>({ from: '', to: '' })
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
  const [showDriverModal, setShowDriverModal] = useState(false)

  useEffect(() => { void loadBranchesAndSAs() }, [])
  useEffect(() => { void loadReceptionEntries() }, [])
  useEffect(() => { void loadBookings() }, [dateRange])

  async function loadBranchesAndSAs() {
    const branchRes = await supabase.from('service_branches').select('name').order('name')
    if (branchRes.data) setBranches((branchRes.data as { name: string }[]).map(b => b.name))
    const creRes = await supabase.from('employee_master').select('id, employee_name, role').eq('is_active', true).order('employee_name')
    if (creRes.data) {
      setCreUsers((creRes.data as { id: string; employee_name: string; role: string | null }[])
        .filter((u) => u.employee_name && (hasBusinessRole(u.role, 'CRE') || (u.role && u.role.toUpperCase().includes('CRE')))))
    }
    const driverRes = await supabase.from('employee_master').select('id, employee_name, role').eq('is_active', true).order('employee_name')
    if (driverRes.data) {
      setDrivers((driverRes.data as { id: string; employee_name: string; role: string | null }[])
        .filter((u) => u.employee_name && (hasBusinessRole(u.role, 'DRIVER') || (u.role && u.role.toUpperCase().includes('DRIVER')))))
    }
  }

  async function updateBookingFields(booking: ServiceBooking, updates: Partial<ServiceBooking>) {
    let updated = false
    try {
      const { data } = await supabase.from('service_bookings').update(updates).eq('id', booking.id).select()
      if (data && data.length > 0) updated = true
    } catch {}

    if (!updated && booking.reg_number) {
      try {
        let q = supabase.from('service_bookings').update(updates).eq('reg_number', booking.reg_number.toUpperCase())
        if (booking.appointment_date) q = q.eq('appointment_date', booking.appointment_date)
        const { data } = await q.select()
        if (data && data.length > 0) updated = true
      } catch {}
    }

    if (!updated) {
      try {
        const fullRow = { ...booking, ...updates }
        delete (fullRow as any).id
        await supabase.from('service_bookings').insert([fullRow])
      } catch {}
    }

    await loadBookings()
    setSelectedBooking(b => b?.id === booking.id ? { ...b, ...updates } as ServiceBooking : b)
  }

  async function updateDriver(booking: ServiceBooking, driverName: string | null) {
    await updateBookingFields(booking, { driver_name: driverName || null })
  }

  // Fetch reg_number + created_at from Reception so we can flag which booked vehicles have
  // already physically arrived / checked in at Reception (verified by reg number, per Reception team).
  async function loadReceptionEntries() {
    const from = new Date()
    from.setDate(from.getDate() - 90)
    const result = await listReceptionRegCreatedSince(from.toISOString())
    if (result.data) setReceptionEntries(result.data)
  }

  async function loadBookings() {
    setLoading(true); setError('')
    try {
      // 1. Fetch from service_bookings
      const { data: sbData, error: err } = await supabase
        .from('service_bookings').select('*')
        .gte('booking_date', dateRange.from).lte('booking_date', dateRange.to)
        .order('created_at', { ascending: false })

      if (err) throw err

      const loadedBookings = [...((sbData ?? []) as ServiceBooking[])]

      // 2. Fetch customer app submissions from post_feedback_bot_data
      const { data: botRows } = await supabase
        .from('post_feedback_bot_data')
        .select('*')
        .in('mode', ['customer_portal_concern', 'customer_booking_portal'])
        .ilike('feedback_text', '%SERVICE BOOKING REQUEST%')
        .order('id', { ascending: false })

      if (botRows && Array.isArray(botRows)) {
        for (const bot of botRows) {
          const parsed = parseBotBookingToServiceBooking(bot)
          const bDate = parsed.booking_date || (bot.created_at || bot.complaint_date_time || '').slice(0, 10)
          
          // Check if date falls in selected range
          if (bDate && (bDate < dateRange.from || bDate > dateRange.to)) {
            continue
          }

          const normVehicle = normReg(bot.vehicle_registration_number)
          const existing = loadedBookings.find(b =>
            normReg(b.reg_number) === normVehicle &&
            (b.booking_date === bDate || (b.lead_number && b.lead_number.includes(String(bot.id))))
          )

          if (!existing) {
            // Attempt to auto-persist into service_bookings so it gets full DB lead_number and triggers
            let syncedRow: ServiceBooking | null = null
            try {
              const { data: inserted, error: insErr } = await supabase
                .from('service_bookings')
                .insert([parsed])
                .select()
                .single()

              if (!insErr && inserted) {
                syncedRow = inserted as ServiceBooking
              }
            } catch {
              // Ignore persist error and fall back to local merge
            }

            if (syncedRow) {
              loadedBookings.unshift(syncedRow)
            } else {
              // Local fallback record
              loadedBookings.unshift({
                id: Number(bot.id) || Date.now(),
                lead_number: `BKG-APP-${bot.id}`,
                booking_date: bDate || new Date().toISOString().slice(0, 10),
                appointment_date: parsed.appointment_date || null,
                booking_time: parsed.booking_time || null,
                booking_source: 'Customer App',
                reg_number: bot.vehicle_registration_number || '',
                model: bot.model || null,
                variant: null,
                fuel_type: null,
                mfg_year: null,
                km_reading: null,
                customer_name: bot.customer_name || 'Customer',
                customer_phone: bot.mobile_number || '',
                alt_phone: null,
                customer_email: null,
                customer_address: null,
                service_type: parsed.service_type || 'Running Repairs',
                complaint_description: parsed.complaint_description || null,
                special_requests: null,
                pickup_required: Boolean(parsed.pickup_required),
                drop_required: false,
                pickup_address: parsed.pickup_address || null,
                branch: parsed.branch || 'Sitapura',
                assigned_sa: null,
                assigned_sa_name: null,
                status: 'New',
                status_reason: null,
                rescheduled_date: null,
                caller_name: null,
                call_attempt: 1,
                call_outcome: null,
                wa_conversation_id: null,
                wa_opt_in: false,
                jc_number: null,
                converted_at: null,
                created_at: bot.created_at || bot.complaint_date_time || new Date().toISOString(),
                updated_at: bot.created_at || new Date().toISOString(),
                telecall_assignment_id: null,
                telecall_campaign_id: null,
                call_notes: null,
                cre_name: null,
                driver_name: null,
              })
            }
          }
        }
      }

      // 3. Strict Deduplication: ensure unique lead per ID and per vehicle+appointment_date
      const seenKeys = new Set<string>()
      const dedupedBookings: ServiceBooking[] = []

      for (const b of loadedBookings) {
        const idKey = `id-${b.id}`
        const vehicleDateKey = b.reg_number && b.appointment_date && b.status !== 'Cancelled'
          ? `veh-${normReg(b.reg_number)}-${b.appointment_date}`
          : null

        if (seenKeys.has(idKey)) {
          continue
        }
        if (vehicleDateKey && seenKeys.has(vehicleDateKey)) {
          continue
        }

        seenKeys.add(idKey)
        if (vehicleDateKey) seenKeys.add(vehicleDateKey)
        dedupedBookings.push(b)
      }

      setBookings(dedupedBookings)
    } catch (loadErr: any) {
      setError(loadErr?.message || 'Failed to load bookings')
    } finally {
      setLoading(false)
    }
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
    if (appointmentDateRange.from) rows = rows.filter(b => b.appointment_date && b.appointment_date >= appointmentDateRange.from)
    if (appointmentDateRange.to) rows = rows.filter(b => b.appointment_date && b.appointment_date <= appointmentDateRange.to)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      rows = rows.filter(b =>
        b.customer_name.toLowerCase().includes(q) || b.customer_phone.includes(q) ||
        b.reg_number.toLowerCase().includes(q) || (b.lead_number ?? '').toLowerCase().includes(q) ||
        (b.model ?? '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [bookings, sourceFilter, statusFilter, branchFilter, appointmentDateRange, searchQuery])

  // Filter dropdown must include ALL booking_source values actually present in the data
  // (e.g. system-generated sources like 'WhatsApp Auto Reminder' / 'WhatsApp EW Service Reminder' /
  // 'WhatsApp AI Agent'), not just the fixed manual-entry list — otherwise selecting those sources
  // silently filters to zero rows because the option never matched any real value.
  const sourceFilterOptions = useMemo(() => {
    const set = new Set<string>(BOOKING_SOURCES)
    bookings.forEach(b => { if (b.booking_source) set.add(b.booking_source) })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [bookings])

  // Reg numbers considered "arrived at Reception": a Reception entry exists for that reg number
  // created on/after the booking was made (so an old, unrelated past visit for the same reg number
  // doesn't wrongly flag a brand-new booking as arrived).
  const receptionByReg = useMemo(() => {
    const map = new Map<string, string[]>()
    receptionEntries.forEach(r => {
      const key = normReg(r.reg_number)
      if (!key) return
      const arr = map.get(key) ?? []
      arr.push(r.created_at)
      map.set(key, arr)
    })
    return map
  }, [receptionEntries])

  function hasArrivedAtReception(b: ServiceBooking): boolean {
    if (b.status === 'Arrived') return true
    const entries = receptionByReg.get(normReg(b.reg_number))
    if (!entries || entries.length === 0) return false

    const bookingTime = b.created_at ? new Date(b.created_at).getTime() : 0
    const targetDate = b.appointment_date || b.booking_date

    return entries.some(createdAt => {
      const entryTime = new Date(createdAt).getTime()
      const entryDate = createdAt.slice(0, 10)
      
      // Reception entry must be created AFTER this booking was created, and on/after the appointment date
      const isAfterBookingCreation = entryTime > (bookingTime + 60000)
      const isOnOrAfterApptDate = targetDate ? entryDate >= targetDate : true

      return isAfterBookingCreation && isOnOrAfterApptDate
    })
  }

  function handleExport() {
    if (filtered.length === 0) return
    const rows = filtered.map(b => ({
      leadNumber: b.lead_number ?? '',
      bookingSource: b.booking_source,
      bookingDate: b.booking_date,
      appointmentDate: b.appointment_date ?? '',
      appointmentTime: timeLabel(b.booking_time) ?? '',
      customerName: b.customer_name,
      customerPhone: b.customer_phone,
      regNumber: b.reg_number,
      model: b.model ?? '',
      fuelType: b.fuel_type ?? '',
      serviceType: b.service_type ?? '',
      branch: b.branch ?? '',
      assignedSA: b.assigned_sa_name ?? '',
      status: b.status,
      jcNumber: b.jc_number ?? '',
      pickupRequired: b.pickup_required ? 'Yes' : 'No',
      dropRequired: b.drop_required ? 'Yes' : 'No',
      createdAt: b.created_at,
    }))
    exportToCSV(rows, generateExportFilename('service-bookings'))
  }

  const stats = useMemo(() => ({
    total: filtered.length,
    new: filtered.filter(b => b.status === 'New').length,
    confirmed: filtered.filter(b => b.status === 'Confirmed').length,
    arrived: filtered.filter(b => b.status === 'Arrived' || b.status === 'In-Progress').length,
    completed: filtered.filter(b => b.status === 'Completed').length,
    cancelled: filtered.filter(b => b.status === 'Cancelled' || b.status === 'No-Show').length,
    converted: filtered.filter(b => b.jc_number).length,
    customerApp: filtered.filter(b => b.booking_source === 'Customer App' || b.booking_source === 'Self').length,
    telecalling: filtered.filter(b => b.booking_source === 'Telecalling').length,
    linked: filtered.filter(b => b.telecall_assignment_id !== null).length,
    whatsapp: filtered.filter(b => b.booking_source === 'WhatsApp' || (b.booking_source && b.booking_source.includes('WhatsApp'))).length,
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

    let updated = false
    try {
      const { data: upData, error: upErr } = await supabase
        .from('service_bookings')
        .update(payload)
        .eq('id', booking.id)
        .select()
      if (!upErr && upData && upData.length > 0) {
        updated = true
      }
    } catch {
      // fallback
    }

    if (!updated && booking.reg_number) {
      try {
        let q = supabase.from('service_bookings').update(payload).eq('reg_number', booking.reg_number.toUpperCase())
        if (booking.appointment_date) q = q.eq('appointment_date', booking.appointment_date)
        const { data: upData2 } = await q.select()
        if (upData2 && upData2.length > 0) updated = true
      } catch {
        // fallback
      }
    }

    if (!updated) {
      try {
        const fullRow = {
          ...booking,
          ...payload,
        }
        delete (fullRow as any).id
        await supabase.from('service_bookings').insert([fullRow])
      } catch (insCatch) {
        console.warn('Failed to insert service_booking on status update:', insCatch)
      }
    }

    await loadBookings()
    setSelectedBooking(b => b?.id === booking.id ? { ...b, ...payload } as ServiceBooking : b)
  }

  function openNew() { setFormMode('new'); setForm(EMPTY_FORM); setShowForm(true); setSelectedBooking(null) }
  function openEdit(b: ServiceBooking) { setSelectedBooking(b); setShowForm(false); void loadFollowups(b.id) }
  function openDetail(b: ServiceBooking) { setSelectedBooking(b); setShowForm(false); void loadFollowups(b.id) }

  function openWhatsApp(b: ServiceBooking) {
    const lines = [
      `🚗 *Service Appointment Confirmation*`,
      `Hi ${b.customer_name},`,
      `Your service booking is confirmed!`,
      ``,
      `📅 *Date:* ${b.appointment_date ? new Date(b.appointment_date).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : 'TBD'}`,
      b.booking_time ? `⏰ *Slot:* ${b.booking_time}` : '',
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
          <DateRangeFilter range={dateRange} onChange={setDateRange} label="Booked:" />
          <button onClick={handleExport} disabled={filtered.length === 0} title="Export filtered bookings to CSV"
            style={{ background: '#fff', color: '#334155', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: 700, cursor: filtered.length === 0 ? 'not-allowed' : 'pointer', opacity: filtered.length === 0 ? 0.5 : 1, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.9rem' }}>⬇</span> Export
          </button>
          <button onClick={() => setShowDriverModal(true)} title="Manage Pickup & Drop Driver Allocations"
            style={{ background: '#f8fafc', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.95rem' }}>🚗</span> Driver Management
          </button>
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
          { label: '📱 Customer App', value: stats.customerApp, color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
          { label: '📞 Telecalling', value: stats.telecalling, color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
          { label: '🔗 Linked from Telecaller', value: stats.linked, color: '#7c3aed', bg: '#faf5ff', border: '#e9d5ff' },
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
          {sourceFilterOptions.map(s => <option key={s}>{s}</option>)}
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

        <DateRangeFilter range={appointmentDateRange} onChange={setAppointmentDateRange} label="Appointment:" includeAll />

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
                  const arrived = hasArrivedAtReception(b)
                  const rowBg = isSelected ? '#eff6ff' : arrived ? '#f0fdf4' : '#fff'
                  const rowHoverBg = isSelected ? '#eff6ff' : arrived ? '#dcfce7' : '#f8fafc'
                  return (
                    <tr key={b.id} onClick={() => openDetail(b)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid #f1f5f9', borderLeft: arrived ? '3px solid #22c55e' : '3px solid transparent', background: rowBg, transition: 'background 0.1s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = rowHoverBg }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = rowBg }}>
                      {/* Lead # */}
                      <td style={{ padding: '0.5rem 0.65rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <div style={{ fontWeight: 700, color: '#2563eb', fontSize: '0.78rem' }}>{b.lead_number || `#${b.id}`}</div>
                          {b.telecall_assignment_id && (
                            <span style={{ fontSize: '0.6rem', background: '#ede9fe', color: '#6d28d9', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>🔗 Telecalling</span>
                          )}
                        </div>
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
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{b.customer_name || b.customer_phone}</div>
                        {b.customer_name && <div style={{ color: '#64748b', fontSize: '0.7rem' }}>{b.customer_phone}</div>}
                      </td>
                      {/* Vehicle */}
                      <td style={{ padding: '0.5rem 0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <div style={{ fontWeight: 700, color: '#334155', fontSize: '0.78rem' }}>{b.reg_number || '—'}</div>
                          {arrived && (
                            <span title="Vehicle checked in at Reception" style={{ fontSize: '0.6rem', background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '1px 5px', fontWeight: 700, whiteSpace: 'nowrap' }}>🏁 Arrived</span>
                          )}
                        </div>
                        {(b.model || b.fuel_type) && <div style={{ color: '#94a3b8', fontSize: '0.68rem' }}>{[b.model, b.fuel_type].filter(Boolean).join(' · ')}</div>}
                      </td>
                      {/* Appointment */}
                      <td style={{ padding: '0.5rem 0.65rem', whiteSpace: 'nowrap' }}>
                        {b.appointment_date
                          ? <><div style={{ color: '#334155', fontWeight: 600, fontSize: '0.75rem' }}>{new Date(b.appointment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
                            {timeLabel(b.booking_time) && <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{timeLabel(b.booking_time)}</div>}</>
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

            {/* ══ NEW BOOKING FORM ══ */}
            {showForm ? (
              <div style={{ padding: '1.1rem 1.25rem' }}>
                {/* Form Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                    ➕
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>
                      New Service Booking
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8' }}>
                      Fill in the details to create a new booking
                    </p>
                  </div>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => { setShowForm(false); setSelectedBooking(null); setForm(EMPTY_FORM) }}
                    style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '0.35rem 0.75rem', fontSize: '0.78rem', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving}
                    style={{ background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.35rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                    {saving ? 'Saving…' : 'Create Booking'}
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

                  <Field label="Preferred Slot">
                    <select style={selInp} value={form.booking_time ?? ''} onChange={e => setForm(p => ({ ...p, booking_time: e.target.value }))}>
                      <option value="">Select slot…</option>
                      {TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
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

                  <Field label="Alt Phone">
                    <input style={inp} inputMode="numeric" placeholder="Alternative number (optional)" value={form.alt_phone ?? ''} onChange={e => setForm(p => ({ ...p, alt_phone: e.target.value || null }))} />
                  </Field>

                  <FieldGroup title="Vehicle Details" icon="🚗" />

                  <Field label="Registration Number" required>
                    <input style={inp} placeholder="e.g. RJ14XX1234" value={form.reg_number ?? ''} onChange={e => setForm(p => ({ ...p, reg_number: e.target.value.toUpperCase() }))} />
                  </Field>

                  <Field label="Fuel Type">
                    <select style={selInp} value={form.fuel_type ?? ''} onChange={e => setForm(p => ({ ...p, fuel_type: e.target.value, model: null }))}>
                      <option value="">Select…</option>
                      {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
                    </select>
                  </Field>

                  <Field label="Model">
                    <select style={selInp} value={form.model ?? ''} onChange={e => setForm(p => ({ ...p, model: e.target.value }))}>
                      <option value="">Select model…</option>
                      {!form.fuel_type || form.fuel_type === 'PV'
                        ? PV_MODELS.map(m => <option key={m}>{m}</option>)
                        : EV_MODELS.map(m => <option key={m}>{m}</option>)
                      }
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

                  <Field label="Customer Complaint / Description" span>
                    <textarea style={{ ...inp, resize: 'vertical' }} rows={2} placeholder="Customer issues, remarks, or requests" value={form.complaint_description ?? ''} onChange={e => setForm(p => ({ ...p, complaint_description: e.target.value || null }))} />
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

                  {form.pickup_required && (
                    <Field label="Assign Driver">
                      <select style={selInp} value={form.driver_name ?? ''} onChange={e => setForm(p => ({ ...p, driver_name: e.target.value || null }))}>
                        <option value="">Select driver…</option>
                        {drivers.map(d => <option key={d.id} value={d.employee_name}>{d.employee_name}</option>)}
                      </select>
                    </Field>
                  )}

                  {/* CRE assignment for Customer App / Telecalling / Edit */}
                  {(form.booking_source === 'Customer App' || form.booking_source === 'Telecalling' || formMode === 'edit') && (
                    <Field label="Assign CRE">
                      <select style={selInp} value={form.cre_name ?? ''} onChange={e => setForm(p => ({ ...p, cre_name: e.target.value || null }))}>
                        <option value="">Select CRE to handle…</option>
                        {creUsers.map(u => <option key={u.id} value={u.employee_name}>{u.employee_name}</option>)}
                      </select>
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
                      <select
                        value={selectedBooking.booking_source}
                        onChange={e => void updateBookingFields(selectedBooking, { booking_source: e.target.value })}
                        style={{ ...selInp, width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.72rem', fontWeight: 700, borderColor: '#cbd5e1' }}
                      >
                        {BOOKING_SOURCES.map(s => <option key={s} value={s}>{SOURCE_ICON[s] ?? '📋'} {s}</option>)}
                      </select>
                    </div>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                      Created {new Date(selectedBooking.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <a href={`tel:${selectedBooking.customer_phone}`}
                    style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '7px', padding: '0.35rem 0.8rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', color: '#059669', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    📞 Call
                  </a>
                  <button onClick={() => openWhatsApp(selectedBooking)}
                    style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '7px', padding: '0.35rem 0.8rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    💬 WhatsApp
                  </button>
                  <button onClick={() => { setSelectedBooking(null); setFollowups([]) }}
                    style={{ background: '#f1f5f9', border: 'none', borderRadius: '7px', padding: '0.35rem 0.6rem', fontSize: '0.82rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
                </div>

                {/* Status Update / Customer Booking Action */}
                {selectedBooking.booking_source === 'Customer App' || selectedBooking.booking_source === 'Self' ? (
                  <div style={{ background: '#f8fafc', padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>📱</span> Customer App Booking Action
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => updateStatus(selectedBooking, 'Confirmed')}
                        style={{
                          background: selectedBooking.status === 'Confirmed' ? '#059669' : '#10b981',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.45rem 0.9rem',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          boxShadow: selectedBooking.status === 'Confirmed' ? 'none' : '0 1px 3px rgba(16,185,129,0.3)',
                        }}
                      >
                        <span>✅</span> {selectedBooking.status === 'Confirmed' ? 'Confirmed & Approved' : 'Approve & Confirm Booking'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Are you sure you want to reject / cancel this service booking?')) {
                            void updateStatus(selectedBooking, 'Cancelled')
                          }
                        }}
                        style={{
                          background: selectedBooking.status === 'Cancelled' ? '#e11d48' : '#fff',
                          color: selectedBooking.status === 'Cancelled' ? '#fff' : '#e11d48',
                          border: '1px solid #fecdd3',
                          borderRadius: '6px',
                          padding: '0.45rem 0.9rem',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <span>❌</span> {selectedBooking.status === 'Cancelled' ? 'Rejected / Cancelled' : 'Reject / Cancel Booking'}
                      </button>

                      <button
                        type="button"
                        onClick={() => updateStatus(selectedBooking, 'Rescheduled')}
                        style={{
                          background: '#fff',
                          color: '#d97706',
                          border: '1px solid #fde68a',
                          borderRadius: '6px',
                          padding: '0.45rem 0.85rem',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <span>📅</span> Reschedule
                      </button>
                    </div>

                    {/* Quick Status Pill selector */}
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px dashed #e2e8f0' }}>
                      <span style={{ fontSize: '0.68rem', color: '#94a3b8', alignSelf: 'center', fontWeight: 600 }}>All Statuses:</span>
                      {STATUSES.map(s => {
                        const sc = STATUS_META[s] ?? { bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' }
                        const isActive = selectedBooking.status === s
                        return (
                          <button key={s} onClick={() => updateStatus(selectedBooking, s)}
                            style={{ background: isActive ? sc.bg : '#fff', color: isActive ? sc.color : '#64748b', border: `1px solid ${isActive ? sc.dot + '60' : '#e2e8f0'}`, borderRadius: '20px', padding: '0.18rem 0.55rem', fontSize: '0.68rem', fontWeight: isActive ? 800 : 500, cursor: 'pointer', transition: 'all 0.1s' }}>
                            {s}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  /* Standard Quick Status for Non-Customer App bookings (Telecalling, Walk-in, etc.) */
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
                )}

                {/* Details grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1rem' }}>

                  {/* Customer Card (Directly Editable) */}
                  <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.85rem', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.45rem' }}>👤 Customer Details</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Name:</div>
                        <input
                          value={selectedBooking.customer_name || ''}
                          onChange={e => setSelectedBooking(b => b ? { ...b, customer_name: e.target.value } : b)}
                          onBlur={e => void updateBookingFields(selectedBooking, { customer_name: e.target.value })}
                          style={{ ...inp, padding: '0.28rem 0.5rem', fontSize: '0.8rem', fontWeight: 700 }}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Mobile:</div>
                          <input
                            inputMode="numeric"
                            value={selectedBooking.customer_phone || ''}
                            onChange={e => setSelectedBooking(b => b ? { ...b, customer_phone: e.target.value } : b)}
                            onBlur={e => void updateBookingFields(selectedBooking, { customer_phone: e.target.value.replace(/\D/g, '') })}
                            style={{ ...inp, padding: '0.28rem 0.5rem', fontSize: '0.78rem' }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Alt Phone:</div>
                          <input
                            inputMode="numeric"
                            placeholder="Optional"
                            value={selectedBooking.alt_phone || ''}
                            onChange={e => setSelectedBooking(b => b ? { ...b, alt_phone: e.target.value } : b)}
                            onBlur={e => void updateBookingFields(selectedBooking, { alt_phone: e.target.value || null })}
                            style={{ ...inp, padding: '0.28rem 0.5rem', fontSize: '0.78rem' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Vehicle Card (Directly Editable) */}
                  <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.85rem', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.45rem' }}>🚗 Vehicle Details</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.4rem' }}>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Reg No:</div>
                          <input
                            value={selectedBooking.reg_number || ''}
                            onChange={e => setSelectedBooking(b => b ? { ...b, reg_number: e.target.value.toUpperCase() } : b)}
                            onBlur={e => void updateBookingFields(selectedBooking, { reg_number: e.target.value.toUpperCase() })}
                            style={{ ...inp, padding: '0.28rem 0.5rem', fontSize: '0.8rem', fontWeight: 800 }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Fuel:</div>
                          <select
                            value={selectedBooking.fuel_type || ''}
                            onChange={e => void updateBookingFields(selectedBooking, { fuel_type: e.target.value || null })}
                            style={{ ...selInp, padding: '0.28rem 0.4rem', fontSize: '0.75rem' }}
                          >
                            <option value="">Select…</option>
                            {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.4rem' }}>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Model:</div>
                          <select
                            value={selectedBooking.model || ''}
                            onChange={e => void updateBookingFields(selectedBooking, { model: e.target.value || null })}
                            style={{ ...selInp, padding: '0.28rem 0.4rem', fontSize: '0.75rem' }}
                          >
                            <option value="">Select model…</option>
                            {!selectedBooking.fuel_type || selectedBooking.fuel_type === 'PV'
                              ? PV_MODELS.map(m => <option key={m}>{m}</option>)
                              : EV_MODELS.map(m => <option key={m}>{m}</option>)
                            }
                          </select>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>KM:</div>
                          <input
                            type="number"
                            placeholder="Odo km"
                            value={selectedBooking.km_reading ?? ''}
                            onChange={e => setSelectedBooking(b => b ? { ...b, km_reading: parseInt(e.target.value) || null } : b)}
                            onBlur={e => void updateBookingFields(selectedBooking, { km_reading: parseInt(e.target.value) || null })}
                            style={{ ...inp, padding: '0.28rem 0.5rem', fontSize: '0.78rem' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Appointment Card (Editable Inline) */}
                  <div style={{ background: '#eff6ff', borderRadius: '10px', padding: '0.85rem', border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.45rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>📅 Booking & Appointment</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Booked On:</div>
                          <input
                            type="date"
                            value={selectedBooking.booking_date || ''}
                            onChange={e => void updateBookingFields(selectedBooking, { booking_date: e.target.value })}
                            style={{ ...inp, padding: '0.3rem 0.5rem', fontSize: '0.78rem', background: '#fff' }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Appointment:</div>
                          <input
                            type="date"
                            value={selectedBooking.appointment_date || ''}
                            onChange={e => void updateBookingFields(selectedBooking, { appointment_date: e.target.value || null })}
                            style={{ ...inp, padding: '0.3rem 0.5rem', fontSize: '0.78rem', background: '#fff' }}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Slot:</div>
                          <select
                            value={selectedBooking.booking_time || ''}
                            onChange={e => void updateBookingFields(selectedBooking, { booking_time: e.target.value || null })}
                            style={{ ...selInp, padding: '0.3rem 0.4rem', fontSize: '0.75rem' }}
                          >
                            <option value="">Select slot…</option>
                            {TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Branch:</div>
                          <select
                            value={selectedBooking.branch || ''}
                            onChange={e => void updateBookingFields(selectedBooking, { branch: e.target.value || null })}
                            style={{ ...selInp, padding: '0.3rem 0.4rem', fontSize: '0.75rem' }}
                          >
                            <option value="">Select branch…</option>
                            {branches.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Service Card */}
                  <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '0.85rem', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.45rem' }}>🔧 Service Type</div>
                    <select
                      value={selectedBooking.service_type || ''}
                      onChange={e => void updateBookingFields(selectedBooking, { service_type: e.target.value || null })}
                      style={{ ...selInp, padding: '0.35rem 0.5rem', fontSize: '0.8rem', background: '#fff', fontWeight: 700, borderColor: '#bbf7d0' }}
                    >
                      <option value="">Select service type…</option>
                      {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {selectedBooking.jc_number && (
                      <div style={{ marginTop: '0.45rem', display: 'inline-block', background: '#dcfce7', color: '#15803d', borderRadius: '20px', padding: '0.15rem 0.55rem', fontSize: '0.7rem', fontWeight: 800 }}>
                        ✓ JC: {selectedBooking.jc_number}
                      </div>
                    )}
                  </div>
                </div>

                {/* Staff & Driver Allocation Card */}
                <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.75rem 0.85rem', marginBottom: '0.85rem', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.45rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>👥 Staff & Driver Allocation</span>
                    {selectedBooking.pickup_required && (
                      <span style={{ background: '#ecfdf5', color: '#059669', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                        🚐 Pickup Active
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, marginBottom: '0.2rem' }}>🚗 Allocated Driver:</div>
                      <select
                        value={selectedBooking.driver_name || ''}
                        onChange={e => void updateBookingFields(selectedBooking, { driver_name: e.target.value || null })}
                        style={{ ...selInp, padding: '0.35rem 0.5rem', fontSize: '0.78rem', borderColor: selectedBooking.driver_name ? '#bbf7d0' : '#cbd5e1', background: selectedBooking.driver_name ? '#f0fdf4' : '#fff', fontWeight: 600 }}
                      >
                        <option value="">— Select Driver —</option>
                        {drivers.map(d => (
                          <option key={d.id} value={d.employee_name}>
                            🚗 {d.employee_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, marginBottom: '0.2rem' }}>👤 Assigned CRE:</div>
                      <select
                        value={selectedBooking.cre_name || ''}
                        onChange={e => void updateBookingFields(selectedBooking, { cre_name: e.target.value || null })}
                        style={{ ...selInp, padding: '0.35rem 0.5rem', fontSize: '0.78rem', borderColor: selectedBooking.cre_name ? '#bfdbfe' : '#cbd5e1', background: selectedBooking.cre_name ? '#eff6ff' : '#fff', fontWeight: 600 }}
                      >
                        <option value="">— Select CRE —</option>
                        {creUsers.map(u => (
                          <option key={u.id} value={u.employee_name}>
                            👤 {u.employee_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Pickup & Drop Section (Directly Editable) */}
                <div style={{ background: '#faf5ff', borderRadius: '10px', padding: '0.75rem 0.85rem', marginBottom: '0.85rem', border: '1px solid #e9d5ff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      🚐 Pickup & Drop Management
                    </div>
                    <div style={{ display: 'flex', gap: '0.85rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 700, color: '#581c87', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!selectedBooking.pickup_required}
                          onChange={e => void updateBookingFields(selectedBooking, { pickup_required: e.target.checked })}
                          style={{ width: '13px', height: '13px', cursor: 'pointer' }}
                        />
                        Pickup Required
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 700, color: '#581c87', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!selectedBooking.drop_required}
                          onChange={e => void updateBookingFields(selectedBooking, { drop_required: e.target.checked })}
                          style={{ width: '13px', height: '13px', cursor: 'pointer' }}
                        />
                        Drop Required
                      </label>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#6b21a8', fontWeight: 600, marginBottom: '0.2rem' }}>Pickup / Drop Address:</div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        placeholder="Enter full address for pickup / drop..."
                        value={selectedBooking.pickup_address || ''}
                        onChange={e => setSelectedBooking(b => b ? { ...b, pickup_address: e.target.value } : b)}
                        onBlur={e => void updateBookingFields(selectedBooking, { pickup_address: e.target.value || null })}
                        style={{ ...inp, padding: '0.35rem 0.6rem', fontSize: '0.78rem', background: '#fff', borderColor: '#d8b4fe' }}
                      />
                      {selectedBooking.pickup_address && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedBooking.pickup_address)}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ background: '#7c3aed', color: '#fff', borderRadius: '6px', padding: '0.35rem 0.65rem', fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}
                        >
                          📍 Map
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Customer Complaints / Remarks (Directly Editable) */}
                <div style={{ background: '#fefce8', borderRadius: '10px', padding: '0.75rem 0.85rem', marginBottom: '0.85rem', border: '1px solid #fef08a' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#854d0e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                    📝 Customer Complaints / Remarks
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Enter customer complaints or instructions..."
                    value={selectedBooking.complaint_description || ''}
                    onChange={e => setSelectedBooking(b => b ? { ...b, complaint_description: e.target.value } : b)}
                    onBlur={e => void updateBookingFields(selectedBooking, { complaint_description: e.target.value || null })}
                    style={{ ...inp, background: '#fff', borderColor: '#fde047', fontSize: '0.78rem', color: '#713f12', resize: 'vertical' }}
                  />
                </div>

                {/* Job Card Conversion */}
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '0.65rem 0.85rem', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.1rem' }}>🔁</span>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#15803d' }}>
                    Job Card:
                  </div>
                  <input
                    placeholder="JC Number (e.g. JC1234)"
                    value={selectedBooking.jc_number || ''}
                    onChange={e => setSelectedBooking(b => b ? { ...b, jc_number: e.target.value } : b)}
                    onBlur={e => {
                      const jc = e.target.value.trim()
                      if (jc) {
                        void updateBookingFields(selectedBooking, { jc_number: jc, converted_at: new Date().toISOString() })
                      } else {
                        void updateBookingFields(selectedBooking, { jc_number: null, converted_at: null })
                      }
                    }}
                    style={{ ...inp, width: '150px', padding: '0.28rem 0.5rem', fontSize: '0.78rem', background: '#fff' }}
                  />
                  {selectedBooking.jc_number && (
                    <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700 }}>
                      ✓ Converted
                    </span>
                  )}
                </div>

                {/* Source-specific Telecalling info / editable fields */}
                {selectedBooking.booking_source === 'Telecalling' && (
                  <div style={{ background: '#f0f9ff', borderRadius: '10px', padding: '0.75rem 0.85rem', marginBottom: '0.85rem', border: '1px solid #bae6fd' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📞 Telecalling Details</span>
                      {selectedBooking.telecall_assignment_id && (
                        <span style={{ background: '#ddd6fe', color: '#5b21b6', borderRadius: 4, fontSize: '0.65rem', padding: '1px 6px', fontWeight: 700 }}>
                          🔗 Assignment #{selectedBooking.telecall_assignment_id}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: 600 }}>Caller:</div>
                        <input
                          placeholder="Caller Name"
                          value={selectedBooking.caller_name || ''}
                          onChange={e => setSelectedBooking(b => b ? { ...b, caller_name: e.target.value } : b)}
                          onBlur={e => void updateBookingFields(selectedBooking, { caller_name: e.target.value || null })}
                          style={{ ...inp, padding: '0.28rem 0.45rem', fontSize: '0.75rem', background: '#fff' }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: 600 }}>Attempt:</div>
                        <select
                          value={selectedBooking.call_attempt ?? 1}
                          onChange={e => void updateBookingFields(selectedBooking, { call_attempt: parseInt(e.target.value) })}
                          style={{ ...selInp, padding: '0.28rem 0.4rem', fontSize: '0.75rem', background: '#fff' }}
                        >
                          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}{n===1?'st':n===2?'nd':n===3?'rd':'th'} Call</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: 600 }}>Outcome:</div>
                        <select
                          value={selectedBooking.call_outcome || ''}
                          onChange={e => void updateBookingFields(selectedBooking, { call_outcome: e.target.value || null })}
                          style={{ ...selInp, padding: '0.28rem 0.4rem', fontSize: '0.75rem', background: '#fff' }}
                        >
                          <option value="">Select…</option>
                          {CALL_OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>
                    {selectedBooking.call_notes && (
                      <div style={{ marginTop: '0.35rem', color: '#1e40af', fontStyle: 'italic', fontSize: '0.75rem' }}>
                        📝 &ldquo;{selectedBooking.call_notes}&rdquo;
                      </div>
                    )}
                  </div>
                )}

                {/* Source-specific WhatsApp info */}
                {selectedBooking.booking_source === 'WhatsApp' && (
                  <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '0.75rem 0.85rem', marginBottom: '0.85rem', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.45rem' }}>💬 WhatsApp Information</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.5rem', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#15803d', fontWeight: 600 }}>Thread ID / Ref:</div>
                        <input
                          placeholder="WA Thread ID"
                          value={selectedBooking.wa_conversation_id || ''}
                          onChange={e => setSelectedBooking(b => b ? { ...b, wa_conversation_id: e.target.value } : b)}
                          onBlur={e => void updateBookingFields(selectedBooking, { wa_conversation_id: e.target.value || null })}
                          style={{ ...inp, padding: '0.28rem 0.5rem', fontSize: '0.75rem', background: '#fff' }}
                        />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: '#166534', cursor: 'pointer', marginTop: '1rem' }}>
                        <input
                          type="checkbox"
                          checked={!!selectedBooking.wa_opt_in}
                          onChange={e => void updateBookingFields(selectedBooking, { wa_opt_in: e.target.checked })}
                          style={{ width: '13px', height: '13px' }}
                        />
                        WA Updates Opt-In
                      </label>
                    </div>
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

      {/* ── Driver Management Modal ── */}
      {showDriverModal && (
        <DriverManagementModal
          bookings={bookings}
          drivers={drivers}
          onClose={() => setShowDriverModal(false)}
          onAssignDriver={updateDriver}
        />
      )}
    </div>
  )
}

// ─── Enhanced Driver Management Modal Sub-component ─────────────────────────
interface DriverManagementModalProps {
  bookings: ServiceBooking[]
  drivers: { id: string; employee_name: string }[]
  onClose: () => void
  onAssignDriver: (booking: ServiceBooking, driverName: string | null) => Promise<void>
}

function DriverManagementModal({ bookings, drivers, onClose, onAssignDriver }: DriverManagementModalProps) {
  const [selectedDriver, setSelectedDriver] = useState<string>('all')
  const [datePreset, setDatePreset] = useState<'today' | 'tomorrow' | 'next7' | 'all' | 'custom'>('today')
  const [customDate, setCustomDate] = useState<string>('')
  const [search, setSearch] = useState<string>('')
  const [savingId, setSavingId] = useState<number | null>(null)

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])
  const tomorrowStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  }, [])
  const next7Str = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  }, [])

  // All bookings requiring pickup/drop or having a driver assigned
  const allPickupBookings = useMemo(() => {
    return bookings.filter(b => b.pickup_required || b.drop_required || Boolean(b.driver_name))
  }, [bookings])

  // Filter by date preset
  const dateFilteredBookings = useMemo(() => {
    return allPickupBookings.filter(b => {
      const apptDate = b.appointment_date || b.booking_date
      if (datePreset === 'today') return apptDate === todayStr
      if (datePreset === 'tomorrow') return apptDate === tomorrowStr
      if (datePreset === 'next7') return Boolean(apptDate && apptDate >= todayStr && apptDate <= next7Str)
      if (datePreset === 'custom' && customDate) return apptDate === customDate
      return true
    })
  }, [allPickupBookings, datePreset, customDate, todayStr, tomorrowStr, next7Str])

  // Final filtered list based on driver selection & search
  const filtered = useMemo(() => {
    return dateFilteredBookings.filter(b => {
      if (selectedDriver === 'unassigned' && b.driver_name) return false
      if (selectedDriver !== 'all' && selectedDriver !== 'unassigned' && b.driver_name !== selectedDriver) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matchVeh = (b.reg_number || '').toLowerCase().includes(q)
        const matchCust = (b.customer_name || '').toLowerCase().includes(q)
        const matchPhone = (b.customer_phone || '').includes(q)
        const matchAddr = (b.pickup_address || '').toLowerCase().includes(q)
        const matchDriver = (b.driver_name || '').toLowerCase().includes(q)
        if (!matchVeh && !matchCust && !matchPhone && !matchAddr && !matchDriver) return false
      }
      return true
    })
  }, [dateFilteredBookings, selectedDriver, search])

  // Driver workload breakdown
  const driverWorkloads = useMemo(() => {
    return drivers.map(d => {
      const assigned = dateFilteredBookings.filter(b => b.driver_name === d.employee_name)
      return {
        id: d.id,
        name: d.employee_name,
        count: assigned.length,
        bookings: assigned,
      }
    })
  }, [drivers, dateFilteredBookings])

  const unassignedCount = dateFilteredBookings.filter(b => !b.driver_name).length

  async function handleDriverChange(b: ServiceBooking, driverName: string) {
    setSavingId(b.id)
    try {
      await onAssignDriver(b, driverName || null)
    } finally {
      setSavingId(null)
    }
  }

  // Generate WhatsApp message with all assigned pickup tasks for a driver
  function sendDriverScheduleWhatsApp(driverName: string, driverCars: ServiceBooking[]) {
    if (driverCars.length === 0) return
    const lines = [
      `🚗 *Techwheels Service — Driver Pickup Task Sheet*`,
      `Driver: *${driverName}*`,
      `Date: *${datePreset === 'today' ? 'Today (' + todayStr + ')' : datePreset === 'tomorrow' ? 'Tomorrow (' + tomorrowStr + ')' : 'Scheduled'}*`,
      `Total Vehicles to Pickup: *${driverCars.length}*`,
      ``,
      `───────────────────────`,
      ...driverCars.map((b, idx) => {
        return [
          `*${idx + 1}. Vehicle: ${b.reg_number}* ${b.model ? `(${b.model})` : ''}`,
          `   👤 Customer: ${b.customer_name}`,
          `   📞 Phone: ${b.customer_phone}`,
          `   ⏰ Slot: ${b.booking_time || 'General Slot'}`,
          `   📍 Pickup Address: ${b.pickup_address || 'Address on file'}`,
          `   🗺️ Maps Link: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.pickup_address || b.customer_name)}`,
          `───────────────────────`,
        ].join('\n')
      }),
      `Please ensure on-time vehicle inspection and update arrival status in Techwheels Driver App.`,
    ]
    const text = encodeURIComponent(lines.join('\n'))
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '1100px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)' }}>

        {/* Modal Header */}
        <div style={{ background: '#0f172a', color: '#fff', padding: '1.1rem 1.4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
              🚗
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                Driver Dispatch & Vehicle Pickup Management
              </h2>
              <p style={{ margin: 0, fontSize: '0.76rem', color: '#94a3b8', marginTop: '2px' }}>
                View driver assignments, track total cars to pickup today, and allocate tasks in 1-click
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', width: '34px', height: '34px', borderRadius: '10px', cursor: 'pointer', fontSize: '1.15rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
            ✕
          </button>
        </div>

        {/* Date Filter Strip */}
        <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '0.65rem 1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginRight: '0.25rem' }}>
            📅 Target Date:
          </span>
          {[
            { key: 'today', label: `Today (${allPickupBookings.filter(b => (b.appointment_date || b.booking_date) === todayStr).length})` },
            { key: 'tomorrow', label: `Tomorrow (${allPickupBookings.filter(b => (b.appointment_date || b.booking_date) === tomorrowStr).length})` },
            { key: 'next7', label: 'Next 7 Days' },
            { key: 'all', label: `All Pickups (${allPickupBookings.length})` },
          ].map(tab => {
            const isActive = datePreset === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setDatePreset(tab.key as any)}
                style={{
                  background: isActive ? '#0284c7' : '#fff',
                  color: isActive ? '#fff' : '#334155',
                  border: `1px solid ${isActive ? '#0284c7' : '#cbd5e1'}`,
                  borderRadius: '20px',
                  padding: '0.3rem 0.85rem',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Custom:</span>
            <input
              type="date"
              value={customDate}
              onChange={e => { setCustomDate(e.target.value); setDatePreset('custom') }}
              style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#fff', outline: 'none' }}
            />
          </div>
        </div>

        {/* Driver Workload Breakdown Cards Strip */}
        <div style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', padding: '0.75rem 1.4rem', overflowX: 'auto', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '0.75rem', minWidth: 'min-content' }}>

            {/* All Overview Card */}
            <div
              onClick={() => setSelectedDriver('all')}
              style={{
                background: selectedDriver === 'all' ? '#0f172a' : '#fff',
                color: selectedDriver === 'all' ? '#fff' : '#1e293b',
                border: `1.5px solid ${selectedDriver === 'all' ? '#0f172a' : '#cbd5e1'}`,
                borderRadius: '12px',
                padding: '0.6rem 0.9rem',
                minWidth: '130px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                boxShadow: selectedDriver === 'all' ? '0 4px 10px rgba(15,23,42,0.2)' : 'none',
              }}
            >
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: selectedDriver === 'all' ? '#94a3b8' : '#64748b', textTransform: 'uppercase' }}>
                All Pickups
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, marginTop: '2px' }}>
                {dateFilteredBookings.length} <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Cars</span>
              </div>
            </div>

            {/* Unassigned Warning Card */}
            <div
              onClick={() => setSelectedDriver('unassigned')}
              style={{
                background: selectedDriver === 'unassigned' ? '#dc2626' : unassignedCount > 0 ? '#fef2f2' : '#fff',
                color: selectedDriver === 'unassigned' ? '#fff' : unassignedCount > 0 ? '#991b1b' : '#64748b',
                border: `1.5px solid ${selectedDriver === 'unassigned' ? '#dc2626' : unassignedCount > 0 ? '#f87171' : '#cbd5e1'}`,
                borderRadius: '12px',
                padding: '0.6rem 0.9rem',
                minWidth: '150px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                boxShadow: selectedDriver === 'unassigned' ? '0 4px 10px rgba(220,38,38,0.25)' : 'none',
              }}
            >
              <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                ⚠️ Needs Driver
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, marginTop: '2px' }}>
                {unassignedCount} <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Unassigned</span>
              </div>
            </div>

            {/* Driver Cards */}
            {driverWorkloads.map(dw => {
              const isSelected = selectedDriver === dw.name
              return (
                <div
                  key={dw.id}
                  onClick={() => setSelectedDriver(dw.name)}
                  style={{
                    background: isSelected ? '#0284c7' : '#fff',
                    color: isSelected ? '#fff' : '#1e293b',
                    border: `1.5px solid ${isSelected ? '#0284c7' : dw.count > 0 ? '#bae6fd' : '#cbd5e1'}`,
                    borderRadius: '12px',
                    padding: '0.6rem 0.9rem',
                    minWidth: '170px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isSelected ? '0 4px 12px rgba(2,132,199,0.25)' : 'none',
                    transition: 'transform 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      🚗 {dw.name}
                    </span>
                    {dw.count > 0 && (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          sendDriverScheduleWhatsApp(dw.name, dw.bookings)
                        }}
                        title={`Send ${dw.name}'s task sheet via WhatsApp`}
                        style={{
                          background: isSelected ? 'rgba(255,255,255,0.2)' : '#f0fdf4',
                          border: isSelected ? 'none' : '1px solid #bbf7d0',
                          color: isSelected ? '#fff' : '#16a34a',
                          borderRadius: '6px',
                          padding: '0.15rem 0.35rem',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        💬 Share
                      </button>
                    )}
                  </div>
                  <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 900 }}>{dw.count}</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: isSelected ? '#e0f2fe' : '#64748b' }}>
                      cars to pickup
                    </span>
                  </div>
                  {dw.bookings.length > 0 && (
                    <div style={{ fontSize: '0.68rem', color: isSelected ? '#e0f2fe' : '#64748b', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {dw.bookings.map(b => b.reg_number).slice(0, 2).join(', ')}{dw.bookings.length > 2 ? ` +${dw.bookings.length - 2}` : ''}
                    </div>
                  )}
                </div>
              )
            })}

          </div>
        </div>

        {/* Search Bar & Active Filter Label */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.65rem 1.4rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: '220px' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>🔍</span>
            <input
              type="text"
              placeholder="Search registration no, customer, address, or driver..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.4rem 0.7rem', fontSize: '0.82rem', outline: 'none' }}
            />
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>
            Showing <strong style={{ color: '#0f172a' }}>{filtered.length}</strong> vehicle pickups
            {selectedDriver !== 'all' && (
              <span style={{ marginLeft: '0.35rem', color: '#0284c7' }}>
                (Filter: {selectedDriver === 'unassigned' ? '⚠️ Unassigned' : `🚗 ${selectedDriver}`})
              </span>
            )}
          </div>
        </div>

        {/* Bookings Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 1.4rem', background: '#f8fafc' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94a3b8' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.6rem' }}>🚗</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#334155' }}>No Vehicle Pickups Found</div>
              <div style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>
                {selectedDriver !== 'all' ? `No vehicles allocated to ${selectedDriver} for this date.` : 'No customer vehicle pickups scheduled for this date.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: '1rem' }}>
              {filtered.map(b => {
                const isAssigned = Boolean(b.driver_name)
                const isSavingThis = savingId === b.id

                return (
                  <div
                    key={b.id}
                    style={{
                      background: '#fff',
                      border: `1.5px solid ${isAssigned ? '#cbd5e1' : '#f87171'}`,
                      borderRadius: '14px',
                      padding: '1rem 1.15rem',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.04)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                    }}
                  >
                    {/* Header Row: Reg No + Driver Pill */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                      <div>
                        <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a', letterSpacing: '0.02em' }}>
                          {b.reg_number}
                        </span>
                        {b.model && (
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginLeft: '0.45rem' }}>
                            · {b.model}
                          </span>
                        )}
                        {b.fuel_type && (
                          <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '4px', background: b.fuel_type === 'EV' ? '#dcfce7' : '#f1f5f9', color: b.fuel_type === 'EV' ? '#15803d' : '#475569' }}>
                            {b.fuel_type}
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          padding: '0.2rem 0.65rem',
                          borderRadius: '16px',
                          background: isAssigned ? '#e0f2fe' : '#fef2f2',
                          color: isAssigned ? '#0369a1' : '#dc2626',
                          border: `1px solid ${isAssigned ? '#bae6fd' : '#fecaca'}`,
                        }}
                      >
                        {isAssigned ? `🚗 ${b.driver_name}` : '⚠️ Driver Not Assigned'}
                      </span>
                    </div>

                    {/* Customer & Slot */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', color: '#1e293b' }}>
                      <div>
                        <strong>{b.customer_name}</strong>
                        <a
                          href={`tel:${b.customer_phone}`}
                          style={{ marginLeft: '0.6rem', color: '#2563eb', textDecoration: 'none', fontWeight: 700, fontSize: '0.78rem' }}
                        >
                          📞 {b.customer_phone}
                        </a>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 700 }}>
                        📅 {b.appointment_date || 'TBD'} {b.booking_time ? `(${timeLabel(b.booking_time)})` : ''}
                      </div>
                    </div>

                    {/* Address Box with Google Maps Link */}
                    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.55rem 0.75rem', border: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#334155', display: 'flex', alignItems: 'flex-start', gap: '0.45rem' }}>
                      <span style={{ fontSize: '0.95rem' }}>📍</span>
                      <div style={{ flex: 1, wordBreak: 'break-word', lineHeight: 1.35 }}>
                        <strong>Pickup Address:</strong> {b.pickup_address || 'Address on customer profile'}
                      </div>
                      {b.pickup_address && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.pickup_address)}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Open in Google Maps"
                          style={{ background: '#2563eb', color: '#fff', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
                        >
                          Maps ↗
                        </a>
                      )}
                    </div>

                    {/* Remarks / Complaint */}
                    {b.complaint_description && (
                      <div style={{ fontSize: '0.74rem', color: '#64748b', background: '#fffbeb', padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #fef3c7' }}>
                        <strong>Service Reason:</strong> {b.complaint_description}
                      </div>
                    )}

                    {/* Assign Driver Dropdown Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginTop: '0.15rem', background: '#f1f5f9', padding: '0.45rem 0.65rem', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>
                        Allocate Driver:
                      </span>
                      <select
                        disabled={isSavingThis}
                        value={b.driver_name || ''}
                        onChange={e => void handleDriverChange(b, e.target.value)}
                        style={{
                          flex: 1,
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '0.35rem 0.6rem',
                          fontSize: '0.8rem',
                          background: b.driver_name ? '#f0fdf4' : '#fff',
                          fontWeight: 700,
                          color: b.driver_name ? '#15803d' : '#334155',
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="">— Select Driver from Employee Master —</option>
                        {drivers.map(d => (
                          <option key={d.id} value={d.employee_name}>
                            🚗 {d.employee_name}
                          </option>
                        ))}
                      </select>
                      {isSavingThis && <span style={{ fontSize: '0.7rem', color: '#2563eb' }}>Saving…</span>}
                    </div>

                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '0.75rem 1.25rem', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ background: '#1e293b', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.45rem 1.2rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Done
          </button>
        </div>

      </div>
    </div>
  )
}
