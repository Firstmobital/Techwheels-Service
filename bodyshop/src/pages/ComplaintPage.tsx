import { useState } from 'react'
import { submitCustomerComplaint, type CustomerVehicle, type ComplaintPayload } from '../lib/api'

interface ComplaintPageProps {
  vehicle: CustomerVehicle
  onSuccess?: () => void
}

const CATEGORIES: Array<{ key: ComplaintPayload['category']; label: string; icon: string; desc: string }> = [
  { key: 'Engine', label: 'Engine & Performance', icon: '⚙️', desc: 'Starting trouble, pickup drop, abnormal sound' },
  { key: 'AC', label: 'AC & Climate Control', icon: '❄️', desc: 'Low cooling, blower noise, foul smell' },
  { key: 'Brake', label: 'Brakes & Safety', icon: '🛑', desc: 'Spongy pedal, squeaking noise, vibration' },
  { key: 'Electrical', label: 'Electrical & Battery', icon: '⚡', desc: 'Lights, horn, power windows, battery' },
  { key: 'Suspension', label: 'Suspension & Steering', icon: '🚗', desc: 'Bumpy ride, alignment pull, noise' },
  { key: 'Tyre', label: 'Tyres & Wheel', icon: '🛞', desc: 'Pressure loss, puncture, uneven wear' },
  { key: 'Body', label: 'Body & Denting/Painting', icon: '🔨', desc: 'Scratches, bumper damage, door dings' },
  { key: 'Noise', label: 'Rattle & Noise', icon: '🔊', desc: 'Cabin rattles, squeaks, underbody noise' },
  { key: 'Other', label: 'Other Issue', icon: '📝', desc: 'General inspection or other problems' },
]

export default function ComplaintPage({ vehicle, onSuccess }: ComplaintPageProps) {
  const [category, setCategory] = useState<ComplaintPayload['category']>('Engine')
  const [kmReading, setKmReading] = useState<number>(vehicle.km_reading || 15000)
  const [description, setDescription] = useState('')
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) {
      setToast({ ok: false, msg: 'Please enter a description of the problem.' })
      return
    }

    setSubmitting(true)
    setToast(null)

    try {
      await submitCustomerComplaint({
        reg_number: vehicle.reg_number,
        customer_name: vehicle.owner_name || undefined,
        mobile_number: vehicle.owner_phone || undefined,
        current_km: kmReading,
        category,
        description: description.trim(),
        comments: comments.trim() || undefined,
      })

      setToast({
        ok: true,
        msg: `Complaint for [${category}] successfully logged! Routed to Service Advisor (${vehicle.sa_display_name || vehicle.sa_name || 'Assigned Advisor'}).`,
      })
      setDescription('')
      setComments('')
      if (onSuccess) {
        setTimeout(onSuccess, 1800)
      }
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : 'Failed to log complaint' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Tell Us Your Problem</h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Register vehicle complaints & issues directly to your Service Advisor (SRD v1.0)
        </p>
      </div>

      {toast && (
        <div className={`toast-banner ${toast.ok ? '' : 'error'}`}>
          <span>{toast.ok ? '✅' : '⚠️'}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Category Picker Grid */}
        <div>
          <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
            Select Problem Category <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {CATEGORIES.map((cat) => {
              const selected = category === cat.key
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setCategory(cat.key)}
                  style={{
                    padding: '10px 6px',
                    borderRadius: 10,
                    border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                    background: selected ? 'var(--primary-sub)' : 'var(--surface)',
                    color: selected ? 'var(--primary)' : 'var(--text)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: 20 }}>{cat.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: selected ? 800 : 600, marginTop: 4 }}>{cat.label}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Current KM */}
        <div className="form-group">
          <label className="form-label">Current Odometer (KM Reading)</label>
          <input
            type="number"
            className="form-input mono"
            value={kmReading}
            onChange={(e) => setKmReading(Number(e.target.value))}
            placeholder="e.g. 18500"
          />
        </div>

        {/* Detailed Issue Description */}
        <div className="form-group">
          <label className="form-label">
            Detailed Issue Description <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <textarea
            className="form-textarea"
            rows={3}
            placeholder={`Describe what is happening with the ${category} (when did it start, symptoms, sound, etc.)…`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        {/* Additional Comments */}
        <div className="form-group">
          <label className="form-label">Special Request / Additional Comments</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Need vehicle by 5 PM, please check AC gas as well"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary" disabled={submitting || !description.trim()} style={{ marginTop: 6 }}>
          {submitting ? 'Registering Problem…' : '🚀 Submit Problem to Workshop'}
        </button>
      </form>
    </div>
  )
}
