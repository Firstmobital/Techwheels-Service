export type CustomerQueryLogEntry = {
  op: 'rpc' | 'from' | 'rest'
  target: string
  at: number
}

let scopeLabel = 'customer-portal'
const entries: CustomerQueryLogEntry[] = []

export function beginCustomerQueryScope(label: string): void {
  scopeLabel = label
  entries.length = 0
}

export function endCustomerQueryScope(): { label: string; count: number; entries: CustomerQueryLogEntry[] } {
  const snapshot = { label: scopeLabel, count: entries.length, entries: [...entries] }
  if (__DEV__ && snapshot.count > 0) {
    const byTarget = new Map<string, number>()
    for (const e of snapshot.entries) {
      const key = `${e.op}:${e.target}`
      byTarget.set(key, (byTarget.get(key) ?? 0) + 1)
    }
    const breakdown = [...byTarget.entries()].map(([k, n]) => `${k}×${n}`).join(', ')
    console.log(`[customer-queries] ${snapshot.label}: ${snapshot.count} (${breakdown})`)
  }
  return snapshot
}

export function logCustomerQuery(op: CustomerQueryLogEntry['op'], target: string): void {
  entries.push({ op, target, at: Date.now() })
}
