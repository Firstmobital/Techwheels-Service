import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from '../../components/Icon'
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

const DEDUCTION_OPTIONS: {
  value: AdvanceDeductionType
  title: string
  hint: string
  icon: string
}[] = [
  { value: 'lump_sum', title: 'Lump Sum', hint: 'Full repayment in one payroll month', icon: 'banknote' },
  { value: 'emi', title: 'Equal EMI', hint: 'Split equally across multiple months', icon: 'calendar' },
  { value: 'custom', title: 'Custom', hint: 'Define month-wise repayment amounts', icon: 'sliders' },
]

const STATUS_BADGE: Record<AdvanceLedgerDisplayStatus, string> = {
  open: 'badge badge--open',
  partial: 'badge badge--partial',
  closed: 'badge badge--closed',
  cancelled: 'badge badge--inactive',
}

function employeeOptionId(code: string) {
  return `advance-employee-option-${code.replace(/[^A-Za-z0-9_-]/g, '_')}`
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
  const [highlightedEmployeeIndex, setHighlightedEmployeeIndex] = useState(0)
  const employeePickerRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!showEmployeeOptions) return
    function handlePointerDown(event: PointerEvent) {
      const root = employeePickerRef.current
      if (!root) return
      if (event.target instanceof Node && root.contains(event.target)) return
      setShowEmployeeOptions(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [showEmployeeOptions])

  const schedulesByAdvance = useMemo(() => {
    const map = new Map<number, PayrollAdvanceSchedule[]>()
    schedules.forEach((schedule) => {
      const list = map.get(schedule.advance_id) ?? []
      list.push(schedule)
      map.set(schedule.advance_id, list)
    })
    return map
  }, [schedules])

  const previewIncomplete = !form.originalAmount.trim() || !form.issueMonth

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

  const previewTotal = scheduleResult.ok
    ? scheduleResult.schedules.reduce((sum, row) => sum + row.scheduledAmount, 0)
    : 0

  const previewChip = useMemo(() => {
    if (form.deductionType === 'lump_sum') return { method: 'Lump Sum', detail: '1 Payment' }
    if (form.deductionType === 'emi') {
      const months = Number(form.emiMonths)
      const label = Number.isFinite(months) && months > 0 ? `${months} Months` : 'EMI'
      return { method: 'EMI', detail: label }
    }
    const count = scheduleResult.ok
      ? scheduleResult.schedules.length
      : form.customAmounts.split(',').map((part) => part.trim()).filter(Boolean).length
    return { method: 'Custom', detail: count > 0 ? `${count} Payment${count === 1 ? '' : 's'}` : 'Custom' }
  }, [form.customAmounts, form.deductionType, form.emiMonths, scheduleResult])

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

  function handleEmployeeKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (!showEmployeeOptions) return
      event.preventDefault()
      setShowEmployeeOptions(false)
      return
    }
    if (event.key === 'Tab') {
      setShowEmployeeOptions(false)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!showEmployeeOptions) {
        setShowEmployeeOptions(true)
        setHighlightedEmployeeIndex(0)
        return
      }
      if (filteredEmployeeOptions.length === 0) return
      setHighlightedEmployeeIndex((index) => (index + 1) % filteredEmployeeOptions.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!showEmployeeOptions) {
        setShowEmployeeOptions(true)
        setHighlightedEmployeeIndex(0)
        return
      }
      if (filteredEmployeeOptions.length === 0) return
      setHighlightedEmployeeIndex((index) => (
        (index - 1 + filteredEmployeeOptions.length) % filteredEmployeeOptions.length
      ))
      return
    }
    if (event.key === 'Enter' && showEmployeeOptions) {
      const highlighted = filteredEmployeeOptions[highlightedEmployeeIndex]
      if (!highlighted) return
      event.preventDefault()
      selectEmployee(highlighted)
    }
  }

  function handleEmployeeBlur() {
    window.setTimeout(() => {
      const root = employeePickerRef.current
      if (root?.contains(document.activeElement)) return
      setShowEmployeeOptions(false)
    }, 0)
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
    <div className="payroll-advance">
      <div className="payroll-advance-toolbar">
        <div className="payroll-advance-toolbar__copy">
          <h2>Advance Management</h2>
          <p>Issue employee advances and manage repayment schedules.</p>
        </div>
        <div className="payroll-advance-toolbar__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={handleExportLedger}>
            <Icon name="download" size={14} strokeWidth={1.8} />
            Export Ledger
          </button>
          {canModify && (
            <>
              <button type="button" className="btn btn--ghost btn--sm" onClick={handleDownloadTemplate}>
                <Icon name="doc" size={14} strokeWidth={1.8} />
                Download Template
              </button>
              <label className="btn btn--ghost btn--sm" style={{ cursor: 'pointer' }}>
                <Icon name="upload" size={14} strokeWidth={1.8} />
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
      </div>

      {canModify && (
        <div className="payroll-advance-issue">
          <div className="payroll-advance-form">
            <div className="payroll-advance-sectionhead">
              <span className="payroll-advance-sectionhead__ic" aria-hidden="true">
                <Icon name="banknote" size={15} strokeWidth={1.8} />
              </span>
              <h3>Issue Advance</h3>
            </div>

            <div className="payroll-advance-fields">
              <div className="payroll-add-field payroll-advance-fields__full">
                <label htmlFor="advance-employee">Employee</label>
                <div className="payroll-emp-picker" ref={employeePickerRef}>
                  <div className="payroll-advance-affix payroll-advance-affix--icon">
                    <span className="payroll-advance-affix__icon" aria-hidden="true">
                      <Icon name="search" size={15} strokeWidth={1.8} />
                    </span>
                    <input
                      id="advance-employee"
                      className="inp"
                      role="combobox"
                      aria-expanded={showEmployeeOptions}
                      aria-controls="advance-employee-list"
                      aria-autocomplete="list"
                      aria-activedescendant={
                        showEmployeeOptions && filteredEmployeeOptions[highlightedEmployeeIndex]
                          ? employeeOptionId(filteredEmployeeOptions[highlightedEmployeeIndex].employee_code.trim().toUpperCase())
                          : undefined
                      }
                      value={form.employeeSearch}
                      placeholder="Search employee by code, name, or role"
                      autoComplete="off"
                      onFocus={() => {
                        setHighlightedEmployeeIndex(0)
                        setShowEmployeeOptions(true)
                      }}
                      onBlur={handleEmployeeBlur}
                      onKeyDown={handleEmployeeKeyDown}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, employeeSearch: event.target.value, employeeCode: '' }))
                        setHighlightedEmployeeIndex(0)
                        setShowEmployeeOptions(true)
                      }}
                    />
                  </div>
                  {showEmployeeOptions && (
                    <div className="payroll-emp-picker__list" id="advance-employee-list" role="listbox">
                      {filteredEmployeeOptions.length === 0 ? (
                        <div className="payroll-emp-picker__empty">No matching active employees.</div>
                      ) : (
                        filteredEmployeeOptions.map((employee, index) => {
                          const code = employee.employee_code.trim().toUpperCase()
                          const active = index === highlightedEmployeeIndex
                          return (
                            <button
                              key={code}
                              id={employeeOptionId(code)}
                              type="button"
                              role="option"
                              aria-selected={active}
                              tabIndex={-1}
                              className={`payroll-emp-picker__option${active ? ' is-active' : ''}`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectEmployee(employee)}
                              ref={(node) => {
                                if (active) node?.scrollIntoView({ block: 'nearest' })
                              }}
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
                <label htmlFor="advance-amount">Advance Amount</label>
                <div className="payroll-advance-affix">
                  <span className="payroll-advance-affix__text" aria-hidden="true">₹</span>
                  <input
                    id="advance-amount"
                    className="inp"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.originalAmount}
                    onChange={(event) => setForm((prev) => ({ ...prev, originalAmount: event.target.value }))}
                  />
                </div>
              </div>

              <div className="payroll-add-field">
                <label htmlFor="advance-issue-month">Issue Month</label>
                <div className="payroll-advance-affix payroll-advance-affix--icon">
                  <span className="payroll-advance-affix__icon" aria-hidden="true">
                    <Icon name="calendar" size={14} strokeWidth={1.8} />
                  </span>
                  <input
                    id="advance-issue-month"
                    className="inp"
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
              </div>

              <div className="payroll-add-field payroll-advance-fields__full">
                <span id="advance-deduction-label" className="payroll-advance-fieldlabel">Deduction Method</span>
                <div
                  className="payroll-advance-methods"
                  role="radiogroup"
                  aria-labelledby="advance-deduction-label"
                >
                  {DEDUCTION_OPTIONS.map((option) => {
                    const selected = form.deductionType === option.value
                    return (
                      <label
                        key={option.value}
                        className={`payroll-advance-method${selected ? ' is-selected' : ''}`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name="advance-deduction-type"
                          value={option.value}
                          checked={selected}
                          onChange={() => setForm((prev) => ({
                            ...prev,
                            deductionType: option.value,
                            payMonth: option.value === 'lump_sum' && !prev.payMonth
                              ? defaultLumpPayMonth(prev.issueMonth)
                              : prev.payMonth,
                          }))}
                        />
                        <span className="payroll-advance-method__ic" aria-hidden="true">
                          <Icon name={option.icon} size={16} strokeWidth={1.8} />
                        </span>
                        <span className="payroll-advance-method__copy">
                          <span className="payroll-advance-method__title">{option.title}</span>
                          <span className="payroll-advance-method__hint">{option.hint}</span>
                        </span>
                        {selected && (
                          <span className="payroll-advance-method__check" aria-hidden="true">
                            <Icon name="checksm" size={12} strokeWidth={2.2} />
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>

              {form.deductionType === 'lump_sum' && (
                <div className="payroll-add-field payroll-advance-fields__full">
                  <label htmlFor="advance-pay-month">Pay Month</label>
                  <div className="payroll-advance-affix payroll-advance-affix--icon payroll-advance-affix--narrow">
                    <span className="payroll-advance-affix__icon" aria-hidden="true">
                      <Icon name="calendar" size={14} strokeWidth={1.8} />
                    </span>
                    <input
                      id="advance-pay-month"
                      className="inp"
                      type="month"
                      value={form.payMonth}
                      onChange={(event) => setForm((prev) => ({ ...prev, payMonth: event.target.value }))}
                    />
                  </div>
                  <p className="payroll-add-hint">Defaults to the month after Issue Month. Same or later months are allowed.</p>
                </div>
              )}

              {form.deductionType === 'emi' && (
                <div className="payroll-add-field payroll-advance-fields__full">
                  <label htmlFor="advance-emi-months">Number of Months</label>
                  <input
                    id="advance-emi-months"
                    className="inp payroll-advance-input--narrow"
                    type="number"
                    min={1}
                    step={1}
                    value={form.emiMonths}
                    onChange={(event) => setForm((prev) => ({ ...prev, emiMonths: event.target.value }))}
                  />
                  <p className="payroll-add-hint">Repayment starts according to the existing approved schedule rule.</p>
                </div>
              )}

              {form.deductionType === 'custom' && (
                <div className="payroll-add-field payroll-advance-fields__full">
                  <label htmlFor="advance-custom-amounts">Monthly Amounts</label>
                  <input
                    id="advance-custom-amounts"
                    className="inp"
                    type="text"
                    placeholder="5000, 7000, 3000"
                    value={form.customAmounts}
                    onChange={(event) => setForm((prev) => ({ ...prev, customAmounts: event.target.value }))}
                  />
                  <p className="payroll-add-hint">Enter comma-separated monthly amounts.</p>
                  {!scheduleResult.ok && !previewIncomplete && form.customAmounts.trim() && (
                    <p className="payroll-add-error">{scheduleResult.error}</p>
                  )}
                </div>
              )}

              <div className="payroll-add-field payroll-advance-fields__full">
                <label htmlFor="advance-notes">Notes</label>
                <textarea
                  id="advance-notes"
                  className="inp"
                  rows={2}
                  placeholder="Optional reason or reference..."
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>
            </div>

            <button
              type="button"
              className="btn btn--primary btn--sm payroll-advance-submit"
              disabled={issuing}
              onClick={() => void handleIssueAdvance()}
            >
              <Icon name="check" size={15} strokeWidth={2} />
              {issuing ? 'Issuing…' : 'Confirm & Issue'}
            </button>
          </div>

          <aside className="payroll-advance-preview">
            <div className="payroll-advance-sectionhead">
              <span className="payroll-advance-sectionhead__ic" aria-hidden="true">
                <Icon name="calendar" size={15} strokeWidth={1.8} />
              </span>
              <div>
                <h3>Live Deduction Preview</h3>
                <p>Review the repayment schedule before issuing.</p>
              </div>
            </div>

            {scheduleResult.ok ? (
              <>
                <div className="payroll-advance-chips" aria-hidden="true">
                  <span className="payroll-advance-chip">{previewChip.method}</span>
                  <span className="payroll-advance-chip">{previewChip.detail}</span>
                </div>
                <table className="payroll-advance-preview__table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleResult.schedules.map((row) => (
                      <tr key={`${row.payrollMonth}_${row.scheduledAmount}`}>
                        <td>{formatAdvanceMonthLabel(row.payrollMonth)}</td>
                        <td>{formatPayrollMoney(row.scheduledAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td>{formatPayrollMoney(previewTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </>
            ) : previewIncomplete ? (
              <div className="payroll-advance-preview__empty">
                <span className="payroll-advance-preview__empty-ic" aria-hidden="true">
                  <Icon name="calendar" size={18} strokeWidth={1.6} />
                </span>
                <p>Enter amount and issue details to preview the deduction schedule.</p>
              </div>
            ) : (
              <p className="payroll-advance-preview__error">{scheduleResult.error}</p>
            )}
          </aside>
        </div>
      )}

      {error && <div className="toast error">{error}</div>}
      {message && <div className="toast">{message}</div>}

      {importPreview && (
        <div className="payroll-advance-import">
          <strong>Import preview</strong>
          <div className="payroll-advance-import__meta">
            Total: {importPreview.totalRows} · Valid: {importPreview.valid} · Rejected: {importPreview.rejected}
          </div>
          <p className="payroll-add-hint">Issue Month YYYY-MM. Deduction Method: LUMP, EMI, or CUSTOM. Pay Month is optional for LUMP (blank = Issue Month + 1) and ignored for EMI/CUSTOM.</p>
          <div className="payroll-advance-import__rows">
            {importPreview.rows.filter((row) => row.status === 'rejected').slice(0, 30).map((row) => (
              <div key={row.rowNumber}>{row.rowNumber}: {row.employeeCode || '—'} — {row.status}: {row.message}</div>
            ))}
            {importPreview.rows.filter((row) => row.status === 'valid').slice(0, 10).map((row) => (
              <div key={row.rowNumber}>{row.rowNumber}: {row.employeeCode} — valid: {row.message}</div>
            ))}
          </div>
          {canModify && (
            <div className="payroll-advance-import__actions">
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

      <div className="payroll-advance-ledger">
        <div className="payroll-advance-ledger__head">
          <div className="payroll-advance-sectionhead">
            <span className="payroll-advance-sectionhead__ic" aria-hidden="true">
              <Icon name="list" size={15} strokeWidth={1.8} />
            </span>
            <div>
              <h3>Advance Ledger</h3>
              <p>{visibleAdvances.length} {visibleAdvances.length === 1 ? 'advance' : 'advances'}</p>
            </div>
          </div>
          <label className="payroll-advance-filter">
            Filter
            <select
              className="sel"
              value={ledgerFilter}
              onChange={(event) => setLedgerFilter(event.target.value as LedgerFilter)}
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
                      <td className="payroll-advance-empcell">
                        <div className="payroll-advance-empcell__name">{employee?.employee_name || code}</div>
                        <div className="payroll-advance-empcell__meta">{code} · {employee?.role ?? '—'}</div>
                      </td>
                      <td>
                        <div>{formatAdvanceMonthLabel(advance.issue_date)}</div>
                        {lumpPayMonth && (
                          <div className="payroll-advance-empcell__meta">Pay {formatAdvanceMonthLabel(lumpPayMonth)}</div>
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
                          <Icon name="calendar" size={13} strokeWidth={1.8} />
                          {expandedId === advance.id ? 'Hide schedule' : 'View schedule'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === advance.id && (
                      <tr>
                        <td colSpan={8}>
                          <table className="table payroll-advance-schedule" style={{ fontSize: '0.72rem', margin: '0.25rem 0' }}>
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
    </div>
  )
}
