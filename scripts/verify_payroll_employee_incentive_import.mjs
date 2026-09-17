#!/usr/bin/env node
/** Mirrors src/lib/payroll/excelUtils.ts previewEmployeeIncentiveImport. */

function normalizeHeader(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function parsePayrollMonthInput(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 8) + '01'
  return null
}

function isEmployeeIncentiveType(value) {
  return ['Parts', 'Rusting', 'VAS', 'Others'].includes(value)
}

function calcEmployeeIncentiveAmount(value, incentivePercent) {
  return Math.round((value * incentivePercent / 100) * 100) / 100
}

function parseNonNegativePayrollMoney(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Value is required' }
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return { ok: false, error: 'Value must be a finite number' }
  if (n < 0) return { ok: false, error: 'Value must be 0 or greater' }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

function parseNonNegativeIncentivePercent(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Incentive % is required' }
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return { ok: false, error: 'Incentive % must be a finite number' }
  if (n < 0) return { ok: false, error: 'Incentive % must be 0 or greater' }
  return { ok: true, value: Math.round(n * 10000) / 10000 }
}

function parseEmployeeIncentiveAmount(raw) {
  const parsed = parseNonNegativePayrollMoney(raw)
  if (parsed.ok) return parsed
  return { ok: false, error: parsed.error.replace(/^Value/, 'Amount') }
}

function normalizeEmployeeIncentiveCalculationMethod(raw) {
  const v = String(raw ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (v === 'percentage' || v === 'percent' || v === 'pct') return 'percentage'
  if (v === 'fixed' || v === 'fixed amount' || v === 'absolute' || v === 'absolute amount') return 'fixed'
  return null
}

function parseEmployeeIncentiveWriteFields(input) {
  const method = normalizeEmployeeIncentiveCalculationMethod(String(input.calculationMethod ?? ''))
  if (!method) return { ok: false, error: 'Calculation Method must be Percentage or Fixed' }
  if (method === 'percentage') {
    const valueParsed = parseNonNegativePayrollMoney(String(input.value ?? ''))
    if (!valueParsed.ok) return valueParsed
    const percentParsed = parseNonNegativeIncentivePercent(String(input.incentivePercent ?? ''))
    if (!percentParsed.ok) return percentParsed
    return {
      ok: true,
      calculationMethod: 'percentage',
      value: valueParsed.value,
      incentivePercent: percentParsed.value,
      amount: calcEmployeeIncentiveAmount(valueParsed.value, percentParsed.value),
    }
  }
  const amountParsed = parseEmployeeIncentiveAmount(String(input.amount ?? ''))
  if (!amountParsed.ok) return amountParsed
  const valueRaw = String(input.value ?? '').trim()
  let value = null
  if (valueRaw) {
    const valueParsed = parseNonNegativePayrollMoney(valueRaw)
    if (!valueParsed.ok) return valueParsed
    value = valueParsed.value
  }
  return { ok: true, calculationMethod: 'fixed', value, incentivePercent: null, amount: amountParsed.value }
}

function payrollEmployeeIncentiveFilename(monthInput) {
  return `Payroll_Employee_Incentives_${monthInput || 'unknown'}.xlsx`
}

function previewEmployeeIncentiveImport(rows, ctx) {
  const previewRows = []
  const seenIds = new Set()
  let valid = 0
  let updates = 0
  let unchanged = 0
  let warnings = 0
  let rejected = 0

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2
    const code = String(row.employee_code ?? '').trim().toUpperCase()
    const month = parsePayrollMonthInput(row.payroll_month ?? ctx.payrollMonth) ?? ctx.payrollMonth
    const typeRaw = String(row.type ?? '').trim()
    const methodRaw = String(row.calculation_method ?? '').trim()
    const valueRaw = String(row.value ?? '').trim()
    const percentRaw = String(row.incentive_percent ?? row.incentive ?? '').trim()
    const amountRaw = String(row.amount ?? '').trim()
    const description = String(row.description ?? '').trim() || null
    const idRaw = String(row.id ?? '').trim()

    if (!code) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: '', status: 'rejected', message: 'Employee Code is required' })
      return
    }
    if (!ctx.knownCodes.has(code)) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: `Employee Code ${code} not found.` })
      return
    }
    if (month !== ctx.payrollMonth) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: `Payroll month mismatch: expected ${ctx.payrollMonth.slice(0, 7)}` })
      return
    }
    if (!isEmployeeIncentiveType(typeRaw)) {
      rejected += 1
      previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: `Type "${typeRaw || ''}" is invalid. Expected Parts/Rusting/VAS/Others.` })
      return
    }

    let id = null
    if (idRaw) {
      const parsedId = Number(idRaw)
      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        rejected += 1
        previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: `Id ${idRaw} is invalid.` })
        return
      }
      if (seenIds.has(parsedId)) {
        rejected += 1
        previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: `Duplicate Id ${parsedId} in file` })
        return
      }
      seenIds.add(parsedId)
      const existing = ctx.existingById.get(parsedId)
      if (!existing) {
        rejected += 1
        previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: `Id ${parsedId} was not found.` })
        return
      }
      if (existing.payrollMonth !== ctx.payrollMonth) {
        rejected += 1
        previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: `Id ${parsedId} does not belong to selected payroll month.` })
        return
      }
      id = parsedId
    }

    const parsed = parseEmployeeIncentiveWriteFields({
      calculationMethod: methodRaw,
      value: valueRaw,
      incentivePercent: percentRaw,
      amount: amountRaw,
    })
    if (!parsed.ok) {
      rejected += 1
      const rejectMessage = (
        parsed.error === 'Value is required' || parsed.error === 'Incentive % is required'
          ? 'Percentage method requires Value and Incentive %.'
          : parsed.error === 'Amount is required'
            ? 'Fixed method requires Amount.'
            : parsed.error.endsWith('.') ? parsed.error : `${parsed.error}.`
      )
      previewRows.push({ rowNumber, employeeCode: code, status: 'rejected', message: rejectMessage })
      return
    }

    const commit = {
      id,
      employeeCode: code,
      incentiveType: typeRaw,
      calculationMethod: parsed.calculationMethod,
      value: parsed.value,
      incentivePercent: parsed.incentivePercent,
      amount: parsed.amount,
      description,
    }

    if (id != null) {
      const existing = ctx.existingById.get(id)
      if (existing
        && existing.employeeCode === commit.employeeCode
        && existing.incentiveType === commit.incentiveType
        && existing.calculationMethod === commit.calculationMethod
        && Number(existing.amount) === Number(commit.amount)
        && (existing.description ?? '') === (commit.description ?? '')
      ) {
        unchanged += 1
        previewRows.push({ rowNumber, employeeCode: code, status: 'unchanged', message: 'No changes', data: commit })
        return
      }
      updates += 1
    } else {
      valid += 1
    }

    let status = 'valid'
    let message = id == null ? 'New incentive row' : 'Update'
    if (parsed.calculationMethod === 'percentage' && amountRaw) {
      const excelAmount = Number(amountRaw)
      if (Number.isFinite(excelAmount) && Math.abs(excelAmount - parsed.amount) > 0.009) {
        warnings += 1
        status = 'warning'
        message = `Amount recalculated from Value × Incentive % (${parsed.amount})`
      }
    }
    previewRows.push({ rowNumber, employeeCode: code, status, message, data: commit })
  })

  return { totalRows: rows.length, valid, updates, unchanged, warnings, rejected, rows: previewRows }
}

function row(fields) {
  const out = {}
  Object.entries(fields).forEach(([key, val]) => {
    out[normalizeHeader(key)] = String(val ?? '').trim()
  })
  return out
}

const month = '2026-08-01'
const knownCodes = new Set(['3000840_463', '3000840_999', '3000840_188'])
const existingById = new Map([
  [10, {
    payrollMonth: month,
    employeeCode: '3000840_463',
    incentiveType: 'Parts',
    calculationMethod: 'percentage',
    value: 235281,
    incentivePercent: 2.13,
    amount: 5011.49,
    description: 'Excess parts incentive Aug 2026',
  }],
])

const preview = previewEmployeeIncentiveImport([
  row({
    Id: 10,
    'Payroll Month': '2026-08',
    'Employee Code': '3000840_463',
    'Employee Name': 'RAHUL SHARMA',
    Value: 100000,
    'Incentive %': 2,
    Amount: 1,
    Type: 'Parts',
    Description: 'Excess parts incentive Aug 2026',
    'Calculation Method': 'Percentage',
  }),
  row({
    'Employee Code': '3000840_999',
    'Employee Name': 'XYZ EMPLOYEE',
    Value: 235281,
    'Incentive %': 2.13,
    Amount: 5000,
    Type: 'Others',
    Description: 'Special incentive',
    'Calculation Method': 'Fixed',
  }),
  row({
    'Employee Code': '3000840_188',
    Type: 'Parts',
    Value: 100000,
    'Incentive %': 1,
    Amount: 9999,
    'Calculation Method': 'Percentage',
  }),
  row({
    'Employee Code': '3000840_188',
    Type: 'VAS',
    Amount: 500,
    'Calculation Method': 'Fixed',
  }),
], { payrollMonth: month, knownCodes, existingById })

const invalid = previewEmployeeIncentiveImport([
  row({ 'Employee Code': '12345', Type: 'Parts', Value: 1, 'Incentive %': 1, 'Calculation Method': 'Percentage' }),
  row({ 'Employee Code': '3000840_463', Type: 'Parts Incentive', Value: 1, 'Incentive %': 1, 'Calculation Method': 'Percentage' }),
  row({ 'Employee Code': '3000840_463', Type: 'Parts', 'Incentive %': 1, 'Calculation Method': 'Percentage' }),
  row({ 'Employee Code': '3000840_463', Type: 'Parts', Value: 1, 'Calculation Method': 'Percentage' }),
  row({ 'Employee Code': '3000840_463', Type: 'Others', 'Calculation Method': 'Fixed' }),
  row({ 'Employee Code': '3000840_463', Type: 'Others', Amount: 'abc', 'Calculation Method': 'Fixed' }),
], { payrollMonth: month, knownCodes, existingById })

const roundTrip = preview.rows.find((r) => r.data?.id === 10)
const insertFixed = preview.rows.find((r) => r.employeeCode === '3000840_999')
const sameEmployee = preview.rows.filter((r) => r.employeeCode === '3000840_188' && r.status !== 'rejected')

const tests = [
  { name: 'filename August 2026', got: payrollEmployeeIncentiveFilename('2026-08'), want: 'Payroll_Employee_Incentives_2026-08.xlsx' },
  { name: 'round-trip Id 10 is update not insert', got: roundTrip?.data?.id === 10 && preview.updates === 1 && preview.valid === 3, want: true },
  { name: 'percentage does not trust excel amount', got: roundTrip?.data?.amount, want: 2000 },
  { name: 'new percentage recalculates disagreeing amount', got: preview.rows.find((r) => r.employeeCode === '3000840_188' && r.data?.incentiveType === 'Parts')?.data?.amount, want: 1000 },
  { name: 'fixed insert amount 5000', got: insertFixed?.data?.amount, want: 5000 },
  { name: 'fixed insert preserves Value and nulls percent', got: insertFixed?.data?.value === 235281 && insertFixed?.data?.incentivePercent == null, want: true },
  { name: 'two rows same employee are both valid', got: sameEmployee.length, want: 2 },
  { name: 'same employee amounts 1000 + 500', got: sameEmployee.reduce((s, r) => s + Number(r.data.amount), 0), want: 1500 },
  { name: 'bad employee code', got: invalid.rows[0].message, want: 'Employee Code 12345 not found.' },
  { name: 'invalid type', got: invalid.rows[1].message, want: 'Type "Parts Incentive" is invalid. Expected Parts/Rusting/VAS/Others.' },
  { name: 'percentage without value', got: invalid.rows[2].message, want: 'Percentage method requires Value and Incentive %.' },
  { name: 'percentage without percent', got: invalid.rows[3].message, want: 'Percentage method requires Value and Incentive %.' },
  { name: 'fixed without amount', got: invalid.rows[4].message, want: 'Fixed method requires Amount.' },
  { name: 'text in amount', got: invalid.rows[5].message, want: 'Amount must be a finite number.' },
  { name: 'invalid preview has 6 rejected', got: invalid.rejected, want: 6 },
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
process.exit(failed > 0 ? 1 : 0)
