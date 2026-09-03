import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { createAdvance, fetchAdvanceSchedules, fetchAdvances, fetchPayrollEmployees } from '../../lib/api/payroll'
import { formatCurrency, parsePayrollMonthInput } from '../../lib/payroll/calculations'
import type { PayrollAdvance, PayrollAdvanceSchedule } from '../../lib/payroll/types'
import { supabase } from '../../lib/supabase'

interface Props {
  canModify: boolean
  payrollMonth: string
}

export default function AdvanceManagementTab({ canModify, payrollMonth }: Props) {
  const [advances, setAdvances] = useState<PayrollAdvance[]>([])
  const [schedules, setSchedules] = useState<PayrollAdvanceSchedule[]>([])
  const [employees, setEmployees] = useState<Awaited<ReturnType<typeof fetchPayrollEmployees>>>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [form, setForm] = useState({
    employeeCode: '',
    originalAmount: '',
    deductionType: 'emi' as 'lump_sum' | 'emi' | 'custom',
    emiMonths: '3',
    startMonth: payrollMonth.slice(0, 7),
    notes: '',
  })

  const reload = useCallback(async () => {
    try {
      const [adv, sched, emps] = await Promise.all([fetchAdvances(), fetchAdvanceSchedules(), fetchPayrollEmployees()])
      setAdvances(adv)
      setSchedules(sched)
      setEmployees(emps)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed')
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const empNameByCode = useMemo(() => {
    const m = new Map<string, string>()
    employees.forEach((e) => m.set(e.employee_code.trim().toUpperCase(), e.employee_name))
    return m
  }, [employees])

  const schedulesByAdvance = useMemo(() => {
    const m = new Map<number, PayrollAdvanceSchedule[]>()
    schedules.forEach((s) => {
      const list = m.get(s.advance_id) ?? []
      list.push(s)
      m.set(s.advance_id, list)
    })
    return m
  }, [schedules])

  function buildSchedulePreview(): Array<{ payrollMonth: string; scheduledAmount: number }> {
    const amount = Number(form.originalAmount)
    if (!Number.isFinite(amount) || amount <= 0) return []
    const start = parsePayrollMonthInput(form.startMonth)
    if (!start) return []

    if (form.deductionType === 'lump_sum') {
      return [{ payrollMonth: start, scheduledAmount: amount }]
    }

    const months = Math.max(1, Number(form.emiMonths) || 1)
    const perMonth = Math.round((amount / months) * 100) / 100
    const out: Array<{ payrollMonth: string; scheduledAmount: number }> = []
    const [y, m] = start.slice(0, 7).split('-').map(Number)
    for (let i = 0; i < months; i += 1) {
      const d = new Date(y, m - 1 + i, 1)
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      const schedAmount = i === months - 1
        ? Math.round((amount - perMonth * (months - 1)) * 100) / 100
        : perMonth
      out.push({ payrollMonth: monthStr, scheduledAmount: schedAmount })
    }
    return out
  }

  async function handleIssueAdvance() {
    if (!canModify) return
    setError(null)
    const amount = Number(form.originalAmount)
    if (!form.employeeCode || !Number.isFinite(amount) || amount <= 0) {
      setError('Employee and valid amount required')
      return
    }
    const schedulePreview = buildSchedulePreview()
    if (schedulePreview.length === 0) {
      setError('Invalid schedule')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    try {
      await createAdvance({
        employeeCode: form.employeeCode.trim().toUpperCase(),
        originalAmount: amount,
        deductionType: form.deductionType,
        notes: form.notes || undefined,
        createdBy: user?.email ?? 'unknown',
        schedules: schedulePreview,
      })
      setMessage('Advance issued')
      setForm((prev) => ({ ...prev, originalAmount: '', notes: '' }))
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue advance')
    }
  }

  return (
    <div>
      {canModify && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>Issue Advance</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <select value={form.employeeCode} onChange={(ev) => setForm((p) => ({ ...p, employeeCode: ev.target.value }))}>
              <option value="">Select employee…</option>
              {employees.map((e) => <option key={e.employee_code} value={e.employee_code}>{e.employee_code} — {e.employee_name}</option>)}
            </select>
            <input placeholder="Amount" type="number" value={form.originalAmount} onChange={(ev) => setForm((p) => ({ ...p, originalAmount: ev.target.value }))} />
            <select value={form.deductionType} onChange={(ev) => setForm((p) => ({ ...p, deductionType: ev.target.value as typeof form.deductionType }))}>
              <option value="lump_sum">Lump Sum</option>
              <option value="emi">EMI</option>
              <option value="custom">Custom (preview below)</option>
            </select>
            {form.deductionType === 'emi' && (
              <input type="number" min={1} value={form.emiMonths} onChange={(ev) => setForm((p) => ({ ...p, emiMonths: ev.target.value }))} style={{ width: '60px' }} />
            )}
            <input type="month" value={form.startMonth} onChange={(ev) => setForm((p) => ({ ...p, startMonth: ev.target.value }))} />
            <input placeholder="Notes" value={form.notes} onChange={(ev) => setForm((p) => ({ ...p, notes: ev.target.value }))} />
            <button type="button" className="btn btn--primary btn--sm" onClick={() => void handleIssueAdvance()}>Issue</button>
          </div>
          {buildSchedulePreview().length > 0 && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#475569' }}>
              Schedule preview: {buildSchedulePreview().map((s) => `${s.payrollMonth.slice(0, 7)}: ${formatCurrency(s.scheduledAmount)}`).join(' · ')}
            </div>
          )}
        </div>
      )}

      {error && <div className="toast error">{error}</div>}
      {message && <div className="toast">{message}</div>}

      <table className="table" style={{ fontSize: '0.78rem', width: '100%' }}>
        <thead>
          <tr>
            <th>Employee</th><th>Issue Date</th><th>Original</th><th>Recovered</th><th>Balance</th><th>Type</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {advances.map((a) => {
            const balance = Number(a.original_amount) - Number(a.recovered_amount)
            const code = a.employee_code.trim().toUpperCase()
            return (
              <Fragment key={a.id}>
                <tr>
                  <td>{code} — {empNameByCode.get(code) ?? ''}</td>
                  <td>{a.issue_date}</td>
                  <td>{formatCurrency(Number(a.original_amount))}</td>
                  <td>{formatCurrency(Number(a.recovered_amount))}</td>
                  <td>{formatCurrency(balance)}</td>
                  <td>{a.deduction_type}</td>
                  <td>{a.status}</td>
                  <td>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                      {expandedId === a.id ? 'Hide' : 'Schedule'}
                    </button>
                  </td>
                </tr>
                {expandedId === a.id && (
                  <tr>
                    <td colSpan={8}>
                      <table className="table" style={{ fontSize: '0.72rem', margin: '0.25rem 0' }}>
                        <thead><tr><th>Month</th><th>Scheduled</th><th>Applied</th><th>Status</th></tr></thead>
                        <tbody>
                          {(schedulesByAdvance.get(a.id) ?? []).map((s) => (
                            <tr key={s.id}>
                              <td>{s.payroll_month.slice(0, 7)}</td>
                              <td>{formatCurrency(Number(s.scheduled_amount))}</td>
                              <td>{formatCurrency(Number(s.applied_amount))}</td>
                              <td>{s.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
