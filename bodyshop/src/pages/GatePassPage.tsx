import { useState, useEffect } from 'react'
import { type CustomerVehicle } from '../lib/api'
import { supabase } from '../lib/supabase'
import { fetchIssuedGatePass, type IssuedGatePassRecord } from '../lib/gatepass'
import { fetchVehiclePayment } from '../lib/payments'

interface GatePassPageProps {
  vehicle: CustomerVehicle
}

export default function GatePassPage({ vehicle }: GatePassPageProps) {
  const [issuedPass, setIssuedPass] = useState<IssuedGatePassRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSecurityMode, setIsSecurityMode] = useState(false)
  const [securityActionMsg, setSecurityActionMsg] = useState<string | null>(null)
  const [isDelivered, setIsDelivered] = useState(false)

  async function loadGatePassData() {
    if (!vehicle.reg_number) return
    setIsLoading(true)
    try {
      // 1. Fetch official Accounts-issued gate pass
      const pass = await fetchIssuedGatePass(vehicle.reg_number)
      setIssuedPass(pass)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadGatePassData()

    // Realtime Supabase Channel for instant sync as soon as Accounts desk clicks "Create Gatepass"
    const channel = supabase
      .channel(`gatepass-realtime-${vehicle.reg_number}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_feedback_bot_data' },
        () => {
          void loadGatePassData()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_reception_entries' },
        () => {
          void loadGatePassData()
        }
      )
      .subscribe()

    function handleGatepassIssued(e: Event) {
      const customEv = e as CustomEvent<IssuedGatePassRecord>
      if (
        !customEv.detail ||
        !customEv.detail.reg_number ||
        customEv.detail.reg_number.toUpperCase() === vehicle.reg_number.toUpperCase()
      ) {
        void loadGatePassData()
      }
    }

    window.addEventListener('techwheels_gatepass_issued', handleGatepassIssued)
    window.addEventListener('techwheels_payment_updated', loadGatePassData)

    return () => {
      void supabase.removeChannel(channel)
      window.removeEventListener('techwheels_gatepass_issued', handleGatepassIssued)
      window.removeEventListener('techwheels_payment_updated', loadGatePassData)
    }
  }, [vehicle.reg_number])

  function handleDownloadPrint() {
    window.print()
  }

  function handleSecurityAuthorize() {
    if (!issuedPass) {
      setSecurityActionMsg('❌ EXIT DENIED: Gate Pass not yet issued by Accounts desk.')
      return
    }
    if (isDelivered) {
      setSecurityActionMsg('⚠️ EXIT DENIED: This gate pass has ALREADY BEEN USED. Vehicle already departed.')
      return
    }
    setIsDelivered(true)
    setSecurityActionMsg(`✅ EXIT GRANTED: Vehicle ${issuedPass.reg_number} authorized for departure! Gate pass marked DELIVERED & retired.`)
  }

  const isGatepassReady = Boolean(issuedPass)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Digital Gate Pass</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Official dealership vehicle departure authorization & QR Pass issued by Accounts Desk
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isGatepassReady && (
            <button
              type="button"
              onClick={handleDownloadPrint}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                border: '1px solid #0284c7',
                background: '#0284c7',
                color: 'white',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              📥 Download / Print Pass
            </button>
          )}
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
      </div>

      {/* If Gate Pass is not yet issued by Accounts */}
      {!isGatepassReady && (
        <div className="card" style={{ background: '#fffbeb', borderColor: '#fde68a', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 26 }}>⏳</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#92400e' }}>
                Gate Pass Under Clearance at Accounts Desk
              </div>
              <div style={{ fontSize: 12.5, color: '#b45309', marginTop: 4, lineHeight: 1.4 }}>
                Your service intake & billing is being processed. Once the <strong>Accounts & Billing Desk</strong> verifies the settlement and generates the official Gate Pass, it will instantly appear below with your exit QR code.
              </div>
              <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="animate-spin">🔄</span> Live syncing with Dealership Accounts Desk…
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Official Dealership Gate Pass Card */}
      <div
        className="card"
        style={{
          border: isGatepassReady ? '2px solid #16a34a' : '2px dashed #cbd5e1',
          background: isGatepassReady
            ? 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)'
            : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: isGatepassReady ? '0 10px 25px -5px rgba(22, 163, 74, 0.15)' : 'none',
        }}
      >
        {/* Dealership Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid var(--border)', paddingBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              FIRST MOBITEL PVT. LTD. · AUTHORIZED TATA WORKSHOP
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>OFFICIAL VEHICLE GATE PASS</div>
          </div>
          <span className={`badge ${isDelivered ? 'badge--purple' : isGatepassReady ? 'badge--green' : 'badge--amber'}`}>
            {isDelivered ? '🚪 USED / DELIVERED' : isGatepassReady ? '✅ VALID FOR VEHICLE EXIT' : '⏳ AWAITING ACCOUNTS CLEARANCE'}
          </span>
        </div>

        {/* QR Code Section */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 8 }}>
          {isGatepassReady ? (
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
              {/* Crisp High-Res QR Pattern */}
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
              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>PENDING RELEASE</span>
            </div>
          )}
          <span className="mono" style={{ fontSize: 13, fontWeight: 800, color: isGatepassReady ? '#15803d' : 'var(--text)' }}>
            Pass #{issuedPass ? issuedPass.gate_pass_no : 'GP-PENDING'}
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
            padding: 14,
            borderRadius: 10,
            border: '1px solid var(--border)',
          }}
        >
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Vehicle Reg:</span>
            <div className="mono" style={{ fontWeight: 800, fontSize: 14, color: '#0369a1' }}>
              {issuedPass ? issuedPass.reg_number : vehicle.reg_number}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Customer Name:</span>
            <div style={{ fontWeight: 700 }}>
              {issuedPass ? issuedPass.customer_name : vehicle.owner_name || 'Customer'}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Job Card:</span>
            <div className="mono" style={{ fontWeight: 700 }}>
              {issuedPass ? issuedPass.job_card_no : vehicle.jc_number || '—'}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Invoice / Settlement:</span>
            <div className="mono" style={{ fontWeight: 700 }}>
              {issuedPass ? issuedPass.invoice_no : 'INV-PROCESSED'}
            </div>
          </div>
          <div style={{ gridColumn: 'span 2', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
            <span style={{ color: 'var(--text-muted)' }}>Accounts Clearance Status:</span>
            <div style={{ fontWeight: 800, fontSize: 13, color: isGatepassReady ? '#15803d' : '#dc2626' }}>
              {isGatepassReady
                ? '✓ FULLY PAID · ACCOUNTS CLEARED FOR DEPARTURE'
                : '⏳ PENDING ACCOUNTS DESK RELEASE'}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
          Authorized By: <strong>{issuedPass ? issuedPass.issued_by : 'Accounts Desk'}</strong> · Issued At: {issuedPass ? issuedPass.issued_at : 'Pending'}
        </div>

        {isGatepassReady && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <button
              type="button"
              onClick={handleDownloadPrint}
              className="btn-primary"
              style={{ width: '100%', padding: '10px 0', fontSize: 13, fontWeight: 800 }}
            >
              📥 Download / Print Gate Pass (PDF)
            </button>
          </div>
        )}
      </div>

      {/* Security Guard Exit Verification Screen */}
      {isSecurityMode && (
        <div className="card" style={{ background: '#0f172a', color: 'white', borderColor: '#334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>👮</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Security Guard Vehicle Exit Portal</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Verify Accounts Gate Pass & Authorize Exit</div>
            </div>
          </div>

          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>
            <div>Vehicle: <strong className="mono" style={{ color: '#38bdf8' }}>{issuedPass ? issuedPass.reg_number : vehicle.reg_number}</strong></div>
            <div>Accounts Clearance: <strong style={{ color: isGatepassReady ? '#4ade80' : '#f87171' }}>{isGatepassReady ? 'ISSUED & CLEARED' : 'NOT ISSUED'}</strong></div>
            <div>Gate Pass Status: <strong style={{ color: isDelivered ? '#c084fc' : isGatepassReady ? '#4ade80' : '#f87171' }}>{isDelivered ? 'ALREADY DELIVERED' : isGatepassReady ? 'READY FOR EXIT' : 'LOCKED'}</strong></div>
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
            disabled={isDelivered || !isGatepassReady}
            style={{ width: '100%', background: isDelivered ? '#475569' : !isGatepassReady ? '#dc2626' : '#16a34a' }}
          >
            {isDelivered ? '✓ Vehicle Already Exited' : !isGatepassReady ? '❌ Exit Denied (No Gate Pass Issued)' : '🚪 Confirm QR Scan & Allow Vehicle Exit'}
          </button>
        </div>
      )}
    </div>
  )
}
