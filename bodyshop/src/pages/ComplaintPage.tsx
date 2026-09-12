import { useState } from 'react'
import { submitCustomerComplaint, type CustomerVehicle } from '../lib/api'

interface ComplaintPageProps {
  vehicle: CustomerVehicle
  onSuccess?: () => void
}

export default function ComplaintPage({ vehicle, onSuccess }: ComplaintPageProps) {
  const [kmReading, setKmReading] = useState<number | ''>(
    vehicle.km_reading != null && vehicle.km_reading > 0 ? vehicle.km_reading : ''
  )
  const [problems, setProblems] = useState<string[]>([''])
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  function handleAddProblem() {
    setProblems((prev) => [...prev, ''])
  }

  function handleProblemChange(index: number, value: string) {
    setProblems((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  function handleRemoveProblem(index: number) {
    if (problems.length <= 1) return
    setProblems((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const validProblems = problems.map((p) => p.trim()).filter(Boolean)

    if (validProblems.length === 0) {
      setToast({ ok: false, msg: 'Please describe at least one problem with your vehicle.' })
      return
    }

    setSubmitting(true)
    setToast(null)

    try {
      await submitCustomerComplaint({
        reg_number: vehicle.reg_number,
        customer_name: vehicle.owner_name || undefined,
        mobile_number: vehicle.owner_phone || undefined,
        current_km: typeof kmReading === 'number' && kmReading > 0 ? kmReading : undefined,
        category: 'Customer Problems',
        description: validProblems[0],
        problems: validProblems,
        comments: comments.trim() || undefined,
      })

      setToast({
        ok: true,
        msg: `✅ ${validProblems.length} Problem(s) registered successfully! Your Service Advisor (${
          vehicle.sa_display_name || vehicle.sa_name || 'Advisor'
        }) has been notified.`,
      })

      setProblems([''])
      setComments('')

      if (onSuccess) {
        setTimeout(onSuccess, 1800)
      }
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : 'Failed to submit problem.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Tell Us Your Problem</h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Enter current odometer and add all vehicle problems to share directly with your Service Advisor.
        </p>
      </div>

      {toast && (
        <div className={`toast-banner ${toast.ok ? '' : 'error'}`}>
          <span>{toast.ok ? '✅' : '⚠️'}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22 }}>
        {/* Current Odometer KM Reading */}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Current Odometer (KM Reading)</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>From dashboard odometer</span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              className="form-input mono"
              style={{ fontSize: 15, fontWeight: 700, paddingLeft: 36 }}
              value={kmReading}
              onChange={(e) => setKmReading(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. 32825"
            />
            <span
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 15,
                color: '#64748b',
                pointerEvents: 'none',
              }}
            >
              ⚡
            </span>
          </div>
        </div>

        {/* Dynamic Multiple Problems Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="form-label" style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>
              Vehicle Problems & Complaints <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <span style={{ fontSize: 11.5, color: '#2563eb', fontWeight: 600 }}>
              {problems.length} Problem{problems.length > 1 ? 's' : ''} Listed
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {problems.map((prob, idx) => (
              <div
                key={idx}
                style={{
                  borderRadius: 10,
                  border: '1.5px solid #e2e8f0',
                  background: '#f8fafc',
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: '#dbeafe',
                      color: '#1e40af',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                    }}
                  >
                    Problem #{idx + 1}
                  </span>

                  {problems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveProblem(idx)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}
                      title="Remove this problem"
                    >
                      🗑️ Remove
                    </button>
                  )}
                </div>

                <textarea
                  className="form-textarea"
                  rows={2}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    borderRadius: 8,
                  }}
                  placeholder={`Describe Problem #${idx + 1} (e.g. AC cooling is slow, strange noise on rough roads, wheel vibrating...)`}
                  value={prob}
                  onChange={(e) => handleProblemChange(idx, e.target.value)}
                  required={idx === 0}
                />
              </div>
            ))}
          </div>

          {/* + Add Another Problem Button */}
          <button
            type="button"
            onClick={handleAddProblem}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1.5px dashed #3b82f6',
              background: '#eff6ff',
              color: '#1d4ed8',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span>➕</span>
            <span>+ Add Another Problem</span>
          </button>
        </div>

        {/* Special Request / Additional Comments */}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Special Request / Additional Comments (Optional)</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Need vehicle by 5 PM, please check tyre pressure as well"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="btn-primary"
          disabled={submitting || problems.every((p) => !p.trim())}
          style={{
            marginTop: 4,
            padding: '13px',
            fontSize: 14,
            fontWeight: 800,
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
          }}
        >
          {submitting ? 'Submitting to Workshop…' : '🚀 Submit Problems to Workshop'}
        </button>
      </form>
    </div>
  )
}
