import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createSalaryTypeEmployee,
  fetchCompensationMap,
  fetchPayrollEmployees,
  saveSalaryTypeMasterRow,
  setEmployeeActive,
  upsertCompensation,
} from '../../lib/api/payroll'
import { KNOWN_BUSINESS_ROLES, validateAndCanonicalizeRoles } from '../../lib/businessRoles'
import { isEmployeeCurrentlyActive } from '../../lib/employeeActive'
import { isBodyshopDepartment, normalizeDepartmentDisplay } from '../../lib/department'
import { formatCurrency } from '../../lib/payroll/calculations'
import {
  exportWorkbookWithTextAccounts,
  isUnsafeBankAccount,
  previewSalaryTypeImport,
  readWorkbookRows,
  validateIfsc,
} from '../../lib/payroll/excelUtils'
import { SALARY_TYPE_LABELS, type ImportPreviewResult, type PayrollEmployee, type SalaryType } from '../../lib/payroll/types'
import { supabase } from '../../lib/supabase'

const DEALER_CODE_RULES = [
  { key: '3000840', location: 'Sitapura', fuel_type: 'PV' },
  { key: '500A840', location: 'Sitapura', fuel_type: 'EV' },
  { key: '3001440', location: 'Ajmer Road', fuel_type: 'PV' },
] as const

const KNOWN_ROLE_OPTIONS = Array.from(KNOWN_BUSINESS_ROLES).sort((a, b) => a.localeCompare(b))

type AddEmployeeForm = {
  employeeCode: string
  employeeName: string
  department: string
  location: string
  role: string
  fuelType: string
  baseSalary: string
  salaryType: SalaryType
  accountNumber: string
  ifsc: string
  bankName: string
}

function emptyAddForm(): AddEmployeeForm {
  return {
    employeeCode: '',
    employeeName: '',
    department: '',
    location: '',
    role: '',
    fuelType: '',
    baseSalary: '',
    salaryType: 'base',
    accountNumber: '',
    ifsc: '',
    bankName: '',
  }
}

function deriveLocationAndFuelType(employeeCode: string): { key: string; location: string; fuel_type: string } | null {
  const normalizedCode = employeeCode.trim().toUpperCase()
  if (!normalizedCode) return null
  const match = DEALER_CODE_RULES.find((rule) => normalizedCode.includes(rule.key))
  if (!match) return null
  return { key: match.key, location: match.location, fuel_type: match.fuel_type }
}

type StatusScope = 'active' | 'inactive' | 'all'

interface Props {
  canModify: boolean
  isAdmin: boolean
}

function departmentOptionKey(value: string): string {
  return isBodyshopDepartment(value) ? 'BODYSHOP' : value
}

function collectDepartmentOptions(employees: PayrollEmployee[], current: string | null | undefined): string[] {
  const byKey = new Map<string, string>()
  for (const employee of employees) {
    const display = normalizeDepartmentDisplay(employee.department)
    if (!display) continue
    const key = departmentOptionKey(display)
    if (!byKey.has(key)) byKey.set(key, display)
  }
  const currentRaw = String(current ?? '').trim()
  if (currentRaw) {
    const currentDisplay = normalizeDepartmentDisplay(currentRaw)
    const key = departmentOptionKey(currentDisplay || currentRaw)
    if (!byKey.has(key)) byKey.set(key, currentRaw)
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b))
}

function collectBranchOptions(employees: PayrollEmployee[], current: string | null | undefined): string[] {
  const values = new Set<string>()
  for (const employee of employees) {
    const location = String(employee.location ?? '').trim()
    if (location) values.add(location)
  }
  const currentRaw = String(current ?? '').trim()
  if (currentRaw) values.add(currentRaw)
  return Array.from(values).sort((a, b) => a.localeCompare(b))
}

function parseBaseSalary(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const n = Number(String(raw).trim())
  if (!Number.isFinite(n)) return { ok: false, error: 'Base salary must be a finite number' }
  if (n < 0) return { ok: false, error: 'Base salary must be 0 or greater' }
  if (n >= 1e10) return { ok: false, error: 'Base salary exceeds allowed precision' }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export default function SalaryTypeTab({ canModify, isAdmin }: Props) {
  const [employees, setEmployees] = useState<PayrollEmployee[]>([])
  const [compMap, setCompMap] = useState<Awaited<ReturnType<typeof fetchCompensationMap>>>(new Map())
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [salaryTypeFilter, setSalaryTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusScope>('active')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<AddEmployeeForm>(emptyAddForm)
  const [addError, setAddError] = useState<string | null>(null)
  const [addSaving, setAddSaving] = useState(false)
  const [savingCode, setSavingCode] = useState<string | null>(null)
  const [lifecycleCode, setLifecycleCode] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [emps, comp] = await Promise.all([fetchPayrollEmployees(), fetchCompensationMap()])
    setEmployees(emps)
    setCompMap(comp)
  }, [])

  useEffect(() => { void reload() }, [reload])

  useEffect(() => {
    if (!showAdd) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !addSaving) {
        setShowAdd(false)
        setAddError(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAdd, addSaving])

  const depts = useMemo(
    () => Array.from(new Set(employees.map((e) => e.department?.trim()).filter(Boolean))).sort(),
    [employees],
  )
  const branches = useMemo(
    () => Array.from(new Set(employees.map((e) => e.location?.trim()).filter(Boolean))).sort(),
    [employees],
  )
  const filtered = useMemo(() => employees.filter((e) => {
    const code = e.employee_code.trim().toUpperCase()
    const comp = compMap.get(code)
    if (statusFilter === 'active' && !isEmployeeCurrentlyActive(e)) return false
    if (statusFilter === 'inactive' && isEmployeeCurrentlyActive(e)) return false
    if (search && !`${e.employee_name} ${e.employee_code}`.toLowerCase().includes(search.toLowerCase())) return false
    if (deptFilter !== 'all' && (e.department?.trim() ?? '') !== deptFilter) return false
    if (branchFilter !== 'all' && (e.location?.trim() ?? '') !== branchFilter) return false
    if (salaryTypeFilter !== 'all' && comp?.salary_type !== salaryTypeFilter) return false
    return true
  }), [employees, compMap, search, deptFilter, branchFilter, salaryTypeFilter, statusFilter])

  const addDepartmentOptions = useMemo(
    () => collectDepartmentOptions(employees, addForm.department),
    [employees, addForm.department],
  )
  const addBranchOptions = useMemo(
    () => collectBranchOptions(employees, addForm.location),
    [employees, addForm.location],
  )
  const dealerDerived = deriveLocationAndFuelType(addForm.employeeCode)

  async function handleSaveCompensation(code: string, baseSalary: number, salaryType: SalaryType) {
    if (!canModify || isAdmin) return
    setError(null)
    setMessage(null)
    setSavingCode(code)
    try {
      await upsertCompensation(code, baseSalary, salaryType)
      await reload()
      setMessage(`Saved compensation for ${code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingCode(null)
    }
  }

  async function handleSaveMasterRow(input: {
    employeeCode: string
    department: string | null
    location: string | null
    accountNumber: string | null
    ifsc: string | null
    bankName: string | null
    baseSalary: number
    salaryType: SalaryType
  }) {
    if (!isAdmin) return
    setError(null)
    setMessage(null)
    setSavingCode(input.employeeCode)
    try {
      await saveSalaryTypeMasterRow(input)
      await reload()
      setMessage(`Saved master and compensation for ${input.employeeCode}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingCode(null)
    }
  }

  async function handleLifecycle(employee: PayrollEmployee, nextActive: boolean) {
    if (!isAdmin) return
    const code = employee.employee_code.trim().toUpperCase()
    const label = `${employee.employee_code} — ${employee.employee_name}`
    if (!nextActive) {
      const confirmed = window.confirm(
        `Deactivate ${label}?\n\nThe employee will be removed from current operational selections. Historical records will remain.`,
      )
      if (!confirmed) return
    }
    setError(null)
    setMessage(null)
    setLifecycleCode(code)
    try {
      await setEmployeeActive(code, nextActive)
      await reload()
      setMessage(nextActive ? `Reactivated ${code}` : `Deactivated ${code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lifecycle update failed')
    } finally {
      setLifecycleCode(null)
    }
  }

  function closeAddModal() {
    if (addSaving) return
    setShowAdd(false)
    setAddError(null)
  }

  function openAddModal() {
    setAddForm(emptyAddForm())
    setAddError(null)
    setShowAdd(true)
  }

  function patchAddForm(patch: Partial<AddEmployeeForm>) {
    setAddForm((prev) => ({ ...prev, ...patch }))
  }

  async function handleCreateEmployee() {
    if (!isAdmin || addSaving) return
    const code = addForm.employeeCode.trim()
    const name = addForm.employeeName.trim()
    if (!code) {
      setAddError('Employee code is required')
      return
    }
    if (!name) {
      setAddError('Employee name is required')
      return
    }
    if (!addForm.baseSalary.trim()) {
      setAddError('Base salary is required')
      return
    }
    const parsed = parseBaseSalary(addForm.baseSalary)
    if (!parsed.ok) {
      setAddError(parsed.error)
      return
    }
    if (!['base', 'variable', 'both'].includes(addForm.salaryType)) {
      setAddError('Invalid salary type')
      return
    }
    const account = addForm.accountNumber.trim()
    if (isUnsafeBankAccount(account)) {
      setAddError('Bank account must remain exact text (no scientific notation or decimals)')
      return
    }
    const normalizedIfsc = addForm.ifsc.trim().toUpperCase()
    if (!validateIfsc(normalizedIfsc)) {
      setAddError('Invalid IFSC. Use 11 characters, for example ABCD0123456.')
      return
    }
    let role: string | null = emptyToNull(addForm.role)
    if (role) {
      const validated = validateAndCanonicalizeRoles(role)
      if (!validated.ok) {
        setAddError(validated.errors.join(' '))
        return
      }
      role = validated.canonical
    }

    setAddError(null)
    setError(null)
    setMessage(null)
    setAddSaving(true)
    try {
      await createSalaryTypeEmployee({
        employeeCode: code,
        employeeName: name,
        department: emptyToNull(normalizeDepartmentDisplay(addForm.department) || addForm.department),
        location: emptyToNull(addForm.location),
        role,
        fuelType: emptyToNull(addForm.fuelType),
        accountNumber: emptyToNull(account),
        ifsc: emptyToNull(normalizedIfsc),
        bankName: emptyToNull(addForm.bankName),
        baseSalary: parsed.value,
        salaryType: addForm.salaryType,
      })
      setShowAdd(false)
      setAddForm(emptyAddForm())
      await reload()
      setMessage(`Added ${code.trim().toUpperCase()}`)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add employee')
    } finally {
      setAddSaving(false)
    }
  }

  function handleExport() {
    const headers = ['Employee Code', 'Employee Name', 'Department', 'Branch', 'Role', 'Base Salary', 'Salary Type', 'Bank Account Number', 'Bank Name', 'IFSC']
    const rows = filtered.map((e) => {
      const code = e.employee_code.trim().toUpperCase()
      const comp = compMap.get(code)
      return [
        code, e.employee_name, e.department ?? '', e.location ?? '', e.role ?? '',
        comp?.base_salary ?? 0,
        comp ? SALARY_TYPE_LABELS[comp.salary_type] : '',
        e.account_number ?? '', e.bank_name ?? '', e.ifsc ?? '',
      ]
    })
    exportWorkbookWithTextAccounts('Salary Type', headers, rows, `Payroll_Salary_Type_${new Date().toISOString().slice(0, 10)}.xlsx`, [7])
  }

  async function handleImportFile(file: File) {
    const rows = await readWorkbookRows(file)
    const knownCodes = new Set(employees.map((e) => e.employee_code.trim().toUpperCase()))
    const existing = new Map<string, { base_salary: number; salary_type: SalaryType }>()
    compMap.forEach((v, k) => existing.set(k, { base_salary: Number(v.base_salary), salary_type: v.salary_type }))
    setImportPreview(previewSalaryTypeImport(rows, { knownCodes, existing }))
  }

  async function commitImport() {
    if (!importPreview || !canModify) return
    for (const row of importPreview.rows) {
      if (row.status !== 'valid' && row.status !== 'warning') continue
      const data = row.data as {
        base_salary: number
        salary_type: SalaryType
        account_number?: string
        ifsc?: string
        bank_name?: string
      }
      await upsertCompensation(row.employeeCode, data.base_salary, data.salary_type)
      const bankUpdate: Record<string, string | null> = {}
      if (data.account_number !== undefined) bankUpdate.account_number = data.account_number || null
      if (data.ifsc !== undefined) bankUpdate.ifsc = data.ifsc || null
      if (data.bank_name !== undefined) bankUpdate.bank_name = data.bank_name || null
      if (Object.keys(bankUpdate).length > 0) {
        await supabase.from('employee_master').update(bankUpdate).eq('employee_code', row.employeeCode)
      }
    }
    setImportPreview(null)
    await reload()
    setMessage('Salary type import committed')
  }

  const showActions = isAdmin || canModify

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <input placeholder="Search employee…" value={search} onChange={(ev) => setSearch(ev.target.value)} />
        <select value={statusFilter} onChange={(ev) => setStatusFilter(ev.target.value as StatusScope)}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <select value={deptFilter} onChange={(ev) => setDeptFilter(ev.target.value)}><option value="all">All departments</option>{depts.map((d) => <option key={d} value={d!}>{d}</option>)}</select>
        <select value={branchFilter} onChange={(ev) => setBranchFilter(ev.target.value)}><option value="all">All branches</option>{branches.map((b) => <option key={b} value={b!}>{b}</option>)}</select>
        <select value={salaryTypeFilter} onChange={(ev) => setSalaryTypeFilter(ev.target.value)}>
          <option value="all">All salary types</option>
          <option value="base">Base Salary</option>
          <option value="variable">Variable Salary</option>
          <option value="both">Base + Variable</option>
        </select>
        <span style={{ flex: 1 }} />
        {isAdmin && (
          <button type="button" className="btn btn--primary btn--sm" onClick={openAddModal}>+ Add Employee</button>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={handleExport}>Export</button>
        {canModify && (
          <label className="btn btn--ghost btn--sm" style={{ cursor: 'pointer' }}>
            Import
            <input type="file" accept=".xlsx,.xls" hidden onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void handleImportFile(f) }} />
          </label>
        )}
      </div>

      {error && <div className="toast error">{error}</div>}
      {message && <div className="toast">{message}</div>}

      {importPreview && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem' }}>
          <strong>Import preview</strong>
          <div style={{ fontSize: '0.78rem', margin: '0.35rem 0' }}>
            Total: {importPreview.totalRows} · Valid: {importPreview.valid} · Updates: {importPreview.updates} · Unchanged: {importPreview.unchanged} · Warnings: {importPreview.warnings} · Rejected: {importPreview.rejected}
          </div>
          {canModify && (
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => void commitImport()}>Commit valid rows</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setImportPreview(null)}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <div className="modal-back" role="presentation" onClick={closeAddModal}>
          <div
            className="modal modal--md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-employee-title"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: '720px' }}
          >
            <div className="modal__head">
              <h3 id="add-employee-title">Add Employee</h3>
              <button type="button" className="modal__x" onClick={closeAddModal} aria-label="Close" disabled={addSaving}>
                ✕
              </button>
            </div>
            <div className="modal__body">
              <div className="payroll-add-grid">
                {addError && <p className="payroll-add-error">{addError}</p>}
                <div className="payroll-add-field">
                  <label htmlFor="add-employee-code">Employee code *</label>
                  <input
                    id="add-employee-code"
                    value={addForm.employeeCode}
                    autoComplete="off"
                    disabled={addSaving}
                    onChange={(event) => {
                      const employeeCode = event.target.value
                      const derived = deriveLocationAndFuelType(employeeCode)
                      setAddForm((prev) => ({
                        ...prev,
                        employeeCode,
                        location: derived?.location ?? prev.location,
                        fuelType: derived?.fuel_type ?? prev.fuelType,
                      }))
                    }}
                  />
                </div>
                <div className="payroll-add-field">
                  <label htmlFor="add-employee-name">Employee name *</label>
                  <input
                    id="add-employee-name"
                    value={addForm.employeeName}
                    autoComplete="off"
                    disabled={addSaving}
                    onChange={(event) => patchAddForm({ employeeName: event.target.value })}
                  />
                </div>
                <div className="payroll-add-field">
                  <label htmlFor="add-employee-department">Department</label>
                  <input
                    id="add-employee-department"
                    list="add-employee-department-options"
                    value={addForm.department}
                    autoComplete="off"
                    disabled={addSaving}
                    onChange={(event) => patchAddForm({ department: event.target.value })}
                  />
                  <datalist id="add-employee-department-options">
                    {addDepartmentOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </div>
                <div className="payroll-add-field">
                  <label htmlFor="add-employee-branch">Branch</label>
                  <input
                    id="add-employee-branch"
                    list="add-employee-branch-options"
                    value={addForm.location}
                    autoComplete="off"
                    disabled={addSaving}
                    onChange={(event) => patchAddForm({ location: event.target.value })}
                  />
                  <datalist id="add-employee-branch-options">
                    {addBranchOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </div>
                <div className="payroll-add-field">
                  <label htmlFor="add-employee-role">Business role</label>
                  <input
                    id="add-employee-role"
                    list="add-employee-role-options"
                    value={addForm.role}
                    autoComplete="off"
                    disabled={addSaving}
                    placeholder="e.g. SA, TECHNICIAN"
                    onChange={(event) => patchAddForm({ role: event.target.value })}
                  />
                  <datalist id="add-employee-role-options">
                    {KNOWN_ROLE_OPTIONS.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </div>
                <div className="payroll-add-field">
                  <label htmlFor="add-employee-fuel">Fuel type</label>
                  <input
                    id="add-employee-fuel"
                    list="add-employee-fuel-options"
                    value={addForm.fuelType}
                    autoComplete="off"
                    disabled={addSaving}
                    placeholder="PV / EV"
                    onChange={(event) => patchAddForm({ fuelType: event.target.value })}
                  />
                  <datalist id="add-employee-fuel-options">
                    <option value="PV" />
                    <option value="EV" />
                  </datalist>
                </div>
                {dealerDerived && (
                  <p className="payroll-add-hint">
                    Codes containing {dealerDerived.key} are stored as {dealerDerived.location} / {dealerDerived.fuel_type} by the existing dealer-code rule.
                  </p>
                )}
                <div className="payroll-add-field">
                  <label htmlFor="add-employee-salary">Base salary *</label>
                  <input
                    id="add-employee-salary"
                    type="number"
                    min="0"
                    step="0.01"
                    value={addForm.baseSalary}
                    disabled={addSaving}
                    onChange={(event) => patchAddForm({ baseSalary: event.target.value })}
                  />
                </div>
                <div className="payroll-add-field">
                  <label htmlFor="add-employee-salary-type">Salary type *</label>
                  <select
                    id="add-employee-salary-type"
                    value={addForm.salaryType}
                    disabled={addSaving}
                    onChange={(event) => patchAddForm({ salaryType: event.target.value as SalaryType })}
                  >
                    <option value="base">Base Salary</option>
                    <option value="variable">Variable Salary</option>
                    <option value="both">Base + Variable</option>
                  </select>
                </div>
                <div className="payroll-add-field">
                  <label htmlFor="add-employee-account">Bank account number</label>
                  <input
                    id="add-employee-account"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={addForm.accountNumber}
                    disabled={addSaving}
                    onChange={(event) => patchAddForm({ accountNumber: event.target.value })}
                  />
                </div>
                <div className="payroll-add-field">
                  <label htmlFor="add-employee-ifsc">IFSC</label>
                  <input
                    id="add-employee-ifsc"
                    type="text"
                    autoComplete="off"
                    value={addForm.ifsc}
                    disabled={addSaving}
                    style={{ textTransform: 'uppercase' }}
                    onChange={(event) => patchAddForm({ ifsc: event.target.value.toUpperCase() })}
                  />
                </div>
                <div className="payroll-add-field">
                  <label htmlFor="add-employee-bank">Bank name</label>
                  <input
                    id="add-employee-bank"
                    type="text"
                    autoComplete="off"
                    value={addForm.bankName}
                    disabled={addSaving}
                    onChange={(event) => patchAddForm({ bankName: event.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="modal__foot">
              <button type="button" className="btn btn--ghost" onClick={closeAddModal} disabled={addSaving}>Cancel</button>
              <button type="button" className="btn btn--primary" onClick={() => void handleCreateEmployee()} disabled={addSaving}>
                {addSaving ? 'Adding…' : 'Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="payroll-table-scroll">
        <table className="table" style={{ fontSize: '0.78rem' }}>
          <thead>
            <tr>
              <th>Employee</th><th>Department</th><th>Branch</th><th>Base Salary</th><th>Salary Type</th>
              <th>Bank Account</th><th>IFSC</th><th>Bank Name</th><th>Status</th>
              {showActions && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const code = e.employee_code.trim().toUpperCase()
              const comp = compMap.get(code)
              return (
                <CompRow
                  key={`${code}|${e.department ?? ''}|${e.location ?? ''}|${e.account_number ?? ''}|${e.ifsc ?? ''}|${e.bank_name ?? ''}|${e.is_active}|${comp?.updated_at ?? ''}|${comp?.base_salary ?? ''}|${comp?.salary_type ?? ''}`}
                  employee={e}
                  comp={comp}
                  canModify={canModify}
                  isAdmin={isAdmin}
                  departmentOptions={collectDepartmentOptions(employees, e.department)}
                  branchOptions={collectBranchOptions(employees, e.location)}
                  busy={savingCode === code || lifecycleCode === code}
                  onSaveCompensation={(base, type) => void handleSaveCompensation(code, base, type)}
                  onSaveMaster={(payload) => void handleSaveMasterRow(payload)}
                  onLifecycle={(nextActive) => void handleLifecycle(e, nextActive)}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CompRow({
  employee, comp, canModify, isAdmin, departmentOptions, branchOptions, busy, onSaveCompensation, onSaveMaster, onLifecycle,
}: {
  employee: PayrollEmployee
  comp: Awaited<ReturnType<typeof fetchCompensationMap>> extends Map<string, infer V> ? V | undefined : never
  canModify: boolean
  isAdmin: boolean
  departmentOptions: string[]
  branchOptions: string[]
  busy: boolean
  onSaveCompensation: (base: number, type: SalaryType) => void
  onSaveMaster: (input: {
    employeeCode: string
    department: string | null
    location: string | null
    accountNumber: string | null
    ifsc: string | null
    bankName: string | null
    baseSalary: number
    salaryType: SalaryType
  }) => void
  onLifecycle: (nextActive: boolean) => void
}) {
  const [department, setDepartment] = useState(normalizeDepartmentDisplay(employee.department) || employee.department || '')
  const [location, setLocation] = useState(employee.location ?? '')
  const [accountNumber, setAccountNumber] = useState(employee.account_number ?? '')
  const [ifsc, setIfsc] = useState(employee.ifsc ?? '')
  const [bankName, setBankName] = useState(employee.bank_name ?? '')
  const [base, setBase] = useState(comp ? String(comp.base_salary) : '0')
  const [salaryType, setSalaryType] = useState<SalaryType>(comp?.salary_type ?? 'base')
  const [rowError, setRowError] = useState<string | null>(null)

  const code = employee.employee_code.trim().toUpperCase()
  const inactive = !isEmployeeCurrentlyActive(employee)
  const canEditCompensation = canModify || isAdmin
  const showSave = isAdmin || canModify

  function submit() {
    setRowError(null)
    const parsed = parseBaseSalary(base)
    if (!parsed.ok) {
      setRowError(parsed.error)
      return
    }
    if (!['base', 'variable', 'both'].includes(salaryType)) {
      setRowError('Invalid salary type')
      return
    }
    if (!isAdmin) {
      onSaveCompensation(parsed.value, salaryType)
      return
    }

    const account = accountNumber.trim()
    if (isUnsafeBankAccount(account)) {
      setRowError('Bank account must remain exact text (no scientific notation or decimals)')
      return
    }
    const normalizedIfsc = ifsc.trim().toUpperCase()
    if (!validateIfsc(normalizedIfsc)) {
      setRowError('Invalid IFSC. Use 11 characters, for example ABCD0123456.')
      return
    }

    onSaveMaster({
      employeeCode: code,
      department: emptyToNull(normalizeDepartmentDisplay(department) || department),
      location: emptyToNull(location),
      accountNumber: emptyToNull(account),
      ifsc: emptyToNull(normalizedIfsc),
      bankName: emptyToNull(bankName),
      baseSalary: parsed.value,
      salaryType,
    })
  }

  return (
    <tr>
      <td>{employee.employee_code} — {employee.employee_name}</td>
      <td>
        {isAdmin ? (
          <select value={department} onChange={(ev) => setDepartment(ev.target.value)} style={{ minWidth: '120px' }}>
            <option value="">—</option>
            {departmentOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : (employee.department ?? '—')}
      </td>
      <td>
        {isAdmin ? (
          <select value={location} onChange={(ev) => setLocation(ev.target.value)} style={{ minWidth: '120px' }}>
            <option value="">—</option>
            {branchOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : (employee.location ?? '—')}
      </td>
      <td>
        {canEditCompensation ? (
          <input type="number" min="0" step="0.01" value={base} onChange={(ev) => setBase(ev.target.value)} style={{ width: '90px' }} />
        ) : formatCurrency(Number(comp?.base_salary ?? 0))}
      </td>
      <td>
        {canEditCompensation ? (
          <select value={salaryType} onChange={(ev) => setSalaryType(ev.target.value as SalaryType)}>
            <option value="base">Base Salary</option>
            <option value="variable">Variable Salary</option>
            <option value="both">Base + Variable</option>
          </select>
        ) : comp ? SALARY_TYPE_LABELS[comp.salary_type] : '—'}
      </td>
      <td>
        {isAdmin ? (
          <input type="text" inputMode="numeric" autoComplete="off" value={accountNumber} onChange={(ev) => setAccountNumber(ev.target.value)} style={{ width: '140px' }} />
        ) : (employee.account_number ?? '—')}
      </td>
      <td>
        {isAdmin ? (
          <input type="text" autoComplete="off" value={ifsc} onChange={(ev) => setIfsc(ev.target.value)} style={{ width: '110px', textTransform: 'uppercase' }} />
        ) : (employee.ifsc ?? '—')}
      </td>
      <td>
        {isAdmin ? (
          <input type="text" value={bankName} onChange={(ev) => setBankName(ev.target.value)} style={{ width: '130px' }} />
        ) : (employee.bank_name ?? '—')}
      </td>
      <td>
        {inactive ? (
          <span style={{ display: 'inline-block', padding: '0.1rem 0.4rem', borderRadius: '999px', background: '#fee2e2', color: '#991b1b', fontWeight: 700, fontSize: '0.68rem' }}>INACTIVE</span>
        ) : (
          <span style={{ display: 'inline-block', padding: '0.1rem 0.4rem', borderRadius: '999px', background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: '0.68rem' }}>ACTIVE</span>
        )}
      </td>
      {(isAdmin || canModify) && (
        <td>
          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
            {showSave && (
              <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={submit}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                disabled={busy}
                onClick={() => onLifecycle(inactive)}
              >
                {inactive ? 'Reactivate' : 'Deactivate'}
              </button>
            )}
          </div>
          {rowError && <div style={{ color: '#b91c1c', fontSize: '0.7rem', marginTop: '0.25rem', whiteSpace: 'normal', maxWidth: '220px' }}>{rowError}</div>}
        </td>
      )}
    </tr>
  )
}
