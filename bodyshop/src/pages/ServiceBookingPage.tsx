import { useState } from 'react'
import { createServiceBooking, type CustomerVehicle } from '../lib/api'

interface ServiceBookingPageProps {
  vehicle: CustomerVehicle
}

export default function ServiceBookingPage({ vehicle }: ServiceBookingPageProps) {
  const [serviceType, setServiceType] = useState('Periodic Maintenance Service')
  const [preferredDate, setPreferredDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [pickupRequired, setPickupRequired] = useState(false)
  const [address, setAddress] = useState('')
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setToast(null)

    try {
      const res = await createServiceBooking({
        reg_number: vehicle.reg_number,
        customer_name: vehicle.owner_name || 'Customer',
        mobile_number: vehicle.owner_phone || '',
        service_type: serviceType,
        preferred_date: preferredDate,
        pickup_required: pickupRequired,
        address: pickupRequired ? address : undefined,
        remarks: remarks.trim() || undefined,
      })

      setToast({ ok: true, msg: res.message })
      setRemarks('')
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : 'Failed to submit service booking' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Book Service & Estimate</h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Schedule an after-purchase service or request a bodyshop repair estimate
        </p>
      </div>

      {toast && (
        <div className={`toast-banner ${toast.ok ? '' : 'error'}`}>
          <span>{toast.ok ? '✅' : '⚠️'}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Vehicle Registration</label>
            <input className="form-input mono" value={vehicle.reg_number} disabled style={{ background: 'var(--surface-sub)', fontWeight: 700 }} />
          </div>

          <div className="form-group">
            <label className="form-label">Service Type</label>
            <select className="form-select" value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
              <option value="Periodic Maintenance Service">Periodic Maintenance Service (Paid/Free)</option>
              <option value="Running Repairs & Inspection">Running Repairs & Diagnostics</option>
              <option value="Bodyshop / Accidental Repair Claim">Bodyshop / Accidental Repair & Insurance Claim</option>
              <option value="Full Vehicle Spa & Detailing">Full Vehicle Spa, Ceramic & Detailing</option>
              <option value="Wheel Alignment & Balancing">Wheel Alignment, Balancing & Tyres</option>
              <option value="AC Overhaul & Disinfection">AC Service & Gas Recharge</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Preferred Date</label>
            <input
              type="date"
              className="form-input"
              value={preferredDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setPreferredDate(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={pickupRequired}
                onChange={(e) => setPickupRequired(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              Request Doorstep Pickup & Drop
            </label>
          </div>

          {pickupRequired && (
            <div className="form-group">
              <label className="form-label">Pickup Address</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="Enter complete home or office pickup address…"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required={pickupRequired}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Complaints / Special Instructions</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="e.g. Unusual sound in suspension, AC cooling slow, dent on right fender…"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Submitting Booking…' : '📅 Confirm Booking Request'}
          </button>
        </form>
      </div>
    </div>
  )
}
