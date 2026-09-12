import { useState, useEffect } from 'react'
import { authenticateCustomer, type CustomerVehicle } from '../lib/api'

interface AuthPageProps {
  onLoginSuccess: (vehicle: CustomerVehicle, allVehicles: CustomerVehicle[]) => void
}

const QUICK_TEST_CREDENTIALS = [
  { label: 'RJ60CJ6764 (Reception Entry)', reg: 'RJ60CJ6764', pass: '9950042708', desc: 'Nexon EV · SHARMA, SUNIL' },
  { label: 'RJ14UL0485 (Reception Entry)', reg: 'RJ14UL0485', pass: '9460517971', desc: 'Safari · SHEKHAWAT, YOGENDRA SINGH' },
  { label: 'RJ45CW4065 (Reception Entry)', reg: 'RJ45CW4065', pass: '9529615370', desc: 'Nexon · SHEKHAWAT, YOGENDRA SINGH' },
  { label: 'RJ14TEST01 (Sandbox)', reg: 'RJ14TEST01', pass: '9888877771', desc: 'Nexon EV · Rahul Sharma' },
]

export default function AuthPage({ onLoginSuccess }: AuthPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [multipleVehicles, setMultipleVehicles] = useState<CustomerVehicle[]>([])

  // Check URL params for direct link: e.g. /?reg=RJ14TEST01
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlReg = params.get('reg')
    if (urlReg) {
      setUsername(urlReg.trim().toUpperCase())
    }
  }, [])

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMultipleVehicles([])

    if (!username.trim()) {
      setError('Please enter your Vehicle Registration Number or Mobile Number as Username.')
      return
    }

    if (!password.trim()) {
      setError('Please enter your 10-digit registered Mobile Number as Password.')
      return
    }

    setLoading(true)
    try {
      const res = await authenticateCustomer(username, password)
      if (!res.success) {
        setError(res.error || 'Authentication failed. Please check your credentials.')
      } else if (res.allVehicles && res.allVehicles.length > 1) {
        setMultipleVehicles(res.allVehicles)
      } else if (res.vehicle) {
        onLoginSuccess(res.vehicle, res.allVehicles || [res.vehicle])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleFillQuickTest(item: typeof QUICK_TEST_CREDENTIALS[0]) {
    setUsername(item.reg)
    setPassword(item.pass)
    setError(null)
  }

  return (
    <div style={{ maxWidth: 490, width: '100%', margin: '0 auto', padding: '24px 0' }}>
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div
          style={{
            width: 68,
            height: 68,
            margin: '0 auto 14px',
            borderRadius: 22,
            background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 34,
            boxShadow: '0 12px 28px rgba(30, 64, 175, 0.35)',
          }}
        >
          🚘
        </div>
        <h1 style={{ fontSize: 23, fontWeight: 900, color: 'var(--text)', marginBottom: 4 }}>
          Techwheels Customer Portal
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Access your live service job card, estimates, complaints & gate pass
        </p>
      </div>

      {/* Login Card */}
      <div className="card" style={{ padding: 26, boxShadow: '0 12px 36px rgba(0,0,0,0.07)' }}>
        <div style={{ marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Customer Sign In</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Use credentials registered during reception intake
          </p>
        </div>

        <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* USERNAME FIELD */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Username</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                (Vehicle No or Mobile No)
              </span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input mono"
                style={{
                  textTransform: 'uppercase',
                  fontSize: 15,
                  fontWeight: 700,
                  paddingLeft: 38,
                }}
                placeholder="e.g. RJ60CJ6764 or 9950042708"
                value={username}
                onChange={(e) => setUsername(e.target.value.toUpperCase())}
                autoFocus
              />
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 16,
                  color: '#64748b',
                  pointerEvents: 'none',
                }}
              >
                🚗
              </span>
            </div>
          </div>

          {/* PASSWORD FIELD */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Password</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                (10-digit Registered Mobile No)
              </span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input mono"
                type={showPassword ? 'text' : 'password'}
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  paddingLeft: 38,
                  paddingRight: 40,
                }}
                placeholder="e.g. 9950042708"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 16,
                  color: '#64748b',
                  pointerEvents: 'none',
                }}
              >
                🔒
              </span>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 15,
                  padding: 4,
                  color: '#64748b',
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div className="toast-banner error" style={{ margin: 0, fontSize: 12.5 }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Sign In Button */}
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !username.trim() || !password.trim()}
            style={{
              padding: '13px',
              fontSize: 14,
              fontWeight: 800,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
            }}
          >
            {loading ? 'Verifying Credentials…' : 'Sign In to Portal →'}
          </button>
        </form>

        {/* Info Note */}
        <div
          style={{
            marginTop: 18,
            padding: '10px 12px',
            borderRadius: 8,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            fontSize: 11.5,
            color: '#475569',
            lineHeight: 1.45,
          }}
        >
          💡 <strong>Login Rule:</strong> Reception par jab vehicle intake entry create hoti hai, customer apna <strong>Vehicle Number</strong> (ya Mobile No) username me aur <strong>Registered Mobile Number</strong> password me daal kar login kar sakte hain.
        </div>

        {/* Quick Test Accounts Fill */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            ⚡ 1-Click Quick Test Credentials:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {QUICK_TEST_CREDENTIALS.map((item) => (
              <button
                key={item.reg}
                type="button"
                onClick={() => handleFillQuickTest(item)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div>
                  <strong className="mono" style={{ fontSize: 12, color: '#1d4ed8' }}>{item.reg}</strong>
                  <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>Pass: {item.pass}</span>
                </div>
                <span style={{ fontSize: 11, color: '#0284c7', fontWeight: 600 }}>Fill ↗</span>
              </button>
            ))}
          </div>
        </div>

        {/* Multiple Vehicles Picker if any */}
        {multipleVehicles.length > 1 && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              Multiple Vehicles Registered Under This Account:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {multipleVehicles.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onLoginSuccess(v, multipleVehicles)}
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
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {v.model || 'Vehicle'} · {v.service_type || 'Service'}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>Select →</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--text-muted)' }}>
        Techwheels Dealership After-Purchase Service Portal · SRD v1.0
      </div>
    </div>
  )
}
