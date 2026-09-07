#!/usr/bin/env node
/** Mirrors src/lib/employeeActive.ts + src/lib/payroll/calculations.ts working-roster predicates. */

function isEmployeeCurrentlyActive(row) {
  if (!row) return false
  return row.is_active !== false
}

function isNonZeroPayrollAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount !== 0
}

function hasGenuinePayrollMonthActivity(activity) {
  if (!activity) return false
  return (
    isNonZeroPayrollAmount(activity.payableDays)
    || isNonZeroPayrollAmount(activity.earnedBase)
    || isNonZeroPayrollAmount(activity.saVariableEarning)
    || isNonZeroPayrollAmount(activity.technicianVariableEarning)
    || isNonZeroPayrollAmount(activity.bodyshopVariableEarning)
    || isNonZeroPayrollAmount(activity.customAdditions)
    || isNonZeroPayrollAmount(activity.otherDeductions)
    || isNonZeroPayrollAmount(activity.advanceDeduction)
    || isNonZeroPayrollAmount(activity.grossPayout)
    || isNonZeroPayrollAmount(activity.netPayable)
  )
}

function payrollActivityFromEntry(entry) {
  if (!entry) return null
  return {
    payableDays: entry.payable_days_snapshot,
    earnedBase: entry.earned_base,
    saVariableEarning: entry.sa_variable_earning,
    technicianVariableEarning: entry.technician_variable_earning,
    bodyshopVariableEarning: entry.bodyshop_variable_earning,
    customAdditions: entry.custom_additions,
    otherDeductions: entry.other_deductions,
    advanceDeduction: entry.advance_deduction,
    grossPayout: entry.gross_payout,
    netPayable: entry.net_payable,
  }
}

function shouldIncludeInPayrollWorkingRoster(employee, activity) {
  if (isEmployeeCurrentlyActive(employee)) return true
  return hasGenuinePayrollMonthActivity(activity)
}

function shouldIncludePayrollEntryInWorkingRoster(employee, entry) {
  return shouldIncludeInPayrollWorkingRoster(employee, payrollActivityFromEntry(entry))
}

function shouldRecomputePayrollEmployee(employee, currentActivity, existingEntry) {
  return (
    shouldIncludeInPayrollWorkingRoster(employee, currentActivity)
    || hasGenuinePayrollMonthActivity(payrollActivityFromEntry(existingEntry))
  )
}

function previewAttendanceKnownCodes(knownCodes, employeeCode) {
  return knownCodes.has(String(employeeCode).trim().toUpperCase())
}

const zeroAugust = {
  payable_days_snapshot: 0,
  earned_base: 0,
  sa_variable_earning: 0,
  technician_variable_earning: 0,
  bodyshop_variable_earning: 0,
  custom_additions: 0,
  other_deductions: 0,
  advance_deduction: 0,
  gross_payout: 0,
  net_payable: 0,
}

const ks07 = { employee_code: 'KS_07', is_active: false }
const lv05 = { employee_code: 'LV_05', is_active: false }
const activeZero = { employee_code: 'ACT_01', is_active: true }
const historicalInactive = { employee_code: 'HIST_01', is_active: false }
const reactivated = { employee_code: 'KS_07', is_active: true }

const historicalEntry = {
  ...zeroAugust,
  earned_base: 10000,
  gross_payout: 10000,
  net_payable: 10000,
  payable_days_snapshot: 30,
}

const pendingAdvanceCurrent = {
  payableDays: 0,
  saVariableEarning: 0,
  technicianVariableEarning: 0,
  bodyshopVariableEarning: 0,
  customAdditions: 0,
  otherDeductions: 0,
  advanceDeduction: 1500,
}

const additionEntry = {
  ...zeroAugust,
  custom_additions: 500,
  gross_payout: 500,
  net_payable: 500,
}

const attendanceWorkingCodes = new Set(['ACT_01', 'HIST_01'])

const processingRows = [
  { employee_code: 'KS_07', employee: ks07, entry: zeroAugust },
  { employee_code: 'LV_05', employee: lv05, entry: zeroAugust },
  { employee_code: 'ACT_01', employee: activeZero, entry: zeroAugust },
  { employee_code: 'HIST_01', employee: historicalInactive, entry: historicalEntry },
]
const visibleProcessing = processingRows.filter((row) => (
  shouldIncludePayrollEntryInWorkingRoster(row.employee, row.entry)
))
const visibleCodes = visibleProcessing.map((row) => row.employee_code).sort()
const kpiCount = visibleProcessing.length

const tests = [
  {
    name: 'KS_07 inactive August zeros hidden from Attendance',
    got: shouldIncludeInPayrollWorkingRoster(ks07, { payableDays: 0, ...payrollActivityFromEntry(zeroAugust) }),
    want: false,
  },
  {
    name: 'LV_05 inactive August zeros hidden from Attendance',
    got: shouldIncludeInPayrollWorkingRoster(lv05, { payableDays: 0, ...payrollActivityFromEntry(zeroAugust) }),
    want: false,
  },
  {
    name: 'KS_07 leftover zero entry hidden from Processing/Slips',
    got: shouldIncludePayrollEntryInWorkingRoster(ks07, zeroAugust),
    want: false,
  },
  {
    name: 'LV_05 leftover zero entry hidden from Processing/Slips',
    got: shouldIncludePayrollEntryInWorkingRoster(lv05, zeroAugust),
    want: false,
  },
  {
    name: 'KS_07 August recompute skips zero working row',
    got: shouldRecomputePayrollEmployee(ks07, {
      payableDays: 0,
      saVariableEarning: 0,
      technicianVariableEarning: 0,
      bodyshopVariableEarning: 0,
      customAdditions: 0,
      otherDeductions: 0,
      advanceDeduction: 0,
    }, zeroAugust),
    want: false,
  },
  {
    name: 'LV_05 August recompute skips zero working row',
    got: shouldRecomputePayrollEmployee(lv05, {
      payableDays: 0,
      saVariableEarning: 0,
      technicianVariableEarning: 0,
      bodyshopVariableEarning: 0,
      customAdditions: 0,
      otherDeductions: 0,
      advanceDeduction: 0,
    }, zeroAugust),
    want: false,
  },
  {
    name: 'active employee with zero payable days remains visible',
    got: shouldIncludeInPayrollWorkingRoster(activeZero, { payableDays: 0 }),
    want: true,
  },
  {
    name: 'active zero entry remains on Processing',
    got: shouldIncludePayrollEntryInWorkingRoster(activeZero, zeroAugust),
    want: true,
  },
  {
    name: 'inactive historical earned/net remains visible',
    got: shouldIncludePayrollEntryInWorkingRoster(historicalInactive, historicalEntry),
    want: true,
  },
  {
    name: 'inactive historical attendance days remain on Attendance',
    got: shouldIncludeInPayrollWorkingRoster(historicalInactive, {
      ...payrollActivityFromEntry(historicalEntry),
      payableDays: 30,
    }),
    want: true,
  },
  {
    name: 'reactivated employee returns to working roster at zero activity',
    got: shouldIncludeInPayrollWorkingRoster(reactivated, { payableDays: 0 }),
    want: true,
  },
  {
    name: 'inactive pending advance is not excluded from recompute',
    got: shouldRecomputePayrollEmployee(ks07, pendingAdvanceCurrent, zeroAugust),
    want: true,
  },
  {
    name: 'inactive genuine addition remains visible',
    got: shouldIncludePayrollEntryInWorkingRoster(lv05, additionEntry),
    want: true,
  },
  {
    name: 'attendance import rejects KS_07 when not on working roster',
    got: previewAttendanceKnownCodes(attendanceWorkingCodes, 'KS_07'),
    want: false,
  },
  {
    name: 'attendance import rejects LV_05 when not on working roster',
    got: previewAttendanceKnownCodes(attendanceWorkingCodes, 'LV_05'),
    want: false,
  },
  {
    name: 'attendance import keeps active working employee',
    got: previewAttendanceKnownCodes(attendanceWorkingCodes, 'ACT_01'),
    want: true,
  },
  {
    name: 'Processing visible roster excludes KS_07 and LV_05',
    got: visibleCodes.join(','),
    want: 'ACT_01,HIST_01',
  },
  {
    name: 'Processing KPI count uses the same visible roster',
    got: kpiCount,
    want: 2,
  },
  {
    name: 'missing is_active is treated as active',
    got: shouldIncludeInPayrollWorkingRoster({ employee_code: 'LEGACY' }, { payableDays: 0 }),
    want: true,
  },
  {
    name: 'base_salary_snapshot alone is not activity',
    got: hasGenuinePayrollMonthActivity(payrollActivityFromEntry({
      ...zeroAugust,
    })),
    want: false,
  },
]

let failed = 0
for (const test of tests) {
  if (test.got !== test.want) {
    console.error(`FAIL ${test.name}: got ${test.got}, want ${test.want}`)
    failed += 1
  } else {
    console.log(`PASS ${test.name}`)
  }
}
process.exit(failed > 0 ? 1 : 0)
