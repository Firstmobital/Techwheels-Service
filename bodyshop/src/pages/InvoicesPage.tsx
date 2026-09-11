import { type CustomerVehicle } from '../lib/api'

interface InvoicesPageProps {
  vehicle: CustomerVehicle
}

export default function InvoicesPage({ vehicle }: InvoicesPageProps) {
  const billedAmount = vehicle.billed_amount ?? 0
  const amountReceived = vehicle.amount_received ?? 0
  const remaining = Math.max(0, billedAmount - amountReceived)
  const isPaid = billedAmount > 0 && remaining === 0

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Invoices & Payments</h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Billed amounts, receipts & gatepass for <strong className="mono">{vehicle.reg_number}</strong>
        </p>
      </div>

      {/* Payment Summary Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Settlement Summary</div>
            <div className="card-subtitle">Job Card #{vehicle.jc_number || '—'}</div>
          </div>
          <span className={`badge ${isPaid ? 'badge--green' : billedAmount > 0 ? 'badge--amber' : 'badge--blue'}`}>
            {isPaid ? '✅ Paid' : billedAmount > 0 ? '⏳ Payment Due' : 'Estimating'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', margin: '14px 0', background: 'var(--surface-sub)', padding: '12px 8px', borderRadius: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Total Billed</div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>
              {billedAmount > 0 ? `₹${billedAmount.toLocaleString()}` : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Received</div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: 'var(--success)', marginTop: 2 }}>
              {amountReceived > 0 ? `₹${amountReceived.toLocaleString()}` : '₹0'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Remaining</div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: remaining > 0 ? 'var(--danger)' : 'var(--text)', marginTop: 2 }}>
              {remaining > 0 ? `₹${remaining.toLocaleString()}` : '₹0'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          ) : vehicle.estimate_drive_url ? (
            <a
              href={vehicle.estimate_drive_url}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
              style={{ textDecoration: 'none' }}
            >
              📄 View Service Estimate
            </a>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)', padding: '8px 0' }}>
              Invoice document will be ready upon final billing and gatepass creation.
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
