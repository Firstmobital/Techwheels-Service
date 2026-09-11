import { useEffect, useState } from 'react'
import { fetchBodyshopRepair, type BodyshopRepairCard, type CustomerVehicle } from '../lib/api'

interface RepairTrackerPageProps {
  vehicle: CustomerVehicle
}

export default function RepairTrackerPage({ vehicle }: RepairTrackerPageProps) {
  const [bodyshopCard, setBodyshopCard] = useState<BodyshopRepairCard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const card = await fetchBodyshopRepair(vehicle.reg_number)
        setBodyshopCard(card)
      } catch (e) {
        console.error('Failed to load bodyshop card:', e)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [vehicle.reg_number])

  const isCompleted = Boolean(vehicle.invoice_done_at)

  const stages = [
    { title: 'Reception & Job Card Opened', desc: 'Vehicle checked in at workshop', completed: true },
    { title: 'Advisor Inspection & Estimate', desc: 'Job card created and estimate generated', completed: Boolean(vehicle.estimate_storage_path || vehicle.jc_number) },
    { title: 'Workshop & Bodyshop Repairs', desc: 'Technicians working on repairs & parts replacement', completed: isCompleted, current: !isCompleted && Boolean(vehicle.jc_number) },
    { title: 'Quality Check & Washing', desc: 'Final inspection & vehicle readiness', completed: isCompleted },
    { title: 'Invoiced & Gatepass Ready', desc: 'Ready for customer pickup and delivery', completed: isCompleted },
  ]

  return (
    <div>
      {/* Title */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Live Repair Tracker</h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Real-time repair and service stages for <strong className="mono">{vehicle.reg_number}</strong>
        </p>
      </div>

      {/* Bodyshop Claim Details if available */}
      {bodyshopCard && (
        <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <div className="card-header">
            <div>
              <div className="card-title">Bodyshop Insurance Claim</div>
              <div className="card-subtitle">Claim #{bodyshopCard.claim_number || 'Under Process'}</div>
            </div>
            <span className="badge badge--purple">{bodyshopCard.status || 'Active'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Insurance: </span>
              <strong>{bodyshopCard.insurance_company || 'Insurance Claim'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Surveyor: </span>
              <strong>{bodyshopCard.surveyor_name || 'Assigned'}</strong>
            </div>
            {bodyshopCard.estimate_amount != null && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Estimate: </span>
                <strong className="mono">₹{bodyshopCard.estimate_amount.toLocaleString()}</strong>
              </div>
            )}
            {bodyshopCard.approved_amount != null && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Approved: </span>
                <strong className="mono" style={{ color: 'var(--success)' }}>₹{bodyshopCard.approved_amount.toLocaleString()}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visual Timeline Card */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Service Stages</div>

        <div className="timeline">
          {stages.map((st, idx) => {
            let statusClass = ''
            let icon = String(idx + 1)
            if (st.completed) {
              statusClass = 'completed'
              icon = '✓'
            } else if (st.current) {
              statusClass = 'current'
              icon = '⏳'
            }

            return (
              <div key={st.title} className={`timeline-step ${statusClass}`}>
                <div className="timeline-dot">{icon}</div>
                <div className="timeline-title">{st.title}</div>
                <div className="timeline-desc">{st.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Workshop Contact Box */}
      <div className="card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>📞</span>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#166534' }}>Need an urgent update?</div>
            <div style={{ fontSize: 12, color: '#15803d' }}>
              Contact your Service Advisor: <strong>{vehicle.sa_display_name || vehicle.sa_name || 'Workshop Helpline'}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
