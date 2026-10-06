import { describe, expect, it } from 'vitest'
import { humanizeStaffAuthError } from './staffAuthErrors'
import { normalizeSupabaseProjectUrl } from './supabaseConfig'

describe('humanizeStaffAuthError', () => {
  it('maps network failures to actionable copy', () => {
    expect(humanizeStaffAuthError('Network request failed')).toMatch(/Cannot reach Techwheels server/)
  })

  it('maps invalid credentials', () => {
    expect(humanizeStaffAuthError('Invalid login credentials')).toMatch(/Wrong email or password/)
  })
})

describe('normalizeSupabaseProjectUrl', () => {
  it('adds https when host only', () => {
    expect(normalizeSupabaseProjectUrl('jmdndcphkmaljhwgzqxq.supabase.co')).toBe(
      'https://jmdndcphkmaljhwgzqxq.supabase.co',
    )
  })

  it('rejects garbage', () => {
    expect(normalizeSupabaseProjectUrl('undefined')).toBeNull()
  })
})
