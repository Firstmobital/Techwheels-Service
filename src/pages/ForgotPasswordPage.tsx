import { useState } from 'react'
import { AuthShell } from '../components/AuthShell'
import { Icon } from '../components/Icon'
import { supabase } from '../lib/supabase'

interface Props {
  onSwitchToLogin: () => void
}

const PITCH = {
  forgot: {
    title: "Locked out? We'll get you back in.",
    body: "Enter the email tied to your Techwheels Service account and we'll send a secure link to set a new password.",
    features: [
      { icon: "lock",   t: "Secure reset",     m: "Time-limited link sent to your inbox" },
      { icon: "key",    t: "Strong passwords", m: "12+ chars with mixed case, number & symbol" },
      { icon: "shield", t: "Account safety",   m: "Links expire and can only be used once" },
    ],
  },
}

export default function ForgotPasswordPage({ onSwitchToLogin }: Props) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback`,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setSentTo(email.trim())
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <AuthShell pitch={PITCH.forgot}>
        <div style={{ textAlign: 'center' }}>
          <div className="bigcheck"><Icon name="mail" size={28} strokeWidth={2} /></div>
          <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>Check your inbox</h1>
          <p className="authcard__sub">We sent a password reset link to<br /><strong style={{ color: 'var(--ink)' }}>{sentTo || 'your email'}</strong>.</p>
        </div>

        <div className="alert alert--ok" style={{ marginTop: 22, textAlign: 'left' }}>
          <Icon name="checksm" size={17} strokeWidth={2.4} />
          <span>Open the link on this device to set a new password, then sign back in.</span>
        </div>

        <button type="button" className="btn btn--ghost btn--block" onClick={onSwitchToLogin} style={{ marginTop: 6 }}>
          Back to sign in
        </button>

        <p className="authfine">Wrong address? <button type="button" className="linkbtn" onClick={() => setSubmitted(false)}>Try a different email</button></p>
      </AuthShell>
    )
  }

  return (
    <AuthShell pitch={PITCH.forgot}>
      <div className="authcard__head">
        <button type="button" className="btn btn--quiet btn--sm" onClick={onSwitchToLogin} style={{ marginLeft: -10, marginBottom: 14 }}>
          <Icon name="back" size={16} /> Back to sign in
        </button>
        <div className="authcard__eyebrow">Password recovery</div>
        <h1>Reset your password</h1>
        <p className="authcard__sub">Enter your account email and we'll send a secure reset link.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="field">
          <span className="label">Email address</span>
          <span className="inp-wrap">
            <span className="icon-l"><Icon name="mail" size={17} /></span>
            <input
              className="inp"
              type="email"
              placeholder="you@firstmobital.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </span>
        </label>

        {error && (
          <div className="alert alert--err">
            <Icon name="alert" size={17} />
            <span>{error}</span>
          </div>
        )}

        <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
          {loading ? 'Sending link…' : <>Send recovery link <Icon name="arrowr" size={17} /></>}
        </button>
      </form>

      <div className="divider-or">Remember your password?</div>
      <button type="button" className="btn btn--ghost btn--block" onClick={onSwitchToLogin}>
        Back to sign in
      </button>

      <div className="access-note" style={{ marginTop: 20 }}>
        <span className="ic"><Icon name="clock" size={17} /></span>
        <div><b>The link expires in 60 minutes</b><p>For your security it can be used only once. Didn't get it? Check spam, then try again.</p></div>
      </div>
    </AuthShell>
  )
}
