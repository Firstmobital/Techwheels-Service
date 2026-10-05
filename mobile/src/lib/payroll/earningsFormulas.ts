/** Shared income formulas — same as web src/lib/payroll/earningsFormulas.ts */

export function parseAmount(value: unknown): number {
  if (value == null) return 0
  const raw = String(value).trim()
  if (!raw) return 0
  const neg = raw.startsWith('(') && raw.endsWith(')')
  const cleaned = raw.replace(/[₹,\s()]/g, '').replace(/RS\.?/gi, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return 0
  return neg ? -n : n
}

export function calculateSAIncome(labourAmount: number, saSharePercent: number): number {
  if (!Number.isFinite(labourAmount) || labourAmount <= 0) return 0
  const netBeforeShare = labourAmount / 1.18
  return netBeforeShare * (saSharePercent / 100)
}

export function normalizeEmployeeCode(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}
