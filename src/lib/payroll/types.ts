export type SalaryType = 'base' | 'variable' | 'both'

export const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  base: 'Base Salary',
  variable: 'Variable Salary',
  both: 'Base + Variable',
}

export type PayrollMonthStatus = 'draft' | 'finalized'

export type AdvanceDeductionType = 'lump_sum' | 'emi' | 'custom'

export type AdvanceStatus = 'active' | 'closed' | 'cancelled'

export type ScheduleStatus = 'pending' | 'applied' | 'skipped'

export interface PayrollEmployee {
  id: number
  employee_code: string
  employee_name: string
  department: string | null
  location: string | null
  role: string | null
  bank_name: string | null
  account_number: string | null
  ifsc: string | null
  is_active: boolean
}

export interface PayrollCompensation {
  id: number
  employee_code: string
  base_salary: number
  salary_type: SalaryType
  created_at: string
  updated_at: string
}

export interface PayrollAttendance {
  id: number
  employee_code: string
  payroll_month: string
  payable_days: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PayrollAdvance {
  id: number
  employee_code: string
  issue_date: string
  original_amount: number
  recovered_amount: number
  deduction_type: AdvanceDeductionType
  status: AdvanceStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PayrollAdvanceSchedule {
  id: number
  advance_id: number
  payroll_month: string
  scheduled_amount: number
  applied_amount: number
  status: ScheduleStatus
  created_at: string
  updated_at: string
}

export interface PayrollMonth {
  payroll_month: string
  status: PayrollMonthStatus
  finalized_at: string | null
  finalized_by: string | null
  unlock_reason: string | null
  unlocked_at: string | null
  unlocked_by: string | null
}

export interface VariableSourceDetail {
  saEarning?: number
  technicianEarning?: number
  bodyshopEarning?: number
  saJobCount?: number
  technicianJobCount?: number
  saSharePercent?: number
  technicianSharePercent?: number
  role?: string | null
  needsReview?: boolean
  reviewReason?: string
}

export interface PayrollEntry {
  id: number
  employee_code: string
  payroll_month: string
  salary_type_snapshot: SalaryType
  base_salary_snapshot: number
  payable_days_snapshot: number
  employee_name_snapshot: string | null
  department_snapshot: string | null
  branch_snapshot: string | null
  role_snapshot: string | null
  bank_name_snapshot: string | null
  account_number_snapshot: string | null
  ifsc_snapshot: string | null
  earned_base: number
  sa_variable_earning: number
  technician_variable_earning: number
  bodyshop_variable_earning: number
  variable_earning_total: number
  custom_additions: number
  other_deductions: number
  advance_deduction: number
  gross_payout: number
  net_payable: number
  variable_source_detail: VariableSourceDetail | null
  review_flags: Record<string, unknown> | null
  computed_at: string
  created_at: string
  updated_at: string
}

export interface PayrollAdjustment {
  id: number
  payroll_entry_id: number
  adjustment_type: 'addition' | 'deduction' | 'variable_override'
  amount: number
  reason: string
  actor: string
  original_value: number | null
  replacement_value: number | null
  created_at: string
}

export interface ImportPreviewRow {
  rowNumber: number
  employeeCode: string
  status: 'valid' | 'unchanged' | 'warning' | 'rejected'
  message: string
  data?: Record<string, unknown>
}

export interface ImportPreviewResult {
  totalRows: number
  valid: number
  updates: number
  unchanged: number
  warnings: number
  rejected: number
  rows: ImportPreviewRow[]
}
