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

function roundPaise(value) {
  return Math.round(value * 100) / 100
}

function scopeBodyshopTrackerByBranch(input) {
  const selected = String(input.selectedBranch ?? '').trim()
  const isAll = !selected || selected.toLowerCase() === 'all'
  if (isAll) {
    return {
      displayedTotal: input.totalBodyshopEarning,
      mappedInScope: input.mappedBodyshopEarning,
      unmappedInScope: input.unmappedBodyshopEarning,
      includeUnmapped: true,
    }
  }
  let mappedInScope = 0
  input.earningsByEmployeeCode.forEach((amount, code) => {
    const branch = input.branchByEmployeeCode.get(normalizeEmployeeCode(code))
    if (employeeMasterBranchMatches(branch, selected)) mappedInScope += amount
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
const snapshot = {
  earningsByEmployeeCode,
  mappedBodyshopEarning: 901475,
  unmappedBodyshopEarning: 109271,
  totalBodyshopEarning: 1010746,
  branchByEmployeeCode,
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

function exportBodyshopRows(selectedBranch) {
  return payrollEntries.filter((entry) => {
    const masterBranch = branchByEmployeeCode.get(normalizeEmployeeCode(entry.employee_code))
    return employeeMasterBranchMatches(masterBranch, selectedBranch)
      && Number(entry.bodyshop_variable_earning) > 0
  })
}

const shahpuraExport = exportBodyshopRows('Shahpura')
const sitapuraExport = exportBodyshopRows('Sitapura')
const allExport = exportBodyshopRows('all')

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
