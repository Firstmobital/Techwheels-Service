import { useState } from 'react'
import { fetchCustomerVehicles, type CustomerVehicle } from '../lib/api'

interface AuthPageProps {
  onLoginSuccess: (vehicle: CustomerVehicle, allVehicles: CustomerVehicle[]) => void
}

export default function AuthPage({ onLoginSuccess }: AuthPageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<CustomerVehicle[]>([])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const query = searchQuery.trim().toUpperCase()
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

  return (
    <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '80vh' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 16px',
            borderRadius: 18,
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
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
          Customer Service Portal
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Track repairs, book service, view invoices & submit feedback
        </p>
      </div>

      <div className="card" style={{ padding: 22, boxShadow: 'var(--shadow-md)' }}>
        <form onSubmit={handleSearch}>
          <div className="form-group">
            <label className="form-label">
              Vehicle Registration No or Mobile No
            </label>
            <input
              className="form-input mono"
              style={{ textTransform: 'uppercase', fontSize: 16, fontWeight: 700 }}
              placeholder="e.g. GJ36AJ2837 or 9978526575"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
              autoFocus
            />
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
            style={{ marginTop: 8 }}
          >
            {loading ? 'Searching Vehicle…' : 'Access My Vehicle'}
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

      <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-sub)' }}>
        Techwheels After-Purchase Customer Services · Available on Android & iOS
      </div>
    </div>
  )
}
