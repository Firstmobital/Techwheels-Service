import { STAFF_SIGNUP_ROLE_OPTIONS, staffSignupRoleLabel, type StaffSignupRoleId } from './staffSignUpRoles'

export { STAFF_SIGNUP_ROLE_OPTIONS, staffSignupRoleLabel, type StaffSignupRoleId }

export const STAFF_PASSWORD_RULES = [
  { id: 'len', label: 'At least 12 characters', test: (pw: string) => pw.length >= 12 },
  { id: 'case', label: 'Uppercase & lowercase', test: (pw: string) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  { id: 'num', label: 'At least one number', test: (pw: string) => /[0-9]/.test(pw) },
  { id: 'sym', label: 'At least one symbol (!@#$%)', test: (pw: string) => /[!@#$%^&*]/.test(pw) },
] as const

export function staffPasswordScore(password: string): number {
  return STAFF_PASSWORD_RULES.filter((r) => r.test(password)).length
}

export function staffSignUpRoleLabel(roleId: StaffSignupRoleId | null): string {
  return staffSignupRoleLabel(roleId)
}
