import { type CustomerVehicle } from '../lib/api'
import { type TabType } from '../components/BottomNav'

interface DashboardPageProps {
  vehicle: CustomerVehicle
  onNavigate: (tab: TabType) => void
}

export default function DashboardPage({ vehicle, onNavigate }: DashboardPageProps) {
  const isServiceCompleted = Boolean(vehicle.invoice_done_at)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Vehicle Hero Card */}
      <div className="card card--gradient">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.85 }}>
              Registered Vehicle
            </span>
            <div className="mono" style={{ fontSize: 24, fontWeight: 800, marginTop: 2, letterSpacing: '1px' }}>
              {vehicle.reg_number}
            </div>
            <div style={{ fontSize: 13.5, marginTop: 4, opacity: 0.9 }}>
              {vehicle.model || 'Tata Motors'} · {vehicle.service_type || 'Customer Service'}
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

        <div
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            fontSize: 12.5,
          }}
        >
          <div>
            <div style={{ opacity: 0.75, fontSize: 11.5 }}>Customer Name</div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{vehicle.owner_name || 'Valued Customer'}</div>
          </div>
          <div>
            <div style={{ opacity: 0.75, fontSize: 11.5 }}>Service Advisor</div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{vehicle.sa_display_name || vehicle.sa_name || 'Assigned SA'}</div>
          </div>
        </div>
      </div>

      {/* Primary 3-Action Quick Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <button
          type="button"
          className="card"
          onClick={() => onNavigate('booking')}
          style={{
            padding: '16px 10px',
            textAlign: 'center',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            borderRadius: 14,
          }}
        >
          <span style={{ fontSize: 26 }}>🛠️</span>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Book Service</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Appointment</div>
        </button>

        <button
          type="button"
          className="card"
          onClick={() => onNavigate('invoices')}
          style={{
            padding: '16px 10px',
            textAlign: 'center',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            borderRadius: 14,
          }}
        >
          <span style={{ fontSize: 26 }}>🧾</span>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Bills & Est.</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Invoices</div>
        </button>

        <button
          type="button"
          className="card"
          onClick={() => onNavigate('feedback')}
          style={{
            padding: '16px 10px',
            textAlign: 'center',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            borderRadius: 14,
          }}
        >
          <span style={{ fontSize: 26 }}>⭐</span>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Feedback</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Give Rating</div>
        </button>
      </div>

      {/* Active Service Status Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Workshop Record</div>
            <div className="card-subtitle">Current Job Details</div>
          </div>
          <span className="badge badge--blue">{vehicle.service_type || 'Bodyshop'}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Job Card Number</span>
            <strong className="mono" style={{ color: 'var(--primary)' }}>{vehicle.jc_number || 'Under Process'}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Service Branch</span>
            <strong>{vehicle.branch || 'Sitapura Workshop'}</strong>
          </div>

          {vehicle.km_reading ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Odometer (KM)</span>
              <strong className="mono">{vehicle.km_reading.toLocaleString()} km</strong>
            </div>
          ) : null}

          {vehicle.billed_amount ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total Amount</span>
              <strong className="mono" style={{ color: '#059669', fontSize: 14 }}>₹{vehicle.billed_amount.toLocaleString()}</strong>
            </div>
          ) : null}

          {vehicle.remark && (
            <div style={{ background: 'var(--surface-sub)', padding: '10px 12px', borderRadius: 8, marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
                Service Advisor Note / Customer Voice:
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{vehicle.remark}</span>
            </div>
          )}
        </div>
      </div>

      {/* Helpline Contact Card */}
      <div className="card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>📞</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#166534' }}>Direct Advisor Assistance</div>
            <div style={{ fontSize: 12, color: '#15803d' }}>
              Advisor: <strong>{vehicle.sa_display_name || vehicle.sa_name || 'Workshop Team'}</strong>
            </div>
          </div>
          {vehicle.owner_phone && (
            <a
              href={`tel:${vehicle.owner_phone}`}
              style={{
                padding: '6px 12px',
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
