import { type CustomerVehicle } from '../lib/api'
import { type TabType } from '../components/BottomNav'

interface DashboardPageProps {
  vehicle: CustomerVehicle
  onNavigate: (tab: TabType) => void
}

export default function DashboardPage({ vehicle, onNavigate }: DashboardPageProps) {
  const isServiceCompleted = Boolean(vehicle.invoice_done_at)

  return (
    <div>
      {/* Vehicle Hero Card */}
      <div className="card card--gradient">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.85 }}>
              Registered Vehicle
            </span>
            <div className="mono" style={{ fontSize: 22, fontWeight: 800, marginTop: 2, letterSpacing: '1px' }}>
              {vehicle.reg_number}
            </div>
            <div style={{ fontSize: 13, marginTop: 4, opacity: 0.9 }}>
              {vehicle.model || 'Tata Motors'} · {vehicle.service_type || 'Service'}
            </div>
          </div>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: 700,
              background: isServiceCompleted ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: 'white',
            }}
          >
            {isServiceCompleted ? '✅ Ready' : '⏳ In Progress'}
          </span>
        </div>

        <div
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px solid rgba(255, 255, 255, 0.18)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            fontSize: 12,
          }}
        >
          <div>
            <div style={{ opacity: 0.75 }}>Owner / Customer</div>
            <div style={{ fontWeight: 700 }}>{vehicle.owner_name || 'Valued Customer'}</div>
          </div>
          <div>
            <div style={{ opacity: 0.75 }}>Service Advisor</div>
            <div style={{ fontWeight: 700 }}>{vehicle.sa_display_name || vehicle.sa_name || 'Assigned Advisor'}</div>
          </div>
        </div>
      </div>

      {/* Quick Action Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <button
          type="button"
          className="card"
          onClick={() => onNavigate('tracker')}
          style={{ padding: 14, textAlign: 'left', cursor: 'pointer', transition: 'transform 0.15s ease' }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}>🔍</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Live Track</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Bodyshop & stages</div>
        </button>

        <button
          type="button"
          className="card"
          onClick={() => onNavigate('booking')}
          style={{ padding: 14, textAlign: 'left', cursor: 'pointer', transition: 'transform 0.15s ease' }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}>🛠️</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Book Service</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Periodic & estimates</div>
        </button>

        <button
          type="button"
          className="card"
          onClick={() => onNavigate('invoices')}
          style={{ padding: 14, textAlign: 'left', cursor: 'pointer', transition: 'transform 0.15s ease' }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}>🧾</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Bills & Receipts</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>View payments</div>
        </button>

        <button
          type="button"
          className="card"
          onClick={() => onNavigate('feedback')}
          style={{ padding: 14, textAlign: 'left', cursor: 'pointer', transition: 'transform 0.15s ease' }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}>⭐</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Feedback</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rating & remarks</div>
        </button>
      </div>

      {/* Active Service Status Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Active Service Info</div>
            <div className="card-subtitle">Job Card & Workshop details</div>
          </div>
          <span className="badge badge--blue">{vehicle.service_type || 'General'}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Job Card Number</span>
            <strong className="mono" style={{ color: 'var(--primary)' }}>{vehicle.jc_number || 'Under Process'}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Service Branch</span>
            <strong>{vehicle.branch || 'Main Workshop'}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Odometer (KM)</span>
            <strong className="mono">{vehicle.km_reading ? `${vehicle.km_reading.toLocaleString()} km` : '—'}</strong>
          </div>

          {vehicle.remark && (
            <div style={{ background: 'var(--surface-sub)', padding: '8px 12px', borderRadius: 8, marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
                Service Advisor Note / Customer Voice:
              </span>
              <span style={{ fontSize: 12.5 }}>{vehicle.remark}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
