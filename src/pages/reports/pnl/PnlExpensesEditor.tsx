import { useCallback, useEffect, useMemo, useState } from 'react'
import { addExpenseHead, canModifyPnl, getExpenseHeads, getExpenses, getPayrollCost, getPnlSettings, savePnlSettings, saveExpenses } from '../../../lib/api/pnl'
import { COMMON_BRANCH, PNL_BRANCHES, payrollByMonthBranch, type ExpenseHead, type PnlSettings } from '../../../lib/pnl/pnl'
import { rupees } from './format'

const CATEGORIES = ['People', 'Premises', 'Operations', 'Admin', 'Finance']
const cellKey = (headId: number, branch: string) => `${headId}|${branch}`
const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const previousMonth = (month: string) => monthOf(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1))
const inputClass = 'rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100'

export default function PnlExpensesEditor() {
  const [month, setMonth] = useState(() => monthOf(new Date()))
  const [heads, setHeads] = useState<ExpenseHead[]>([])
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [payroll, setPayroll] = useState<Map<string, { paise: number; finalized: boolean }>>(new Map())
  const [settings, setSettings] = useState<PnlSettings | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [newHead, setNewHead] = useState({ name: '', category: 'Admin' })

  const load = useCallback(async (target: string) => {
    const loadedSettings = await getPnlSettings()
    const [loadedHeads, expenses, pay, editable] = await Promise.all([
      getExpenseHeads(), getExpenses(target, target), getPayrollCost(`${target}-01`, `${target}-01`), canModifyPnl(),
    ])
    const cells: Record<string, string> = {}
    for (const e of expenses) cells[cellKey(e.headId, e.branch)] = String(e.amount)
    return { loadedSettings, loadedHeads, cells, pay: payrollByMonthBranch(pay), editable }
  }, [])

  const apply = useCallback((r: Awaited<ReturnType<typeof load>>) => {
    setSettings(r.loadedSettings)
    setHeads(r.loadedHeads)
    setSaved(r.cells)
    setDraft(r.cells)
    setPayroll(r.pay)
    setCanEdit(r.editable)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setMessage(null)
    load(month)
      .then((r) => { if (active) apply(r) })
      .catch((err: Error) => { if (active) { setHeads([]); setError(err.message) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [month, load, apply])

  const changedKeys = useMemo(
    () => [...new Set([...Object.keys(saved), ...Object.keys(draft)])].filter((k) => (saved[k] ?? '') !== (draft[k] ?? '').trim()),
    [saved, draft],
  )
  const activeHeads = heads.filter((h) => h.isActive)

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
      setMessage(done)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const save = () => run(async () => {
    const upserts: Array<{ branch: string; headId: number; amount: number }> = []
    const removals: Array<{ branch: string; headId: number }> = []
    for (const key of changedKeys) {
      const [id, branch] = key.split('|')
      const text = (draft[key] ?? '').trim()
      if (text === '') { removals.push({ branch, headId: Number(id) }); continue }
      const amount = Number(text.replace(/,/g, ''))
      if (!Number.isFinite(amount) || amount < 0) throw new Error(`“${text}” is not a valid amount.`)
      upserts.push({ branch, headId: Number(id), amount: Math.round(amount * 100) / 100 })
    }
    await saveExpenses(month, upserts, removals)
    apply(await load(month))
  }, 'Expenses saved.')

  const copyPrevious = () => run(async () => {
    const source = await getExpenses(previousMonth(month), previousMonth(month))
    if (!source.length) throw new Error(`Nothing is entered for ${previousMonth(month)}.`)
    // Salary is not copied: it must come from this month's Payroll or be typed for this month.
    const salaryId = heads.find((h) => h.code === 'salary')?.id
    setDraft((current) => {
      const next = { ...current }
      for (const e of source) {
        const key = cellKey(e.headId, e.branch)
        if (e.headId !== salaryId && !(next[key] ?? '').trim()) next[key] = String(e.amount)
      }
      return next
    })
  }, 'Copied into empty cells (salary excluded). Check the amounts, then press Save.')

  const columnTotal = (branch: string) => activeHeads.reduce((sum, h) => {
    const text = (draft[cellKey(h.id, branch)] ?? '').trim()
    if (text !== '') return sum + Math.round((Number(text.replace(/,/g, '')) || 0) * 100)
    return sum + (h.code === 'salary' ? payroll.get(`${month}|${branch}`)?.paise ?? 0 : 0)
  }, 0)

  if (loading) return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Loading expenses...</div>

  return (
    <div className="space-y-5">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>}

      {heads.length > 0 && (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Monthly Expenses</h2>
                <p className="mt-1 max-w-3xl text-sm text-gray-500">
                  Enter the full month’s amount in rupees. Use “{COMMON_BRANCH}” for head-office or shared costs such as loan interest. For salary, leave a cell blank to use Payroll gross pay; a typed amount (even 0) replaces Payroll for that branch only.
                  For loans, enter the interest only, not the principal repayment.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input type="month" aria-label="Expense month" value={month} disabled={busy} className={inputClass}
                  onChange={(e) => {
                    if (!e.target.value) return
                    if (changedKeys.length && !window.confirm('Discard unsaved changes?')) return
                    setMonth(e.target.value)
                  }} />
                {canEdit && (
                  <>
                    <button type="button" disabled={busy} onClick={() => void copyPrevious()} className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Copy previous month</button>
                    <button type="button" disabled={busy || !changedKeys.length} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      Save{changedKeys.length ? ` (${changedKeys.length})` : ''}
                    </button>
                  </>
                )}
              </div>
            </div>
            {!canEdit && <p className="mt-3 text-sm text-amber-700">You can view these amounts but not change them.</p>}
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="table-scroll-pane">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                    <th className="px-4 py-3 text-left">Expense head</th>
                    {PNL_BRANCHES.map((b) => <th key={b} className="px-2 py-3 text-right">{b}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {CATEGORIES.flatMap((category) => [
                    <tr key={category}><td colSpan={PNL_BRANCHES.length + 1} className="bg-gray-50 px-4 py-1.5 text-xs font-semibold uppercase text-gray-500">{category}</td></tr>,
                    ...activeHeads.filter((h) => h.category === category).map((h) => (
                      <tr key={h.id}>
                        <td className="px-4 py-1.5 text-sm text-gray-900">{h.name}</td>
                        {PNL_BRANCHES.map((b) => {
                          const pay = h.code === 'salary' ? payroll.get(`${month}|${b}`) : undefined
                          return (
                            <td key={b} className="px-2 py-1.5 text-right">
                              <input inputMode="decimal" aria-label={`${h.name}, ${b}`} disabled={!canEdit || busy}
                                value={draft[cellKey(h.id, b)] ?? ''}
                                placeholder={pay?.paise ? String(Math.round(pay.paise / 100)) : ''}
                                onChange={(e) => setDraft((d) => ({ ...d, [cellKey(h.id, b)]: e.target.value }))}
                                className={`${inputClass} w-28 text-right`} />
                              {pay?.paise ? <div className="text-[11px] text-gray-500">Payroll{pay.finalized ? '' : ' (draft)'}: {rupees(pay.paise)}</div> : null}
                            </td>
                          )
                        })}
                      </tr>
                    )),
                  ])}
                  <tr className="border-t-2 border-gray-300 bg-gray-50 text-sm font-semibold">
                    <td className="px-4 py-2">Month total</td>
                    {PNL_BRANCHES.map((b) => <td key={b} className="px-2 py-2 text-right">{rupees(columnTotal(b))}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {canEdit && settings && (
            <div className="grid gap-5 lg:grid-cols-2">
              <form className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                onSubmit={(e) => { e.preventDefault(); void run(() => savePnlSettings(settings), 'Margins saved. They apply to every period shown in the report.') }}>
                <h3 className="text-sm font-semibold text-gray-900">Profit margins</h3>
                <div className="flex flex-wrap gap-3">
                  {([['labourMarginPct', 'Labour profit %'], ['partsMarginPct', 'Parts profit %']] as const).map(([field, label]) => (
                    <label key={field} className="text-xs text-gray-600">{label}
                      <input type="number" min={0} max={100} step="0.01" required value={Number.isNaN(settings[field]) ? '' : settings[field]}
                        onChange={(e) => setSettings({ ...settings, [field]: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
                        className={`${inputClass} mt-1 block w-32`} />
                    </label>
                  ))}
                  <label className="text-xs text-gray-600">Calculate profit on
                    <select value={settings.revenueBasis} onChange={(e) => setSettings({ ...settings, revenueBasis: e.target.value as PnlSettings['revenueBasis'] })} className={`${inputClass} mt-1 block`}>
                      <option value="ex_gst">Revenue without GST (recommended)</option>
                      <option value="incl_gst">Billed amount with GST</option>
                    </select>
                  </label>
                </div>
                <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">Save margins</button>
              </form>

              <form className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!newHead.name.trim()) return
                  void run(async () => {
                    await addExpenseHead(newHead.name, newHead.category)
                    // Reload only the head list so unsaved amounts stay on screen.
                    setHeads(await getExpenseHeads())
                    setNewHead({ name: '', category: newHead.category })
                  }, 'Expense head added.')
                }}>
                <h3 className="text-sm font-semibold text-gray-900">Add an expense head</h3>
                <div className="flex flex-wrap gap-3">
                  <input aria-label="New expense head name" placeholder="Name" value={newHead.name} onChange={(e) => setNewHead({ ...newHead, name: e.target.value })} className={inputClass} />
                  <select aria-label="New expense head group" value={newHead.category} onChange={(e) => setNewHead({ ...newHead, category: e.target.value })} className={inputClass}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <button type="submit" disabled={busy || !newHead.name.trim()} className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50">Add</button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  )
}
