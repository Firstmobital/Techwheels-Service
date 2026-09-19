import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
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
  customer_address: string | null
  service_type: string | null
  complaint_description: string | null
  pickup_required: boolean
  drop_required: boolean
  pickup_address: string | null
  branch: string | null
  status: string
  driver_name: string | null
  created_at: string
}

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

export default function DriverManagementPage() {
  const [bookings, setBookings] = useState<ServiceBooking[]>([])
  const [drivers, setDrivers] = useState<{ id: string; employee_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDriver, setSelectedDriver] = useState<string>('all')
  const [datePreset, setDatePreset] = useState<'today' | 'tomorrow' | 'next7' | 'all' | 'custom'>('today')
  const [customDate, setCustomDate] = useState<string>('')
  const [search, setSearch] = useState<string>('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>('all')

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

  // Load bookings and drivers from Supabase
  const loadData = async () => {
    setLoading(true)
    try {
      // 1. Load Drivers from employee_master
      const driverRes = await supabase
        .from('employee_master')
        .select('id, employee_name, role')
        .eq('is_active', true)
        .order('employee_name')
      
      if (driverRes.data) {
        setDrivers(
          (driverRes.data as { id: string; employee_name: string; role: string | null }[])
            .filter(u => u.employee_name && (hasBusinessRole(u.role, 'DRIVER') || (u.role && u.role.toUpperCase().includes('DRIVER'))))
        )
      }

      // 2. Load Bookings with pickup or drop
      const { data: bData, error: bErr } = await supabase
        .from('service_bookings')
        .select('*')
        .order('appointment_date', { ascending: true })

      if (bErr) throw bErr
      if (bData) {
        setBookings(bData as ServiceBooking[])
        const bSet = Array.from(new Set(bData.map((b: any) => b.branch).filter(Boolean))) as string[]
        setBranches(bSet)
      }
    } catch (err) {
      console.warn('Error loading driver management data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  // Filter bookings that require pickup OR drop OR have a driver assigned
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

  // Filter by branch
  const branchFiltered = useMemo(() => {
    if (selectedBranch === 'all') return dateFilteredBookings
    return dateFilteredBookings.filter(b => b.branch === selectedBranch)
  }, [dateFilteredBookings, selectedBranch])

  // Final filtered list based on driver selection & search
  const filtered = useMemo(() => {
    return branchFiltered.filter(b => {
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
  }, [branchFiltered, selectedDriver, search])

  // Driver workload breakdown
  const driverWorkloads = useMemo(() => {
    return drivers.map(d => {
      const assigned = branchFiltered.filter(b => b.driver_name === d.employee_name)
      return {
        id: d.id,
        name: d.employee_name,
        count: assigned.length,
        bookings: assigned,
      }
    })
  }, [drivers, branchFiltered])

  const unassignedCount = branchFiltered.filter(b => !b.driver_name).length
  const assignedCount = branchFiltered.length - unassignedCount

  async function handleAssignDriver(booking: ServiceBooking, driverName: string | null) {
    setSavingId(booking.id)
    try {
      const payload = { driver_name: driverName || null }
      const { error } = await supabase
        .from('service_bookings')
        .update(payload)
        .eq('id', booking.id)

      if (error) throw error

      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, driver_name: driverName || null } : b))
    } catch (err: any) {
      alert('Failed to update driver: ' + (err?.message || 'Unknown error'))
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#f8fafc', fontFamily: 'inherit' }}>

      {/* ── Header ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.8rem 1.25rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
              🚗
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
                Driver Management & Dispatch
              </h1>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', marginTop: '1px' }}>
                Real-time vehicle pickup allocations, driver workload tracking & doorstep task dispatch
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link
              to="/service-booking"
              style={{
                background: '#f8fafc',
                color: '#334155',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '0.45rem 0.9rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              📋 All Service Bookings
            </Link>
            <button
              onClick={() => void loadData()}
              style={{
                background: '#0284c7',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.45rem 0.9rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ↻ Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI Summary Cards Strip ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.6rem 1.25rem', display: 'flex', gap: '0.65rem', flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.4rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.2rem' }}>📦</span>
          <div>
            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Target Pickups</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>{branchFiltered.length}</div>
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '0.4rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.2rem' }}>✅</span>
          <div>
            <div style={{ fontSize: '0.65rem', color: '#16a34a', fontWeight: 700, textTransform: 'uppercase' }}>Driver Allocated</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#15803d' }}>{assignedCount}</div>
          </div>
        </div>

        <div style={{ background: unassignedCount > 0 ? '#fef2f2' : '#f8fafc', border: `1px solid ${unassignedCount > 0 ? '#fecaca' : '#e2e8f0'}`, borderRadius: '10px', padding: '0.4rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.2rem' }}>⚠️</span>
          <div>
            <div style={{ fontSize: '0.65rem', color: unassignedCount > 0 ? '#dc2626' : '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Needs Driver</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: unassignedCount > 0 ? '#b91c1c' : '#0f172a' }}>{unassignedCount}</div>
          </div>
        </div>

        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '0.4rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.2rem' }}>👥</span>
          <div>
            <div style={{ fontSize: '0.65rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' }}>Active Drivers</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0284c7' }}>{drivers.length}</div>
          </div>
        </div>
      </div>

      {/* ── Date Preset Filter Strip ── */}
      <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '0.65rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>
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

      {/* ── Driver Workload Breakdown Cards Strip ── */}
      <div style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', padding: '0.75rem 1.25rem', overflowX: 'auto', flexShrink: 0 }}>
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
              {branchFiltered.length} <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Cars</span>
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

      {/* ── Search & Filter Toolbar ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.65rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flexShrink: 0 }}>
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

        {branches.length > 0 && (
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.4rem 0.65rem', fontSize: '0.8rem', background: '#fff', outline: 'none' }}
          >
            <option value="all">All Branches</option>
            {branches.map(b => <option key={b} value={b}>📍 {b}</option>)}
          </select>
        )}

        <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>
          Showing <strong style={{ color: '#0f172a' }}>{filtered.length}</strong> vehicle pickups
          {selectedDriver !== 'all' && (
            <span style={{ marginLeft: '0.35rem', color: '#0284c7' }}>
              (Filter: {selectedDriver === 'unassigned' ? '⚠️ Unassigned' : `🚗 ${selectedDriver}`})
            </span>
          )}
        </div>
      </div>

      {/* ── Bookings Grid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 1.25rem', background: '#f8fafc' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94a3b8' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>Loading driver dispatch data…</div>
          </div>
        ) : filtered.length === 0 ? (
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
              const sm = STATUS_META[b.status] || { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' }

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '12px', background: sm.bg, color: sm.color }}>
                        {b.status}
                      </span>
                    </div>
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
                      📅 {b.appointment_date || 'TBD'} {b.booking_time ? `(${b.booking_time})` : ''}
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
                      onChange={e => void handleAssignDriver(b, e.target.value)}
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
                    {isSavingThis && <span style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: 700 }}>Saving…</span>}
                  </div>

                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
