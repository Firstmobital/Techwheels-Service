import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addPayrollAdjustment,
  fetchPayrollEmployees,
  fetchPayrollEntries,
  fetchPayrollMonth,
  finalizePayrollMonth,
  recomputePayrollMonth,
  unlockPayrollMonth,
} from '../../lib/api/payroll'
import { formatCurrency } from '../../lib/payroll/calculations'
import { resolvePayrollEntryIdentity } from '../../lib/payroll/entryIdentity'
import { exportWorkbookWithTextAccounts } from '../../lib/payroll/excelUtils'
import { SALARY_TYPE_LABELS, type PayrollEntry } from '../../lib/payroll/types'
import { supabase } from '../../lib/supabase'

interface Props {
  payrollMonth: string
  monthInput: string
  onMonthChange: (value: string) => void
  canModify: boolean
  canDelete: boolean
}

export default function PayrollProcessingTab({
  payrollMonth, monthInput, onMonthChange, canModify, canDelete,
}: Props) {
  const [entries, setEntries] = useState<PayrollEntry[]>([])
  const [employees, setEmployees] = useState<Awaited<ReturnType<typeof fetchPayrollEmployees>>>([])
  const [monthStatus, setMonthStatus] = useState<'draft' | 'finalized'>('draft')
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [salaryTypeFilter, setSalaryTypeFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [unlockReason, setUnlockReason] = useState('')
  const [adjForm, setAdjForm] = useState<{ entryId: number; type: 'addition' | 'deduction'; amount: string; reason: string } | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ents, emps, monthState] = await Promise.all([
        fetchPayrollEntries(payrollMonth),
        fetchPayrollEmployees(),
        fetchPayrollMonth(payrollMonth),
      ])
      setEntries(ents)
      setEmployees(emps)
      setMonthStatus(monthState?.status ?? 'draft')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [payrollMonth])

  useEffect(() => { void reload() }, [reload])

  // Live employee_master is used only as a legacy NULL-snapshot fallback.
  // Historical row existence, filters, KPIs, and display use payroll entry snapshots.
  const empByCode = useMemo(() => {
    const m = new Map<string, (typeof employees)[0]>()
    employees.forEach((e) => m.set(e.employee_code.trim().toUpperCase(), e))
    return m
  }, [employees])

  const identityByCode = useMemo(() => {
    const m = new Map<string, ReturnType<typeof resolvePayrollEntryIdentity>>()
    entries.forEach((entry) => {
      const code = entry.employee_code.trim().toUpperCase()
      m.set(code, resolvePayrollEntryIdentity(entry, empByCode.get(code)))
    })
    return m
  }, [entries, empByCode])

  const depts = useMemo(() => Array.from(new Set(
    entries.map((entry) => identityByCode.get(entry.employee_code.trim().toUpperCase())?.department?.trim()).filter(Boolean),
  )).sort(), [entries, identityByCode])
  const branches = useMemo(() => Array.from(new Set(
    entries.map((entry) => identityByCode.get(entry.employee_code.trim().toUpperCase())?.branch?.trim()).filter(Boolean),
  )).sort(), [entries, identityByCode])

  const aggregateScopedRows = useMemo(() => entries.filter((entry) => {
    const identity = identityByCode.get(entry.employee_code.trim().toUpperCase())
    if (deptFilter !== 'all' && (identity?.department?.trim() ?? '') !== deptFilter) return false
    if (branchFilter !== 'all' && (identity?.branch?.trim() ?? '') !== branchFilter) return false
    if (salaryTypeFilter !== 'all' && entry.salary_type_snapshot !== salaryTypeFilter) return false
    return true
  }), [entries, identityByCode, deptFilter, branchFilter, salaryTypeFilter])

  const tableRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return aggregateScopedRows
    return aggregateScopedRows.filter((entry) => {
      const identity = identityByCode.get(entry.employee_code.trim().toUpperCase())
      return `${identity?.employeeName ?? ''} ${entry.employee_code}`.toLowerCase().includes(term)
    })
  }, [aggregateScopedRows, identityByCode, search])

  const totals = useMemo(() => aggregateScopedRows.reduce((acc, e) => {
    acc.employeeCount += 1
    acc.gross += Number(e.gross_payout)
    acc.advance += Number(e.advance_deduction)
    acc.earnedBase += Number(e.earned_base)
    acc.saVariable += Number(e.sa_variable_earning)
    acc.technicianVariable += Number(e.technician_variable_earning)
    acc.net += Number(e.net_payable)
    return acc
  }, {
    employeeCount: 0,
    gross: 0,
    advance: 0,
    earnedBase: 0,
    saVariable: 0,
    technicianVariable: 0,
    net: 0,
  }), [aggregateScopedRows])

  const statusBadgeStyle = {
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.72rem',
    fontWeight: 700,
    background: monthStatus === 'finalized' ? '#dcfce7' : '#fef9c3',
    color: monthStatus === 'finalized' ? '#166534' : '#854d0e',
  } as const

  async function handleRecompute() {
    if (!canModify || monthStatus === 'finalized') return
    setLoading(true)
    try {
      await recomputePayrollMonth(payrollMonth)
      await reload()
      setMessage('Payroll recomputed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recompute failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleFinalize() {
    if (!canModify || monthStatus === 'finalized') return
    if (!window.confirm('Finalize and lock this payroll month?')) return
    const { data: { user } } = await supabase.auth.getUser()
    setLoading(true)
    try {
      await finalizePayrollMonth(payrollMonth, user?.email ?? 'unknown')
      await reload()
      setMessage('Payroll finalized and locked')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Finalize failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleUnlock() {
    if (!canDelete || !unlockReason.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    setLoading(true)
    try {
      await unlockPayrollMonth(payrollMonth, unlockReason.trim(), user?.email ?? 'unknown')
      setUnlockReason('')
      await reload()
      setMessage('Payroll month unlocked')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdjustment() {
    if (!adjForm || !canModify || monthStatus === 'finalized') return
    if (!adjForm.reason.trim()) {
      setError('Adjustment reason is required')
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    try {
      await addPayrollAdjustment({
        payrollEntryId: adjForm.entryId,
        adjustmentType: adjForm.type,
        amount: Number(adjForm.amount),
        reason: adjForm.reason.trim(),
        actor: user?.email ?? 'unknown',
      })
      setAdjForm(null)
      await reload()
      setMessage('Adjustment applied')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adjustment failed')
    }
  }

  function exportBankPayout() {
    if (monthStatus !== 'finalized') {
      setError('Bank payout export requires finalized payroll')
      return
    }
    const headers = ['Employee Code', 'Employee Name', 'Net Payable', 'Bank Name', 'Account Number', 'IFSC']
    const rows = tableRows
      .filter((e) => Number(e.net_payable) > 0)
      .map((e) => {
        const identity = identityByCode.get(e.employee_code.trim().toUpperCase())
        return [
          e.employee_code,
          identity?.employeeName ?? e.employee_code,
          e.net_payable,
          identity?.bankName ?? '',
          identity?.accountNumber ?? '',
          identity?.ifsc ?? '',
        ]
      })
    exportWorkbookWithTextAccounts('Bank Payout', headers, rows, `Payroll_Bank_Payout_${monthInput}.xlsx`, [4])
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Month</label>
        <input type="month" value={monthInput} onChange={(ev) => onMonthChange(ev.target.value)} />
        <input placeholder="Search…" value={search} onChange={(ev) => setSearch(ev.target.value)} />
        <select value={deptFilter} onChange={(ev) => setDeptFilter(ev.target.value)}><option value="all">All departments</option>{depts.map((d) => <option key={d} value={d!}>{d}</option>)}</select>
        <select value={branchFilter} onChange={(ev) => setBranchFilter(ev.target.value)}><option value="all">All branches</option>{branches.map((b) => <option key={b} value={b!}>{b}</option>)}</select>
        <select value={salaryTypeFilter} onChange={(ev) => setSalaryTypeFilter(ev.target.value)}>
          <option value="all">All salary types</option>
          <option value="base">Base</option><option value="variable">Variable</option><option value="both">Both</option>
        </select>
        <span style={statusBadgeStyle}>
          {monthStatus === 'finalized' ? 'FINALIZED' : 'DRAFT'}
        </span>
        <span style={{ flex: 1 }} />
        {canModify && monthStatus !== 'finalized' && (
          <button type="button" className="btn btn--ghost btn--sm" disabled={loading} onClick={() => void handleRecompute()}>Recompute Payroll</button>
        )}
        {canModify && monthStatus !== 'finalized' && (
          <button type="button" className="btn btn--primary btn--sm" disabled={loading} onClick={() => void handleFinalize()}>Finalize / Lock</button>
        )}
        {monthStatus === 'finalized' && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={exportBankPayout}>Bank Payout Export</button>
        )}
      </div>

      {canDelete && monthStatus === 'finalized' && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
          <input placeholder="Unlock reason (required)" value={unlockReason} onChange={(ev) => setUnlockReason(ev.target.value)} style={{ flex: 1 }} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void handleUnlock()}>Unlock Month</button>
        </div>
      )}

      {error && <div className="toast error">{error}</div>}
      {message && <div className="toast">{message}</div>}

      <div className="kpis payroll-kpis">
        <div className="kpi">
          <div className="kpi__val">{totals.employeeCount}</div>
          <div className="kpi__lab">Total Employees</div>
        </div>
        <div className="kpi">
          <div className="kpi__val">{formatCurrency(totals.gross)}</div>
          <div className="kpi__lab">Total Gross</div>
        </div>
        <div className="kpi">
          <div className="kpi__val">{formatCurrency(totals.advance)}</div>
          <div className="kpi__lab">Total Advance Deducted</div>
        </div>
        <div className="kpi">
          <div className="kpi__val">
            <span style={statusBadgeStyle}>{monthStatus === 'finalized' ? 'FINALIZED' : 'DRAFT'}</span>
          </div>
          <div className="kpi__lab">Status</div>
        </div>
        <div className="kpi">
          <div className="kpi__val">{formatCurrency(totals.earnedBase)}</div>
          <div className="kpi__lab">Earned Base Total</div>
        </div>
        <div className="kpi">
          <div className="kpi__val">{formatCurrency(totals.saVariable)}</div>
          <div className="kpi__lab">SA Variable Total</div>
        </div>
        <div className="kpi">
          <div className="kpi__val">{formatCurrency(totals.technicianVariable)}</div>
          <div className="kpi__lab">Technician Variable Total</div>
        </div>
        <div className="kpi">
          <div className="kpi__val">{formatCurrency(totals.net)}</div>
          <div className="kpi__lab">Net Payable Total</div>
        </div>
      </div>

      <div className="payroll-table-scroll">
        <table className="table" style={{ fontSize: '0.72rem' }}>
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Type</th><th>Base</th><th>Days</th><th>Earned Base</th>
              <th>SA Var</th><th>Tech Var</th><th>Additions</th><th>Advance</th><th>Other Ded.</th><th>Net</th><th>Flags</th><th></th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((e) => {
              const identity = identityByCode.get(e.employee_code.trim().toUpperCase())
              const needsReview = Boolean((e.review_flags as { needsReview?: boolean } | null)?.needsReview)
              return (
                <tr key={e.id} style={needsReview ? { background: '#fffbeb' } : undefined}>
                  <td>{e.employee_code}</td>
                  <td>{identity?.employeeName ?? e.employee_code}</td>
                  <td>{SALARY_TYPE_LABELS[e.salary_type_snapshot]}</td>
                  <td>{formatCurrency(Number(e.base_salary_snapshot))}</td>
                  <td>{e.payable_days_snapshot}</td>
                  <td>{formatCurrency(Number(e.earned_base))}</td>
                  <td>{formatCurrency(Number(e.sa_variable_earning))}</td>
                  <td>{formatCurrency(Number(e.technician_variable_earning))}</td>
                  <td>{formatCurrency(Number(e.custom_additions))}</td>
                  <td>{formatCurrency(Number(e.advance_deduction))}</td>
                  <td>{formatCurrency(Number(e.other_deductions))}</td>
                  <td style={{ fontWeight: 700 }}>{formatCurrency(Number(e.net_payable))}</td>
                  <td>{needsReview ? '⚠ Review' : '—'}</td>
                  <td>
                    {canModify && monthStatus !== 'finalized' && (
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdjForm({ entryId: e.id, type: 'addition', amount: '', reason: '' })}>Adjust</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {adjForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', padding: '1rem', borderRadius: '10px', minWidth: '320px' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>Manual Adjustment</h4>
            <select value={adjForm.type} onChange={(ev) => setAdjForm((p) => p ? { ...p, type: ev.target.value as 'addition' | 'deduction' } : p)}>
              <option value="addition">Addition / Arrears</option>
              <option value="deduction">Other Deduction</option>
            </select>
            <input type="number" placeholder="Amount" value={adjForm.amount} onChange={(ev) => setAdjForm((p) => p ? { ...p, amount: ev.target.value } : p)} style={{ display: 'block', margin: '0.5rem 0', width: '100%' }} />
            <input placeholder="Reason (required)" value={adjForm.reason} onChange={(ev) => setAdjForm((p) => p ? { ...p, reason: ev.target.value } : p)} style={{ display: 'block', marginBottom: '0.5rem', width: '100%' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => void handleAdjustment()}>Apply</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdjForm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
