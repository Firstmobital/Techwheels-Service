/** Snapshot-vs-live identity resolver checks (mirrors src/lib/payroll/entryIdentity.ts). */
function snapshotOrLegacyLive(snapshot, live) {
  if (snapshot !== null && snapshot !== undefined) return snapshot
  if (live !== null && live !== undefined) return live
  return null
}

function resolvePayrollEntryIdentity(entry, live) {
  const snapshotName = snapshotOrLegacyLive(entry.employee_name_snapshot, live?.employee_name)
  const employeeName = snapshotName?.trim() ? snapshotName : entry.employee_code
  return {
    employeeCode: entry.employee_code,
    employeeName,
    department: snapshotOrLegacyLive(entry.department_snapshot, live?.department),
    branch: snapshotOrLegacyLive(entry.branch_snapshot, live?.location),
    role: snapshotOrLegacyLive(entry.role_snapshot, live?.role),
    bankName: snapshotOrLegacyLive(entry.bank_name_snapshot, live?.bank_name),
    accountNumber: snapshotOrLegacyLive(entry.account_number_snapshot, live?.account_number),
    ifsc: snapshotOrLegacyLive(entry.ifsc_snapshot, live?.ifsc),
  }
}

const live = {
  employee_code: 'E001',
  employee_name: 'Live Name',
  department: 'BODY SHOP',
  location: 'Ajmer Road',
  role: 'TECHNICIAN',
  bank_name: 'Live Bank',
  account_number: 'ACCOUNT-B',
  ifsc: 'LIVE0001111',
}

const tests = [
  {
    name: 'snapshot wins over later live master',
    got: resolvePayrollEntryIdentity({
      employee_code: 'E001',
      employee_name_snapshot: 'Snap Name',
      department_snapshot: 'SERVICE',
      branch_snapshot: 'Sitapura',
      role_snapshot: 'SA',
      bank_name_snapshot: 'Snap Bank',
      account_number_snapshot: 'ACCOUNT-A',
      ifsc_snapshot: 'SNAP0002222',
    }, live),
    want: {
      employeeCode: 'E001',
      employeeName: 'Snap Name',
      department: 'SERVICE',
      branch: 'Sitapura',
      role: 'SA',
      bankName: 'Snap Bank',
      accountNumber: 'ACCOUNT-A',
      ifsc: 'SNAP0002222',
    },
  },
  {
    name: 'legacy NULL snapshot falls back to live master',
    got: resolvePayrollEntryIdentity({
      employee_code: 'E001',
      employee_name_snapshot: null,
      department_snapshot: null,
      branch_snapshot: null,
      role_snapshot: null,
      bank_name_snapshot: null,
      account_number_snapshot: null,
      ifsc_snapshot: null,
    }, live),
    want: {
      employeeCode: 'E001',
      employeeName: 'Live Name',
      department: 'BODY SHOP',
      branch: 'Ajmer Road',
      role: 'TECHNICIAN',
      bankName: 'Live Bank',
      accountNumber: 'ACCOUNT-B',
      ifsc: 'LIVE0001111',
    },
  },
  {
    name: 'empty snapshot string is kept and does not fall back',
    got: resolvePayrollEntryIdentity({
      employee_code: 'E001',
      employee_name_snapshot: 'Kept Name',
      department_snapshot: '',
      branch_snapshot: 'Sitapura',
      role_snapshot: null,
      bank_name_snapshot: 'Snap Bank',
      account_number_snapshot: 'ACCOUNT-A',
      ifsc_snapshot: null,
    }, live),
    want: {
      employeeCode: 'E001',
      employeeName: 'Kept Name',
      department: '',
      branch: 'Sitapura',
      role: 'TECHNICIAN',
      bankName: 'Snap Bank',
      accountNumber: 'ACCOUNT-A',
      ifsc: 'LIVE0001111',
    },
  },
  {
    name: 'missing live employee still renders from snapshot',
    got: resolvePayrollEntryIdentity({
      employee_code: 'E001',
      employee_name_snapshot: 'Snap Name',
      department_snapshot: 'SERVICE',
      branch_snapshot: 'Sitapura',
      role_snapshot: 'SA',
      bank_name_snapshot: 'Snap Bank',
      account_number_snapshot: 'ACCOUNT-A',
      ifsc_snapshot: 'SNAP0002222',
    }, undefined),
    want: {
      employeeCode: 'E001',
      employeeName: 'Snap Name',
      department: 'SERVICE',
      branch: 'Sitapura',
      role: 'SA',
      bankName: 'Snap Bank',
      accountNumber: 'ACCOUNT-A',
      ifsc: 'SNAP0002222',
    },
  },
  {
    name: 'no snapshot and no live employee uses employee_code as name',
    got: resolvePayrollEntryIdentity({
      employee_code: 'E001',
      employee_name_snapshot: null,
      department_snapshot: null,
      branch_snapshot: null,
      role_snapshot: null,
      bank_name_snapshot: null,
      account_number_snapshot: null,
      ifsc_snapshot: null,
    }, undefined),
    want: {
      employeeCode: 'E001',
      employeeName: 'E001',
      department: null,
      branch: null,
      role: null,
      bankName: null,
      accountNumber: null,
      ifsc: null,
    },
  },
]

function filterKeepsSnapshotDept(entry, liveEmp, deptFilter) {
  const identity = resolvePayrollEntryIdentity(entry, liveEmp)
  return (identity.department?.trim() ?? '') === deptFilter
}

const filterTests = [
  {
    name: 'historical SERVICE filter keeps snapshot SERVICE despite live BODY SHOP',
    got: filterKeepsSnapshotDept({
      employee_code: 'E001',
      employee_name_snapshot: 'Snap Name',
      department_snapshot: 'SERVICE',
      branch_snapshot: 'Sitapura',
      role_snapshot: 'SA',
      bank_name_snapshot: null,
      account_number_snapshot: null,
      ifsc_snapshot: null,
    }, live, 'SERVICE'),
    want: true,
  },
  {
    name: 'historical SERVICE filter excludes snapshot SERVICE from BODY SHOP filter',
    got: filterKeepsSnapshotDept({
      employee_code: 'E001',
      employee_name_snapshot: 'Snap Name',
      department_snapshot: 'SERVICE',
      branch_snapshot: 'Sitapura',
      role_snapshot: 'SA',
      bank_name_snapshot: null,
      account_number_snapshot: null,
      ifsc_snapshot: null,
    }, live, 'BODY SHOP'),
    want: false,
  },
]

let failed = 0
for (const t of [...tests, ...filterTests]) {
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
process.exit(failed > 0 ? 1 : 0)
