import type { BusyGstBucket } from './types.ts'

export function classifyGstRate(rate: number): BusyGstBucket | null {
  if (Math.abs(rate - 5) <= 0.15) return 5
  if (Math.abs(rate - 18) <= 0.15) return 18
  return null
}
