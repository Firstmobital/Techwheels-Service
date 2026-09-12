import { useState, useEffect } from 'react'
import { getEstimateDetails, type CustomerVehicle, type EstimateDetails } from '../lib/api'
import {
  fetchEstimateForVehicle,
  updateEstimateApproval,
  type CustomerEstimateRecord,
} from '../lib/estimates'

interface EstimatePageProps {
  vehicle: CustomerVehicle
}

export default function EstimatePage({ vehicle }: EstimatePageProps) {
  const [estimate, setEstimate] = useState<EstimateDetails>(() => getEstimateDetails(vehicle))
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    async function loadLiveEstimate() {
      if (!vehicle.reg_number) return
      const live = await fetchEstimateForVehicle(vehicle.reg_number)
      if (live && live.items && live.items.length > 0) {
        setEstimate({
          estimate_no: live.estimate_no,
          items: live.items,
          subtotal: live.subtotal,
          discount: live.discount,
          gst_tax: live.gst_tax,
          grand_total: live.grand_total,
          status: live.status,
          rejection_reason: live.rejection_reason || undefined,
        })
      }
    }

    void loadLiveEstimate()

    function handleEstimateSync(e: Event) {
      const customEv = e as CustomEvent<CustomerEstimateRecord>
      if (customEv.detail && (!customEv.detail.vehicle_registration_number || customEv.detail.vehicle_registration_number === vehicle.reg_number)) {
        void loadLiveEstimate()
      }
    }

    window.addEventListener('techwheels_estimate_updated', handleEstimateSync)
    return () => {
      window.removeEventListener('techwheels_estimate_updated', handleEstimateSync)
    }
  }, [vehicle.reg_number])

  async function handleApprove() {
    setEstimate((prev) => ({ ...prev, status: 'Approved' }))
    await updateEstimateApproval(estimate.estimate_no, 'Approved')
    setToast({
      ok: true,
      msg: `Estimate #${estimate.estimate_no} Approved! Assigned Technician has been notified to commence repairs.`,
    })
  }

  async function handleRejectSubmit() {
    if (!rejectReason.trim()) return
    const reason = rejectReason.trim()
    setEstimate((prev) => ({ ...prev, status: 'Rejected', rejection_reason: reason }))
    await updateEstimateApproval(estimate.estimate_no, 'Rejected', reason)
    setShowRejectModal(false)
    setToast({
      ok: false,
      msg: `Estimate #${estimate.estimate_no} has been rejected. Service Advisor will connect with a revised estimate.`,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Digital Service Estimate</h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Transparent parts & labour quotation with instant approval (SRD v1.0)
        </p>
      </div>

      {toast && (
        <div className={`toast-banner ${toast.ok ? '' : 'error'}`}>
          <span>{toast.ok ? '✅' : 'ℹ️'}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Estimate Header Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Quotation #{estimate.estimate_no}</div>
            <div className="card-subtitle">Job Card #{vehicle.jc_number || 'JC-2026-00125'}</div>
          </div>
          <span
            className={`badge ${
              estimate.status === 'Approved'
                ? 'badge--green'
                : estimate.status === 'Rejected'
                ? 'badge--red'
                : 'badge--blue'
            }`}
          >
            {estimate.status === 'Approved' ? '✅ Approved' : estimate.status === 'Rejected' ? '❌ Rejected' : '⏳ Action Required'}
          </span>
        </div>

        {/* Itemized Table */}
        <div style={{ overflowX: 'auto', margin: '10px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '8px 4px' }}>Item / Description</th>
                <th style={{ padding: '8px 4px', textAlign: 'center' }}>Type</th>
                <th style={{ padding: '8px 4px', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {estimate.items.map((it) => (
                <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 4px' }}>
                    <div style={{ fontWeight: 600 }}>{it.description}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Qty: {it.quantity} × ₹{it.unit_price}
                    </div>
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 6,
                        background: it.type === 'part' ? '#e0f2fe' : '#f3e8ff',
                        color: it.type === 'part' ? '#0369a1' : '#7e22ce',
                      }}
                    >
                      {it.type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700 }} className="mono">
                    ₹{it.total.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Summary Calculation */}
        <div style={{ background: 'var(--surface-sub)', padding: '12px 14px', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
            <span className="mono">₹{estimate.subtotal.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)' }}>
            <span>Special Dealership Discount</span>
            <span className="mono">- ₹{estimate.discount.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>GST / Taxes (18%)</span>
            <span className="mono">₹{estimate.gst_tax.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border)', fontSize: 15, fontWeight: 800 }}>
            <span>Grand Total (Est.)</span>
            <span className="mono" style={{ color: 'var(--primary)' }}>₹{estimate.grand_total.toLocaleString()}</span>
          </div>
        </div>

        {/* Action Buttons */}
        {estimate.status === 'Sent' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowRejectModal(true)}
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            >
              ❌ Reject / Discuss
            </button>
            <button type="button" className="btn-primary" onClick={handleApprove}>
              ✅ Approve Estimate
            </button>
          </div>
        )}

        {estimate.status === 'Approved' && (
          <div style={{ marginTop: 14, padding: 10, background: '#f0fdf4', borderRadius: 8, color: '#166534', fontSize: 12.5, textAlign: 'center', fontWeight: 700 }}>
            ✓ You have approved this estimate. Technician is performing approved repairs.
          </div>
        )}

        {estimate.status === 'Rejected' && (
          <div style={{ marginTop: 14, padding: 10, background: '#fef2f2', borderRadius: 8, color: '#991b1b', fontSize: 12.5 }}>
            <div style={{ fontWeight: 700 }}>Estimate Rejected</div>
            <div>Reason: {estimate.rejection_reason || 'Customer requested revision'}</div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 100,
          }}
        >
          <div className="card" style={{ maxWidth: 400, width: '100%', background: 'white' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Reason for Rejecting Estimate</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
              Help the Service Advisor understand why this estimate is being revised.
            </p>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="e.g. Estimate cost is high, please exclude optional labour or discuss parts discount…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="button" className="btn-secondary" onClick={() => setShowRejectModal(false)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleRejectSubmit}
                disabled={!rejectReason.trim()}
                style={{ flex: 1, background: 'var(--danger)' }}
              >
                Submit Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
