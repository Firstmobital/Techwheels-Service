import { supabase } from '../supabase'

export interface PayrollSecurityGrantStatus {
  active: boolean
  expiresAt: string | null
}

export async function fetchPayrollSecurityGrantStatus(): Promise<PayrollSecurityGrantStatus> {
  const res = await supabase.rpc('payroll_security_grant_status')
  if (res.error) throw new Error(res.error.message)
  const data = (res.data ?? {}) as { active?: boolean; expires_at?: string | null }
  return {
    active: Boolean(data.active),
    expiresAt: data.expires_at ?? null,
  }
}

export async function verifyPayrollSecurityCode(code: string): Promise<PayrollSecurityGrantStatus> {
  const res = await supabase.rpc('payroll_verify_security_code', { p_code: code })
  if (res.error) {
    const message = res.error.message || ''
    if (message.includes('Incorrect security code')) {
      throw new Error('Incorrect security code.')
    }
    if (message.toLowerCase().includes('unauthorized')) {
      throw new Error('Unauthorized')
    }
    throw new Error('Incorrect security code.')
  }
  const data = (res.data ?? {}) as { ok?: boolean; expires_at?: string | null }
  return {
    active: Boolean(data.ok),
    expiresAt: data.expires_at ?? null,
  }
}
