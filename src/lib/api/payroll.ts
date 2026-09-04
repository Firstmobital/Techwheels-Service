import { supabase } from '../supabase'
import { computePayrollAmounts, parsePayrollMonthInput, salaryTypeIncludesVariable } from '../payroll/calculations'
import { fetchMonthlyVariableEarnings } from '../payroll/variableEarnings'
import type {
  PayrollAdvance,
  PayrollAdvanceSchedule,
  PayrollAttendance,
  PayrollCompensation,
  PayrollEmployee,
  PayrollEntry,
  PayrollMonth,
  SalaryType,
} from '../payroll/types'

/** Returns all employees including inactive. Do not use for current operational assignment pickers. */
export async function fetchPayrollEmployees(): Promise<PayrollEmployee[]> {
  const res = await supabase
    .from('employee_master')
    .select('id, employee_code, employee_name, department, location, role, bank_name, account_number, ifsc, is_active')
    .order('employee_name')
  if (res.error) throw new Error(res.error.message)
  return ((res.data ?? []) as PayrollEmployee[]).map((row) => ({
    ...row,
    is_active: row.is_active !== false,
  }))
}

export async function fetchCompensationMap(): Promise<Map<string, PayrollCompensation>> {
  const res = await supabase.from('payroll_compensation').select('*')
  if (res.error) throw new Error(res.error.message)
  const map = new Map<string, PayrollCompensation>()
  ;(res.data ?? []).forEach((row) => {
    const code = String((row as PayrollCompensation).employee_code).trim().toUpperCase()
    map.set(code, row as PayrollCompensation)
  })
  return map
}

export async function upsertCompensation(
  employeeCode: string,
  baseSalary: number,
  salaryType: SalaryType,
): Promise<void> {
  const res = await supabase.from('payroll_compensation').upsert(
    {
      employee_code: employeeCode.trim().toUpperCase(),
      base_salary: baseSalary,
      salary_type: salaryType,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'employee_code' },
  )
  if (res.error) throw new Error(res.error.message)
}

export async function fetchAttendanceForMonth(payrollMonth: string): Promise<Map<string, PayrollAttendance>> {
  const month = parsePayrollMonthInput(payrollMonth)
  if (!month) throw new Error('Invalid payroll month')
  const res = await supabase.from('payroll_attendance').select('*').eq('payroll_month', month)
  if (res.error) throw new Error(res.error.message)
  const map = new Map<string, PayrollAttendance>()
  ;(res.data ?? []).forEach((row) => {
    map.set(String((row as PayrollAttendance).employee_code).trim().toUpperCase(), row as PayrollAttendance)
  })
  return map
}

export async function saveAttendance(
  employeeCode: string,
  payrollMonth: string,
  payableDays: number,
  notes: string | null,
): Promise<void> {
  const month = parsePayrollMonthInput(payrollMonth)
  if (!month) throw new Error('Invalid payroll month')
  const res = await supabase.from('payroll_attendance').upsert(
    {
      employee_code: employeeCode.trim().toUpperCase(),
      payroll_month: month,
      payable_days: payableDays,
      notes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'employee_code,payroll_month' },
  )
  if (res.error) throw new Error(res.error.message)
}

export async function fetchPayrollMonth(payrollMonth: string): Promise<PayrollMonth | null> {
  const month = parsePayrollMonthInput(payrollMonth)
  if (!month) return null
  const res = await supabase.from('payroll_months').select('*').eq('payroll_month', month).maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return (res.data as PayrollMonth | null) ?? null
}

export async function fetchPayrollEntries(payrollMonth: string): Promise<PayrollEntry[]> {
  const month = parsePayrollMonthInput(payrollMonth)
  if (!month) throw new Error('Invalid payroll month')
  const res = await supabase.from('payroll_entries').select('*').eq('payroll_month', month)
  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []) as PayrollEntry[]
}

export async function fetchAdvances(): Promise<PayrollAdvance[]> {
  const res = await supabase.from('payroll_advances').select('*').order('created_at', { ascending: false })
  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []) as PayrollAdvance[]
}

export async function fetchAdvanceSchedules(advanceId?: number): Promise<PayrollAdvanceSchedule[]> {
  let q = supabase.from('payroll_advance_schedules').select('*').order('payroll_month')
  if (advanceId) q = q.eq('advance_id', advanceId)
  const res = await q
  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []) as PayrollAdvanceSchedule[]
}

export async function createAdvance(input: {
  employeeCode: string
  originalAmount: number
  deductionType: 'lump_sum' | 'emi' | 'custom'
  notes?: string
  createdBy: string
  schedules: Array<{ payrollMonth: string; scheduledAmount: number }>
}): Promise<void> {
  const advRes = await supabase.from('payroll_advances').insert({
    employee_code: input.employeeCode.trim().toUpperCase(),
    original_amount: input.originalAmount,
    recovered_amount: 0,
    deduction_type: input.deductionType,
    status: 'active',
    notes: input.notes ?? null,
    created_by: input.createdBy,
  }).select('id').single()
  if (advRes.error) throw new Error(advRes.error.message)
  const advanceId = (advRes.data as { id: number }).id

  if (input.schedules.length > 0) {
    const schedRes = await supabase.from('payroll_advance_schedules').insert(
      input.schedules.map((s) => ({
        advance_id: advanceId,
        payroll_month: parsePayrollMonthInput(s.payrollMonth),
        scheduled_amount: s.scheduledAmount,
        applied_amount: 0,
        status: 'pending',
      })),
    )
    if (schedRes.error) throw new Error(schedRes.error.message)
  }
}

async function getAdvanceDeductionForMonth(employeeCode: string, payrollMonth: string): Promise<number> {
  const month = parsePayrollMonthInput(payrollMonth)
  if (!month) return 0
  const code = employeeCode.trim().toUpperCase()

  const advRes = await supabase
    .from('payroll_advances')
    .select('id')
    .eq('employee_code', code)
    .eq('status', 'active')
  if (advRes.error) throw new Error(advRes.error.message)
  const advanceIds = (advRes.data ?? []).map((r) => (r as { id: number }).id)
  if (advanceIds.length === 0) return 0

  const schedRes = await supabase
    .from('payroll_advance_schedules')
    .select('scheduled_amount, status')
    .eq('payroll_month', month)
    .in('advance_id', advanceIds)
    .eq('status', 'pending')
  if (schedRes.error) throw new Error(schedRes.error.message)

  return (schedRes.data ?? []).reduce(
    (sum, row) => sum + Number((row as { scheduled_amount: number }).scheduled_amount ?? 0),
    0,
  )
}

export async function recomputePayrollMonth(payrollMonth: string): Promise<PayrollEntry[]> {
  const month = parsePayrollMonthInput(payrollMonth)
  if (!month) throw new Error('Invalid payroll month')

  const monthState = await fetchPayrollMonth(month)
  if (monthState?.status === 'finalized') {
    throw new Error('Cannot recompute a finalized payroll month')
  }

  const [employees, compMap, attendanceMap, existingEntries] = await Promise.all([
    fetchPayrollEmployees(),
    fetchCompensationMap(),
    fetchAttendanceForMonth(month),
    fetchPayrollEntries(month),
  ])

  const existingByCode = new Map(existingEntries.map((e) => [e.employee_code.trim().toUpperCase(), e]))
  const employeeCodes = employees.map((e) => e.employee_code.trim().toUpperCase())
  const variableMap = await fetchMonthlyVariableEarnings(month, employeeCodes)

  const upsertRows: Array<Record<string, unknown>> = []

  for (const emp of employees) {
    const code = emp.employee_code.trim().toUpperCase()
    const comp = compMap.get(code)
    if (!comp) continue

    const attendance = attendanceMap.get(code)
    const payableDays = attendance?.payable_days ?? 0
    const variable = variableMap.get(code)
    const saVar = variable?.saEarning ?? 0
    const techVar = variable?.technicianEarning ?? 0

    const role = String(emp.role ?? '').trim().toUpperCase()
    let finalSaVar = saVar
    let finalTechVar = techVar
    if (role.includes('SERVICE') || role.includes('SA') || role.includes('ADVISOR')) {
      finalTechVar = 0
    } else if (role.includes('TECH')) {
      finalSaVar = 0
    }

    const existing = existingByCode.get(code)
    const customAdditions = existing?.custom_additions ?? 0
    const otherDeductions = existing?.other_deductions ?? 0
    const advanceDeduction = await getAdvanceDeductionForMonth(code, month)

    const needsReview = salaryTypeIncludesVariable(comp.salary_type) && finalSaVar + finalTechVar <= 0

    const amounts = computePayrollAmounts({
      salaryType: comp.salary_type,
      baseSalary: Number(comp.base_salary),
      payableDays,
      saVariableEarning: finalSaVar,
      technicianVariableEarning: finalTechVar,
      customAdditions,
      otherDeductions,
      advanceDeduction,
    })

    upsertRows.push({
      employee_code: code,
      payroll_month: month,
      salary_type_snapshot: comp.salary_type,
      base_salary_snapshot: comp.base_salary,
      payable_days_snapshot: payableDays,
      employee_name_snapshot: emp.employee_name ?? null,
      department_snapshot: emp.department ?? null,
      branch_snapshot: emp.location ?? null,
      role_snapshot: emp.role ?? null,
      bank_name_snapshot: emp.bank_name ?? null,
      account_number_snapshot: emp.account_number ?? null,
      ifsc_snapshot: emp.ifsc ?? null,
      earned_base: amounts.earnedBase,
      sa_variable_earning: finalSaVar,
      technician_variable_earning: finalTechVar,
      variable_earning_total: amounts.variableTotal,
      custom_additions: customAdditions,
      other_deductions: otherDeductions,
      advance_deduction: advanceDeduction,
      gross_payout: amounts.grossPayout,
      net_payable: amounts.netPayable,
      variable_source_detail: {
        ...(variable?.detail ?? {}),
        role: emp.role,
        needsReview,
        reviewReason: needsReview ? 'No applicable variable source for payroll month' : undefined,
      },
      review_flags: needsReview ? { needsReview: true } : null,
      computed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  if (upsertRows.length > 0) {
    const res = await supabase.from('payroll_entries').upsert(upsertRows, { onConflict: 'employee_code,payroll_month' })
    if (res.error) throw new Error(res.error.message)
  }

  return fetchPayrollEntries(month)
}

export async function finalizePayrollMonth(payrollMonth: string, actor: string): Promise<void> {
  const month = parsePayrollMonthInput(payrollMonth)
  if (!month) throw new Error('Invalid payroll month')
  await recomputePayrollMonth(month)
  const res = await supabase.rpc('payroll_finalize_month', { p_month: month, p_actor: actor })
  if (res.error) throw new Error(res.error.message)
}

export async function unlockPayrollMonth(payrollMonth: string, reason: string, actor: string): Promise<void> {
  const month = parsePayrollMonthInput(payrollMonth)
  if (!month) throw new Error('Invalid payroll month')
  const res = await supabase.rpc('payroll_unlock_month', { p_month: month, p_reason: reason, p_actor: actor })
  if (res.error) throw new Error(res.error.message)
}

export async function addPayrollAdjustment(input: {
  payrollEntryId: number
  adjustmentType: 'addition' | 'deduction'
  amount: number
  reason: string
  actor: string
}): Promise<void> {
  const adjRes = await supabase.from('payroll_adjustments').insert({
    payroll_entry_id: input.payrollEntryId,
    adjustment_type: input.adjustmentType,
    amount: input.amount,
    reason: input.reason,
    actor: input.actor,
  })
  if (adjRes.error) throw new Error(adjRes.error.message)

  const entryRes = await supabase.from('payroll_entries').select('*').eq('id', input.payrollEntryId).single()
  if (entryRes.error) throw new Error(entryRes.error.message)
  const entry = entryRes.data as PayrollEntry

  const customAdditions = entry.custom_additions + (input.adjustmentType === 'addition' ? input.amount : 0)
  const otherDeductions = entry.other_deductions + (input.adjustmentType === 'deduction' ? input.amount : 0)

  const amounts = computePayrollAmounts({
    salaryType: entry.salary_type_snapshot,
    baseSalary: entry.base_salary_snapshot,
    payableDays: entry.payable_days_snapshot,
    saVariableEarning: entry.sa_variable_earning,
    technicianVariableEarning: entry.technician_variable_earning,
    customAdditions,
    otherDeductions,
    advanceDeduction: entry.advance_deduction,
  })

  const updRes = await supabase.from('payroll_entries').update({
    custom_additions: customAdditions,
    other_deductions: otherDeductions,
    gross_payout: amounts.grossPayout,
    net_payable: amounts.netPayable,
    updated_at: new Date().toISOString(),
  }).eq('id', input.payrollEntryId)
  if (updRes.error) throw new Error(updRes.error.message)
}

export async function saveSalaryTypeMasterRow(input: {
  employeeCode: string
  department: string | null
  location: string | null
  accountNumber: string | null
  ifsc: string | null
  bankName: string | null
  baseSalary: number
  salaryType: SalaryType
}): Promise<void> {
  const res = await supabase.rpc('payroll_save_salary_type_master', {
    p_employee_code: input.employeeCode,
    p_department: input.department,
    p_location: input.location,
    p_account_number: input.accountNumber,
    p_ifsc: input.ifsc,
    p_bank_name: input.bankName,
    p_base_salary: input.baseSalary,
    p_salary_type: input.salaryType,
  })
  if (res.error) throw new Error(res.error.message)
}

export async function setEmployeeActive(employeeCode: string, isActive: boolean): Promise<void> {
  const res = await supabase.rpc('payroll_set_employee_active', {
    p_employee_code: employeeCode,
    p_is_active: isActive,
  })
  if (res.error) throw new Error(res.error.message)
}

export async function checkPayrollPermissions(): Promise<{
  canView: boolean
  canModify: boolean
  canDelete: boolean
  isAdmin: boolean
}> {
  const [viewRes, modRes, delRes, adminRes] = await Promise.all([
    supabase.rpc('has_module_view', { p_module: 'payroll' }),
    supabase.rpc('has_module_modify', { p_module: 'payroll' }),
    supabase.rpc('has_module_delete', { p_module: 'payroll' }),
    supabase.rpc('is_admin'),
  ])
  return {
    canView: Boolean(viewRes.data),
    canModify: Boolean(modRes.data),
    canDelete: Boolean(delRes.data),
    isAdmin: Boolean(adminRes.data),
  }
}
