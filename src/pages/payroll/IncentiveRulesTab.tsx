import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createEmployeeIncentive,
  deleteEmployeeIncentive,
  fetchCompensationMap,
  fetchEmployeeIncentivesForMonth,
  fetchPayrollEmployees,
  fetchPayrollMonth,
  updateEmployeeIncentive,
} from '../../lib/api/payroll'
import {
  calcEmployeeIncentiveAmount,
  formatPayrollMoney,
  parseNonNegativeIncentivePercent,
  parseNonNegativePayrollMoney,
} from '../../lib/payroll/calculations'
import {
  EMPLOYEE_INCENTIVE_CALCULATION_METHOD_LABELS,
  EMPLOYEE_INCENTIVE_TYPES,
  isEmployeeIncentiveCalculationMethod,
  isEmployeeIncentiveType,
} from '../../lib/payroll/types'
import type {
  EmployeeIncentiveCalculationMethod,
  EmployeeIncentiveType,
  ImportPreviewResult,
  PayrollEmployee,
  PayrollEmployeeIncentive,
} from '../../lib/payroll/types'
import {
  EMPLOYEE_INCENTIVE_EXPORT_HEADERS,
  exportWorkbook,
  payrollEmployeeIncentiveFilename,
  previewEmployeeIncentiveImport,
  readWorkbookRows,
} from '../../lib/payroll/excelUtils'
import { supabase } from '../../lib/supabase'
import { usePayrollSecurity } from './PayrollSecurityGate'

interface SettingRow {
  key: string
  value: string
  updated_at?: string
}

interface Props {
  canModify: boolean
  payrollMonth: string
  monthInput: string
  onMonthChange: (value: string) => void
}

const MONTH_OPTIONS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
] as const

interface DraftRow {
  key: string
  id: number | null
  employeeCode: string
  calculationMethod: EmployeeIncentiveCalculationMethod
  value: string
  incentivePercent: string
  amount: string
  incentiveType: EmployeeIncentiveType | ''
  description: string
  editing: boolean
}

function SettingsTable({
  title,
  table,
  roleLabel,
  canModify,
}: {
  title: string
  table: 'sa_earnings_settings' | 'technician_earnings_settings'
  roleLabel: string
  canModify: boolean
}) {
  const [rows, setRows] = useState<SettingRow[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { requireSecurityThen } = usePayrollSecurity()

  useEffect(() => {
    void (async () => {
      const res = await supabase.from(table).select('key, value, updated_at').order('key')
      if (!res.error && res.data) {
        setRows(res.data as SettingRow[])
        const d: Record<string, string> = {}
        ;(res.data as SettingRow[]).forEach((r) => { d[r.key] = r.value })
        setDraft(d)
      }
    })()
  }, [table])

  async function handleSave() {
    await requireSecurityThen(async () => {
      setSaving(true)
      setError(null)
      setMessage(null)
      try {
        const upserts = Object.entries(draft).map(([key, value]) => ({ key, value }))
        const res = await supabase.from(table).upsert(upserts)
        if (res.error) throw new Error(res.error.message)
        setMessage(`${title} settings saved`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed')
      } finally {
        setSaving(false)
      }
    })
  }

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem' }}>{title}</h3>
      <div className="payroll-table-scroll" style={{ maxHeight: 'min(40vh, 360px)', maxWidth: '720px' }}>
      <table className="table" style={{ fontSize: '0.78rem' }}>
        <thead>
          <tr>
            <th>Rule Group</th>
            <th>Applicable Role</th>
            <th>Setting / Rule</th>
            <th>Value</th>
            <th>Last Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>Variable Earnings</td>
              <td>{roleLabel}</td>
              <td>{row.key.replace(/_/g, ' ')}</td>
              <td>
                {canModify ? (
                  <input
                    value={draft[row.key] ?? row.value}
                    onChange={(ev) => setDraft((prev) => ({ ...prev, [row.key]: ev.target.value }))}
                    style={{ width: '80px' }}
                  />
                ) : row.value}
              </td>
              <td>{row.updated_at ? new Date(row.updated_at).toLocaleString('en-IN') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {canModify && (
        <button type="button" className="btn btn--primary btn--sm" style={{ marginTop: '0.5rem' }} disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Saving…' : `Save ${title} Rules`}
        </button>
      )}
      {message && <div className="toast" style={{ marginTop: '0.5rem' }}>{message}</div>}
      {error && <div className="toast error" style={{ marginTop: '0.5rem' }}>{error}</div>}
      <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.5rem' }}>
        Edits update the same {table} authority used by {roleLabel} Tracker. Payroll variable earnings reuse these rules.
      </p>
    </div>
  )
}

function persistedToDraft(row: PayrollEmployeeIncentive): DraftRow {
  return {
    key: `saved-${row.id}`,
    id: row.id,
    employeeCode: row.employee_code.trim().toUpperCase(),
    calculationMethod: row.calculation_method === 'fixed' ? 'fixed' : 'percentage',
    value: row.value == null ? '' : String(row.value),
    incentivePercent: row.incentive_percent == null ? '' : String(row.incentive_percent),
    amount: String(row.amount),
    incentiveType: isEmployeeIncentiveType(row.incentive_type) ? row.incentive_type : '',
    description: row.description ?? '',
    editing: false,
  }
}

function displayDerivedAmount(valueRaw: string, percentRaw: string): string {
  const valueParsed = parseNonNegativePayrollMoney(valueRaw)
  const percentParsed = parseNonNegativeIncentivePercent(percentRaw)
  if (!valueParsed.ok || !percentParsed.ok) return '—'
  try {
    return formatPayrollMoney(calcEmployeeIncentiveAmount(valueParsed.value, percentParsed.value))
  } catch {
    return '—'
  }
}

function derivedAmountNumber(valueRaw: string, percentRaw: string): number | null {
  const valueParsed = parseNonNegativePayrollMoney(valueRaw)
  const percentParsed = parseNonNegativeIncentivePercent(percentRaw)
  if (!valueParsed.ok || !percentParsed.ok) return null
  try {
    return calcEmployeeIncentiveAmount(valueParsed.value, percentParsed.value)
  } catch {
    return null
  }
}

function displayRowAmount(row: DraftRow): string {
  if (row.editing && row.calculationMethod === 'percentage') {
    return displayDerivedAmount(row.value, row.incentivePercent)
  }
  const amount = Number(row.amount)
  if (row.amount.trim() && Number.isFinite(amount)) return formatPayrollMoney(amount)
  return '—'
}

function EmployeeMonthlyIncentives({
  canModify,
  payrollMonth,
  monthInput,
  onMonthChange,
}: Props) {
  const [rows, setRows] = useState<DraftRow[]>([])
  const [persisted, setPersisted] = useState<PayrollEmployeeIncentive[]>([])
  const [eligibleEmployees, setEligibleEmployees] = useState<PayrollEmployee[]>([])
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null)
  const { requireSecurityThen } = usePayrollSecurity()

  const [selectedYear, selectedMonth] = useMemo(() => {
    const [year, month] = monthInput.split('-')
    return [year ?? '', month ?? '']
  }, [monthInput])

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear()
    const selected = Number(selectedYear)
    const years = new Set<number>()
    for (let year = current - 4; year <= current + 1; year += 1) years.add(year)
    if (Number.isFinite(selected) && selected > 0) years.add(selected)
    return Array.from(years).sort((a, b) => a - b)
  }, [selectedYear])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [emps, comp, incentives, monthState] = await Promise.all([
        fetchPayrollEmployees(),
        fetchCompensationMap(),
        fetchEmployeeIncentivesForMonth(payrollMonth),
        fetchPayrollMonth(payrollMonth),
      ])
      setEligibleEmployees(
        emps.filter((employee) => comp.has(employee.employee_code.trim().toUpperCase())),
      )
      setPersisted(incentives)
      setRows(incentives.map(persistedToDraft))
      setLocked(monthState?.status === 'finalized')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load incentives')
    } finally {
      setLoading(false)
    }
  }, [payrollMonth])

  useEffect(() => { void reload() }, [reload])

  const employeeByCode = useMemo(() => {
    const map = new Map<string, PayrollEmployee>()
    eligibleEmployees.forEach((employee) => {
      map.set(employee.employee_code.trim().toUpperCase(), employee)
    })
    return map
  }, [eligibleEmployees])

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function handleAdd() {
    if (!canModify || locked) return
    setMessage(null)
    setError(null)
    setRows((prev) => [
      ...prev,
      {
        key: `draft-${Date.now()}`,
        id: null,
        employeeCode: '',
        calculationMethod: 'percentage',
        value: '',
        incentivePercent: '',
        amount: '',
        incentiveType: '',
        description: '',
        editing: true,
      },
    ])
  }

  function setRowMethod(key: string, method: EmployeeIncentiveCalculationMethod) {
    setRows((prev) => prev.map((row) => {
      if (row.key !== key) return row
      if (method === 'fixed') {
        const derived = derivedAmountNumber(row.value, row.incentivePercent)
        return {
          ...row,
          calculationMethod: 'fixed',
          amount: row.amount.trim() || (derived == null ? '' : String(derived)),
        }
      }
      return { ...row, calculationMethod: 'percentage' }
    }))
  }

  async function handleSave(row: DraftRow) {
    if (!canModify || locked) return
    await requireSecurityThen(async () => {
      setSavingKey(row.key)
      setError(null)
      setMessage(null)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (row.id == null) {
          await createEmployeeIncentive({
            employeeCode: row.employeeCode,
            payrollMonth,
            incentiveType: row.incentiveType,
            calculationMethod: row.calculationMethod,
            value: row.value,
            incentivePercent: row.incentivePercent,
            amount: row.amount,
            description: row.description,
            createdBy: user?.email ?? 'unknown',
          })
          setMessage('Incentive added')
        } else {
          await updateEmployeeIncentive({
            id: row.id,
            employeeCode: row.employeeCode,
            incentiveType: row.incentiveType,
            calculationMethod: row.calculationMethod,
            value: row.value,
            incentivePercent: row.incentivePercent,
            amount: row.amount,
            description: row.description,
          })
          setMessage('Incentive updated')
        }
        await reload()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed')
      } finally {
        setSavingKey(null)
      }
    })
  }

  async function handleDelete(row: DraftRow) {
    if (!canModify || locked) return
    if (row.id == null) {
      setRows((prev) => prev.filter((item) => item.key !== row.key))
      return
    }
    if (!window.confirm('Delete this incentive row?')) return
    await requireSecurityThen(async () => {
      setSavingKey(row.key)
      setError(null)
      setMessage(null)
      try {
        await deleteEmployeeIncentive(row.id as number)
        setMessage('Incentive deleted')
        await reload()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed')
      } finally {
        setSavingKey(null)
      }
    })
  }

  function handleExport() {
    const headers = [...EMPLOYEE_INCENTIVE_EXPORT_HEADERS]
    const exportRows = persisted.map((row) => {
      const code = row.employee_code.trim().toUpperCase()
      const employee = employeeByCode.get(code)
      const method = row.calculation_method === 'fixed' ? 'fixed' : 'percentage'
      return [
        row.id,
        payrollMonth.slice(0, 7),
        code,
        employee?.employee_name ?? '',
        row.value ?? '',
        row.incentive_percent ?? '',
        row.amount,
        row.incentive_type,
        row.description ?? '',
        EMPLOYEE_INCENTIVE_CALCULATION_METHOD_LABELS[method],
      ]
    })
    exportWorkbook('Employee Incentives', headers, exportRows, payrollEmployeeIncentiveFilename(monthInput))
  }

  async function handleImportFile(file: File) {
    if (!canModify || locked) return
    setError(null)
    setMessage(null)
    const workbookRows = await readWorkbookRows(file)
    const knownCodes = new Set(eligibleEmployees.map((employee) => employee.employee_code.trim().toUpperCase()))
    const existingById = new Map(persisted.map((row) => [row.id, {
      payrollMonth: `${String(row.payroll_month).slice(0, 7)}-01`,
      employeeCode: row.employee_code.trim().toUpperCase(),
      incentiveType: row.incentive_type,
      calculationMethod: (row.calculation_method === 'fixed' ? 'fixed' : 'percentage') as EmployeeIncentiveCalculationMethod,
      value: row.value,
      incentivePercent: row.incentive_percent,
      amount: Number(row.amount),
      description: row.description,
    }]))
    setImportPreview(previewEmployeeIncentiveImport(workbookRows, {
      payrollMonth,
      knownCodes,
      existingById,
    }))
  }

  async function commitImport() {
    if (!importPreview || !canModify || locked) return
    await requireSecurityThen(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const actor = user?.email ?? 'unknown'
      for (const row of importPreview.rows) {
        if (row.status !== 'valid' && row.status !== 'warning') continue
        const data = row.data as {
          id: number | null
          employeeCode: string
          incentiveType: string
          calculationMethod: string
          value: number | null
          incentivePercent: number | null
          amount: number
          description: string | null
        }
        if (data.id == null) {
          await createEmployeeIncentive({
            employeeCode: data.employeeCode,
            payrollMonth,
            incentiveType: data.incentiveType,
            calculationMethod: data.calculationMethod,
            value: data.value,
            incentivePercent: data.incentivePercent,
            amount: data.amount,
            description: data.description,
            createdBy: actor,
          })
        } else {
          await updateEmployeeIncentive({
            id: data.id,
            employeeCode: data.employeeCode,
            incentiveType: data.incentiveType,
            calculationMethod: data.calculationMethod,
            value: data.value,
            incentivePercent: data.incentivePercent,
            amount: data.amount,
            description: data.description,
          })
        }
      }
      setImportPreview(null)
      await reload()
      setMessage('Incentive import committed')
    })
  }

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, marginRight: '0.5rem' }}>Employee Monthly Incentives</h3>
        <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Month</label>
        <select
          value={selectedMonth}
          onChange={(ev) => onMonthChange(`${selectedYear}-${ev.target.value}`)}
          style={{ padding: '0.3rem 0.5rem' }}
        >
          {MONTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Year</label>
        <select
          value={selectedYear}
          onChange={(ev) => onMonthChange(`${ev.target.value}-${selectedMonth}`)}
          style={{ padding: '0.3rem 0.5rem' }}
        >
          {yearOptions.map((year) => (
            <option key={year} value={String(year)}>{year}</option>
          ))}
        </select>
        <span style={{
          padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700,
          background: locked ? '#dcfce7' : '#fef9c3',
          color: locked ? '#166534' : '#854d0e',
        }}>
          {locked ? 'FINALIZED' : 'DRAFT'}
        </span>
        <span style={{ flex: 1 }} />
        {canModify && !locked && (
          <label className="btn btn--ghost btn--sm" style={{ cursor: 'pointer' }}>
            Import
            <input type="file" accept=".xlsx,.xls" hidden onChange={(ev) => {
              const file = ev.target.files?.[0]
              ev.target.value = ''
              if (file) void handleImportFile(file)
            }} />
          </label>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={handleExport}>Export</button>
        {canModify && !locked && (
          <button type="button" className="btn btn--primary btn--sm" onClick={handleAdd}>+ Add Incentive</button>
        )}
      </div>
      {loading && <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.35rem' }}>Loading incentives…</div>}
      {error && <div className="toast error">{error}</div>}
      {message && <div className="toast">{message}</div>}
      {importPreview && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem' }}>
          <strong>Import preview</strong>
          <div style={{ fontSize: '0.78rem', margin: '0.35rem 0' }}>
            Total: {importPreview.totalRows} · Valid: {importPreview.valid} · Updates: {importPreview.updates} · Unchanged: {importPreview.unchanged} · Warnings: {importPreview.warnings} · Rejected: {importPreview.rejected}
          </div>
          <div style={{ maxHeight: '180px', overflow: 'auto', fontSize: '0.75rem' }}>
            {importPreview.rows.filter((r) => r.status === 'rejected' || r.status === 'warning').slice(0, 20).map((r) => (
              <div key={r.rowNumber}>{r.rowNumber}: {r.employeeCode || '—'} — {r.status}: {r.message}</div>
            ))}
          </div>
          {canModify && !locked && (
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => void commitImport()}>Commit valid rows</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setImportPreview(null)}>Cancel</button>
            </div>
          )}
        </div>
      )}
      <div className="payroll-table-scroll">
        <table className="table" style={{ fontSize: '0.78rem' }}>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Code</th>
              <th>Calculation</th>
              <th>Value</th>
              <th>Incentive %</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ color: '#64748b' }}>No employee incentives for this month.</td>
              </tr>
            )}
            {rows.map((row) => {
              const employee = employeeByCode.get(row.employeeCode)
              const busy = savingKey === row.key
              const readOnly = !row.editing || locked || !canModify
              return (
                <tr key={row.key}>
                  <td>
                    {readOnly ? (employee?.employee_name ?? (row.employeeCode || '—')) : (
                      <select
                        value={row.employeeCode}
                        onChange={(ev) => updateRow(row.key, { employeeCode: ev.target.value })}
                        style={{ minWidth: '160px' }}
                      >
                        <option value="">Select employee…</option>
                        {eligibleEmployees.map((item) => {
                          const code = item.employee_code.trim().toUpperCase()
                          return (
                            <option key={code} value={code}>
                              {item.employee_name} ({code})
                            </option>
                          )
                        })}
                      </select>
                    )}
                  </td>
                  <td>{row.employeeCode || '—'}</td>
                  <td>
                    {readOnly ? EMPLOYEE_INCENTIVE_CALCULATION_METHOD_LABELS[row.calculationMethod] : (
                      <select
                        value={row.calculationMethod}
                        onChange={(ev) => {
                          const next = ev.target.value
                          if (isEmployeeIncentiveCalculationMethod(next)) setRowMethod(row.key, next)
                        }}
                      >
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed Amount</option>
                      </select>
                    )}
                  </td>
                  <td>
                    {readOnly ? (row.value || '—') : (
                      <input
                        value={row.value}
                        onChange={(ev) => updateRow(row.key, { value: ev.target.value })}
                        style={{ width: '90px' }}
                        inputMode="decimal"
                        disabled={row.calculationMethod === 'fixed'}
                      />
                    )}
                  </td>
                  <td>
                    {readOnly ? (row.incentivePercent || '—') : (
                      <input
                        value={row.incentivePercent}
                        onChange={(ev) => updateRow(row.key, { incentivePercent: ev.target.value })}
                        style={{ width: '70px' }}
                        inputMode="decimal"
                        disabled={row.calculationMethod === 'fixed'}
                      />
                    )}
                  </td>
                  <td>
                    {readOnly ? (row.incentiveType || '—') : (
                      <select
                        value={row.incentiveType}
                        onChange={(ev) => updateRow(row.key, {
                          incentiveType: isEmployeeIncentiveType(ev.target.value) ? ev.target.value : '',
                        })}
                      >
                        <option value="">Select type…</option>
                        {EMPLOYEE_INCENTIVE_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {readOnly || row.calculationMethod === 'percentage' ? displayRowAmount(row) : (
                      <input
                        value={row.amount}
                        onChange={(ev) => updateRow(row.key, { amount: ev.target.value })}
                        style={{ width: '90px' }}
                        inputMode="decimal"
                      />
                    )}
                  </td>
                  <td>
                    {readOnly ? (row.description || '—') : (
                      <input
                        value={row.description}
                        onChange={(ev) => updateRow(row.key, { description: ev.target.value })}
                        style={{ minWidth: '140px' }}
                      />
                    )}
                  </td>
                  <td>
                    {canModify && !locked && (
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {row.editing ? (
                          <>
                            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => void handleSave(row)}>
                              {busy ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              disabled={busy}
                              onClick={() => {
                                if (row.id == null) {
                                  setRows((prev) => prev.filter((item) => item.key !== row.key))
                                  return
                                }
                                void reload()
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => updateRow(row.key, { editing: true })}>
                              Edit
                            </button>
                            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void handleDelete(row)}>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.5rem' }}>
        Percentage amount = Value × Incentive % / 100. Fixed amount is entered directly. Multiple rows per employee and month are allowed. Recompute Payroll to include the month total in Net.
        Only employees with a payroll compensation profile can be selected.
      </p>
    </div>
  )
}

export default function IncentiveRulesTab({ canModify, payrollMonth, monthInput, onMonthChange }: Props) {
  return (
    <div>
      <EmployeeMonthlyIncentives
        canModify={canModify}
        payrollMonth={payrollMonth}
        monthInput={monthInput}
        onMonthChange={onMonthChange}
      />
      <SettingsTable title="Service Advisor Earnings" table="sa_earnings_settings" roleLabel="Service Advisor" canModify={canModify} />
      <SettingsTable title="Technician Earnings" table="technician_earnings_settings" roleLabel="Technician" canModify={canModify} />
    </div>
  )
}
