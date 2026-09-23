import { useEffect, useMemo, useState } from 'react'
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

import { parseLocationDetails } from '../lib/locationParser'

const STATUS_META: Record<string, { bg: string; color: string; border: string }> = {
  New:                 { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  Confirmed:           { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  'Driver Assigned':   { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' },
  'Out for Pickup':    { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  'Vehicle Picked Up': { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  Arrived:             { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
  'In-Progress':       { bg: '#faf5ff', color: '#6d28d9', border: '#e9d5ff' },
  'Out for Drop':      { bg: '#fdf4ff', color: '#86198f', border: '#f5d0fe' },
  Completed:           { bg: '#dcfce7', color: '#166534', border: '#86efac' },
  Cancelled:           { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
}

export function isPickupDropTrip(b: ServiceBooking): boolean {
  const hasPickupOrDrop = Boolean(b.pickup_required || b.drop_required)
  const hasAssignedDriver = Boolean(b.driver_name && b.driver_name.toLowerCase() !== 'admin')
  return hasPickupOrDrop && hasAssignedDriver
}

export default function DriverManagementPage() {
  const [bookings, setBookings] = useState<ServiceBooking[]>([])
  const [drivers, setDrivers] = useState<DriverEmployee[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'workload'>('table')

  // Filters
  const todayStr = new Date().toISOString().split('T')[0]
  const [dateFilter, setDateFilter] = useState<string>(todayStr)
  const [datePreset, setDatePreset] = useState<'today' | 'tomorrow' | 'week' | 'all' | 'custom'>('today')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDriver, setSelectedDriver] = useState('all')
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [tripType, setTripType] = useState<'all' | 'pickup' | 'drop'>('all')

  // Print Trip Sheet Dialog
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [printDriverSelect, setPrintDriverSelect] = useState('all')

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

      // 2. Fetch real staff driver list from employee_master
      const driverRes = await supabase
        .from('employee_master')
        .select('id, employee_name, role, department, is_active')
        .order('employee_name')

      if (driverRes.data) {
        const list = (driverRes.data as { id: number; employee_name: string; role: string | null; department?: string | null; is_active: boolean | null }[])
          .filter(u => {
            if (!u.employee_name) return false
            const name = u.employee_name.trim().toLowerCase()
            if (name === 'admin' || name === 'administrator') return false
            if (u.is_active === false) return false
            const isDriverRole = hasBusinessRole(u.role, 'DRIVER') || (u.role && u.role.toUpperCase().includes('DRIVER'))
            const isDriverDept = Boolean(u.department && u.department.toUpperCase().includes('DRIVER'))
            return isDriverRole || isDriverDept
          })
          .map(u => ({
            id: String(u.id),
            employee_name: u.employee_name.trim(),
            role: u.role || 'DRIVER',
            is_active: u.is_active ?? true,
          }))

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

      const list = (data || []).filter(isPickupDropTrip)
      setBookings(list)

      // Also collect any driver_name assigned to bookings (strictly excluding 'Admin' and 'Administrator')
      const bookedDrivers = Array.from(new Set(list.map(b => b.driver_name).filter(Boolean))) as string[]
      setDrivers(prev => {
        const existingNames = new Set(prev.map(d => d.employee_name.toLowerCase()))
        const additional: DriverEmployee[] = []
        bookedDrivers.forEach(rawName => {
          const name = rawName.trim()
          const lower = name.toLowerCase()
          if (lower !== 'admin' && lower !== 'administrator' && !existingNames.has(lower)) {
            additional.push({ id: `driver-${name}`, employee_name: name, role: 'DRIVER', is_active: true })
            existingNames.add(lower)
          }
        })
        return additional.length > 0 ? [...prev, ...additional] : prev
      })
    } catch (err: any) {
      console.error('loadBookings error:', err)
      setError(err?.message || 'Failed to load driver dispatch bookings')
    } finally {
      setLoading(false)
    }
  }

  function handleDatePreset(preset: 'today' | 'tomorrow' | 'week' | 'all' | 'custom') {
    setDatePreset(preset)
    const d = new Date()
    if (preset === 'today') {
      setDateFilter(d.toISOString().split('T')[0])
    } else if (preset === 'tomorrow') {
      d.setDate(d.getDate() + 1)
      setDateFilter(d.toISOString().split('T')[0])
    } else if (preset === 'all') {
      setDateFilter('')
    }
  }

  async function handleAssignDriver(booking: ServiceBooking, driverName: string) {
    setSavingId(booking.id)
    try {
      const updates: { driver_name: string | null; status?: string } = { driver_name: driverName || null }

      // Automatic status handling:
      if (driverName) {
        if (booking.status === 'Confirmed' || booking.status === 'New') {
          updates.status = 'Driver Assigned'
        }
      } else {
        if (booking.status === 'Driver Assigned') {
          updates.status = 'Confirmed'
        }
      }

      const { error: updateErr } = await supabase
        .from('service_bookings')
        .update(updates)
        .eq('id', booking.id)

      if (updateErr) throw updateErr

      setBookings(prev =>
        prev.map(b => (b.id === booking.id ? { ...b, ...updates } : b))
      )
    } catch (err: any) {
      console.error('Assign driver error:', err)
      alert('Failed to update driver: ' + (err?.message || 'Unknown error'))
    } finally {
      setSavingId(null)
    }
  }

  // Workload computation across all bookings
  const driverWorkload = useMemo(() => {
    const counts: Record<string, { total: number; pickups: number; drops: number; completed: number }> = {}
    drivers.forEach(d => {
      counts[d.employee_name.toLowerCase()] = { total: 0, pickups: 0, drops: 0, completed: 0 }
    })

    bookings.forEach(b => {
      if (!isPickupDropTrip(b)) return
      const hasDriver = Boolean(b.driver_name && b.driver_name.toLowerCase() !== 'admin')
      if (hasDriver) {
        const key = b.driver_name!.trim().toLowerCase()
        if (!counts[key]) {
          counts[key] = { total: 0, pickups: 0, drops: 0, completed: 0 }
        }
        counts[key].total++
        if (b.pickup_required) counts[key].pickups++
        if (b.drop_required) counts[key].drops++
        if (b.status === 'Completed' || b.status === 'Arrived') counts[key].completed++
      }
    })

    return { counts }
  }, [bookings, drivers])

  // Filtered dataset
  const filtered = useMemo(() => {
    return bookings.filter(b => {
      if (!isPickupDropTrip(b)) return false

      if (selectedDriver !== 'all') {
        if (b.driver_name?.toLowerCase() !== selectedDriver.toLowerCase()) {
          return false
        }
      }

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
  }, [bookings, selectedDriver, selectedBranch, tripType, searchQuery])

  // Summary Metrics
  const stats = useMemo(() => {
    const total = filtered.length
    const pickups = filtered.filter(b => b.pickup_required).length
    const drops = filtered.filter(b => b.drop_required).length
    const completed = filtered.filter(b => b.status === 'Completed' || b.status === 'Arrived').length
    return { total, pickups, drops, completed }
  }, [filtered])

  function handleExport() {
    const rows = filtered.map(b => {
      const loc = parseLocationDetails(b.pickup_address || b.customer_address)
      return {
        'Lead Number': b.lead_number || `#${b.id}`,
        'Reg Number': b.reg_number,
        'Model': b.model || '',
        'Customer Name': b.customer_name,
        'Customer Phone': b.customer_phone,
        'Appointment Date': b.appointment_date || b.booking_date,
        'Slot': b.booking_time || '',
        'Pickup Address': loc.cleanAddress,
        'GPS Latitude': loc.lat || '',
        'GPS Longitude': loc.lng || '',
        'Google Maps URL': loc.mapsUrl || '',
        'Assigned Staff Driver': b.driver_name || 'Unassigned',
        'Trip Type': b.pickup_required && b.drop_required ? 'Pickup & Drop' : b.pickup_required ? 'Pickup' : b.drop_required ? 'Drop' : 'Standard',
        'Status': b.status,
        'Branch': b.branch || '',
      }
    })
    exportToCSV(rows, generateExportFilename('Driver_Pickup_Drop_Report'))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'inherit' }}>
      
      {/* ── Top Header ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.75rem 1.4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>
            Driver Management
          </h1>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
            Assign vehicles to staff drivers and view customer app location pins
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => void loadBookings()}
            style={{ background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.4rem 0.8rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            🔄 Refresh
          </button>
          <button
            onClick={() => setPrintModalOpen(true)}
            style={{ background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.4rem 0.8rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            🖨️ Print Sheet
          </button>
          <button
            onClick={handleExport}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '0.4rem 0.95rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* ── KPI Metric Cards Strip ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.6rem 1.4rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.65rem', flexShrink: 0 }}>
        
        {/* Total Allocated Trips */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.55rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ width: 34, height: 34, borderRadius: 6, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>📦</div>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{stats.total}</div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginTop: 2 }}>Allocated Trips</div>
          </div>
        </div>

        {/* Pickups */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.55rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ width: 34, height: 34, borderRadius: 6, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🚐</div>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#2563eb', lineHeight: 1 }}>{stats.pickups}</div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', marginTop: 2 }}>Pickups</div>
          </div>
        </div>

        {/* Drops */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.55rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ width: 34, height: 34, borderRadius: 6, background: '#fdf4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🚗</div>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#86198f', lineHeight: 1 }}>{stats.drops}</div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#a21caf', textTransform: 'uppercase', marginTop: 2 }}>Drops</div>
          </div>
        </div>

        {/* Completed */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.55rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ width: 34, height: 34, borderRadius: 6, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>✅</div>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>{stats.completed}</div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', marginTop: 2 }}>Completed</div>
          </div>
        </div>

        {/* Staff Drivers */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.55rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ width: 34, height: 34, borderRadius: 6, background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>👥</div>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#4338ca', lineHeight: 1 }}>{drivers.length}</div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#3730a3', textTransform: 'uppercase', marginTop: 2 }}>Staff Drivers</div>
          </div>
        </div>

      </div>

      {/* ── Driver Workload Roster Strip ── */}
      <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '0.55rem 1.4rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>🚗</span>
            <span>Staff Drivers Workload & Quick Filters:</span>
            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 500 }}>(Select driver to view allocated vehicles)</span>
          </div>
          {(selectedDriver !== 'all') && (
            <button
              onClick={() => setSelectedDriver('all')}
              style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.2rem 0.55rem', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', color: '#475569' }}
            >
              Clear Filter (Show All)
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.15rem' }}>

          {/* Individual Driver Cards */}
          {drivers.map(d => {
            const counts = driverWorkload.counts[d.employee_name.toLowerCase()] || { total: 0, pickups: 0, drops: 0, completed: 0 }
            const isSelected = selectedDriver.toLowerCase() === d.employee_name.toLowerCase()

            return (
              <div
                key={d.id}
                onClick={() => {
                  setSelectedDriver(isSelected ? 'all' : d.employee_name)
                }}
                style={{
                  flex: '0 0 auto',
                  background: isSelected ? '#eff6ff' : '#ffffff',
                  border: `1.5px solid ${isSelected ? '#2563eb' : '#e2e8f0'}`,
                  borderRadius: 8,
                  padding: '0.4rem 0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>{d.employee_name}</span>
                    <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '0.08rem 0.35rem', borderRadius: 6, background: counts.total > 0 ? '#dbeafe' : '#f1f5f9', color: counts.total > 0 ? '#1d4ed8' : '#64748b' }}>
                      {counts.total} Allocated
                    </span>
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 1 }}>
                    <span>{d.role || 'Staff Driver'}</span>
                    {counts.completed > 0 && <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ {counts.completed} Done</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Filters & Search Toolbar ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.65rem 1.4rem', display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '300px' }}>
          <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.9rem' }}>🔍</span>
          <input
            style={{ width: '100%', padding: '0.42rem 0.65rem 0.42rem 2rem', fontSize: '0.8rem', border: '1.5px solid #cbd5e1', borderRadius: 8, outline: 'none', background: '#f8fafc' }}
            placeholder="Search reg no, customer, address, driver…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Date presets & picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#f1f5f9', padding: '0.2rem', borderRadius: 8 }}>
          <button
            onClick={() => handleDatePreset('today')}
            style={{ padding: '0.3rem 0.6rem', border: 'none', borderRadius: 6, fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer', background: datePreset === 'today' ? '#fff' : 'transparent', color: datePreset === 'today' ? '#0f172a' : '#64748b', boxShadow: datePreset === 'today' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
          >
            Today
          </button>
          <button
            onClick={() => handleDatePreset('tomorrow')}
            style={{ padding: '0.3rem 0.6rem', border: 'none', borderRadius: 6, fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer', background: datePreset === 'tomorrow' ? '#fff' : 'transparent', color: datePreset === 'tomorrow' ? '#0f172a' : '#64748b', boxShadow: datePreset === 'tomorrow' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
          >
            Tomorrow
          </button>
          <button
            onClick={() => handleDatePreset('all')}
            style={{ padding: '0.3rem 0.6rem', border: 'none', borderRadius: 6, fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer', background: datePreset === 'all' ? '#fff' : 'transparent', color: datePreset === 'all' ? '#0f172a' : '#64748b', boxShadow: datePreset === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
          >
            All Dates
          </button>
        </div>

        <input
          type="date"
          value={dateFilter}
          onChange={e => {
            setDatePreset('custom')
            setDateFilter(e.target.value)
          }}
          style={{ padding: '0.38rem 0.6rem', fontSize: '0.78rem', border: '1.5px solid #cbd5e1', borderRadius: 8, background: '#f8fafc', fontWeight: 700, color: '#0f172a' }}
        />

        {/* Driver Dropdown */}
        <select
          value={selectedDriver}
          onChange={e => setSelectedDriver(e.target.value)}
          style={{ padding: '0.4rem 0.65rem', fontSize: '0.78rem', border: '1.5px solid #cbd5e1', borderRadius: 8, background: '#f8fafc', fontWeight: 700, color: '#0f172a' }}
        >
          <option value="all">All Drivers ({drivers.length})</option>
          {drivers.map(d => {
            const count = driverWorkload.counts[d.employee_name.toLowerCase()]?.total || 0
            return (
              <option key={d.id} value={d.employee_name}>
                🚗 {d.employee_name} ({count} assigned)
              </option>
            )
          })}
        </select>

        {/* Trip Type */}
        <select
          value={tripType}
          onChange={e => setTripType(e.target.value as 'all' | 'pickup' | 'drop')}
          style={{ padding: '0.4rem 0.65rem', fontSize: '0.78rem', border: '1.5px solid #cbd5e1', borderRadius: 8, background: '#f8fafc', fontWeight: 700, color: '#0f172a' }}
        >
          <option value="all">All Trips (Pickups & Drops)</option>
          <option value="pickup">🚐 Pickups Only</option>
          <option value="drop">🏠 Drops Only</option>
        </select>

        {/* Branch Filter */}
        {branches.length > 0 && (
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            style={{ padding: '0.4rem 0.65rem', fontSize: '0.78rem', border: '1.5px solid #cbd5e1', borderRadius: 8, background: '#f8fafc', fontWeight: 700, color: '#0f172a' }}
          >
            <option value="all">All Branches</option>
            {branches.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        )}

        {/* View Mode Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#f1f5f9', padding: '0.2rem', borderRadius: 8, marginLeft: 'auto' }}>
          <button
            onClick={() => setViewMode('table')}
            style={{ padding: '0.35rem 0.65rem', border: 'none', borderRadius: 6, fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer', background: viewMode === 'table' ? '#2563eb' : 'transparent', color: viewMode === 'table' ? '#fff' : '#64748b' }}
          >
            📋 Table
          </button>
          <button
            onClick={() => setViewMode('workload')}
            style={{ padding: '0.35rem 0.65rem', border: 'none', borderRadius: 6, fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer', background: viewMode === 'workload' ? '#2563eb' : 'transparent', color: viewMode === 'workload' ? '#fff' : '#64748b' }}
          >
            👥 Driver Board
          </button>
        </div>

      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.55rem 1.4rem', fontSize: '0.8rem', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* ── Main Content Area ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 1.4rem' }}>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94a3b8' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>⏳</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#334155' }}>Loading driver dispatch data…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94a3b8', background: '#fff', borderRadius: 16, border: '1.5px dashed #cbd5e1' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.6rem' }}>🚗</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#334155' }}>No Vehicle Pickups / Drops Found</div>
            <div style={{ fontSize: '0.82rem', marginTop: '0.3rem', color: '#64748b' }}>
              {selectedDriver !== 'all' ? `No vehicles allocated to ${selectedDriver} for current filters.` : 'No scheduled vehicle pickups matching current date or filter selection.'}
            </div>
            <button
              onClick={() => {
                setDatePreset('all')
                setDateFilter('')
                setSelectedDriver('all')
                setSearchQuery('')
              }}
              style={{ marginTop: '1rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 1.1rem', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}
            >
              Reset All Filters
            </button>
          </div>
        ) : viewMode === 'table' ? (
          
          /* ── TABLE VIEW ── */
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', color: '#475569', fontWeight: 800, fontSize: '0.72rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Reg Number / Vehicle</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Customer</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Appointment Slot</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Pickup / Drop Address & GPS</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Assigned Driver</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>GPS Navigation</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => {
                  const isAssigned = Boolean(b.driver_name && b.driver_name.toLowerCase() !== 'admin')
                  const loc = parseLocationDetails(b.pickup_address || b.customer_address)
                  const sm = STATUS_META[b.status] || { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' }

                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 900, color: '#0f172a' }}>{b.reg_number}</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{b.model || 'Tata Vehicle'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{b.customer_name}</div>
                        <a href={`tel:${b.customer_phone}`} style={{ fontSize: '0.74rem', color: '#2563eb', textDecoration: 'none' }}>
                          📞 {b.customer_phone}
                        </a>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 700 }}>{b.appointment_date || b.booking_date}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{b.booking_time || 'General Slot'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', maxWidth: '300px' }}>
                        <div style={{ fontSize: '0.78rem', color: '#334155', wordBreak: 'break-word' }}>
                          {loc.cleanAddress}
                        </div>
                        {loc.hasGps && (
                          <div style={{ fontSize: '0.68rem', color: '#059669', fontWeight: 800, marginTop: 2 }}>
                            🛰️ Live Pin: {loc.lat?.toFixed(5)}, {loc.lng?.toFixed(5)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <select
                            disabled={savingId === b.id}
                            value={b.driver_name && b.driver_name.toLowerCase() !== 'admin' ? b.driver_name : ''}
                            onChange={e => void handleAssignDriver(b, e.target.value)}
                            style={{
                              border: '1px solid #cbd5e1',
                              borderRadius: 6,
                              padding: '0.3rem 0.5rem',
                              fontSize: '0.78rem',
                              background: isAssigned ? '#f0fdf4' : '#fff',
                              fontWeight: 700,
                              color: isAssigned ? '#15803d' : '#334155',
                            }}
                          >
                            <option value="">— Select Driver —</option>
                            {drivers.map(d => (
                              <option key={d.id} value={d.employee_name}>
                                🚗 {d.employee_name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: 12, background: sm.bg, color: sm.color, border: `1px solid ${sm.border}` }}>
                          {b.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          {loc.mapsUrl ? (
                            <a
                              href={loc.mapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: '0.74rem',
                                color: loc.hasGps ? '#15803d' : '#2563eb',
                                background: loc.hasGps ? '#f0fdf4' : '#eff6ff',
                                border: `1px solid ${loc.hasGps ? '#bbf7d0' : '#bfdbfe'}`,
                                fontWeight: 800,
                                textDecoration: 'none',
                                padding: '0.3rem 0.65rem',
                                borderRadius: 6,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                              }}
                            >
                              {loc.hasGps ? '🛰️ Open GPS Pin ↗' : '🗺️ Open in Map ↗'}
                            </a>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

        ) : (
          
          /* ── DRIVER WORKLOAD BOARD (KANBAN STYLE) ── */
          <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem' }}>
            {/* Columns for each staff driver */}
            {drivers.map(d => {
              const driverTrips = filtered.filter(b => b.driver_name?.toLowerCase() === d.employee_name.toLowerCase())

              return (
                <div
                  key={d.id}
                  style={{
                    flex: '0 0 340px',
                    background: '#f8fafc',
                    borderRadius: 14,
                    border: '1.5px solid #cbd5e1',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: 'calc(100vh - 300px)',
                  }}
                >
                  <div
                    style={{
                      padding: '0.8rem 1rem',
                      background: '#e2e8f0',
                      borderTopLeftRadius: 12,
                      borderTopRightRadius: 12,
                      borderBottom: '1px solid #cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900, fontSize: '0.88rem', color: '#0f172a' }}>
                        🚗 {d.employee_name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                        {d.role || 'Staff Driver'}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '0.76rem',
                        fontWeight: 900,
                        background: '#2563eb',
                        color: '#fff',
                        padding: '0.1rem 0.5rem',
                        borderRadius: 10,
                      }}
                    >
                      {driverTrips.length}
                    </span>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {driverTrips.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8', fontSize: '0.78rem' }}>
                        No vehicles assigned
                      </div>
                    ) : (
                      driverTrips.map(b => {
                        const loc = parseLocationDetails(b.pickup_address || b.customer_address)
                        return (
                          <div key={b.id} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 900, fontSize: '0.92rem', color: '#0f172a' }}>{b.reg_number}</span>
                              <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: 6, background: '#f1f5f9' }}>
                                {b.booking_time || 'Slot'}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: 2 }}>
                              {b.customer_name} (📞 {b.customer_phone})
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                              📍 {loc.cleanAddress}
                              {loc.hasGps && (
                                <div style={{ fontSize: '0.66rem', color: '#16a34a', fontWeight: 700, marginTop: 1 }}>
                                  🛰️ Live GPS: {loc.lat?.toFixed(5)}, {loc.lng?.toFixed(5)}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginTop: 6 }}>
                              {loc.mapsUrl ? (
                                <a
                                  href={loc.mapsUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    fontSize: '0.7rem',
                                    color: loc.hasGps ? '#15803d' : '#2563eb',
                                    background: loc.hasGps ? '#f0fdf4' : '#eff6ff',
                                    border: `1px solid ${loc.hasGps ? '#bbf7d0' : '#bfdbfe'}`,
                                    fontWeight: 800,
                                    textDecoration: 'none',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: 4,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                  }}
                                >
                                  {loc.hasGps ? '🛰️ Map Pin ↗' : '🗺️ Map ↗'}
                                </a>
                              ) : <span />}
                              <select
                                disabled={savingId === b.id}
                                value={b.driver_name || ''}
                                onChange={e => void handleAssignDriver(b, e.target.value)}
                                style={{ fontSize: '0.7rem', padding: '0.15rem 0.3rem', borderRadius: 4, border: '1px solid #cbd5e1', fontWeight: 700, background: '#fff', color: '#15803d', cursor: 'pointer' }}
                                title="Change driver"
                              >
                                {drivers.map(drv => (
                                  <option key={drv.id} value={drv.employee_name}>
                                    → {drv.employee_name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}

          </div>

        )}

      </div>



      {/* ── Print Dispatch Sheet Dialog ── */}
      {printModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#0f172a' }}>
                  🖨️ Print Driver Dispatch Sheet
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Date: {dateFilter || 'All Dates'}
                </div>
              </div>
              <button onClick={() => setPrintModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Select Driver to Print:</span>
              <select
                value={printDriverSelect}
                onChange={e => setPrintDriverSelect(e.target.value)}
                style={{ padding: '0.35rem 0.65rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 700 }}
              >
                <option value="all">All Drivers (Combined Sheet)</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.employee_name}>🚗 {d.employee_name}</option>
                ))}
              </select>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '1rem', background: '#fafafa', fontSize: '0.8rem' }}>
              <div style={{ textAlign: 'center', borderBottom: '1.5px solid #0f172a', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
                <div style={{ fontWeight: 900, fontSize: '1.15rem' }}>TECHWHEELS SERVICE</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Daily Vehicle Pickup & Drop Dispatch Sheet · Date: {dateFilter || 'Today'}</div>
                {printDriverSelect !== 'all' && <div style={{ fontSize: '0.85rem', fontWeight: 800, marginTop: 3 }}>Driver: {printDriverSelect}</div>}
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #cbd5e1', background: '#f1f5f9', fontWeight: 800 }}>
                    <th style={{ padding: '0.4rem', textAlign: 'left' }}>#</th>
                    <th style={{ padding: '0.4rem', textAlign: 'left' }}>Reg No / Model</th>
                    <th style={{ padding: '0.4rem', textAlign: 'left' }}>Customer & Contact</th>
                    <th style={{ padding: '0.4rem', textAlign: 'left' }}>Slot</th>
                    <th style={{ padding: '0.4rem', textAlign: 'left' }}>Location Address</th>
                    <th style={{ padding: '0.4rem', textAlign: 'left' }}>Driver</th>
                    <th style={{ padding: '0.4rem', textAlign: 'left' }}>Sign</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .filter(b => printDriverSelect === 'all' || b.driver_name?.toLowerCase() === printDriverSelect.toLowerCase())
                    .map((b, idx) => {
                      const loc = parseLocationDetails(b.pickup_address || b.customer_address)
                      return (
                        <tr key={b.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.45rem' }}>{idx + 1}</td>
                          <td style={{ padding: '0.45rem', fontWeight: 800 }}>{b.reg_number}<br /><span style={{ fontWeight: 400, color: '#64748b' }}>{b.model}</span></td>
                          <td style={{ padding: '0.45rem' }}>{b.customer_name}<br />{b.customer_phone}</td>
                          <td style={{ padding: '0.45rem' }}>{b.booking_time || 'General'}</td>
                          <td style={{ padding: '0.45rem' }}>{loc.cleanAddress}</td>
                          <td style={{ padding: '0.45rem', fontWeight: 700 }}>{b.driver_name || '—'}</td>
                          <td style={{ padding: '0.45rem', borderBottom: '1px dotted #94a3b8' }}></td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.2rem' }}>
              <button
                onClick={() => setPrintModalOpen(false)}
                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: '0.45rem 1rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 1.2rem', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}
              >
                🖨️ Send to Printer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
