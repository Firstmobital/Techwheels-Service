import { useState, useEffect } from 'react'
import { type CustomerVehicle } from '../lib/api'
import { supabase } from '../lib/supabase'
import { fetchEstimatesForVehicle, type CustomerEstimateRecord } from '../lib/estimates'
import { fetchVehiclePayment, type VehiclePaymentRecord } from '../lib/payments'

interface InvoicesPageProps {
  vehicle: CustomerVehicle
}

export default function InvoicesPage({ vehicle }: InvoicesPageProps) {
  const [estimates, setEstimates] = useState<CustomerEstimateRecord[]>([])
  const [payment, setPayment] = useState<VehiclePaymentRecord | null>(null)
  const [loading, setLoading] = useState(false)

  async function loadInvoiceData() {
    if (!vehicle.reg_number) return
    setLoading(true)
    try {
      // 1. Fetch live estimates for vehicle
      const estList = await fetchEstimatesForVehicle(vehicle.reg_number)
      setEstimates(estList)

      // 2. Fetch live payment settlement record
      const payRecord = await fetchVehiclePayment(vehicle.reg_number)
      setPayment(payRecord)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInvoiceData()

    // Realtime Supabase Channel for instant sync when advisor updates payment or estimate
    const channel = supabase
      .channel(`invoices-sync-${vehicle.reg_number}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_feedback_bot_data' },
        () => {
          void loadInvoiceData()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customer_estimates' },
        () => {
          void loadInvoiceData()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_reception_entries' },
        () => {
          void loadInvoiceData()
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
        void loadInvoiceData()
      }
    }

    function handleEstimateSync() {
      void loadInvoiceData()
    }

    window.addEventListener('techwheels_payment_updated', handlePaymentSync)
    window.addEventListener('techwheels_estimate_updated', handleEstimateSync)

    return () => {
      void supabase.removeChannel(channel)
      window.removeEventListener('techwheels_payment_updated', handlePaymentSync)
      window.removeEventListener('techwheels_estimate_updated', handleEstimateSync)
    }
  }, [vehicle.reg_number])

  // Total estimate amount calculated from generated estimates or payment record
  const estimateTotal = estimates.reduce((sum, e) => sum + (e.grand_total || 0), 0)
  const billedAmount =
    (payment && payment.total_billed > 0 ? payment.total_billed : 0) ||
    (estimateTotal > 0 ? estimateTotal : 0) ||
    (vehicle.billed_amount ?? 0)

  const amountReceived = payment ? payment.amount_received : (vehicle.amount_received ?? 0)
  const remaining = Math.max(0, billedAmount - amountReceived)
  const isPaid = billedAmount > 0 && remaining === 0
  const isPartial = amountReceived > 0 && remaining > 0

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Invoices & Payments</h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Billed amounts, receipts & gatepass settlement for <strong className="mono">{vehicle.reg_number}</strong>
        </p>
      </div>

      {/* Payment Summary Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Settlement Summary</div>
            <div className="card-subtitle">
              Job Card #{vehicle.jc_number || '—'} {estimates.length > 0 && `· ${estimates.length} Quotation(s)`}
            </div>
          </div>
          <span className={`badge ${isPaid ? 'badge--green' : isPartial ? 'badge--amber' : billedAmount > 0 ? 'badge--blue' : 'badge--blue'}`}>
            {isPaid ? '✅ Fully Paid' : isPartial ? `⚡ Partially Paid (₹${amountReceived})` : billedAmount > 0 ? '⏳ Payment Due' : 'Estimating'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', margin: '14px 0', background: 'var(--surface-sub)', padding: '14px 8px', borderRadius: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Total Billed</div>
            <div className="mono" style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>
              {billedAmount > 0 ? `₹${billedAmount.toLocaleString()}` : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Received</div>
            <div className="mono" style={{ fontSize: 16, fontWeight: 800, color: 'var(--success)', marginTop: 2 }}>
              {amountReceived > 0 ? `₹${amountReceived.toLocaleString()}` : '₹0'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Remaining Due</div>
            <div className="mono" style={{ fontSize: 16, fontWeight: 800, color: remaining > 0 ? 'var(--danger)' : 'var(--text)', marginTop: 2 }}>
              {remaining > 0 ? `₹${remaining.toLocaleString()}` : '₹0'}
            </div>
          </div>
        </div>

        {/* Live Estimate Line Items Breakdown if available */}
        {estimates.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              📋 Estimate Breakdown ({estimates.length} Quotation{estimates.length > 1 ? 's' : ''}):
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {estimates.map((est, idx) => (
                <div
                  key={est.estimate_no || idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#f8fafc',
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                >
                  <div>
                    <span className="mono" style={{ fontWeight: 700, color: '#0369a1' }}>
                      #{est.estimate_no}
                    </span>
                    <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontSize: 11 }}>
                      ({est.items?.length || 0} items · {est.status})
                    </span>
                  </div>
                  <div className="mono" style={{ fontWeight: 800 }}>
                    ₹{est.grand_total.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action / Document download */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {vehicle.invoice_drive_url ? (
            <a
              href={vehicle.invoice_drive_url}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
              style={{ textDecoration: 'none' }}
            >
              📥 Download Tax Invoice
            </a>
          ) : isPaid ? (
            <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--success)', fontWeight: 700, padding: '6px 0', background: '#ecfdf5', borderRadius: 8 }}>
              ✓ Full payment settled. Your Digital Gate Pass is unlocked and ready!
            </div>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)', padding: '6px 0' }}>
              Complete the balance payment of <strong>₹{remaining.toLocaleString()}</strong> at workshop billing desk to release Gate Pass.
            </div>
          )}
        </div>
      </div>

      {/* Secure Online Payment Note */}
      <div className="card" style={{ background: '#f8fafc', borderColor: '#cbd5e1' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🔒</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Workshop Payments Accepted</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              UPI (GPay / PhonePe / Paytm), Credit / Debit Cards, Net Banking & Cash at workshop billing desk.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
