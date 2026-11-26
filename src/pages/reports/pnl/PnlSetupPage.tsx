import { useCallback, useEffect, useState } from 'react'
import { addExpenseHead, canModifyPnl, getExpenseHeads, getPnlSettings, getRecurringExpenses, savePnlSettings, saveRecurringExpense } from '../../../lib/api/pnl'
import { COMMON_BRANCH, PNL_BRANCHES, type ExpenseHead, type PnlSettings, type RecurringExpense } from '../../../lib/pnl/pnl'
import { cardClass, currentMonth, EXPENSE_CATEGORIES, monthName, parseAmount, rupees, inputClass, primaryButton, secondaryButton } from './format'
import { HeadOptions, Notices } from './shared'
import { useAction } from './useAction'

const blankForm = () => ({ id: undefined as number | undefined, headId: '', branch: '', amount: '', amountVaries: false, startMonth: currentMonth(), endMonth: '', note: '' })

export default function PnlSetupPage() {
  const [heads, setHeads] = useState<ExpenseHead[]>([])
  const [recurring, setRecurring] = useState<RecurringExpense[]>([])
  const [settings, setSettings] = useState<PnlSettings | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState(blankForm)
  const [newHead, setNewHead] = useState({ name: '', category: 'Admin' })
  const { busy, error, message, run, setError } = useAction()

  useEffect(() => {
    let active = true
    getPnlSettings()
      .then(async (loadedSettings) => {
        const [h, r, editable] = await Promise.all([getExpenseHeads(), getRecurringExpenses(), canModifyPnl()])
        if (!active) return
        setSettings(loadedSettings)
        setHeads(h)
        setRecurring(r)
        setCanEdit(editable)
      })
      .catch((err: Error) => { if (active) setLoadError(err.message) })
    return () => { active = false }
  }, [])

  const reloadRecurring = useCallback(async () => setRecurring(await getRecurringExpenses()), [])
  const headName = (id: number) => heads.find((h) => h.id === id)?.name ?? 'Unknown'

  const submitRecurring = async () => {
    const amount = parseAmount(form.amount)
    if (!form.headId || !form.branch) return setError('Choose the expense type and branch.')
    if (amount === null) return setError('Enter the usual monthly amount in rupees.')
    if (!form.startMonth) return setError('Choose the first month.')
    if (form.endMonth && form.endMonth < form.startMonth) return setError('The last month cannot be before the first month.')
    const existing = recurring.find((r) => r.id === form.id)
    const ok = await run(async () => {
      await saveRecurringExpense({
        headId: Number(form.headId), branch: form.branch, amount, amountVaries: form.amountVaries,
        startMonth: form.startMonth, endMonth: form.endMonth || null, note: form.note, isActive: existing?.isActive ?? true,
      }, form.id)
      await reloadRecurring()
    }, 'Saved. Confirm it each month in the Expenses tab; it counts only after confirmation.')
    if (ok) setForm(blankForm())
  }

  const setActive = (t: RecurringExpense, isActive: boolean) => {
    void run(async () => {
      await saveRecurringExpense({ ...t, isActive }, t.id)
      await reloadRecurring()
    }, isActive ? 'Restarted.' : 'Stopped. Months already confirmed are unchanged.')
  }

  if (loadError) return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Failed to load: {loadError}</div>
  if (!settings) return <div className={`${cardClass} text-sm text-gray-500`}>Loading...</div>

  // A repeating expense keeps its type and branch once created, so months already confirmed stay consistent.
  const locked = form.id !== undefined

  return (
    <div className="space-y-5">
      <Notices error={error} message={message} />
      {!canEdit && <p className="text-sm text-amber-700">You can view these settings but not change them.</p>}

      <div className={`${cardClass} space-y-4`}>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Repeating expenses</h2>
          <p className="mt-1 text-sm text-gray-500">Set up rent, loan interest and other regular costs once. Each month they wait for your confirmation. Salary comes from Payroll.</p>
        </div>
        {canEdit && (
          <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void submitRecurring() }}>
            <label className="text-xs text-gray-600">Expense type
              <select disabled={locked} value={form.headId} onChange={(e) => setForm({ ...form, headId: e.target.value })} className={`${inputClass} mt-1 block w-full`}>
                <HeadOptions heads={heads.filter((h) => h.code !== 'salary' && (h.isActive || String(h.id) === form.headId))} />
              </select>
            </label>
            <label className="text-xs text-gray-600">Branch
              <select disabled={locked} value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className={`${inputClass} mt-1 block w-full`}>
                <option value="">Select…</option>
                {PNL_BRANCHES.map((b) => <option key={b} value={b}>{b === COMMON_BRANCH ? 'Common (shared)' : b}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-600">Usual monthly amount (Rs.)
              <input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={`${inputClass} mt-1 block w-full text-right`} />
            </label>
            <label className="text-xs text-gray-600">Amount type
              <select value={form.amountVaries ? 'varies' : 'fixed'} onChange={(e) => setForm({ ...form, amountVaries: e.target.value === 'varies' })} className={`${inputClass} mt-1 block w-full`}>
                <option value="fixed">Same every month</option>
                <option value="varies">Changes (type the bill each month)</option>
              </select>
            </label>
            <label className="text-xs text-gray-600">First month
              <input type="month" value={form.startMonth} onChange={(e) => setForm({ ...form, startMonth: e.target.value })} className={`${inputClass} mt-1 block w-full`} />
            </label>
            <label className="text-xs text-gray-600">Last month (blank = continues)
              <input type="month" value={form.endMonth} onChange={(e) => setForm({ ...form, endMonth: e.target.value })} className={`${inputClass} mt-1 block w-full`} />
            </label>
            <label className="text-xs text-gray-600">Note (optional)
              <input maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Landlord, lender…" className={`${inputClass} mt-1 block w-full`} />
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className={primaryButton}>{locked ? 'Save changes' : 'Add repeating expense'}</button>
              {locked && <button type="button" onClick={() => setForm(blankForm())} className={secondaryButton}>Close</button>}
            </div>
          </form>
        )}
        {recurring.length === 0 ? <p className="text-sm text-gray-500">None yet.</p> : (
          <ul className="divide-y divide-gray-100">
            {recurring.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className={`min-w-56 flex-1 ${t.isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                  {headName(t.headId)} · {t.branch}{t.note ? ` · ${t.note}` : ''}{t.isActive ? '' : ' (stopped)'}
                  <span className="block text-xs text-gray-500">{monthName(t.startMonth)} to {t.endMonth ? monthName(t.endMonth) : 'continuing'} · {t.amountVaries ? 'changes monthly' : 'same every month'}</span>
                </span>
                <span className="w-32 text-right font-medium">{rupees(Math.round(t.amount * 100))}</span>
                {canEdit && (
                  <span className="flex gap-3 text-blue-700">
                    <button type="button" onClick={() => setForm({ id: t.id, headId: String(t.headId), branch: t.branch, amount: String(t.amount), amountVaries: t.amountVaries, startMonth: t.startMonth, endMonth: t.endMonth ?? '', note: t.note ?? '' })}>Edit</button>
                    <button type="button" disabled={busy} onClick={() => setActive(t, !t.isActive)}>{t.isActive ? 'Stop' : 'Restart'}</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && (
        <div className="grid gap-5 lg:grid-cols-2">
          <form className={`${cardClass} space-y-3`} onSubmit={(e) => { e.preventDefault(); void run(() => savePnlSettings(settings), 'Margins saved. They apply to every period shown in the report.') }}>
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
            <button type="submit" disabled={busy} className={primaryButton}>Save margins</button>
          </form>

          <form className={`${cardClass} space-y-3`}
            onSubmit={(e) => {
              e.preventDefault()
              if (!newHead.name.trim()) return
              void run(async () => {
                await addExpenseHead(newHead.name, newHead.category)
                setHeads(await getExpenseHeads())
                setNewHead({ name: '', category: newHead.category })
              }, 'Expense type added.')
            }}>
            <h3 className="text-sm font-semibold text-gray-900">Add an expense type</h3>
            <div className="flex flex-wrap gap-3">
              <input aria-label="New expense type name" placeholder="Name" value={newHead.name} onChange={(e) => setNewHead({ ...newHead, name: e.target.value })} className={inputClass} />
              <select aria-label="New expense type group" value={newHead.category} onChange={(e) => setNewHead({ ...newHead, category: e.target.value })} className={inputClass}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <button type="submit" disabled={busy || !newHead.name.trim()} className={secondaryButton}>Add</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
