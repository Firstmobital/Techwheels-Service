import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import {
  addPayrollAdjustment,
  fetchPayrollEmployees,
  fetchPayrollEntries,
  fetchPayrollMonth,
  finalizePayrollMonth,
  recomputePayrollMonth,
  unlockPayrollMonth,
} from '../../lib/api/payroll'
import {
  employeeMatchesBodyshopPayrollScope,
  fetchMonthlyBodyshopStakeholderEarnings,
  scopeBodyshopTrackerByBranch,
  type BodyshopStakeholderEarnings,
} from '../../lib/bodyshopMonthlyEarnings'
import { formatCurrency } from '../../lib/payroll/calculations'
import { normalizeEmployeeCode } from '../../lib/payroll/earningsFormulas'
import { resolvePayrollEntryIdentity } from '../../lib/payroll/entryIdentity'
import {
  bankBaseSalaryFilename,
  exportPayrollBankCsv,
  exportWorkbookWithTextAccounts,
  isEligibleEarnedBaseBankPayoutRow,
  payrollCardExportFilename,
} from '../../lib/payroll/excelUtils'
import { SALARY_TYPE_LABELS, type PayrollEntry } from '../../lib/payroll/types'
import { supabase } from '../../lib/supabase'
import { usePayrollSecurity } from './PayrollSecurityGate'

function formatUnlockMonthLabel(monthInput: string): string {
  const [year, month] = monthInput.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthInput
  return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function PayrollSummaryCard({
  value,
  label,
  icon,
  tone,
  onExport,
  hint,
}: {
  value: ReactNode
  label: string
  icon: string
  tone: string
  onExport: () => void
  hint?: ReactNode
}) {
  return (
    <div className={`kpi payroll-kpi--${tone}`}>
      <div className="payroll-kpi__top">
        <div className="payroll-kpi__main">
          <span className="payroll-kpi__ic" aria-hidden="true">
            <Icon name={icon} size={15} strokeWidth={1.8} />
          </span>
          <div className="payroll-kpi__copy">
            <div className="kpi__val">{value}</div>
            <div className="kpi__lab">{label}</div>
          </div>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onExport}>
          Export
        </button>
      </div>
      {hint}
    </div>
  )
}

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
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')
  const [unlockCode, setUnlockCode] = useState('')
  const [unlockBusy, setUnlockBusy] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [adjForm, setAdjForm] = useState<{ entryId: number; type: 'addition' | 'deduction'; amount: string; reason: string } | null>(null)
  const { requireSecurityThen } = usePayrollSecurity()
  const [bodyshopStakeholder, setBodyshopStakeholder] = useState<BodyshopStakeholderEarnings | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ents, emps, monthState, stakeholder] = await Promise.all([
        fetchPayrollEntries(payrollMonth),
        fetchPayrollEmployees(),
        fetchPayrollMonth(payrollMonth),
        fetchMonthlyBodyshopStakeholderEarnings(payrollMonth),
      ])
      setEntries(ents)
      setEmployees(emps)
      setMonthStatus(monthState?.status ?? 'draft')
      setBodyshopStakeholder(stakeholder)
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

  const masterBranchByCode = useMemo(() => {
    const m = new Map<string, string | null>()
    employees.forEach((employee) => {
      m.set(normalizeEmployeeCode(employee.employee_code), employee.location ?? null)
    })
    return m
  }, [employees])

  const departmentByCode = useMemo(() => {
    const m = new Map<string, string | null>()
    entries.forEach((entry) => {
      const code = normalizeEmployeeCode(entry.employee_code)
      m.set(code, identityByCode.get(code)?.department ?? null)
    })
    return m
  }, [entries, identityByCode])

  const salaryTypeByCode = useMemo(() => {
    const m = new Map<string, string | null>()
    entries.forEach((entry) => {
      m.set(normalizeEmployeeCode(entry.employee_code), entry.salary_type_snapshot)
    })
    return m
  }, [entries])

  const matchesBodyshopCardFilters = useCallback((code: string) => (
    employeeMatchesBodyshopPayrollScope({
      department: departmentByCode.get(code),
      salaryType: salaryTypeByCode.get(code),
      masterBranch: masterBranchByCode.get(code),
      selectedDepartment: deptFilter,
      selectedSalaryType: salaryTypeFilter,
      selectedBranch: branchFilter,
    })
  ), [departmentByCode, salaryTypeByCode, masterBranchByCode, deptFilter, salaryTypeFilter, branchFilter])

  const bodyshopScope = useMemo(() => {
    if (!bodyshopStakeholder) {
      return {
        displayedTotal: 0,
        mappedInScope: 0,
        unmappedInScope: 0,
        includeUnmapped: deptFilter === 'all' && branchFilter === 'all' && salaryTypeFilter === 'all',
      }
    }
    return scopeBodyshopTrackerByBranch({
      earningsByEmployeeCode: bodyshopStakeholder.earningsByEmployeeCode,
      totalBodyshopEarning: bodyshopStakeholder.totalBodyshopEarning,
      mappedBodyshopEarning: bodyshopStakeholder.mappedBodyshopEarning,
      unmappedBodyshopEarning: bodyshopStakeholder.unmappedBodyshopEarning,
      branchByEmployeeCode: masterBranchByCode,
      departmentByEmployeeCode: departmentByCode,
      salaryTypeByEmployeeCode: salaryTypeByCode,
      selectedBranch: branchFilter,
      selectedDepartment: deptFilter,
      selectedSalaryType: salaryTypeFilter,
    })
  }, [
    bodyshopStakeholder,
    masterBranchByCode,
    departmentByCode,
    salaryTypeByCode,
    branchFilter,
    deptFilter,
    salaryTypeFilter,
  ])

  const payableBodyshopInScope = useMemo(
    () => entries.reduce((sum, entry) => {
      const code = normalizeEmployeeCode(entry.employee_code)
      if (!matchesBodyshopCardFilters(code)) return sum
      return sum + Number(entry.bodyshop_variable_earning ?? 0)
    }, 0),
    [entries, matchesBodyshopCardFilters],
  )

  const bodyshopHint = useMemo(() => {
    if (!bodyshopStakeholder) return undefined
    if (bodyshopScope.includeUnmapped) {
      const show = bodyshopScope.unmappedInScope > 0
        || Math.abs(bodyshopScope.displayedTotal - payableBodyshopInScope) > 0.009
      if (!show) return undefined
      return (
        <div className="kpi__hint">
          Payable in payroll {formatCurrency(payableBodyshopInScope)}
          {bodyshopScope.unmappedInScope > 0 ? ` · Unmapped ${formatCurrency(bodyshopScope.unmappedInScope)}` : ''}
        </div>
      )
    }
    if (Math.abs(bodyshopScope.displayedTotal - payableBodyshopInScope) <= 0.009) return undefined
    return (
      <div className="kpi__hint">
        Mapped to payroll {formatCurrency(payableBodyshopInScope)}
      </div>
    )
  }, [bodyshopStakeholder, bodyshopScope, payableBodyshopInScope])

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
    await requireSecurityThen(async () => {
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
    })
  }

  async function handleFinalize() {
    if (!canModify || monthStatus === 'finalized') return
    await requireSecurityThen(async () => {
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
    })
  }

  function openUnlockModal() {
    if (!canDelete || monthStatus !== 'finalized') return
    setUnlockReason('')
    setUnlockCode('')
    setUnlockError(null)
    setError(null)
    setUnlockOpen(true)
  }

  async function handleUnlock() {
    if (!canDelete || !unlockReason.trim() || !unlockCode.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    setUnlockBusy(true)
    setUnlockError(null)
    try {
      await unlockPayrollMonth(payrollMonth, unlockReason.trim(), unlockCode, user?.email ?? 'unknown')
      setUnlockOpen(false)
      setUnlockReason('')
      setUnlockCode('')
      await reload()
      setMessage('Payroll month unlocked')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unlock failed'
      setUnlockError(message.includes('Incorrect security code') ? 'Incorrect security code.' : message)
    } finally {
      setUnlockBusy(false)
    }
  }

  async function handleAdjustment() {
    if (!adjForm || !canModify || monthStatus === 'finalized') return
    if (!adjForm.reason.trim()) {
      setError('Adjustment reason is required')
      return
    }
    await requireSecurityThen(async () => {
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
    })
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

  function resolveBankPayee(entry: PayrollEntry) {
    const identity = identityByCode.get(entry.employee_code.trim().toUpperCase())
    return {
      employeeName: identity?.employeeName ?? entry.employee_code,
      bankName: identity?.bankName ?? '',
      accountNumber: identity?.accountNumber ?? '',
      ifsc: identity?.ifsc ?? '',
    }
  }

  function exportCardBankCsv(
    amountSelector: (entry: PayrollEntry) => number,
    filename: string,
    rowPredicate?: (entry: PayrollEntry) => boolean,
    sourceEntries: PayrollEntry[] = aggregateScopedRows,
  ) {
    try {
      exportPayrollBankCsv({
        entries: sourceEntries,
        amountSelector,
        rowPredicate,
        filename,
        resolvePayee: resolveBankPayee,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    }
  }

  function exportBodyshopBankPayout() {
    exportCardBankCsv(
      (entry) => Number(entry.bodyshop_variable_earning ?? 0),
      payrollCardExportFilename('bodyshop-variable', monthInput),
      (entry) => matchesBodyshopCardFilters(normalizeEmployeeCode(entry.employee_code)),
      entries,
    )
  }

  function exportEarnedBaseBankPayout() {
    exportCardBankCsv(
      (entry) => Number(entry.net_payable),
      bankBaseSalaryFilename(monthInput),
      (entry) => isEligibleEarnedBaseBankPayoutRow({
        salaryType: entry.salary_type_snapshot,
        netPayable: entry.net_payable,
      }),
    )
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
        {canDelete && monthStatus === 'finalized' && (
          <button type="button" className="btn btn--sm payroll-unlock-btn" disabled={loading} onClick={openUnlockModal}>
            Unlock Month
          </button>
        )}
      </div>

      {error && <div className="toast error">{error}</div>}
      {message && <div className="toast">{message}</div>}

      <div className="kpis payroll-kpis">
        <PayrollSummaryCard
          tone="employees"
          icon="user"
          value={totals.employeeCount}
          label="Total Employees"
          onExport={() => exportCardBankCsv(
            (entry) => Number(entry.net_payable),
            payrollCardExportFilename('total-employees', monthInput),
          )}
        />
        <PayrollSummaryCard
          tone="gross"
          icon="reports"
          value={formatCurrency(totals.gross)}
          label="Total Gross"
          onExport={() => exportCardBankCsv(
            (entry) => Number(entry.gross_payout),
            payrollCardExportFilename('total-gross', monthInput),
          )}
        />
        <PayrollSummaryCard
          tone="advance"
          icon="download"
          value={formatCurrency(totals.advance)}
          label="Total Advance Deducted"
          onExport={() => exportCardBankCsv(
            (entry) => Number(entry.advance_deduction),
            payrollCardExportFilename('advance-deducted', monthInput),
          )}
        />
        <PayrollSummaryCard
          tone="bodyshop"
          icon="truck"
          value={formatCurrency(bodyshopScope.displayedTotal)}
          label="Bodyshop Variable Total"
          onExport={exportBodyshopBankPayout}
          hint={bodyshopHint}
        />
        <PayrollSummaryCard
          tone="earned"
          icon="autodoc"
          value={formatCurrency(totals.earnedBase)}
          label="Earned Base Total"
          onExport={exportEarnedBaseBankPayout}
        />
        <PayrollSummaryCard
          tone="sa"
          icon="admin"
          value={formatCurrency(totals.saVariable)}
          label="SA Variable Total"
          onExport={() => exportCardBankCsv(
            (entry) => Number(entry.sa_variable_earning),
            payrollCardExportFilename('sa-variable', monthInput),
          )}
        />
        <PayrollSummaryCard
          tone="technician"
          icon="tech"
          value={formatCurrency(totals.technicianVariable)}
          label="Technician Variable Total"
          onExport={() => exportCardBankCsv(
            (entry) => Number(entry.technician_variable_earning),
            payrollCardExportFilename('technician-variable', monthInput),
          )}
        />
        <PayrollSummaryCard
          tone="net"
          icon="check"
          value={formatCurrency(totals.net)}
          label="Net Payable Total"
          onExport={() => exportCardBankCsv(
            (entry) => Number(entry.net_payable),
            payrollCardExportFilename('net-payable', monthInput),
          )}
        />
      </div>

      <div className="payroll-table-scroll">
        <table className="table" style={{ fontSize: '0.72rem' }}>
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Type</th><th>Base</th><th>Days</th><th>Earned Base</th>
              <th>SA Var</th><th>Tech Var</th><th>Bodyshop Var</th><th>Additions</th><th>Advance</th><th>Other Ded.</th><th>Net</th><th>Flags</th><th></th>
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
                  <td>{formatCurrency(Number(e.bodyshop_variable_earning ?? 0))}</td>
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

      {unlockOpen && (
        <div className="modal-back" role="presentation" onClick={() => { if (!unlockBusy) setUnlockOpen(false) }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="payroll-unlock-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal__head">
              <h3 id="payroll-unlock-title">Unlock Payroll — {formatUnlockMonthLabel(monthInput)}</h3>
              <button type="button" className="modal__x" onClick={() => setUnlockOpen(false)} disabled={unlockBusy} aria-label="Close">✕</button>
            </div>
            <div className="modal__body">
              <label className="payroll-security-field">
                <span>Security Code</span>
                <input type="password" autoComplete="off" value={unlockCode} onChange={(ev) => setUnlockCode(ev.target.value)} disabled={unlockBusy} />
              </label>
              <label className="payroll-security-field" style={{ marginTop: '0.75rem' }}>
                <span>Reason for Unlock</span>
                <textarea value={unlockReason} onChange={(ev) => setUnlockReason(ev.target.value)} disabled={unlockBusy} rows={3} />
              </label>
              {unlockError && <p className="payroll-add-error" style={{ marginTop: '0.65rem' }}>{unlockError}</p>}
            </div>
            <div className="modal__foot">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setUnlockOpen(false)} disabled={unlockBusy}>Cancel</button>
              <button
                type="button"
                className="btn btn--sm payroll-unlock-btn"
                disabled={unlockBusy || !unlockCode.trim() || !unlockReason.trim()}
                onClick={() => void handleUnlock()}
              >
                {unlockBusy ? 'Unlocking…' : 'Unlock Month'}
              </button>
            </div>
          </div>
        </div>
      )}

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
