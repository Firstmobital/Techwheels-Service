import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchPayrollEmployees, fetchPayrollEntries, fetchPayrollMonth } from '../../lib/api/payroll'
import { formatCurrency, maskBankAccount } from '../../lib/payroll/calculations'
import { displayOptional, resolvePayrollEntryIdentity } from '../../lib/payroll/entryIdentity'
import { exportWorkbook } from '../../lib/payroll/excelUtils'

interface Props {
  payrollMonth: string
  monthInput: string
  onMonthChange: (value: string) => void
}

export default function SalarySlipReportTab({ payrollMonth, monthInput, onMonthChange }: Props) {
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof fetchPayrollEntries>>>([])
  const [employees, setEmployees] = useState<Awaited<ReturnType<typeof fetchPayrollEmployees>>>([])
  const [monthStatus, setMonthStatus] = useState<'draft' | 'finalized'>('draft')
  const [selectedCode, setSelectedCode] = useState('')

  const reload = useCallback(async () => {
    const [ents, emps, monthState] = await Promise.all([
      fetchPayrollEntries(payrollMonth),
      fetchPayrollEmployees(),
      fetchPayrollMonth(payrollMonth),
    ])
    setEntries(ents)
    setEmployees(emps)
    setMonthStatus(monthState?.status ?? 'draft')
  }, [payrollMonth])

  useEffect(() => { void reload() }, [reload])

  // Live employee_master is a legacy NULL-snapshot fallback only.
  const empByCode = useMemo(() => {
    const m = new Map<string, (typeof employees)[0]>()
    employees.forEach((e) => m.set(e.employee_code.trim().toUpperCase(), e))
    return m
  }, [employees])

  const identityByCode = useMemo(() => {
    const m = new Map<string, ReturnType<typeof resolvePayrollEntryIdentity>>()
    entries.forEach((entry) => {
      const code = entry.employee_code.trim().toUpperCase()
      m.set(code, resolvePayrollEntryIdentity(entry, empByCode.get(code)))
    })
    return m
  }, [entries, empByCode])

  const selectedEntry = entries.find((e) => e.employee_code.trim().toUpperCase() === selectedCode.trim().toUpperCase())
  const selectedIdentity = selectedCode
    ? identityByCode.get(selectedCode.trim().toUpperCase())
    : undefined

  function exportConsolidated() {
    const headers = [
      'Employee Code', 'Employee Name', 'Department', 'Branch', 'Role', 'Payroll Month',
      'Earned Base', 'SA Variable', 'Tech Variable', 'Bodyshop Variable', 'Additions', 'Gross',
      'Advance Recovery', 'Other Deductions', 'Net Payable', 'Status',
    ]
    const rows = entries.map((e) => {
      const identity = identityByCode.get(e.employee_code.trim().toUpperCase())
      return [
        e.employee_code, identity?.employeeName ?? e.employee_code, identity?.department ?? '', identity?.branch ?? '', identity?.role ?? '',
        payrollMonth.slice(0, 7),
        e.earned_base, e.sa_variable_earning, e.technician_variable_earning, e.bodyshop_variable_earning ?? 0, e.custom_additions, e.gross_payout,
        e.advance_deduction, e.other_deductions, e.net_payable, monthStatus.toUpperCase(),
      ]
    })
    exportWorkbook('Salary Report', headers, rows, `Payroll_Consolidated_${monthInput}.xlsx`)
  }

  function printSlip() {
    window.print()
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Month</label>
        <input type="month" value={monthInput} onChange={(ev) => onMonthChange(ev.target.value)} />
        <select value={selectedCode} onChange={(ev) => setSelectedCode(ev.target.value)}>
          <option value="">Select employee for slip…</option>
          {entries.map((e) => {
            const identity = identityByCode.get(e.employee_code.trim().toUpperCase())
            return <option key={e.id} value={e.employee_code}>{e.employee_code} — {identity?.employeeName ?? e.employee_code}</option>
          })}
        </select>
        <button type="button" className="btn btn--ghost btn--sm" onClick={exportConsolidated}>Consolidated Excel</button>
        {selectedEntry && <button type="button" className="btn btn--ghost btn--sm" onClick={printSlip}>Print Slip</button>}
        <span style={{
          padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700,
          background: monthStatus === 'finalized' ? '#dcfce7' : '#fef9c3',
          color: monthStatus === 'finalized' ? '#166534' : '#854d0e',
        }}>
          {monthStatus === 'finalized' ? 'OFFICIAL' : 'DRAFT PREVIEW'}
        </span>
      </div>

      {selectedEntry && selectedIdentity && (
        <div id="salary-slip" style={{ maxWidth: '520px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>Salary Slip — {monthStatus === 'finalized' ? 'Final' : 'Draft'}</h3>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.75rem' }}>{payrollMonth.slice(0, 7)}</div>
          <div style={{ fontSize: '0.82rem', marginBottom: '0.75rem' }}>
            <div><strong>{selectedIdentity.employeeName}</strong> ({selectedEntry.employee_code})</div>
            <div>{displayOptional(selectedIdentity.department)} · {displayOptional(selectedIdentity.branch)} · {displayOptional(selectedIdentity.role)}</div>
            <div>Bank: {displayOptional(selectedIdentity.bankName)} · {maskBankAccount(selectedIdentity.accountNumber)} · {displayOptional(selectedIdentity.ifsc)}</div>
          </div>
          <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td colSpan={2} style={{ fontWeight: 700, paddingTop: '0.5rem' }}>Earnings</td></tr>
              <tr><td>Earned Base Salary</td><td style={{ textAlign: 'right' }}>{formatCurrency(Number(selectedEntry.earned_base))}</td></tr>
              {Number(selectedEntry.sa_variable_earning) > 0 && (
                <tr><td>SA Variable Earnings</td><td style={{ textAlign: 'right' }}>{formatCurrency(Number(selectedEntry.sa_variable_earning))}</td></tr>
              )}
              {Number(selectedEntry.technician_variable_earning) > 0 && (
                <tr><td>Technician Variable Earnings</td><td style={{ textAlign: 'right' }}>{formatCurrency(Number(selectedEntry.technician_variable_earning))}</td></tr>
              )}
              {Number(selectedEntry.bodyshop_variable_earning ?? 0) > 0 && (
                <tr><td>Bodyshop Variable Earnings</td><td style={{ textAlign: 'right' }}>{formatCurrency(Number(selectedEntry.bodyshop_variable_earning ?? 0))}</td></tr>
              )}
              {Number(selectedEntry.custom_additions) > 0 && (
                <tr><td>Other Additions / Arrears</td><td style={{ textAlign: 'right' }}>{formatCurrency(Number(selectedEntry.custom_additions))}</td></tr>
              )}
              <tr><td style={{ fontWeight: 700 }}>Gross Salary</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(Number(selectedEntry.gross_payout))}</td></tr>
              <tr><td colSpan={2} style={{ fontWeight: 700, paddingTop: '0.5rem' }}>Deductions</td></tr>
              <tr><td>Advance Recovery</td><td style={{ textAlign: 'right' }}>{formatCurrency(Number(selectedEntry.advance_deduction))}</td></tr>
              <tr><td>Other Deductions</td><td style={{ textAlign: 'right' }}>{formatCurrency(Number(selectedEntry.other_deductions))}</td></tr>
              <tr><td style={{ fontWeight: 800, fontSize: '0.9rem' }}>Net Payable</td><td style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.9rem' }}>{formatCurrency(Number(selectedEntry.net_payable))}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
