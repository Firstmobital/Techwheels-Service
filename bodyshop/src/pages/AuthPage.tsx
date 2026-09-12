import { useState } from 'react'
import { fetchCustomerVehicles, type CustomerVehicle } from '../lib/api'

interface AuthPageProps {
  onLoginSuccess: (vehicle: CustomerVehicle, allVehicles: CustomerVehicle[]) => void
}

const SAMPLE_VEHICLES = [
  { reg: 'RJ14TEST01', desc: 'Nexon EV (Paid Service)' },
  { reg: 'RJ14TEST02', desc: 'Safari (Accident & Gatepass)' },
  { reg: 'RJ14TEST03', desc: 'Punch (First Free Service)' },
  { reg: 'RJ14TEST04', desc: 'Altroz (Third Free Service)' },
]

export default function AuthPage({ onLoginSuccess }: AuthPageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<CustomerVehicle[]>([])

  async function handleSearchWithQuery(queryStr: string) {
    const query = queryStr.trim().toUpperCase()
    if (!query || query.length < 3) {
      setError('Please enter at least 3 characters of Registration or Mobile number.')
      return
    }

    setLoading(true)
    setError(null)
    setSearchResults([])

    try {
      const results = await fetchCustomerVehicles(query)
      if (results.length === 0) {
        setError(`No vehicle found matching "${query}". Please check the number or contact your service advisor.`)
      } else if (results.length === 1) {
        onLoginSuccess(results[0], results)
      } else {
        setSearchResults(results)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search vehicle')
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    void handleSearchWithQuery(searchQuery)
  }

  return (
    <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', padding: '24px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 16px',
            borderRadius: 20,
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            boxShadow: '0 10px 25px rgba(37, 99, 235, 0.35)',
          }}
        >
          🚘
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)', marginBottom: 6 }}>
          Techwheels Customer Portal
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
          Vehicle Services, Complaints, Estimates, Invoices & Gate Pass
        </p>
      </div>

      <div className="card" style={{ padding: 26, boxShadow: '0 10px 30px rgba(0,0,0,0.06)' }}>
        <form onSubmit={handleSearch}>
          <div className="form-group">
            <label className="form-label">
              Vehicle Registration No or Mobile No
            </label>
            <input
              className="form-input mono"
              style={{ textTransform: 'uppercase', fontSize: 16, fontWeight: 700 }}
              placeholder="e.g. RJ60CH2388 or 9680460999"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
              autoFocus
            />
          </div>

          {/* Quick 1-Click Test Chips */}
          <div style={{ margin: '10px 0 16px' }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>
              Quick test vehicles:
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {SAMPLE_VEHICLES.map((sample) => (
                <button
                  key={sample.reg}
                  type="button"
                  onClick={() => {
                    setSearchQuery(sample.reg)
                    void handleSearchWithQuery(sample.reg)
                  }}
                  style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#1e293b',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {sample.reg}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="toast-banner error" style={{ margin: '12px 0' }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !searchQuery.trim()}
            style={{ width: '100%', padding: '13px' }}
          >
            {loading ? 'Accessing Vehicle Portal…' : 'Access Vehicle Portal →'}
          </button>
        </form>

        {searchResults.length > 1 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              Multiple vehicles found — Select yours:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {searchResults.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onLoginSuccess(v, searchResults)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-sub)',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <strong className="mono" style={{ fontSize: 14, color: '#1d4ed8' }}>{v.reg_number}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{v.model || 'Vehicle'} · {v.service_type || 'Service'}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>Select →</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--text-muted)' }}>
        Techwheels Dealership After-Purchase Service Portal · Version 1.0
      </div>
    </div>
  )
}
