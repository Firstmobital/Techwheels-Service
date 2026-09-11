import { useState } from 'react'
import { submitCustomerFeedback, type CustomerVehicle } from '../lib/api'

interface FeedbackPageProps {
  vehicle: CustomerVehicle
}

const FEEDBACK_TAGS = [
  'Prompt & courteous service',
  'Transparent estimation',
  'Timely car delivery',
  'Excellent paint & dent finish',
  'Neat interior washing',
  'Service advisor explained work clearly',
]

export default function FeedbackPage({ vehicle }: FeedbackPageProps) {
  const [rating, setRating] = useState<number>(5)
  const [feedbackText, setFeedbackText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!feedbackText.trim()) {
      setToast({ ok: false, msg: 'Please share a brief comment about your service experience.' })
      return
    }

    setSubmitting(true)
    setToast(null)

    try {
      await submitCustomerFeedback({
        reg_number: vehicle.reg_number,
        customer_name: vehicle.owner_name || undefined,
        mobile_number: vehicle.owner_phone || undefined,
        rating,
        feedback_text: feedbackText.trim(),
        service_type: vehicle.service_type || undefined,
        service_advisor_name: vehicle.sa_display_name || vehicle.sa_name || undefined,
        branch: vehicle.branch || undefined,
      })

      setToast({ ok: true, msg: 'Thank you! Your feedback has been recorded in post_feedback_bot_data.' })
      setFeedbackText('')
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : 'Failed to submit feedback' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Service Feedback</h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Help us improve your after-purchase service experience
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
          {/* Star Rating */}
          <div style={{ textAlign: 'center', padding: '10px 0 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              How satisfied are you with the service?
            </div>
            <div className="star-rating" style={{ justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="star-btn"
                  onClick={() => setRating(star)}
                  style={{
                    color: star <= rating ? '#f59e0b' : '#cbd5e1',
                    transform: star === rating ? 'scale(1.2)' : undefined,
                  }}
                >
                  ★
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: rating >= 4 ? 'var(--success)' : rating === 3 ? 'var(--accent)' : 'var(--danger)' }}>
              {rating === 5 ? '⭐⭐⭐⭐⭐ Outstanding Experience' : rating === 4 ? '⭐⭐⭐⭐ Very Good' : rating === 3 ? '⭐⭐⭐ Average' : 'Needs Improvement'}
            </div>
          </div>

          {/* Feedback Textarea */}
          <div className="form-group">
            <label className="form-label">
              Your Feedback Remarks <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <textarea
              className="form-textarea"
              rows={4}
              placeholder="Tell us what you liked or any areas where we can improve…"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              required
            />

            <div className="quick-tags">
              {FEEDBACK_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="tag-btn"
                  onClick={() => {
                    setFeedbackText((prev) => (prev.trim() ? `${prev.trim()}, ${tag}` : tag))
                  }}
                >
                  + {tag}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={submitting || !feedbackText.trim()} style={{ marginTop: 14 }}>
            {submitting ? 'Submitting Feedback…' : '⭐ Submit Customer Feedback'}
          </button>
        </form>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-sub)', marginTop: 8 }}>
        Feedback is securely stored and reviewed by workshop management.
      </div>
    </div>
  )
}
