/* eslint-disable react-refresh/only-export-components -- provider, indicator, and hooks share one payroll security module */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { fetchPayrollSecurityGrantStatus, verifyPayrollSecurityCode } from '../../lib/api/payrollSecurity'

interface PayrollSecurityContextValue {
  isAdmin: boolean
  canModify: boolean
  grantActive: boolean
  requireSecurityThen: (action: () => void | Promise<void>) => Promise<void>
}

const PayrollSecurityContext = createContext<PayrollSecurityContextValue | null>(null)

export function usePayrollSecurity(): PayrollSecurityContextValue {
  const ctx = useContext(PayrollSecurityContext)
  if (!ctx) {
    throw new Error('usePayrollSecurity must be used inside PayrollSecurityProvider')
  }
  return ctx
}

export function usePayrollSecurityOptional(): PayrollSecurityContextValue | null {
  return useContext(PayrollSecurityContext)
}

interface ProviderProps {
  isAdmin: boolean
  canModify: boolean
  children: ReactNode
}

export function PayrollSecurityProvider({ isAdmin, canModify, children }: ProviderProps) {
  const [grantActive, setGrantActive] = useState(isAdmin)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pendingRef = useRef<(() => Promise<void>) | null>(null)

  const refreshGrant = useCallback(async () => {
    if (isAdmin) {
      setGrantActive(true)
      return
    }
    if (!canModify) {
      setGrantActive(false)
      setExpiresAt(null)
      return
    }
    try {
      const status = await fetchPayrollSecurityGrantStatus()
      setGrantActive(status.active)
      setExpiresAt(status.expiresAt)
    } catch {
      setGrantActive(false)
      setExpiresAt(null)
    }
  }, [canModify, isAdmin])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshGrant() }, 0)
    return () => window.clearTimeout(timer)
  }, [refreshGrant])

  useEffect(() => {
    if (!expiresAt || isAdmin) return
    const expiresMs = new Date(expiresAt).getTime() - Date.now()
    const delay = Number.isFinite(expiresMs) && expiresMs > 0 ? expiresMs + 250 : 0
    const timer = window.setTimeout(() => { void refreshGrant() }, delay)
    return () => window.clearTimeout(timer)
  }, [expiresAt, isAdmin, refreshGrant])

  const closeModal = useCallback(() => {
    pendingRef.current = null
    setModalOpen(false)
    setCode('')
    setError(null)
  }, [])

  const requireSecurityThen = useCallback(async (action: () => void | Promise<void>) => {
    if (!canModify && !isAdmin) return
    if (isAdmin || grantActive) {
      await action()
      return
    }
    pendingRef.current = async () => { await action() }
    setError(null)
    setCode('')
    setModalOpen(true)
  }, [canModify, grantActive, isAdmin])

  async function submitVerification() {
    if (!code.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const status = await verifyPayrollSecurityCode(code)
      setGrantActive(status.active)
      setExpiresAt(status.expiresAt)
      setModalOpen(false)
      setCode('')
      const pending = pendingRef.current
      pendingRef.current = null
      if (pending) await pending()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect security code.')
    } finally {
      setBusy(false)
    }
  }

  const value = useMemo<PayrollSecurityContextValue>(() => ({
    isAdmin,
    canModify,
    grantActive: isAdmin || grantActive,
    requireSecurityThen,
  }), [canModify, grantActive, isAdmin, requireSecurityThen])

  return (
    <PayrollSecurityContext.Provider value={value}>
      {children}
      {modalOpen && (
        <div className="modal-back" role="presentation" onClick={closeModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payroll-security-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal__head">
              <h3 id="payroll-security-title">Payroll Security Verification</h3>
              <button type="button" className="modal__x" onClick={closeModal} aria-label="Close" disabled={busy}>✕</button>
            </div>
            <div className="modal__body">
              <label className="payroll-security-field">
                <span>Security Code</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void submitVerification() }}
                  disabled={busy}
                />
              </label>
              {error && <p className="payroll-add-error" style={{ marginTop: '0.65rem' }}>{error}</p>}
            </div>
            <div className="modal__foot">
              <button type="button" className="btn btn--ghost btn--sm" onClick={closeModal} disabled={busy}>Cancel</button>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => void submitVerification()} disabled={busy || !code.trim()}>
                {busy ? 'Verifying…' : 'Unlock Editing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PayrollSecurityContext.Provider>
  )
}

export function PayrollSecurityIndicator() {
  const { canModify, isAdmin, grantActive } = usePayrollSecurity()
  if (!canModify && !isAdmin) return null

  const unlocked = isAdmin || grantActive
  return (
    <span className={`payroll-security-chip ${unlocked ? 'is-unlocked' : 'is-locked'}`}>
      <Icon name={unlocked ? 'shield' : 'lock'} size={13} strokeWidth={1.8} />
      {unlocked ? 'Payroll Editing Unlocked' : 'Secure Actions Locked'}
    </span>
  )
}
