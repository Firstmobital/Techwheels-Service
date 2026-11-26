import type { ExpenseHead } from '../../../lib/pnl/pnl'
import { EXPENSE_CATEGORIES } from './format'

export function Notices({ error, message }: { error: string | null; message: string | null }) {
  return (
    <div aria-live="polite" className="space-y-2">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
    </div>
  )
}

export function HeadOptions({ heads }: { heads: ExpenseHead[] }) {
  return (
    <>
      <option value="">Select…</option>
      {EXPENSE_CATEGORIES.map((category) => (
        <optgroup key={category} label={category}>
          {heads.filter((h) => h.category === category).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </optgroup>
      ))}
    </>
  )
}
