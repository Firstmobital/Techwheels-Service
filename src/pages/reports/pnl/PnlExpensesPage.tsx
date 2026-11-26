import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addExpenseEntries, canModifyPnl, cancelExpenseEntry, editExpenseEntry, getEntryHistory, getExpenseHeads, getExpenses,
  getRecurringExpenses, type EntryChange, type ExpenseEntryRow,
} from '../../../lib/api/pnl'
import { loadSalaryInputs } from '../../../lib/api/pnlSalary'
import {
  chooseSalary, COMMON_BRANCH, payrollByMonthBranch, pendingRecurring, PNL_BRANCHES,
  type ExpenseHead, type RecurringExpense, type SalaryChoice,
} from '../../../lib/pnl/pnl'
import { cardClass, currentMonth, monthName, parseAmount, rupees, inputClass, primaryButton, secondaryButton } from './format'
import { HeadOptions, Notices } from './shared'
import { useAction } from './useAction'

interface MonthData {
  month: string
  heads: ExpenseHead[]
  entries: ExpenseEntryRow[]
  recurring: RecurringExpense[]
  salary: SalaryChoice | null
  liveProblem: string | null
  canEdit: boolean
}

async function loadMonth(month: string): Promise<MonthData> {
  const [heads, entries, recurring, pay, canEdit] = await Promise.all([
    getExpenseHeads(),
    getExpenses(month, month, true),
    getRecurringExpenses(),
    loadSalaryInputs([month], currentMonth()),
    canModifyPnl(),
  ])
  const salary = chooseSalary(month, payrollByMonthBranch(pay.payroll), pay.live[month])
  return { month, heads, entries, recurring, salary, liveProblem: pay.liveProblem, canEdit }
}

export default function PnlExpensesPage() {
  const [month, setMonth] = useState(currentMonth)
  const [data, setData] = useState<MonthData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const action = useAction()
  const { clear } = action

  useEffect(() => {
    let active = true
    setLoadError(null)
    loadMonth(month)
      .then((loaded) => { if (active) setData(loaded) })
      .catch((err: Error) => { if (active) { setData(null); setLoadError(err.message) } })
    return () => { active = false }
  }, [month, version])

  useEffect(() => { clear() }, [month, clear])

  /** Saves, then reloads so every list reflects what the database accepted. */
  const save = useCallback(async (change: () => Promise<void>, done: string) => {
    const ok = await action.run(change, done)
    setVersion((v) => v + 1)
    return ok
  }, [action])

  if (loadError) return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Failed to load expenses: {loadError}</div>
  const ready = data && data.month === month ? data : null

  return (
    <div className="space-y-5">
      <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Expenses for {monthName(month)}</h2>
          <p className="mt-1 text-sm text-gray-500">Record each cost in the month it belongs to, even if it is paid later.</p>
        </div>
        <label className="text-xs font-medium text-gray-600">Month the cost belongs to
          <input type="month" value={month} disabled={action.busy} onChange={(e) => { if (e.target.value) setMonth(e.target.value) }} className={`${inputClass} mt-1 block`} />
        </label>
      </div>

      <Notices error={action.error} message={action.message} />
      {ready?.liveProblem && <p className="text-sm text-amber-800">{ready.liveProblem}</p>}

      {!ready ? (
        <div className={`${cardClass} text-sm text-gray-500`}>Loading expenses...</div>
      ) : (
        <>
          {ready.canEdit
            ? <AddExpenseForm data={ready} busy={action.busy} save={save} />
            : <p className="text-sm text-amber-700">You can view expenses but not change them.</p>}
          <PendingList key={`pending-${month}`} data={ready} busy={action.busy} save={save} setError={action.setError} />
          <EntryList key={`entries-${month}`} data={ready} busy={action.busy} save={save} setError={action.setError} />
          <MonthSummary data={ready} />
        </>
      )}
    </div>
  )
}

interface SectionProps {
  data: MonthData
  busy: boolean
  save: (change: () => Promise<void>, done: string) => Promise<boolean>
}

const SALARY_LABEL = { payroll: 'finalized Payroll', live: 'calculated now from Payroll data', estimate: 'estimate', draft: 'saved Payroll draft' }

/** The figure the P&L uses when no salary is typed: base pay for the month plus work-based pay so far. */
function salaryFor(data: MonthData, branch: string): { paise: number; label: string } | null {
  const pay = data.salary?.branches.get(branch)
  if (!data.salary || !pay) return null
  const label = data.salary.basis === 'estimate' ? `estimate from ${monthName(data.salary.sourceMonth)}` : SALARY_LABEL[data.salary.basis]
  return { paise: pay.monthlyPaise + pay.toDatePaise, label }
}

function AddExpenseForm({ data, busy, save }: SectionProps) {
  const [headId, setHeadId] = useState('')
  const [branch, setBranch] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const headRef = useRef<HTMLSelectElement>(null)
  const activeHeads = data.heads.filter((h) => h.isActive)
  const head = activeHeads.find((h) => String(h.id) === headId)
  const salary = head?.code === 'salary' && branch ? salaryFor(data, branch) : null

  const submit = async () => {
    const value = parseAmount(amount)
    if (!head || !branch) return setProblem('Choose the expense type and branch.')
    if (value === null) return setProblem('Enter the amount in rupees, for example 125000 or 1,25,000.50.')
    const same = data.entries.filter((e) => e.status === 'active' && e.headId === head.id && e.branch === branch)
    if (same.length) {
      const total = same.reduce((sum, e) => sum + Math.round(e.amount * 100), 0)
      if (!window.confirm(`${head.name} for ${branch} already has ${rupees(total)} this month. Add ${rupees(Math.round(value * 100))} more?`)) return
    }
    setProblem(null)
    const ok = await save(
      () => addExpenseEntries([{ month: data.month, branch, headId: head.id, amount: value, note }]),
      `Saved ${head.name}, ${branch}: ${rupees(Math.round(value * 100))}.`,
    )
    if (ok) {
      setHeadId('')
      setAmount('')
      setNote('')
      headRef.current?.focus()
    }
  }

  return (
    <form className={`${cardClass} space-y-3`} onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <h3 className="text-sm font-semibold text-gray-900">Add expense</h3>
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_2fr_auto]">
        <label className="text-xs text-gray-600">Expense type
          <select ref={headRef} value={headId} onChange={(e) => setHeadId(e.target.value)} className={`${inputClass} mt-1 block w-full`}><HeadOptions heads={activeHeads} /></select>
        </label>
        <label className="text-xs text-gray-600">Branch
          <select value={branch} onChange={(e) => setBranch(e.target.value)} className={`${inputClass} mt-1 block w-full`}>
            <option value="">Select…</option>
            {PNL_BRANCHES.map((b) => <option key={b} value={b}>{b === COMMON_BRANCH ? 'Common (shared)' : b}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">Amount (Rs.)
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputClass} mt-1 block w-full text-right`} />
        </label>
        <label className="text-xs text-gray-600">Note (optional)
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Bill number, vendor…" className={`${inputClass} mt-1 block w-full`} />
        </label>
        <button type="submit" disabled={busy} className={primaryButton}>Save and add another</button>
      </div>
      {salary && (
        <p className="text-sm text-amber-800">
          A salary entry replaces the figure ({salary.label}) of {rupees(salary.paise)} for {branch}. Enter the full month’s salary here. For extra payments, choose “Incentives paid outside Payroll”.
        </p>
      )}
      {problem && <p className="text-sm text-red-700">{problem}</p>}
    </form>
  )
}

function PendingList({ data, busy, save, setError }: SectionProps & { setError: (message: string) => void }) {
  const [typed, setTyped] = useState<Record<number, string>>({})
  const active = data.entries.filter((e) => e.status === 'active')
  const pending = pendingRecurring(data.recurring, active, data.month, PNL_BRANCHES)
  const headName = (id: number) => data.heads.find((h) => h.id === id)?.name ?? 'Unknown'
  const textFor = (t: RecurringExpense) => typed[t.id] ?? (t.amountVaries ? '' : String(t.amount))
  const fixed = pending.filter((t) => !t.amountVaries && typed[t.id] === undefined)
  // Salary is excluded: Payroll or its estimate covers it.
  const missingCore = data.heads.filter(
    (h) => h.isCore && h.isActive && h.code !== 'salary' && !active.some((e) => e.headId === h.id) && !pending.some((t) => t.headId === h.id),
  )
  const toEntry = (t: RecurringExpense, amount: number) => ({ month: data.month, branch: t.branch, headId: t.headId, amount, note: t.note, recurringId: t.id })

  const confirmOne = (t: RecurringExpense) => {
    const amount = parseAmount(textFor(t))
    if (amount === null) return setError(`Enter this month’s amount for ${headName(t.headId)}, ${t.branch}.`)
    void save(() => addExpenseEntries([toEntry(t, amount)]), `Confirmed ${headName(t.headId)}, ${t.branch}.`)
  }

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Pending this month ({pending.length})</h3>
        {data.canEdit && fixed.length > 1 && (
          <button type="button" disabled={busy} className={secondaryButton}
            onClick={() => {
              const total = fixed.reduce((sum, t) => sum + Math.round(t.amount * 100), 0)
              if (window.confirm(`Confirm ${fixed.length} fixed expenses totalling ${rupees(total)} for ${monthName(data.month)}?`)) {
                void save(() => addExpenseEntries(fixed.map((t) => toEntry(t, t.amount))), `Confirmed ${fixed.length} fixed expenses.`)
              }
            }}>
            Confirm all fixed ({fixed.length})
          </button>
        )}
      </div>
      {pending.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">
          {data.recurring.length ? 'All repeating expenses for this month are confirmed.' : 'No repeating expenses yet. Add rent, interest and other regular costs in the “Repeating & Settings” tab.'}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100">
          {pending.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="min-w-56 flex-1 text-gray-900">
                {headName(t.headId)} · {t.branch}
                {t.note ? <span className="text-gray-500"> · {t.note}</span> : null}
              </span>
              <span className="text-xs text-gray-500">{t.amountVaries ? `Type the bill amount (usually ${rupees(Math.round(t.amount * 100))})` : 'Fixed'}</span>
              {data.canEdit && (
                <>
                  <input inputMode="decimal" aria-label={`Amount for ${headName(t.headId)}, ${t.branch}`} value={textFor(t)} onChange={(e) => setTyped((v) => ({ ...v, [t.id]: e.target.value }))} className={`${inputClass} w-32 text-right`} />
                  <button type="button" disabled={busy} onClick={() => confirmOne(t)} className={primaryButton}>Confirm</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {missingCore.length > 0 && (
        <p className="mt-3 text-sm text-amber-800">Nothing entered or set to repeat for: {missingCore.map((h) => h.name).join(', ')}.</p>
      )}
    </div>
  )
}

function EntryList({ data, busy, save, setError }: SectionProps & { setError: (message: string) => void }) {
  const [branchFilter, setBranchFilter] = useState('ALL')
  const [showCancelled, setShowCancelled] = useState(false)
  const [editing, setEditing] = useState<{ id: number; month: string; branch: string; headId: string; amount: string; note: string } | null>(null)
  const [cancelling, setCancelling] = useState<{ id: number; reason: string } | null>(null)
  const [history, setHistory] = useState<{ id: number; changes: EntryChange[] } | null>(null)
  const headName = (id: number) => data.heads.find((h) => h.id === id)?.name ?? 'Unknown'
  const rows = data.entries
    .filter((e) => (showCancelled || e.status === 'active') && (branchFilter === 'ALL' || e.branch === branchFilter))
    .sort((a, b) => b.id - a.id)
  const total = rows.reduce((sum, e) => sum + (e.status === 'active' ? Math.round(e.amount * 100) : 0), 0)

  const saveEdit = async () => {
    if (!editing) return
    const amount = parseAmount(editing.amount)
    if (amount === null) return setError('Enter a valid amount in rupees.')
    const ok = await save(
      () => editExpenseEntry(editing.id, { month: editing.month, branch: editing.branch, headId: Number(editing.headId), amount, note: editing.note }),
      'Entry updated.',
    )
    if (ok) { setEditing(null); setHistory(null) }
  }

  const toggleHistory = (id: number) => {
    if (history?.id === id) return setHistory(null)
    getEntryHistory(id).then((changes) => setHistory({ id, changes })).catch((err: Error) => setError(err.message))
  }

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">Entries ({rows.length}) · {rupees(total)}</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />Show cancelled</label>
          <select aria-label="Filter entries by branch" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputClass}>
            <option value="ALL">All branches</option>
            {PNL_BRANCHES.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
      </div>
      {rows.length === 0 ? <p className="mt-2 text-sm text-gray-500">No entries yet.</p> : (
        <ul className="mt-2 divide-y divide-gray-100">
          {rows.map((e) => (
            <li key={e.id} className="py-2 text-sm">
              {editing?.id === e.id ? (
                <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void saveEdit() }}>
                  {e.recurringId === null && (
                    <>
                      <select aria-label="Expense type" value={editing.headId} onChange={(ev) => setEditing({ ...editing, headId: ev.target.value })} className={inputClass}>
                        <HeadOptions heads={data.heads.filter((h) => h.isActive || h.id === e.headId)} />
                      </select>
                      <select aria-label="Branch" value={editing.branch} onChange={(ev) => setEditing({ ...editing, branch: ev.target.value })} className={inputClass}>
                        {PNL_BRANCHES.map((b) => <option key={b}>{b}</option>)}
                      </select>
                      <input type="month" aria-label="Month" value={editing.month} required onChange={(ev) => setEditing({ ...editing, month: ev.target.value })} className={inputClass} />
                    </>
                  )}
                  <input inputMode="decimal" aria-label="Amount" value={editing.amount} onChange={(ev) => setEditing({ ...editing, amount: ev.target.value })} className={`${inputClass} w-32 text-right`} />
                  <input aria-label="Note" maxLength={300} value={editing.note} onChange={(ev) => setEditing({ ...editing, note: ev.target.value })} className={`${inputClass} flex-1`} />
                  <button type="submit" disabled={busy || !editing.headId} className={primaryButton}>Save</button>
                  <button type="button" onClick={() => setEditing(null)} className={secondaryButton}>Close</button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`min-w-56 flex-1 ${e.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {headName(e.headId)} · {e.branch}
                    {e.recurringId !== null ? <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">repeating</span> : null}
                    {e.note ? <span className="text-gray-500"> · {e.note}</span> : null}
                  </span>
                  <span className={`w-32 text-right font-medium ${e.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{rupees(Math.round(e.amount * 100))}</span>
                  <span className="flex gap-3 text-sm text-blue-700">
                    {data.canEdit && e.status === 'active' && (
                      <>
                        <button type="button" onClick={() => { setCancelling(null); setEditing({ id: e.id, month: e.month, branch: e.branch, headId: String(e.headId), amount: String(e.amount), note: e.note ?? '' }) }}>Edit</button>
                        <button type="button" onClick={() => { setEditing(null); setCancelling({ id: e.id, reason: '' }) }}>Cancel entry</button>
                      </>
                    )}
                    <button type="button" onClick={() => toggleHistory(e.id)}>History</button>
                  </span>
                </div>
              )}
              {e.status === 'cancelled' && <p className="text-xs text-gray-500">Cancelled: {e.cancelReason}</p>}
              {cancelling?.id === e.id && (
                <form className="mt-2 flex flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void save(() => cancelExpenseEntry(e.id, cancelling.reason), 'Entry cancelled. It no longer counts in the P&L.').then((ok) => { if (ok) { setCancelling(null); setHistory(null) } })
                  }}>
                  <input autoFocus aria-label="Reason for cancelling" placeholder="Reason for cancelling (required)" maxLength={300} value={cancelling.reason} onChange={(ev) => setCancelling({ ...cancelling, reason: ev.target.value })} className={`${inputClass} flex-1`} />
                  <button type="submit" disabled={busy || !cancelling.reason.trim()} className={primaryButton}>Cancel this entry</button>
                  <button type="button" onClick={() => setCancelling(null)} className={secondaryButton}>Keep it</button>
                </form>
              )}
              {history?.id === e.id && (
                <ul className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                  {history.changes.map((c, i) => (
                    <li key={i}>
                      {new Date(c.changedAt).toLocaleString('en-IN')}: {c.action}, {rupees(Math.round(c.amount * 100))}, {headName(c.headId)}, {c.branch}, {monthName(c.month)}{c.note ? `, “${c.note}”` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Read-only totals, including the salary the P&L will use for the full month. */
function MonthSummary({ data }: { data: MonthData }) {
  const cells = new Map<string, number>()
  for (const e of data.entries) {
    if (e.status !== 'active') continue
    const key = `${e.headId}|${e.branch}`
    cells.set(key, (cells.get(key) ?? 0) + Math.round(e.amount * 100))
  }
  const cell = (head: ExpenseHead, branch: string): { paise: number; label?: string } | null => {
    const entered = cells.get(`${head.id}|${branch}`)
    if (entered !== undefined) return { paise: entered }
    return head.code === 'salary' ? salaryFor(data, branch) : null
  }
  const rows = data.heads.filter((h) => PNL_BRANCHES.some((b) => cell(h, b)))

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <h3 className="px-4 py-3 text-sm font-semibold text-gray-900">Month summary (base pay for the full month; work-based salary so far)</h3>
      {rows.length === 0 ? <p className="px-4 pb-4 text-sm text-gray-500">Nothing to show yet.</p> : (
        <div className="table-scroll-pane">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                <th className="px-4 py-2 text-left">Expense type</th>
                {PNL_BRANCHES.map((b) => <th key={b} className="px-3 py-2 text-right">{b}</th>)}
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-2 text-gray-900">{h.name}</td>
                  {PNL_BRANCHES.map((b) => {
                    const c = cell(h, b)
                    return (
                      <td key={b} className="px-3 py-2 text-right text-gray-700">
                        {c ? rupees(c.paise) : '–'}
                        {c?.label ? <div className="text-[11px] text-amber-700">{c.label}</div> : null}
                      </td>
                    )
                  })}
                  <td className="px-4 py-2 text-right font-medium">{rupees(PNL_BRANCHES.reduce((sum, b) => sum + (cell(h, b)?.paise ?? 0), 0))}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                <td className="px-4 py-2">Total</td>
                {PNL_BRANCHES.map((b) => <td key={b} className="px-3 py-2 text-right">{rupees(rows.reduce((sum, h) => sum + (cell(h, b)?.paise ?? 0), 0))}</td>)}
                <td className="px-4 py-2 text-right">{rupees(rows.reduce((sum, h) => sum + PNL_BRANCHES.reduce((s, b) => s + (cell(h, b)?.paise ?? 0), 0), 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
