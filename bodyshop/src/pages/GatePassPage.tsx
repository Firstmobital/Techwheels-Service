import { useState, useEffect } from 'react'
import { getGatePassInfo, type CustomerVehicle, type GatePassInfo } from '../lib/api'
import { supabase } from '../lib/supabase'
import { fetchVehiclePayment, type VehiclePaymentRecord } from '../lib/payments'
import { fetchEstimatesForVehicle } from '../lib/estimates'

interface GatePassPageProps {
  vehicle: CustomerVehicle
}

export default function GatePassPage({ vehicle }: GatePassPageProps) {
  const [gatePass, setGatePass] = useState<GatePassInfo>(() => getGatePassInfo(vehicle))
  const [payment, setPayment] = useState<VehiclePaymentRecord | null>(null)
  const [isSecurityMode, setIsSecurityMode] = useState(false)
  const [securityActionMsg, setSecurityActionMsg] = useState<string | null>(null)

  async function syncGatePassData() {
    if (!vehicle.reg_number) return
    const pay = await fetchVehiclePayment(vehicle.reg_number)
    const estimates = await fetchEstimatesForVehicle(vehicle.reg_number)
    const estTotal = estimates.reduce((sum, e) => sum + (e.grand_total || 0), 0)

    setPayment(pay)

    const effectiveBilled = (pay && pay.total_billed > 0 ? pay.total_billed : 0) || estTotal || (vehicle.billed_amount ?? 0)
    const effectiveReceived = pay ? pay.amount_received : (vehicle.amount_received ?? 0)
    const remaining = Math.max(0, effectiveBilled - effectiveReceived)
    const isPaymentSettled = (effectiveBilled > 0 && remaining === 0) || pay?.status === 'Fully Paid'

    setGatePass((prev) => ({
      ...prev,
      payment_status: isPaymentSettled ? 'Paid' : 'Pending',
      is_valid: isPaymentSettled && prev.qc_status === 'Pass',
    }))
  }

  useEffect(() => {
    void syncGatePassData()

    const channel = supabase
      .channel(`gatepass-sync-${vehicle.reg_number}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_feedback_bot_data' },
        () => {
          void syncGatePassData()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customer_estimates' },
        () => {
          void syncGatePassData()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_reception_entries' },
        () => {
          void syncGatePassData()
        }
      )
      .subscribe()

    function handlePaymentSync(e: Event) {
      const customEv = e as CustomEvent<VehiclePaymentRecord>
      if (
        !customEv.detail ||
        !customEv.detail.reg_number ||
        customEv.detail.reg_number.toUpperCase() === vehicle.reg_number.toUpperCase()
      ) {
        void syncGatePassData()
      }
    }

    window.addEventListener('techwheels_payment_updated', handlePaymentSync)
    window.addEventListener('techwheels_estimate_updated', syncGatePassData)

    return () => {
      void supabase.removeChannel(channel)
      window.removeEventListener('techwheels_payment_updated', handlePaymentSync)
      window.removeEventListener('techwheels_estimate_updated', syncGatePassData)
    }
  }, [vehicle.reg_number])

  function handleSecurityAuthorize() {
    if (!gatePass.is_valid) {
      setSecurityActionMsg('❌ EXIT DENIED: Gate Pass is invalid. Outstanding bill must be fully paid and QC passed before exit.')
      return
    }
    if (gatePass.is_used) {
      setSecurityActionMsg('⚠️ EXIT DENIED: This gate pass has ALREADY BEEN USED. Vehicle already delivered.')
      return
    }
    setGatePass((prev) => ({ ...prev, is_used: true }))
    setSecurityActionMsg(`✅ EXIT GRANTED: Vehicle ${gatePass.reg_number} authorized for departure! Gate pass marked DELIVERED & retired.`)
  }

  const effectiveRemaining = payment ? payment.remaining_amount : (vehicle.billed_amount ?? 0) - (vehicle.amount_received ?? 0)
  const isPendingPayment = gatePass.payment_status !== 'Paid'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Digital Gate Pass</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Official dealership vehicle exit authorization & QR Pass (SRD Section 13 & 14)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsSecurityMode(!isSecurityMode)}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            border: '1px solid var(--border)',
            background: isSecurityMode ? 'var(--primary)' : 'var(--surface)',
            color: isSecurityMode ? 'white' : 'var(--text)',
            cursor: 'pointer',
          }}
        >
          {isSecurityMode ? '🛡️ Exit Security Mode' : '👮 Switch to Security Mode'}
        </button>
      </div>

      {/* If Gate Pass is locked due to pending payment */}
      {!gatePass.is_valid && (
        <div className="card" style={{ background: '#fffbeb', borderColor: '#fde68a', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 24 }}>🔒</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#92400e' }}>
                Gate Pass Locked {isPendingPayment ? '(Payment Settlement Pending)' : '(Inspection Pending)'}
              </div>
              <div style={{ fontSize: 12.5, color: '#b45309', marginTop: 3, lineHeight: 1.4 }}>
                {isPendingPayment ? (
                  <>
                    Outstanding balance of <strong>₹{effectiveRemaining > 0 ? effectiveRemaining.toLocaleString() : '0'}</strong> must be fully cleared at the billing counter. Once the workshop employee marks full payment received, your Digital Gate Pass will unlock instantly.
                  </>
                ) : (
                  <>
                    Vehicle inspection / washing is currently finishing up. Gate Pass will become active shortly.
                  </>
                )}
                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  <li>
                    Payment Status:{' '}
                    <strong style={{ color: gatePass.payment_status === 'Paid' ? '#16a34a' : '#dc2626' }}>
                      {gatePass.payment_status === 'Paid' ? '✓ Fully Paid' : '⏳ Pending / Unsettled'}
                    </strong>
                  </li>
                  <li>
                    Quality Check:{' '}
                    <strong style={{ color: gatePass.qc_status === 'Pass' ? '#16a34a' : '#d97706' }}>
                      {gatePass.qc_status === 'Pass' ? '✓ QC Passed' : '⏳ In Progress'}
                    </strong>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Official Dealership Gate Pass Card */}
      <div
        className="card"
        style={{
          border: '2px dashed var(--primary)',
          background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Dealership Watermark Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid var(--border)', paddingBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              FIRST MOBITEL PVT. LTD. · DEALERSHIP
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>OFFICIAL VEHICLE GATE PASS</div>
          </div>
          <span className={`badge ${gatePass.is_used ? 'badge--purple' : gatePass.is_valid ? 'badge--green' : 'badge--amber'}`}>
            {gatePass.is_used ? '🚪 USED / DELIVERED' : gatePass.is_valid ? '✅ VALID FOR EXIT' : '⏳ LOCKED (PAYMENT DUE)'}
          </span>
        </div>

        {/* QR Code Section */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 8 }}>
          {gatePass.is_valid ? (
            <div
              style={{
                width: 140,
                height: 140,
                background: '#ffffff',
                border: '2px solid #0f172a',
                borderRadius: 12,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                position: 'relative',
              }}
            >
              {/* Simulated crisp QR Pattern */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, padding: 12 }}>
                {[...Array(25)].map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 16,
                      height: 16,
                      background: (i % 2 === 0 || i % 7 === 0 || i < 5 || i > 19) ? '#0f172a' : '#f1f5f9',
                      borderRadius: 2,
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                width: 140,
                height: 140,
                background: '#f1f5f9',
                borderRadius: 12,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                gap: 4,
              }}
            >
              <span style={{ fontSize: 32 }}>🔒</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>LOCKED</span>
            </div>
          )}
          <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
            Pass #{gatePass.gate_pass_no}
          </span>
        </div>

        {/* Gate Pass Data Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            fontSize: 12.5,
            background: 'white',
            padding: 12,
            borderRadius: 10,
            border: '1px solid var(--border)',
          }}
        >
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Vehicle Reg:</span>
            <div className="mono" style={{ fontWeight: 800, fontSize: 14 }}>{gatePass.reg_number}</div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Customer Name:</span>
            <div style={{ fontWeight: 700 }}>{gatePass.customer_name}</div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Job Card:</span>
            <div className="mono" style={{ fontWeight: 700 }}>{gatePass.job_card_no}</div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Invoice / Settlement:</span>
            <div className="mono" style={{ fontWeight: 700 }}>{gatePass.invoice_no}</div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Payment Status:</span>
            <div style={{ fontWeight: 800, color: gatePass.payment_status === 'Paid' ? 'var(--success)' : 'var(--danger)' }}>
              {gatePass.payment_status === 'Paid' ? '✓ FULLY PAID' : '⏳ PENDING'}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>QC & Wash Check:</span>
            <div style={{ fontWeight: 700, color: 'var(--success)' }}>
              ✓ QC {gatePass.qc_status} · Wash {gatePass.washing_status}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
          Authorized By: <strong>{gatePass.authorized_by}</strong> · Issued At: {gatePass.issued_at}
        </div>
      </div>

      {/* Security Guard Exit Verification Screen (SRD Section 14) */}
      {isSecurityMode && (
        <div className="card" style={{ background: '#0f172a', color: 'white', borderColor: '#334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>👮</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Security Guard Vehicle Exit Portal</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Verify QR / Pass Number & Authorize Departure</div>
            </div>
          </div>

          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>
            <div>Vehicle: <strong className="mono" style={{ color: '#38bdf8' }}>{gatePass.reg_number}</strong></div>
            <div>Payment: <strong style={{ color: gatePass.payment_status === 'Paid' ? '#4ade80' : '#f87171' }}>{gatePass.payment_status}</strong></div>
            <div>QC Clearance: <strong style={{ color: '#4ade80' }}>{gatePass.qc_status}</strong></div>
            <div>Gate Pass Status: <strong style={{ color: gatePass.is_used ? '#c084fc' : gatePass.is_valid ? '#4ade80' : '#f87171' }}>{gatePass.is_used ? 'ALREADY DELIVERED' : gatePass.is_valid ? 'READY FOR EXIT' : 'EXIT LOCKED (UNPAID)'}</strong></div>
          </div>

          {securityActionMsg && (
            <div style={{ padding: 10, borderRadius: 8, background: '#334155', fontSize: 12, marginBottom: 12, lineHeight: 1.4 }}>
              {securityActionMsg}
            </div>
          )}

          <button
            type="button"
            className="btn-primary"
            onClick={handleSecurityAuthorize}
            disabled={gatePass.is_used || !gatePass.is_valid}
            style={{ width: '100%', background: gatePass.is_used ? '#475569' : !gatePass.is_valid ? '#dc2626' : '#16a34a' }}
          >
            {gatePass.is_used ? '✓ Vehicle Already Exited' : !gatePass.is_valid ? '❌ Exit Denied (Payment Pending)' : '🚪 Confirm QR Scan & Allow Vehicle Exit'}
          </button>
        </div>
      )}
    </div>
  )
}
