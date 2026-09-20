import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { exportToCSV, generateExportFilename } from '../lib/exportUtils'
import { hasBusinessRole } from '../lib/businessRoles'

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
  customer_name: string
  customer_phone: string
  alt_phone: string | null
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
  driver_name: string | null
  created_at: string
  updated_at: string
}

interface DriverEmployee {
  id: string
  employee_name: string
  phone?: string | null
  role: string | null
  is_active: boolean
}

const STATUS_META: Record<string, { bg: string; color: string }> = {
  New:           { bg: '#eff6ff', color: '#2563eb' },
  Confirmed:     { bg: '#f0fdf4', color: '#16a34a' },
  Rescheduled:   { bg: '#fffbeb', color: '#d97706' },
  Arrived:       { bg: '#f0f9ff', color: '#0284c7' },
  'In-Progress': { bg: '#faf5ff', color: '#7c3aed' },
  Completed:     { bg: '#dcfce7', color: '#15803d' },
  Cancelled:     { bg: '#fef2f2', color: '#dc2626' },
}

export default function DriverManagementPage() {
  const [bookings, setBookings] = useState<ServiceBooking[]>([])
  const [drivers, setDrivers] = useState<DriverEmployee[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<number | null>(null)

  // Filters
  const todayStr = new Date().toISOString().split('T')[0]
  const [dateFilter, setDateFilter] = useState(todayStr)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDriver, setSelectedDriver] = useState('all')
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [tripType, setTripType] = useState<'all' | 'pickup' | 'drop'>('all')
  const [allocationFilter, setAllocationFilter] = useState<'all' | 'unassigned' | 'assigned'>('all')

  // Edit Address Modal
  const [editingBooking, setEditingBooking] = useState<ServiceBooking | null>(null)
  const [editAddressInput, setEditAddressInput] = useState('')

  useEffect(() => {
    void loadInitialData()
  }, [])

  useEffect(() => {
    void loadBookings()
  }, [dateFilter])

  async function loadInitialData() {
    try {
      // 1. Fetch branch list
      const branchRes = await supabase.from('service_branches').select('name').order('name')
      if (branchRes.data) setBranches(branchRes.data.map(b => b.name))

      // 2. Fetch driver list from employee_master
      const driverRes = await supabase
        .from('employee_master')
        .select('id, employee_name, phone, role, is_active')
        .eq('is_active', true)
        .order('employee_name')

      if (driverRes.data) {
        const list = (driverRes.data as DriverEmployee[]).filter(
          u => u.employee_name && (hasBusinessRole(u.role, 'DRIVER') || (u.role && u.role.toUpperCase().includes('DRIVER')) || true)
        )
        setDrivers(list)
      }
    } catch (e: any) {
      console.error('Error loading initial driver data:', e)
    }
  }

  async function loadBookings() {
    setLoading(true)
    setError('')
    try {
      let query = supabase
        .from('service_bookings')
        .select('*')
        .order('id', { ascending: false })

      if (dateFilter) {
        query = query.or(`appointment_date.eq.${dateFilter},booking_date.eq.${dateFilter}`)
      }

      const { data, error: fetchErr } = await query

      if (fetchErr) throw fetchErr

      // Also pull bookings from post_feedback_bot_data for customer app bookings if needed
      setBookings(data || [])
    } catch (err: any) {
      console.error('loadBookings error:', err)
      setError(err?.message || 'Failed to load driver dispatch bookings')
    } finally {
      setLoading(false)
    }
  }

  async function handleAssignDriver(booking: ServiceBooking, driverName: string) {
    setSavingId(booking.id)
    try {
      const updates = { driver_name: driverName || null }
      const { error: updateErr } = await supabase
        .from('service_bookings')
        .update(updates)
        .eq('id', booking.id)

      if (updateErr) throw updateErr

      setBookings(prev =>
        prev.map(b => (b.id === booking.id ? { ...b, driver_name: driverName || null } : b))
      )
    } catch (err: any) {
      console.error('Assign driver error:', err)
      alert('Failed to update driver: ' + (err?.message || 'Unknown error'))
    } finally {
      setSavingId(null)
    }
  }

  async function handleSaveAddress() {
    if (!editingBooking) return
    setSavingId(editingBooking.id)
    try {
      const updates = { pickup_address: editAddressInput.trim() || null }
      const { error: updateErr } = await supabase
        .from('service_bookings')
        .update(updates)
        .eq('id', editingBooking.id)

      if (updateErr) throw updateErr

      setBookings(prev =>
        prev.map(b => (b.id === editingBooking.id ? { ...b, pickup_address: updates.pickup_address } : b))
      )
      setEditingBooking(null)
    } catch (err: any) {
      alert('Failed to save address: ' + (err?.message || 'Unknown error'))
    } finally {
      setSavingId(null)
    }
  }

  function copyAddress(b: ServiceBooking) {
    const text = b.pickup_address || b.customer_address || ''
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedId(b.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function sendWhatsAppToDriver(b: ServiceBooking) {
    if (!b.driver_name) {
      alert('Please assign a driver first before sending dispatch details.')
      return
    }
    const driverObj = drivers.find(d => d.employee_name.toLowerCase() === b.driver_name?.toLowerCase())
    const driverPhone = (driverObj?.phone || '').replace(/\D/g, '').slice(-10)

    const addr = b.pickup_address || b.customer_address || 'Address on customer record'
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`

    const message = `🚗 *TECHWHEELS DRIVER DISPATCH ASSIGNMENT*\n\n` +
      `*Vehicle:* ${b.reg_number} (${b.model || 'Tata Vehicle'})\n` +
      `*Customer:* ${b.customer_name}\n` +
      `*Phone:* ${b.customer_phone}\n` +
      `*Appointment Date:* ${b.appointment_date || b.booking_date}\n` +
      `*Slot:* ${b.booking_time || 'General Slot'}\n` +
      `*Pickup Address:* ${addr}\n` +
      `*Google Maps Pin:* ${mapsLink}\n\n` +
      `Please coordinate with the customer and ensure safe vehicle transit.`

    const waUrl = driverPhone
      ? `https://wa.me/91${driverPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`

    window.open(waUrl, '_blank')
  }

  // Filtered dataset
  const filtered = useMemo(() => {
    return bookings.filter(b => {
      // Must be pickup/drop or have driver assigned or is customer app booking
      const isTrip = b.pickup_required || b.drop_required || Boolean(b.driver_name) || Boolean(b.pickup_address)
      if (!isTrip && allocationFilter === 'all' && selectedDriver === 'all' && !searchQuery) {
        // Still show bookings if requested
      }

      if (selectedDriver !== 'all') {
        if (selectedDriver === '__unassigned__') {
          if (b.driver_name) return false
        } else if (b.driver_name?.toLowerCase() !== selectedDriver.toLowerCase()) {
          return false
        }
      }

      if (allocationFilter === 'unassigned' && b.driver_name) return false
      if (allocationFilter === 'assigned' && !b.driver_name) return false

      if (selectedBranch !== 'all' && b.branch?.toLowerCase() !== selectedBranch.toLowerCase()) {
        return false
      }

      if (tripType === 'pickup' && !b.pickup_required && !b.pickup_address) return false
      if (tripType === 'drop' && !b.drop_required) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const match =
          b.reg_number?.toLowerCase().includes(q) ||
          b.customer_name?.toLowerCase().includes(q) ||
          b.customer_phone?.includes(q) ||
          b.pickup_address?.toLowerCase().includes(q) ||
          b.model?.toLowerCase().includes(q) ||
          b.driver_name?.toLowerCase().includes(q)
        if (!match) return false
      }

      return true
    })
  }, [bookings, selectedDriver, selectedBranch, tripType, allocationFilter, searchQuery])

  // Summary Metrics
  const stats = useMemo(() => {
    const total = filtered.length
    const assigned = filtered.filter(b => Boolean(b.driver_name)).length
    const unassigned = total - assigned
    const completed = filtered.filter(b => b.status === 'Completed' || b.status === 'Arrived').length
    return { total, assigned, unassigned, completed }
  }, [filtered])

  function handleExport() {
    const rows = filtered.map(b => ({
      'Lead Number': b.lead_number || `#${b.id}`,
      'Reg Number': b.reg_number,
      'Model': b.model || '',
      'Customer Name': b.customer_name,
      'Customer Phone': b.customer_phone,
      'Appointment Date': b.appointment_date || b.booking_date,
      'Slot': b.booking_time || '',
      'Pickup Address': b.pickup_address || '',
      'Assigned Driver': b.driver_name || 'Unassigned',
      'Trip Type': b.pickup_required && b.drop_required ? 'Pickup & Drop' : b.pickup_required ? 'Pickup' : b.drop_required ? 'Drop' : 'Standard',
      'Status': b.status,
      'Branch': b.branch || '',
    }))
    exportToCSV(rows, generateExportFilename('Driver_Dispatch_Report'))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc', color: '#0f172a' }}>
      
      {/* ── Top Header ── */}
      <div style={{ background: '#0b132b', color: '#fff', padding: '0.85rem 1.4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(30,96,255,0.2)', border: '1px solid rgba(30,96,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
            🚗
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#ffffff' }}>
              Driver Pickup & Drop Management
            </h1>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
              Assign drivers, navigate customer addresses & track scheduled vehicle dispatches
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Link
            to="/service-booking"
            style={{ textDecoration: 'none', background: 'rgba(255,255,255,0.1)', color: '#e2e8f0', padding: '0.45rem 0.85rem', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            ← Service Bookings
          </Link>
          <button
            onClick={() => void loadBookings()}
            style={{ background: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: 8, padding: '0.45rem 0.85rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            🔄 Refresh
          </button>
          <button
            onClick={handleExport}
            style={{ background: '#1e60ff', color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 0.95rem', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            📥 Export Report
          </button>
        </div>
      </div>

      {/* ── KPI Metric Cards Strip ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.75rem 1.4rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ fontSize: '1.8rem' }}>📦</div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{stats.total}</div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginTop: 3 }}>Total Pickups & Drops</div>
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ fontSize: '1.8rem' }}>✅</div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#16a34a', lineHeight: 1 }}>{stats.assigned}</div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', marginTop: 3 }}>Driver Allocated</div>
          </div>
        </div>

        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ fontSize: '1.8rem' }}>⚠️</div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#dc2626', lineHeight: 1 }}>{stats.unassigned}</div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase', marginTop: 3 }}>Unassigned (Pending)</div>
          </div>
        </div>

        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ fontSize: '1.8rem' }}>👥</div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#2563eb', lineHeight: 1 }}>{drivers.length}</div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', marginTop: 3 }}>Active Drivers Roster</div>
          </div>
        </div>
      </div>

      {/* ── Filters & Search Bar ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.65rem 1.4rem', display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '320px' }}>
          <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.9rem' }}>🔍</span>
          <input
            style={{ width: '100%', padding: '0.45rem 0.65rem 0.45rem 2rem', fontSize: '0.82rem', border: '1.5px solid #cbd5e1', borderRadius: 8, outline: 'none', background: '#f8fafc' }}
            placeholder="Search reg no, customer, address, driver…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Date Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#475569' }}>Date:</span>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', border: '1.5px solid #cbd5e1', borderRadius: 8, background: '#f8fafc', fontWeight: 700, color: '#0f172a' }}
          />
          <button
            onClick={() => setDateFilter('')}
            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.35rem 0.6rem', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
          >
            All Dates
          </button>
        </div>

        {/* Driver Filter Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#475569' }}>Driver:</span>
          <select
            value={selectedDriver}
            onChange={e => setSelectedDriver(e.target.value)}
            style={{ padding: '0.4rem 0.65rem', fontSize: '0.8rem', border: '1.5px solid #cbd5e1', borderRadius: 8, background: '#f8fafc', fontWeight: 700, color: '#0f172a' }}
          >
            <option value="all">All Drivers ({drivers.length})</option>
            <option value="__unassigned__">⚠️ Unassigned Only</option>
            {drivers.map(d => (
              <option key={d.id} value={d.employee_name}>
                🚗 {d.employee_name}
              </option>
            ))}
          </select>
        </div>

        {/* Trip Type Filter */}
        <select
          value={tripType}
          onChange={e => setTripType(e.target.value as 'all' | 'pickup' | 'drop')}
          style={{ padding: '0.4rem 0.65rem', fontSize: '0.8rem', border: '1.5px solid #cbd5e1', borderRadius: 8, background: '#f8fafc', fontWeight: 700, color: '#0f172a' }}
        >
          <option value="all">All Trips (Pickups & Drops)</option>
          <option value="pickup">📦 Pickups Only</option>
          <option value="drop">🚗 Drops Only</option>
        </select>

        {/* Branch Filter */}
        {branches.length > 0 && (
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            style={{ padding: '0.4rem 0.65rem', fontSize: '0.8rem', border: '1.5px solid #cbd5e1', borderRadius: 8, background: '#f8fafc', fontWeight: 700, color: '#0f172a' }}
          >
            <option value="all">All Branches</option>
            {branches.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        )}

        {/* Allocation status pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto' }}>
          {(['all', 'unassigned', 'assigned'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setAllocationFilter(mode)}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: 20,
                fontSize: '0.74rem',
                fontWeight: 800,
                cursor: 'pointer',
                border: allocationFilter === mode ? '1.5px solid #1e60ff' : '1px solid #cbd5e1',
                background: allocationFilter === mode ? '#eff6ff' : '#fff',
                color: allocationFilter === mode ? '#1e60ff' : '#64748b',
                textTransform: 'capitalize',
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.5rem 1.4rem', fontSize: '0.8rem', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* ── Main Dispatch Cards List ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 1.4rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94a3b8' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>Loading driver dispatch data…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94a3b8', background: '#fff', borderRadius: 16, border: '1px dashed #cbd5e1' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.6rem' }}>🚗</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#334155' }}>No Vehicle Pickups / Drops Found</div>
            <div style={{ fontSize: '0.82rem', marginTop: '0.3rem' }}>
              {selectedDriver !== 'all' ? `No vehicles allocated to selected driver filter.` : 'No scheduled vehicle pickups matching current filters.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: '1.1rem' }}>
            {filtered.map(b => {
              const isAssigned = Boolean(b.driver_name)
              const isSavingThis = savingId === b.id
              const sm = STATUS_META[b.status] || { bg: '#f1f5f9', color: '#475569' }
              const addressText = b.pickup_address || b.customer_address || ''
              const hasAddress = Boolean(addressText.trim())

              return (
                <div
                  key={b.id}
                  style={{
                    background: '#ffffff',
                    border: `1.5px solid ${isAssigned ? '#cbd5e1' : '#f87171'}`,
                    borderRadius: 16,
                    padding: '1.1rem 1.2rem',
                    boxShadow: isAssigned ? '0 2px 6px rgba(0,0,0,0.03)' : '0 4px 12px rgba(239, 68, 68, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    position: 'relative',
                  }}
                >
                  {/* Row 1: Vehicle Reg Number + Driver Pill */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.6rem' }}>
                    <div>
                      <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a', letterSpacing: '0.02em' }}>
                        {b.reg_number}
                      </span>
                      {b.model && (
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginLeft: '0.5rem' }}>
                          · {b.model}
                        </span>
                      )}
                      {b.fuel_type && (
                        <span style={{ marginLeft: '0.45rem', fontSize: '0.68rem', fontWeight: 900, padding: '0.15rem 0.45rem', borderRadius: 6, background: b.fuel_type === 'EV' ? '#dcfce7' : '#f1f5f9', color: b.fuel_type === 'EV' ? '#15803d' : '#475569' }}>
                          {b.fuel_type}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span
                        style={{
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          padding: '0.22rem 0.75rem',
                          borderRadius: 20,
                          background: isAssigned ? '#e0f2fe' : '#fef2f2',
                          color: isAssigned ? '#0369a1' : '#dc2626',
                          border: `1px solid ${isAssigned ? '#bae6fd' : '#fecaca'}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}
                      >
                        {isAssigned ? `🚗 ${b.driver_name}` : '⚠️ Driver Not Assigned'}
                      </span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: 12, background: sm.bg, color: sm.color }}>
                        {b.status}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Customer Name, Phone, and Slot */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', color: '#1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong>{b.customer_name}</strong>
                      <a
                        href={`tel:${b.customer_phone}`}
                        style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 700, fontSize: '0.8rem', background: '#eff6ff', padding: '0.15rem 0.5rem', borderRadius: 6, border: '1px solid #bfdbfe' }}
                      >
                        📞 {b.customer_phone}
                      </a>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>
                      📅 {b.appointment_date || b.booking_date || 'TBD'} {b.booking_time ? `(${b.booking_time})` : ''}
                    </div>
                  </div>

                  {/* Row 3: Comprehensive Location Box with Google Maps Pin & Directions */}
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.65rem 0.85rem', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', flex: 1 }}>
                        <span style={{ fontSize: '1.1rem', marginTop: -2 }}>📍</span>
                        <div style={{ flex: 1, wordBreak: 'break-word', lineHeight: 1.4 }}>
                          <strong style={{ color: '#0f172a' }}>Pickup / Drop Address:</strong>{' '}
                          {hasAddress ? addressText : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Address not specified</span>}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setEditingBooking(b)
                          setEditAddressInput(addressText)
                        }}
                        style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.15rem 0.45rem', fontSize: '0.7rem', fontWeight: 700, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        ✏️ Edit
                      </button>
                    </div>

                    {/* Action Links: Open Map, Start Navigation, Copy */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.2rem', paddingTop: '0.4rem', borderTop: '1px solid #f1f5f9' }}>
                      {hasAddress && (
                        <>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ background: '#2563eb', color: '#fff', borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.72rem', fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                          >
                            📍 Open Maps ↗
                          </a>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressText)}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ background: '#16a34a', color: '#fff', borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.72rem', fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                          >
                            🧭 Start GPS Nav ↗
                          </a>
                          <button
                            onClick={() => copyAddress(b)}
                            style={{ background: copiedId === b.id ? '#dcfce7' : '#fff', color: copiedId === b.id ? '#15803d' : '#475569', border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.25rem 0.55rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            {copiedId === b.id ? '✓ Copied!' : '📋 Copy Address'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Complaint / Special instructions */}
                  {b.complaint_description && (
                    <div style={{ fontSize: '0.76rem', color: '#64748b', background: '#fffbeb', padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #fef3c7' }}>
                      <strong>Service Request:</strong> {b.complaint_description}
                    </div>
                  )}

                  {/* Row 4: Assign Driver Dropdown + Send WhatsApp Button */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginTop: '0.2rem', background: '#f1f5f9', padding: '0.55rem 0.75rem', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap' }}>
                        Assign Driver:
                      </span>
                      <select
                        disabled={isSavingThis}
                        value={b.driver_name || ''}
                        onChange={e => void handleAssignDriver(b, e.target.value)}
                        style={{
                          flex: 1,
                          border: '1.5px solid #cbd5e1',
                          borderRadius: 8,
                          padding: '0.38rem 0.6rem',
                          fontSize: '0.82rem',
                          background: b.driver_name ? '#f0fdf4' : '#fff',
                          fontWeight: 700,
                          color: b.driver_name ? '#15803d' : '#334155',
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="">— Select Driver from Roster —</option>
                        {drivers.map(d => (
                          <option key={d.id} value={d.employee_name}>
                            🚗 {d.employee_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={() => sendWhatsAppToDriver(b)}
                      title="Send complete pickup details & Google Maps pin to driver via WhatsApp"
                      style={{
                        background: '#25D366',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '0.4rem 0.75rem',
                        fontSize: '0.76rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      💬 WhatsApp Driver
                    </button>
                  </div>

                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Edit Address Modal ── */}
      {editingBooking && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, padding: '1.4rem', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 900, fontSize: '1.05rem', color: '#0f172a' }}>
                ✏️ Update Pickup Location: {editingBooking.reg_number}
              </div>
              <button onClick={() => setEditingBooking(null)} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.2rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Complete Pickup Address & Landmark:</span>
              <textarea
                rows={4}
                value={editAddressInput}
                onChange={e => setEditAddressInput(e.target.value)}
                placeholder="Enter complete street address, apartment / colony, landmark and pin code…"
                style={{ border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.85rem', outline: 'none', resize: 'vertical' }}
              />
            </label>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                onClick={() => setEditingBooking(null)}
                style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 8, padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSaveAddress()}
                style={{ background: '#1e60ff', color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 1.2rem', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer' }}
              >
                Save Location
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
