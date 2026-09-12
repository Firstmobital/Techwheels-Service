import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getEstimateDetails, type CustomerVehicle, type EstimateDetails } from '../lib/api'
import {
  fetchEstimatesForVehicle,
  updateEstimateApproval,
  type CustomerEstimateRecord,
} from '../lib/estimates'

interface EstimatePageProps {
  vehicle: CustomerVehicle
}

export default function EstimatePage({ vehicle }: EstimatePageProps) {
  const [allEstimates, setAllEstimates] = useState<CustomerEstimateRecord[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number>(0)
  const [estimate, setEstimate] = useState<EstimateDetails>(() => getEstimateDetails(vehicle))
  const [isLoading, setIsLoading] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  async function loadLiveEstimate() {
    if (!vehicle.reg_number) return
    setIsLoading(true)
    try {
      const list = await fetchEstimatesForVehicle(vehicle.reg_number)
      setAllEstimates(list)

      if (list && list.length > 0) {
        const cur = list[selectedIdx] || list[0]
        setEstimate({
          estimate_no: cur.estimate_no,
          items: cur.items || [],
          subtotal: cur.subtotal || 0,
          discount: cur.discount || 0,
          gst_tax: cur.gst_tax || 0,
          grand_total: cur.grand_total || 0,
          status: cur.status || 'Draft',
          rejection_reason: cur.rejection_reason || undefined,
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadLiveEstimate()

    // Realtime Supabase Channel
    const channel = supabase
      .channel(`estimate-realtime-${vehicle.reg_number}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_feedback_bot_data' },
        () => {
          void loadLiveEstimate()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customer_estimates' },
        () => {
          void loadLiveEstimate()
        }
      )
      .subscribe()

    function handleEstimateSync(e: Event) {
      const customEv = e as CustomEvent<CustomerEstimateRecord>
      if (
        customEv.detail &&
        (!customEv.detail.vehicle_registration_number ||
          customEv.detail.vehicle_registration_number === vehicle.reg_number)
      ) {
        void loadLiveEstimate()
      }
    }

    window.addEventListener('techwheels_estimate_updated', handleEstimateSync)
    return () => {
      void supabase.removeChannel(channel)
      window.removeEventListener('techwheels_estimate_updated', handleEstimateSync)
    }
  }, [vehicle.reg_number, selectedIdx])

  function selectEstimate(idx: number) {
    setSelectedIdx(idx)
    const cur = allEstimates[idx]
    if (cur) {
      setEstimate({
        estimate_no: cur.estimate_no,
        items: cur.items || [],
        subtotal: cur.subtotal || 0,
        discount: cur.discount || 0,
        gst_tax: cur.gst_tax || 0,
        grand_total: cur.grand_total || 0,
        status: cur.status || 'Draft',
        rejection_reason: cur.rejection_reason || undefined,
      })
    }
  }

  async function handleApprove() {
    setEstimate((prev) => ({ ...prev, status: 'Approved' }))
    await updateEstimateApproval(estimate.estimate_no, 'Approved')
    setToast({
      ok: true,
      msg: `Estimate #${estimate.estimate_no} Approved! Assigned Technician has been notified to commence repairs.`,
    })
    void loadLiveEstimate()
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
    void loadLiveEstimate()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Digital Service Estimate</h2>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8' }}>
              🟢 Live Synced
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Transparent parts & labour quotation with instant approval (SRD v1.0)
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadLiveEstimate()}
          disabled={isLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 700,
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            cursor: 'pointer',
          }}
        >
          <span style={{ display: 'inline-block', transform: isLoading ? 'rotate(360deg)' : 'none', transition: 'transform 0.5s' }}>
            🔄
          </span>
          {isLoading ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {/* Multiple Estimates Tab Switcher if more than 1 estimate exists */}
      {allEstimates.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
            Multiple Quotations Available ({allEstimates.length}):
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {allEstimates.map((estItem, idx) => {
              const isSel = idx === selectedIdx
              const isAppr = estItem.status === 'Approved'
              const isRej = estItem.status === 'Rejected'
              return (
                <button
                  key={estItem.estimate_no || idx}
                  type="button"
                  onClick={() => selectEstimate(idx)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    border: isSel ? '2px solid #2563eb' : '1px solid var(--border)',
                    background: isSel ? '#eff6ff' : 'var(--surface)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    color: isSel ? '#1e40af' : 'var(--text)',
                    boxShadow: isSel ? '0 2px 6px rgba(37,99,235,0.15)' : 'none',
                  }}
                >
                  <span>{isAppr ? '✅' : isRej ? '❌' : '⏳'}</span>
                  <span>Quotation #{idx + 1}</span>
                  <span style={{ fontFamily: 'monospace', color: '#047857' }}>₹{estItem.grand_total.toLocaleString()}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

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
                  <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                    ₹{it.total.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Breakdown */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '12px 14px',
            background: 'var(--bg)',
            borderRadius: 10,
            fontSize: 12.5,
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>Parts & Labour Subtotal</span>
            <span style={{ fontFamily: 'monospace' }}>₹{estimate.subtotal.toLocaleString()}</span>
          </div>

          {estimate.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)' }}>
              <span>Special Discount</span>
              <span style={{ fontFamily: 'monospace' }}>- ₹{estimate.discount.toLocaleString()}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>GST (18% Applicable)</span>
            <span style={{ fontFamily: 'monospace' }}>₹{estimate.gst_tax.toLocaleString()}</span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 800,
              fontSize: 15,
              paddingTop: 8,
              borderTop: '1.5px dashed var(--border)',
              color: 'var(--text)',
            }}
          >
            <span>Grand Total (Net Payable)</span>
            <span style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>
              ₹{estimate.grand_total.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Rejection Note if rejected */}
        {estimate.status === 'Rejected' && estimate.rejection_reason && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 8,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              fontSize: 12,
            }}
          >
            <strong>Rejection Reason:</strong> {estimate.rejection_reason}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          {estimate.status === 'Approved' ? (
            <div
              style={{
                width: '100%',
                padding: '12px',
                textAlign: 'center',
                background: '#ecfdf5',
                border: '1.5px solid #a7f3d0',
                borderRadius: 10,
                color: '#065f46',
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              ✅ You Have Approved This Quotation (Repair Authorized)
            </div>
          ) : estimate.status === 'Rejected' ? (
            <div
              style={{
                width: '100%',
                padding: '12px',
                textAlign: 'center',
                background: '#fff1f2',
                border: '1.5px solid #fecdd3',
                borderRadius: 10,
                color: '#9f1239',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              ❌ Quotation Rejected. Service Advisor will contact you with a revised quotation.
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handleApprove()}
                className="btn btn-primary"
                style={{ flex: 1, padding: '12px', fontSize: 14, fontWeight: 800 }}
              >
                ✅ Approve Estimate
              </button>
              <button
                type="button"
                onClick={() => setShowRejectModal(true)}
                className="btn btn-secondary"
                style={{ flex: 1, padding: '12px', fontSize: 14, color: '#dc2626', borderColor: '#fca5a5' }}
              >
                ❌ Reject / Need Revision
              </button>
            </>
          )}
        </div>
      </div>

      {/* Reject Reason Modal */}
      {showRejectModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 100,
          }}
        >
          <div className="card" style={{ maxWidth: 440, width: '100%', padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>
              Reason for Estimate Rejection
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Please let your Service Advisor know why you are rejecting this quotation (e.g. price high, part not needed).
            </p>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Enter reason for rejection…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{ width: '100%', marginBottom: 14, fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="btn btn-secondary"
                style={{ fontSize: 12.5 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRejectSubmit()}
                className="btn"
                style={{ background: '#dc2626', color: '#fff', fontSize: 12.5, fontWeight: 700 }}
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
