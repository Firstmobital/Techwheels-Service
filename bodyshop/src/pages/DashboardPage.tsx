import { type CustomerVehicle } from '../lib/api'
import { type TabType } from '../components/BottomNav'

interface DashboardPageProps {
  vehicle: CustomerVehicle
  onNavigate: (tab: TabType) => void
}

export default function DashboardPage({ vehicle, onNavigate }: DashboardPageProps) {
  const isServiceCompleted = Boolean(vehicle.invoice_done_at || vehicle.payment_status === 'Paid')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Vehicle Hero Card with Specs (SRD Section 2) */}
      <div className="card card--gradient">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.85 }}>
              Registered Vehicle
            </span>
            <div className="mono" style={{ fontSize: 24, fontWeight: 800, marginTop: 2, letterSpacing: '1px' }}>
              {vehicle.reg_number}
            </div>
            <div style={{ fontSize: 13.5, marginTop: 4, opacity: 0.95 }}>
              <strong>{vehicle.model || 'Tata Motors'}</strong> · {vehicle.variant || 'Creative Edition'}
            </div>
          </div>
          <span
            style={{
              padding: '5px 12px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              background: isServiceCompleted ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: 'white',
              backdropFilter: 'blur(4px)',
            }}
          >
            {isServiceCompleted ? '✅ Delivered / Ready' : '⏳ In Service'}
          </span>
        </div>

        {/* Vehicle Metadata Grid (VIN, KM, Warranty, AMC) */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            fontSize: 12,
          }}
        >
          <div>
            <div style={{ opacity: 0.75, fontSize: 11 }}>VIN / Chassis Number</div>
            <div className="mono" style={{ fontWeight: 700 }}>{vehicle.vin || 'MAT1234567890'}</div>
          </div>
          <div>
            <div style={{ opacity: 0.75, fontSize: 11 }}>Current Odometer</div>
            <div className="mono" style={{ fontWeight: 700 }}>{vehicle.km_reading ? `${vehicle.km_reading.toLocaleString()} KM` : '15,000 KM'}</div>
          </div>
          <div>
            <div style={{ opacity: 0.75, fontSize: 11 }}>Warranty Status</div>
            <div style={{ fontWeight: 700 }}>{vehicle.warranty_status || 'Active (3 Yrs)'}</div>
          </div>
          <div>
            <div style={{ opacity: 0.75, fontSize: 11 }}>AMC / Service Pack</div>
            <div style={{ fontWeight: 700 }}>{vehicle.amc_status || 'Gold Care AMC'}</div>
          </div>
        </div>
      </div>

      {/* Primary Actions Grid (SRD Core Workflows) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {/* 1. Tell Us Your Problem */}
        <button
          type="button"
          className="card"
          onClick={() => onNavigate('complaint')}
          style={{
            padding: 14,
            textAlign: 'left',
            cursor: 'pointer',
            background: '#ffffff',
            border: '1px solid #fed7aa',
            borderLeft: '4px solid #f97316',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 4 }}>🚨</div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>Tell Us Your Problem</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Register complaints & issues</div>
        </button>

        {/* 2. Review Estimate */}
        <button
          type="button"
          className="card"
          onClick={() => onNavigate('estimate')}
          style={{
            padding: 14,
            textAlign: 'left',
            cursor: 'pointer',
            background: '#ffffff',
            border: '1px solid #bfdbfe',
            borderLeft: '4px solid #2563eb',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 4 }}>📋</div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>Digital Estimate</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Approve or reject quotation</div>
        </button>

        {/* 3. Bills & Invoices */}
        <button
          type="button"
          className="card"
          onClick={() => onNavigate('invoices')}
          style={{
            padding: 14,
            textAlign: 'left',
            cursor: 'pointer',
            background: '#ffffff',
            border: '1px solid #bbf7d0',
            borderLeft: '4px solid #16a34a',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 4 }}>🧾</div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>Bills & Receipts</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Invoices & payment records</div>
        </button>

        {/* 4. Digital Gate Pass */}
        <button
          type="button"
          className="card"
          onClick={() => onNavigate('gatepass')}
          style={{
            padding: 14,
            textAlign: 'left',
            cursor: 'pointer',
            background: '#ffffff',
            border: '1px solid #e9d5ff',
            borderLeft: '4px solid #9333ea',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 4 }}>🎟️</div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>Digital Gate Pass</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>QR Exit Authorization</div>
        </button>
      </div>

      {/* Active Service Status Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Workshop Record</div>
            <div className="card-subtitle">Current Job Card Details</div>
          </div>
          <span className="badge badge--blue">{vehicle.service_type || 'Customer Service'}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Job Card Number</span>
            <strong className="mono" style={{ color: 'var(--primary)' }}>{vehicle.jc_number || 'JC-2026-00125'}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Service Advisor</span>
            <strong>{vehicle.sa_display_name || vehicle.sa_name || 'AMAN GUPTA'}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Service Branch</span>
            <strong>{vehicle.branch || 'Sitapura Main Workshop'}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Settlement Status</span>
            <strong style={{ color: vehicle.payment_status === 'Paid' ? 'var(--success)' : 'var(--danger)' }}>
              {vehicle.payment_status === 'Paid' ? '✓ Fully Paid' : '⏳ Payment Due'}
            </strong>
          </div>
        </div>
      </div>

      {/* Advisor Direct Call Card */}
      <div className="card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>📞</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#166534' }}>Need Advisor Assistance?</div>
            <div style={{ fontSize: 12, color: '#15803d' }}>
              Service Advisor: <strong>{vehicle.sa_display_name || vehicle.sa_name || 'Workshop Helpline'}</strong>
            </div>
          </div>
          {vehicle.owner_phone && (
            <a
              href={`tel:${vehicle.owner_phone}`}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                background: '#16a34a',
                color: 'white',
                fontSize: 12,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Call
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
