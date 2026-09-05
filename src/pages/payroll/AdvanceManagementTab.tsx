import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { createAdvance, fetchAdvanceSchedules, fetchAdvances, fetchPayrollEmployees } from '../../lib/api/payroll'
import {
  ADVANCE_LEDGER_STATUS_LABELS,
  advanceBalance,
  advanceLedgerDisplayStatus,
  advanceProgressPercent,
  buildAdvanceSchedule,
  defaultLumpPayMonth,
  formatAdvanceMonthLabel,
  type AdvanceLedgerDisplayStatus,
} from '../../lib/payroll/advanceSchedule'
import { formatPayrollMoney, parsePayrollMonthInput } from '../../lib/payroll/calculations'
import { isEmployeeCurrentlyActive } from '../../lib/employeeActive'
import {
  ADVANCE_IMPORT_HEADERS,
  ADVANCE_LEDGER_EXPORT_HEADERS,
  exportWorkbook,
  previewAdvanceImport,
  readWorkbookRows,
  type AdvanceImportCommitData,
} from '../../lib/payroll/excelUtils'
import type { AdvanceDeductionType, ImportPreviewResult, PayrollAdvance, PayrollAdvanceSchedule, PayrollEmployee } from '../../lib/payroll/types'
import { supabase } from '../../lib/supabase'

interface Props {
  canModify: boolean
  payrollMonth: string
}

type LedgerFilter = 'all' | AdvanceLedgerDisplayStatus

const DEDUCTION_LABELS: Record<AdvanceDeductionType, string> = {
  lump_sum: 'Lump Sum',
  emi: 'Equal EMI',
  custom: 'Custom',
}

const STATUS_BADGE: Record<AdvanceLedgerDisplayStatus, string> = {
  open: 'badge badge--open',
  partial: 'badge badge--partial',
  closed: 'badge badge--closed',
  cancelled: 'badge badge--inactive',
}

function emptyForm(payrollMonth: string) {
  const issueMonth = payrollMonth.slice(0, 7)
  return {
    employeeCode: '',
    employeeSearch: '',
    originalAmount: '',
    issueMonth,
    payMonth: defaultLumpPayMonth(issueMonth),
    deductionType: 'lump_sum' as AdvanceDeductionType,
    emiMonths: '3',
    customAmounts: '',
    notes: '',
  }
}

export default function AdvanceManagementTab({ canModify, payrollMonth }: Props) {
  const [advances, setAdvances] = useState<PayrollAdvance[]>([])
  const [schedules, setSchedules] = useState<PayrollAdvanceSchedule[]>([])
  const [employees, setEmployees] = useState<PayrollEmployee[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [issuing, setIssuing] = useState(false)
  const [showEmployeeOptions, setShowEmployeeOptions] = useState(false)
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('all')
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null)
  const [form, setForm] = useState(() => emptyForm(payrollMonth))

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

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [adv, sched, emps] = await Promise.all([fetchAdvances(), fetchAdvanceSchedules(), fetchPayrollEmployees()])
        if (cancelled) return
        setAdvances(adv)
        setSchedules(sched)
        setEmployees(emps)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Load failed')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const employeeByCode = useMemo(() => {
    const map = new Map<string, PayrollEmployee>()
    employees.forEach((employee) => map.set(employee.employee_code.trim().toUpperCase(), employee))
    return map
  }, [employees])

  const activeEmployees = useMemo(
    () => employees.filter((employee) => isEmployeeCurrentlyActive(employee)),
    [employees],
  )

  const selectedEmployee = form.employeeCode ? employeeByCode.get(form.employeeCode) ?? null : null

  const filteredEmployeeOptions = useMemo(() => {
    const query = form.employeeSearch.trim().toLowerCase()
    return activeEmployees
      .filter((employee) => {
        if (!query) return true
        return `${employee.employee_code} ${employee.employee_name} ${employee.role ?? ''}`.toLowerCase().includes(query)
      })
      .slice(0, 30)
  }, [activeEmployees, form.employeeSearch])

  const schedulesByAdvance = useMemo(() => {
    const map = new Map<number, PayrollAdvanceSchedule[]>()
    schedules.forEach((schedule) => {
      const list = map.get(schedule.advance_id) ?? []
      list.push(schedule)
      map.set(schedule.advance_id, list)
    })
    return map
  }, [schedules])

  const scheduleResult = useMemo(() => {
    const amount = Number(form.originalAmount)
    if (!form.originalAmount.trim() || !form.issueMonth) {
      return { ok: false as const, error: 'Fill amount and issue month to preview deductions.' }
    }
    return buildAdvanceSchedule({
      issueMonth: form.issueMonth,
      amount,
      deductionType: form.deductionType,
      payMonth: form.deductionType === 'lump_sum' ? form.payMonth : undefined,
      emiMonths: form.deductionType === 'emi' ? Number(form.emiMonths) : undefined,
      customText: form.deductionType === 'custom' ? form.customAmounts : undefined,
    })
  }, [form.originalAmount, form.issueMonth, form.payMonth, form.deductionType, form.emiMonths, form.customAmounts])

  const visibleAdvances = useMemo(() => {
    if (ledgerFilter === 'all') return advances
    return advances.filter((advance) => {
      const display = advanceLedgerDisplayStatus({
        status: advance.status,
        originalAmount: Number(advance.original_amount),
        recoveredAmount: Number(advance.recovered_amount),
      })
      return display === ledgerFilter
    })
  }, [advances, ledgerFilter])

  function selectEmployee(employee: PayrollEmployee) {
    const code = employee.employee_code.trim().toUpperCase()
    setForm((prev) => ({
      ...prev,
      employeeCode: code,
      employeeSearch: `${code} — ${employee.employee_name}`,
    }))
    setShowEmployeeOptions(false)
  }

  async function handleIssueAdvance() {
    if (!canModify || issuing) return
    setError(null)
    setMessage(null)

    const code = form.employeeCode.trim().toUpperCase()
    const employee = employeeByCode.get(code)
    if (!code || !employee) {
      setError('Please select an employee')
      return
    }
    if (!isEmployeeCurrentlyActive(employee)) {
      setError('Advances can only be issued to active employees')
      return
    }
    if (!scheduleResult.ok) {
      setError(scheduleResult.error)
      return
    }
    const issueDate = parsePayrollMonthInput(form.issueMonth)
    if (!issueDate) {
      setError('Issue month is required')
      return
    }

    setIssuing(true)
    const { data: { user } } = await supabase.auth.getUser()
    try {
      await createAdvance({
        employeeCode: code,
        originalAmount: Number(form.originalAmount),
        deductionType: form.deductionType,
        issueDate,
        notes: form.notes.trim() || undefined,
        createdBy: user?.email ?? 'unknown',
        schedules: scheduleResult.schedules,
      })
      setMessage('Advance issued')
      setForm(emptyForm(payrollMonth))
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue advance')
    } finally {
      setIssuing(false)
    }
  }

  function handleExportLedger() {
    const rows = visibleAdvances.map((advance) => {
      const code = advance.employee_code.trim().toUpperCase()
      const employee = employeeByCode.get(code)
      const original = Number(advance.original_amount)
      const recovered = Number(advance.recovered_amount)
      const balance = advanceBalance(original, recovered)
      const display = advanceLedgerDisplayStatus({
        status: advance.status,
        originalAmount: original,
        recoveredAmount: recovered,
      })
      return [
        code,
        employee?.employee_name ?? '',
        employee?.role ?? '',
        formatAdvanceMonthLabel(advance.issue_date),
        DEDUCTION_LABELS[advance.deduction_type] ?? advance.deduction_type,
        original,
        recovered,
        balance,
        ADVANCE_LEDGER_STATUS_LABELS[display],
        Number(advanceProgressPercent(recovered, original).toFixed(1)),
      ]
    })
    exportWorkbook(
      'Advance Ledger',
      [...ADVANCE_LEDGER_EXPORT_HEADERS],
      rows,
      `Payroll_Advance_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
  }

  function handleDownloadTemplate() {
    exportWorkbook(
      'Advance Import',
      [...ADVANCE_IMPORT_HEADERS],
      [
        ['', '10000', '2026-09', 'LUMP', '', '', '', ''],
        ['', '10000', '2026-09', 'LUMP', '2026-12', '', '', ''],
        ['', '10000', '2026-09', 'EMI', '', '3', '', ''],
        ['', '15000', '2026-09', 'CUSTOM', '', '', '5000,7000,3000', ''],
      ],
      'Payroll_Advance_Import_Template.xlsx',
    )
  }

  async function handleImportFile(file: File) {
    setError(null)
    const rows = await readWorkbookRows(file)
    const knownCodes = new Set(employees.map((employee) => employee.employee_code.trim().toUpperCase()))
    const activeCodes = new Set(
      employees
        .filter((employee) => isEmployeeCurrentlyActive(employee))
        .map((employee) => employee.employee_code.trim().toUpperCase()),
    )
    setImportPreview(previewAdvanceImport(rows, { knownCodes, activeCodes }))
  }

  async function commitImport() {
    if (!importPreview || !canModify) return
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    try {
      for (const row of importPreview.rows) {
        if (row.status !== 'valid') continue
        const data = row.data as unknown as AdvanceImportCommitData
        await createAdvance({
          employeeCode: row.employeeCode,
          originalAmount: data.originalAmount,
          deductionType: data.deductionType,
          issueDate: data.issueDate,
          notes: data.notes ?? undefined,
          createdBy: user?.email ?? 'unknown',
          schedules: data.schedules,
        })
      }
      setImportPreview(null)
      await reload()
      setMessage('Advance import committed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import commit failed')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn--ghost btn--sm" onClick={handleExportLedger}>Export Ledger</button>
        {canModify && (
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleDownloadTemplate}>Download Template</button>
            <label className="btn btn--ghost btn--sm" style={{ cursor: 'pointer' }}>
              Import
              <input
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleImportFile(file)
                  event.target.value = ''
                }}
              />
            </label>
          </>
        )}
      </div>

      {canModify && (
        <div className="payroll-advance-issue">
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.65rem' }}>Issue Advance</h3>
            <div className="payroll-add-grid">
              <div className="payroll-add-field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="advance-employee">Employee</label>
                <div className="payroll-emp-picker">
                  <input
                    id="advance-employee"
                    value={form.employeeSearch}
                    placeholder="Search active employee by code, name, or role"
                    autoComplete="off"
                    onFocus={() => setShowEmployeeOptions(true)}
                    onChange={(event) => {
                      setForm((prev) => ({ ...prev, employeeSearch: event.target.value, employeeCode: '' }))
                      setShowEmployeeOptions(true)
                    }}
                  />
                  {showEmployeeOptions && (
                    <div className="payroll-emp-picker__list">
                      {filteredEmployeeOptions.length === 0 ? (
                        <div className="payroll-emp-picker__empty">No matching active employees.</div>
                      ) : (
                        filteredEmployeeOptions.map((employee) => {
                          const code = employee.employee_code.trim().toUpperCase()
                          return (
                            <button
                              key={code}
                              type="button"
                              className="payroll-emp-picker__option"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectEmployee(employee)}
                            >
                              <span className="payroll-emp-picker__name">{code} — {employee.employee_name}</span>
                              <span className="payroll-emp-picker__role">{employee.role ?? '—'}</span>
                            </button>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
                {selectedEmployee && (
                  <p className="payroll-add-hint">{selectedEmployee.role ?? 'No role'} · {selectedEmployee.department ?? 'No department'}</p>
                )}
              </div>

              <div className="payroll-add-field">
                <label htmlFor="advance-amount">Advance amount</label>
                <input
                  id="advance-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.originalAmount}
                  onChange={(event) => setForm((prev) => ({ ...prev, originalAmount: event.target.value }))}
                />
              </div>

              <div className="payroll-add-field">
                <label htmlFor="advance-issue-month">Issue month</label>
                <input
                  id="advance-issue-month"
                  type="month"
                  value={form.issueMonth}
                  onChange={(event) => {
                    const nextIssue = event.target.value
                    setForm((prev) => {
                      const prevDefault = defaultLumpPayMonth(prev.issueMonth)
                      const keepManual = Boolean(prev.payMonth) && prev.payMonth !== prevDefault
                      return {
                        ...prev,
                        issueMonth: nextIssue,
                        payMonth: keepManual ? prev.payMonth : defaultLumpPayMonth(nextIssue),
                      }
                    })
                  }}
                />
              </div>

              <div className="payroll-add-field" style={{ gridColumn: '1 / -1' }}>
                <label>Deduction method</label>
                <div className="payroll-advance-methods">
                  {([
                    ['lump_sum', 'Lump Sum — full amount deducted in the selected Pay Month'],
                    ['emi', 'Equal EMI — split over N months'],
                    ['custom', 'Custom — comma-separated monthly amounts'],
                  ] as const).map(([value, label]) => (
                    <label key={value} className="payroll-advance-method">
                      <input
                        type="radio"
                        name="advance-deduction-type"
                        checked={form.deductionType === value}
                        onChange={() => setForm((prev) => ({
                          ...prev,
                          deductionType: value,
                          payMonth: value === 'lump_sum' && !prev.payMonth
                            ? defaultLumpPayMonth(prev.issueMonth)
                            : prev.payMonth,
                        }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {form.deductionType === 'lump_sum' && (
                <div className="payroll-add-field">
                  <label htmlFor="advance-pay-month">Pay month</label>
                  <input
                    id="advance-pay-month"
                    type="month"
                    value={form.payMonth}
                    onChange={(event) => setForm((prev) => ({ ...prev, payMonth: event.target.value }))}
                  />
                  <p className="payroll-add-hint">Defaults to the month after Issue Month. Same month and later months are allowed.</p>
                </div>
              )}

              {form.deductionType === 'emi' && (
                <div className="payroll-add-field">
                  <label htmlFor="advance-emi-months">N months</label>
                  <input
                    id="advance-emi-months"
                    type="number"
                    min={1}
                    step={1}
                    value={form.emiMonths}
                    onChange={(event) => setForm((prev) => ({ ...prev, emiMonths: event.target.value }))}
                  />
                </div>
              )}

              {form.deductionType === 'custom' && (
                <div className="payroll-add-field" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="advance-custom-amounts">Monthly amounts (comma-separated)</label>
                  <textarea
                    id="advance-custom-amounts"
                    rows={3}
                    placeholder="e.g. 5000, 7000, 3000"
                    value={form.customAmounts}
                    onChange={(event) => setForm((prev) => ({ ...prev, customAmounts: event.target.value }))}
                  />
                </div>
              )}

              <div className="payroll-add-field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="advance-notes">Notes</label>
                <input
                  id="advance-notes"
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              style={{ marginTop: '0.75rem' }}
              disabled={issuing}
              onClick={() => void handleIssueAdvance()}
            >
              {issuing ? 'Issuing…' : 'Confirm & Issue'}
            </button>
          </div>

          <div className="payroll-advance-preview">
            <h3>Live deduction preview</h3>
            <p className="payroll-add-hint">
              {form.deductionType === 'lump_sum'
                ? 'Lump Sum is deducted entirely in the selected Pay Month. Nothing is saved until you confirm.'
                : 'EMI and Custom repayment start the month after Issue Month. Nothing is saved until you confirm.'}
            </p>
            {scheduleResult.ok ? (
              <table className="table" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
                <thead>
                  <tr><th>Month</th><th>Amount to Deduct</th></tr>
                </thead>
                <tbody>
                  {scheduleResult.schedules.map((row) => (
                    <tr key={`${row.payrollMonth}_${row.scheduledAmount}`}>
                      <td>{formatAdvanceMonthLabel(row.payrollMonth)}</td>
                      <td>{formatPayrollMoney(row.scheduledAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="payroll-advance-preview__empty">{scheduleResult.error}</p>
            )}
          </div>
        </div>
      )}

      {error && <div className="toast error">{error}</div>}
      {message && <div className="toast">{message}</div>}

      {importPreview && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem' }}>
          <strong>Import preview</strong>
          <div style={{ fontSize: '0.78rem', margin: '0.35rem 0' }}>
            Total: {importPreview.totalRows} · Valid: {importPreview.valid} · Rejected: {importPreview.rejected}
          </div>
          <p className="payroll-add-hint">Issue Month YYYY-MM. Deduction Method: LUMP, EMI, or CUSTOM. Pay Month is optional for LUMP (blank = Issue Month + 1) and ignored for EMI/CUSTOM.</p>
          <div style={{ maxHeight: '180px', overflow: 'auto', fontSize: '0.75rem' }}>
            {importPreview.rows.filter((row) => row.status === 'rejected').slice(0, 30).map((row) => (
              <div key={row.rowNumber}>{row.rowNumber}: {row.employeeCode || '—'} — {row.status}: {row.message}</div>
            ))}
            {importPreview.rows.filter((row) => row.status === 'valid').slice(0, 10).map((row) => (
              <div key={row.rowNumber}>{row.rowNumber}: {row.employeeCode} — valid: {row.message}</div>
            ))}
          </div>
          {canModify && (
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={importPreview.valid === 0}
                onClick={() => void commitImport()}
              >
                Commit valid rows
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setImportPreview(null)}>Cancel</button>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', margin: '0.75rem 0' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>Advance ledger</h3>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>
          Filter
          <select
            value={ledgerFilter}
            onChange={(event) => setLedgerFilter(event.target.value as LedgerFilter)}
            style={{ marginLeft: '0.4rem' }}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="partial">Partial</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>

      <div className="payroll-table-scroll">
        <table className="table" style={{ fontSize: '0.78rem' }}>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Issued Month</th>
              <th>Total Amount</th>
              <th>Recovered</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Schedule</th>
            </tr>
          </thead>
          <tbody>
            {visibleAdvances.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ color: '#64748b' }}>No advances found for selected filter.</td>
              </tr>
            ) : visibleAdvances.map((advance) => {
              const code = advance.employee_code.trim().toUpperCase()
              const employee = employeeByCode.get(code)
              const original = Number(advance.original_amount)
              const recovered = Number(advance.recovered_amount)
              const balance = advanceBalance(original, recovered)
              const display = advanceLedgerDisplayStatus({
                status: advance.status,
                originalAmount: original,
                recoveredAmount: recovered,
              })
              const progress = advanceProgressPercent(recovered, original)
              const lumpPayMonth = advance.deduction_type === 'lump_sum'
                ? (schedulesByAdvance.get(advance.id) ?? [])[0]?.payroll_month
                : null
              return (
                <Fragment key={advance.id}>
                  <tr>
                    <td style={{ whiteSpace: 'normal' }}>
                      <div>{code} — {employee?.employee_name ?? ''}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{employee?.role ?? '—'}</div>
                    </td>
                    <td>
                      <div>{formatAdvanceMonthLabel(advance.issue_date)}</div>
                      {lumpPayMonth && (
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Pay {formatAdvanceMonthLabel(lumpPayMonth)}</div>
                      )}
                    </td>
                    <td>{formatPayrollMoney(original)}</td>
                    <td>{formatPayrollMoney(recovered)}</td>
                    <td>{formatPayrollMoney(balance)}</td>
                    <td><span className={STATUS_BADGE[display]}>{ADVANCE_LEDGER_STATUS_LABELS[display]}</span></td>
                    <td>
                      <div className="payroll-progress">
                        <div className="payroll-progress__track">
                          <div className="payroll-progress__fill" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="payroll-progress__pct">{progress.toFixed(1)}%</div>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setExpandedId(expandedId === advance.id ? null : advance.id)}
                      >
                        {expandedId === advance.id ? 'Hide schedule' : 'View schedule'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === advance.id && (
                    <tr>
                      <td colSpan={8}>
                        <table className="table" style={{ fontSize: '0.72rem', margin: '0.25rem 0' }}>
                          <thead>
                            <tr>
                              <th>Month</th>
                              <th>Scheduled Amount</th>
                              <th>Applied Amount</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(schedulesByAdvance.get(advance.id) ?? []).map((schedule) => (
                              <tr key={schedule.id}>
                                <td>{formatAdvanceMonthLabel(schedule.payroll_month)}</td>
                                <td>{formatPayrollMoney(Number(schedule.scheduled_amount))}</td>
                                <td>{formatPayrollMoney(Number(schedule.applied_amount))}</td>
                                <td>{schedule.status}</td>
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
    </div>
  )
}
