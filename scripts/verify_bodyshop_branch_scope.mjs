#!/usr/bin/env node
/** Mirrors src/lib/bodyshopMonthlyEarnings.ts branch-scope helpers. */

function normalizeEmployeeCode(value) {
  return String(value ?? '').trim().toUpperCase()
}

function normalizeBranchLabel(raw) {
  if (raw === null || raw === undefined) return ''
  return String(raw)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

const SITAPURA_BRANCH_ALIASES = ['Sitapura', 'Sitapura PV', 'Sitapura EV']
const AJMER_BRANCH_ALIASES = ['Ajmer Road', 'Ajmer Road PV', 'Ajmer Road EV']

function branchAliases(branch) {
  const normalized = normalizeBranchLabel(branch)
  if (!normalized) return []
  const lower = normalized.toLowerCase()
  if (lower === 'sitapura' || lower === 'sitapura (pv+ev)') return [...SITAPURA_BRANCH_ALIASES]
  if (lower === 'ajmer road' || lower === 'ajmer road (pv+ev)') return [...AJMER_BRANCH_ALIASES]
  return [normalized]
}

function matchesBranchSelection(rawBranch, selectedBranch) {
  if (selectedBranch === 'ALL') return true
  const rowBranch = normalizeBranchLabel(rawBranch).toLowerCase()
  if (!rowBranch) return false
  return branchAliases(selectedBranch).some((alias) => alias.toLowerCase() === rowBranch)
}

function employeeMasterBranchMatches(employeeBranch, selectedBranch) {
  const selected = String(selectedBranch ?? '').trim()
  if (!selected || selected.toLowerCase() === 'all') return true
  return (
    matchesBranchSelection(employeeBranch, selected)
    || matchesBranchSelection(selected, String(employeeBranch ?? ''))
  )
}

function isAllFilter(value) {
  const selected = String(value ?? '').trim()
  return !selected || selected.toLowerCase() === 'all'
}

function departmentMatches(employeeDepartment, selectedDepartment) {
  if (isAllFilter(selectedDepartment)) return true
  return String(employeeDepartment ?? '').trim() === String(selectedDepartment).trim()
}

function salaryTypeMatches(employeeSalaryType, selectedSalaryType) {
  if (isAllFilter(selectedSalaryType)) return true
  return String(employeeSalaryType ?? '') === String(selectedSalaryType).trim()
}

function employeeMatchesBodyshopPayrollScope(input) {
  return (
    departmentMatches(input.department, input.selectedDepartment ?? 'all')
    && salaryTypeMatches(input.salaryType, input.selectedSalaryType ?? 'all')
    && employeeMasterBranchMatches(input.masterBranch, input.selectedBranch ?? 'all')
  )
}

function roundPaise(value) {
  return Math.round(value * 100) / 100
}

function scopeBodyshopTrackerByBranch(input) {
  const unscoped = (
    isAllFilter(input.selectedBranch)
    && isAllFilter(input.selectedDepartment)
    && isAllFilter(input.selectedSalaryType)
  )
  if (unscoped) {
    return {
      displayedTotal: input.totalBodyshopEarning,
      mappedInScope: input.mappedBodyshopEarning,
      unmappedInScope: input.unmappedBodyshopEarning,
      includeUnmapped: true,
    }
  }
  let mappedInScope = 0
  input.earningsByEmployeeCode.forEach((amount, code) => {
    const key = normalizeEmployeeCode(code)
    if (employeeMatchesBodyshopPayrollScope({
      department: input.departmentByEmployeeCode?.get(key),
      salaryType: input.salaryTypeByEmployeeCode?.get(key),
      masterBranch: input.branchByEmployeeCode.get(key),
      selectedDepartment: input.selectedDepartment,
      selectedSalaryType: input.selectedSalaryType,
      selectedBranch: input.selectedBranch,
    })) mappedInScope += amount
  })
  mappedInScope = roundPaise(mappedInScope)
  return {
    displayedTotal: mappedInScope,
    mappedInScope,
    unmappedInScope: 0,
    includeUnmapped: false,
  }
}

const earningsByEmployeeCode = new Map([
  ['SITA1', 800000],
  ['sita2', 101475],
  ['SHAH1', 0],
])
const branchByEmployeeCode = new Map([
  ['SITA1', 'Sitapura'],
  ['SITA2', 'Sitapura PV'],
  ['SHAH1', 'Shahpura'],
])
const departmentByEmployeeCode = new Map([
  ['SITA1', 'BODY SHOP'],
  ['SITA2', 'SERVICE'],
  ['SHAH1', 'BODY SHOP'],
])
const salaryTypeByEmployeeCode = new Map([
  ['SITA1', 'variable'],
  ['SITA2', 'base'],
  ['SHAH1', 'both'],
])
const snapshot = {
  earningsByEmployeeCode,
  mappedBodyshopEarning: 901475,
  unmappedBodyshopEarning: 109271,
  totalBodyshopEarning: 1010746,
  branchByEmployeeCode,
  departmentByEmployeeCode,
  salaryTypeByEmployeeCode,
}

const all = scopeBodyshopTrackerByBranch({ ...snapshot, selectedBranch: 'all' })
const sitapura = scopeBodyshopTrackerByBranch({ ...snapshot, selectedBranch: 'Sitapura' })
const shahpura = scopeBodyshopTrackerByBranch({ ...snapshot, selectedBranch: 'Shahpura' })
const tonk = scopeBodyshopTrackerByBranch({ ...snapshot, selectedBranch: 'Tonk' })

const payrollEntries = [
  { employee_code: 'SITA1', bodyshop_variable_earning: 800000, identityBranch: 'Sitapura' },
  { employee_code: 'SITA2', bodyshop_variable_earning: 101475, identityBranch: 'Sitapura' },
  { employee_code: 'SHAH1', bodyshop_variable_earning: 0, identityBranch: 'Shahpura' },
]

function exportBodyshopRows(filters) {
  return payrollEntries.filter((entry) => {
    const code = normalizeEmployeeCode(entry.employee_code)
    return employeeMatchesBodyshopPayrollScope({
      department: departmentByEmployeeCode.get(code),
      salaryType: salaryTypeByEmployeeCode.get(code),
      masterBranch: branchByEmployeeCode.get(code),
      selectedDepartment: filters.selectedDepartment,
      selectedSalaryType: filters.selectedSalaryType,
      selectedBranch: filters.selectedBranch,
    }) && Number(entry.bodyshop_variable_earning) > 0
  })
}

const shahpuraExport = exportBodyshopRows({ selectedBranch: 'Shahpura' })
const sitapuraExport = exportBodyshopRows({ selectedBranch: 'Sitapura' })
const allExport = exportBodyshopRows({ selectedBranch: 'all' })
const bodyShopDept = scopeBodyshopTrackerByBranch({ ...snapshot, selectedBranch: 'all', selectedDepartment: 'BODY SHOP' })
const serviceDept = scopeBodyshopTrackerByBranch({ ...snapshot, selectedBranch: 'all', selectedDepartment: 'SERVICE' })
const variableOnly = scopeBodyshopTrackerByBranch({ ...snapshot, selectedBranch: 'all', selectedSalaryType: 'variable' })
const baseOnly = scopeBodyshopTrackerByBranch({ ...snapshot, selectedBranch: 'all', selectedSalaryType: 'base' })
const sitapuraVariable = scopeBodyshopTrackerByBranch({
  ...snapshot,
  selectedBranch: 'Sitapura',
  selectedSalaryType: 'variable',
})
const serviceExport = exportBodyshopRows({ selectedDepartment: 'SERVICE' })
const variableExport = exportBodyshopRows({ selectedSalaryType: 'variable' })

const tests = [
  { name: 'All branches keeps Tracker total including unmapped', got: all.displayedTotal, want: 1010746 },
  { name: 'All branches mapped', got: all.mappedInScope, want: 901475 },
  { name: 'All branches unmapped included', got: all.unmappedInScope, want: 109271 },
  { name: 'Sitapura excludes unmapped', got: sitapura.unmappedInScope, want: 0 },
  { name: 'Sitapura card is mapped Sitapura only', got: sitapura.displayedTotal, want: 901475 },
  { name: 'Shahpura card is 0', got: shahpura.displayedTotal, want: 0 },
  { name: 'Tonk card is 0', got: tonk.displayedTotal, want: 0 },
  { name: 'Sitapura PV alias maps to Sitapura filter', got: employeeMasterBranchMatches('Sitapura PV', 'Sitapura'), want: true },
  { name: 'Sitapura filter matches Sitapura master', got: employeeMasterBranchMatches('Sitapura', 'Sitapura'), want: true },
  { name: 'Shahpura does not match Sitapura', got: employeeMasterBranchMatches('Sitapura', 'Shahpura'), want: false },
  { name: 'missing master branch is not guessed', got: employeeMasterBranchMatches(null, 'Sitapura'), want: false },
  { name: 'Shahpura export has no rows', got: shahpuraExport.map((row) => row.employee_code), want: [] },
  { name: 'Sitapura export is Sitapura only', got: sitapuraExport.map((row) => row.employee_code), want: ['SITA1', 'SITA2'] },
  { name: 'All-branch export excludes zero and unmapped', got: allExport.map((row) => row.employee_code), want: ['SITA1', 'SITA2'] },
  { name: 'switching Shahpura then Sitapura is not stale', got: [
    scopeBodyshopTrackerByBranch({ ...snapshot, selectedBranch: 'Shahpura' }).displayedTotal,
    scopeBodyshopTrackerByBranch({ ...snapshot, selectedBranch: 'Sitapura' }).displayedTotal,
    scopeBodyshopTrackerByBranch({ ...snapshot, selectedBranch: 'all' }).displayedTotal,
  ], want: [0, 901475, 1010746] },
  { name: 'BODY SHOP department excludes SERVICE employee', got: bodyShopDept.displayedTotal, want: 800000 },
  { name: 'SERVICE department is Sitapura SERVICE only', got: serviceDept.displayedTotal, want: 101475 },
  { name: 'department filter excludes unmapped', got: bodyShopDept.unmappedInScope, want: 0 },
  { name: 'variable salary type is SITA1 only', got: variableOnly.displayedTotal, want: 800000 },
  { name: 'base salary type is SITA2 only', got: baseOnly.displayedTotal, want: 101475 },
  { name: 'salary type filter excludes unmapped', got: variableOnly.includeUnmapped, want: false },
  { name: 'Sitapura + variable combines filters', got: sitapuraVariable.displayedTotal, want: 800000 },
  { name: 'SERVICE export excludes BODY SHOP employee', got: serviceExport.map((row) => row.employee_code), want: ['SITA2'] },
  { name: 'variable export excludes base employee', got: variableExport.map((row) => row.employee_code), want: ['SITA1'] },
]

let failed = 0
for (const t of tests) {
  const ok = JSON.stringify(t.got) === JSON.stringify(t.want)
  if (!ok) {
    console.error(`FAIL ${t.name}`)
    console.error(' got ', t.got)
    console.error(' want', t.want)
    failed += 1
  } else {
    console.log(`PASS ${t.name}`)
  }
}

console.log(`All branches Tracker=${all.displayedTotal} Mapped=${all.mappedInScope} Unmapped=${all.unmappedInScope}`)
console.log(`Sitapura Mapped=${sitapura.mappedInScope} Displayed=${sitapura.displayedTotal}`)
console.log(`Shahpura Mapped=${shahpura.mappedInScope} Displayed=${shahpura.displayedTotal}`)
process.exit(failed > 0 ? 1 : 0)
