import { useState } from 'react'
import { AuthShell } from '../components/AuthShell'
import { Icon } from '../components/Icon'
import { supabase } from '../lib/supabase'
import { authenticateCustomer, type CustomerVehicle } from '../lib/api/customer'

interface Props {
  onSwitchToSignUp: () => void
  onSwitchToForgot?: () => void
  onCustomerLogin?: (vehicle: CustomerVehicle, allVehicles: CustomerVehicle[]) => void
}

const PITCH_STAFF = {
  title: "Run your service workshop from one dashboard.",
  body: "Reception to delivery — intake, job cards, technician assignment, parts and revenue reporting, all role-aware and in real time.",
  features: [
    { icon: "reception", t: "Front-desk intake", m: "Capture vehicles & assign advisors in seconds" },
    { icon: "shield",    t: "Role-based access", m: "Everyone sees exactly the modules they own" },
    { icon: "reports",   t: "Live analytics",    m: "Labour, parts & VAS revenue at a glance" },
  ],
}

const PITCH_CUSTOMER = {
  title: "Track your vehicle service in real-time.",
  body: "Live workshop stage tracking, transparent estimate approvals, job card history, gate pass status, and direct customer support.",
  features: [
    { icon: "car",        t: "Live Stage Tracking", m: "Reception → Floor → Wash → Ready" },
    { icon: "doc",        t: "Digital Invoices",    m: "View estimate approval & tax invoices" },
    { icon: "complaints", t: "Priority Support",    m: "Log complaints & feedback directly" },
  ],
}

export default function LoginPage({ onSwitchToSignUp, onSwitchToForgot, onCustomerLogin }: Props) {
  const [mode, setMode] = useState<'staff' | 'customer'>('staff')

  // Staff Form State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Customer Form State
  const [customerUsername, setCustomerUsername] = useState('')
  const [customerPassword, setCustomerPassword] = useState('')
  const [showCustPassword, setShowCustPassword] = useState(false)
  const [custLoading, setCustLoading] = useState(false)
  const [custError, setCustError] = useState<string | null>(null)

  // Staff Login Handler
  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const inputIdentifier = email.trim()

    // 1. If email contains '@', try Supabase staff login
    if (inputIdentifier.includes('@')) {
      const { error: staffErr } = await supabase.auth.signInWithPassword({ email: inputIdentifier, password })
      if (!staffErr) {
        setLoading(false)
        return
      }
      setError(staffErr.message || 'Staff authentication failed. Please check your credentials.')
      setLoading(false)
      return
    }

    // 2. If non-email, try customer login fallback
    const custRes = await authenticateCustomer(inputIdentifier, password)
    if (custRes.success && custRes.vehicle) {
      if (onCustomerLogin) {
        onCustomerLogin(custRes.vehicle, custRes.allVehicles || [custRes.vehicle])
      }
      setLoading(false)
      return
    }

    // 3. Fallback: try Supabase staff login
    const { error: staffErr } = await supabase.auth.signInWithPassword({ email: inputIdentifier, password })
    if (!staffErr) {
      setLoading(false)
      return
    }

    setError('Invalid staff credentials or unrecognized account format.')
    setLoading(false)
  }

  // Customer Login Handler
  const handleCustomerLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setCustLoading(true)
    setCustError(null)

    const username = customerUsername.trim()
    const pass = customerPassword.trim()

    if (!username) {
      setCustError('Please enter your 10-digit mobile number or vehicle registration number.')
      setCustLoading(false)
      return
    }

    if (!pass) {
      setCustError('Please enter your password or mobile number.')
      setCustLoading(false)
      return
    }

    try {
      const custRes = await authenticateCustomer(username, pass)
      if (custRes.success && custRes.vehicle) {
        if (onCustomerLogin) {
          onCustomerLogin(custRes.vehicle, custRes.allVehicles || [custRes.vehicle])
        }
        setCustLoading(false)
        return
      }
      setCustError(custRes.error || 'Unable to log in with provided customer credentials.')
    } catch (err: any) {
      setCustError(err?.message || 'Login request failed. Please check network connection.')
    } finally {
      setCustLoading(false)
    }
  }

  // Quick-fill test credentials
  const fillCustomerDemo = (phone: string, vehicleNo: string) => {
    setCustomerUsername(phone)
    setCustomerPassword(phone)
    setCustError(null)
  }

  return (
    <AuthShell pitch={mode === 'staff' ? PITCH_STAFF : PITCH_CUSTOMER}>
      {/* Mode Selector Tabs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          background: 'var(--surface-sunken, #f1f5f9)',
          padding: 4,
          borderRadius: 12,
          marginBottom: 24,
          border: '1px solid var(--border, #e2e8f0)',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setMode('staff')
            setError(null)
          }}
          style={{
            padding: '8px 12px',
            fontSize: 13.5,
            fontWeight: 600,
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: mode === 'staff' ? 'var(--surface, #ffffff)' : 'transparent',
            color: mode === 'staff' ? 'var(--primary, #1e40af)' : 'var(--muted, #64748b)',
            boxShadow: mode === 'staff' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Icon name="shield" size={15} />
          <span>Staff Login</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('customer')
            setCustError(null)
          }}
          style={{
            padding: '8px 12px',
            fontSize: 13.5,
            fontWeight: 600,
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: mode === 'customer' ? 'var(--surface, #ffffff)' : 'transparent',
            color: mode === 'customer' ? 'var(--accent, #0284c7)' : 'var(--muted, #64748b)',
            boxShadow: mode === 'customer' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Icon name="car" size={16} />
          <span>Customer Login</span>
        </button>
      </div>

      {mode === 'staff' ? (
        /* ──────── Staff Login View ──────── */
        <>
          <div className="authcard__head">
            <div className="authcard__eyebrow">Workshop Portal</div>
            <h1>Staff Sign In</h1>
            <p className="authcard__sub">Sign in with your dealership or workshop email address.</p>
          </div>

          <form onSubmit={handleStaffLogin} className="space-y-5">
            <label className="field">
              <span className="label">Work Email</span>
              <span className="inp-wrap">
                <span className="icon-l"><Icon name="mail" size={17} /></span>
                <input
                  className="inp"
                  type="text"
                  placeholder="you@firstmobital.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </span>
            </label>

            <label className="field">
              <span className="label">Password</span>
              <span className="inp-wrap">
                <span className="icon-l"><Icon name="lock" size={17} /></span>
                <input
                  className="inp"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="toggle-eye"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  <Icon name={showPassword ? "eyeoff" : "eye"} size={17} />
                </button>
              </span>
            </label>

            {error && (
              <div className="alert alert--err">
                <Icon name="alert" size={17} />
                <span>{error}</span>
              </div>
            )}

            <div className="helprow">
              <label className="checkrow">
                <input type="checkbox" defaultChecked />
                Keep me signed in
              </label>
              <button type="button" className="linkbtn" onClick={onSwitchToForgot}>
                Forgot password?
              </button>
            </div>

            <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : <>Sign in as Staff <Icon name="arrowr" size={17} /></>}
            </button>
          </form>

          {/* Dedicated Customer Login Shortcut Button */}
          <div style={{ marginTop: 20 }}>
            <button
              type="button"
              className="btn btn--block"
              onClick={() => setMode('customer')}
              style={{
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                border: '1px solid #bae6fd',
                color: '#0369a1',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '11px 16px',
                borderRadius: 10,
              }}
            >
              <Icon name="car" size={18} />
              <span>Customer Login / Track Your Vehicle</span>
            </button>
          </div>

          <div className="divider-or">New to Techwheels?</div>
          <button type="button" className="btn btn--ghost btn--block" onClick={onSwitchToSignUp}>
            Request staff access
          </button>
        </>
      ) : (
        /* ──────── Customer Login View ──────── */
        <>
          <div className="authcard__head">
            <div
              className="authcard__eyebrow"
              style={{
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="car" size={14} />
              <span>Customer Portal (ग्राहक लॉगिन)</span>
            </div>
            <h1>Track Your Vehicle</h1>
            <p className="authcard__sub">
              Enter your registered Mobile Number or Vehicle Registration Number to view live service status.
            </p>
          </div>

          <form onSubmit={handleCustomerLogin} className="space-y-4">
            <label className="field">
              <span className="label">Mobile Number / Vehicle No.</span>
              <span className="inp-wrap">
                <span className="icon-l"><Icon name="phone" size={17} /></span>
                <input
                  className="inp"
                  type="text"
                  placeholder="e.g. 9950042708 or RJ60CJ6764"
                  value={customerUsername}
                  onChange={(e) => setCustomerUsername(e.target.value)}
                  required
                />
              </span>
            </label>

            <label className="field">
              <span className="label">Password / Mobile Number</span>
              <span className="inp-wrap">
                <span className="icon-l"><Icon name="lock" size={17} /></span>
                <input
                  className="inp"
                  type={showCustPassword ? "text" : "password"}
                  placeholder="Enter 10-digit mobile number as password"
                  value={customerPassword}
                  onChange={(e) => setCustomerPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="toggle-eye"
                  onClick={() => setShowCustPassword(!showCustPassword)}
                  aria-label="Toggle password visibility"
                >
                  <Icon name={showCustPassword ? "eyeoff" : "eye"} size={17} />
                </button>
              </span>
            </label>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12.5,
                color: '#475569',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                lineHeight: 1.45,
              }}
            >
              <span style={{ fontSize: 14 }}>💡</span>
              <span>
                <strong>Login Tip:</strong> You can enter your 10-digit mobile number in both fields to login directly and access your dashboard.
              </span>
            </div>

            {/* Quick Demo Fill Buttons */}
            <div style={{ paddingTop: 2, paddingBottom: 2 }}>
              <div style={{ fontSize: 11.5, color: 'var(--muted, #64748b)', marginBottom: 6, fontWeight: 600 }}>
                Demo Accounts (Click to test):
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => fillCustomerDemo('9888877771', 'RJ14TEST01')}
                  style={{
                    fontSize: 11.5,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    color: '#1e293b',
                    cursor: 'pointer',
                  }}
                >
                  🚗 Nexon EV (9888877771)
                </button>
                <button
                  type="button"
                  onClick={() => fillCustomerDemo('9888877772', 'RJ14TEST02')}
                  style={{
                    fontSize: 11.5,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    color: '#1e293b',
                    cursor: 'pointer',
                  }}
                >
                  🚙 Safari (9888877772)
                </button>
              </div>
            </div>

            {custError && (
              <div className="alert alert--err">
                <Icon name="alert" size={17} />
                <span>{custError}</span>
              </div>
            )}

            <button
              className="btn btn--primary btn--block"
              type="submit"
              disabled={custLoading}
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                marginTop: 10,
              }}
            >
              {custLoading ? 'Logging into Customer Portal…' : <>Log in as Customer <Icon name="arrowr" size={17} /></>}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <button
              type="button"
              className="linkbtn"
              onClick={() => {
                setMode('staff')
                setError(null)
              }}
              style={{ fontSize: 13.5, color: 'var(--muted, #64748b)' }}
            >
              ← Back to Workshop Staff Login
            </button>
          </div>
        </>
      )}

      <p className="authfine" style={{ marginTop: 24 }}>
        Techwheels Service v1.0 · Firstmobital · Role & Customer Protected
      </p>
    </AuthShell>
  )
}
