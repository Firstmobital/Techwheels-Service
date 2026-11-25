import { useEffect, useMemo, useState } from 'react'
import { fetchPayrollEntries, fetchPayrollMonth } from '../../lib/api/payroll'
import { summarizePayrollCost, type PayrollCostSummary } from '../../lib/payroll/costSummary'

interface Props {
  payrollMonth: string
  monthInput: string
  onMonthChange: (value: string) => void
}

const rupees = (paise: number) => `Rs. ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Read-only: gross earnings, employee deductions, net payable and employer cost shown separately. */
export default function PayrollCostTab({ payrollMonth, monthInput, onMonthChange }: Props) {
  const [summary, setSummary] = useState<PayrollCostSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    Promise.all([fetchPayrollMonth(payrollMonth), fetchPayrollEntries(payrollMonth)])
      .then(([month, entries]) => active && setSummary(summarizePayrollCost(entries, month?.status ?? 'draft')))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [payrollMonth])

  const rows = useMemo(() => summary?.byBranch ?? [], [summary])

  return (
    <div>
      <label style={{ fontSize: '0.8rem', color: '#475569' }}>
        Month{' '}
        <input type="month" value={monthInput} onChange={(e) => onMonthChange(e.target.value)} />
      </label>
      {loading && <p>Loading cost summary…</p>}
      {error && <p style={{ color: '#b91c1c' }}>Could not load payroll cost: {error}</p>}
      {summary && !loading && (
        <div style={{ marginTop: '0.75rem' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 700, color: summary.finalized ? '#047857' : '#b45309' }}>
            {summary.finalized ? 'Finalized month' : `Provisional: month is not finalized (${summary.monthStatus}). Figures can still change.`}
          </p>
          <p style={{ fontSize: '0.78rem', color: summary.reconciles ? '#047857' : '#b91c1c' }}>
            {summary.reconciles
              ? `Reconciled: branch totals equal the overall totals and every employee's gross and net equal their components (${summary.employees} employees).`
              : `Reconciliation FAILED${summary.inconsistentEntries.length ? ` for ${summary.inconsistentEntries.length} employee(s)` : ''}. Do not use these figures.`}
          </p>
          <table style={{ width: '100%', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            <tbody>
              <tr><td>Gross earnings (base + variable + incentive + additions)</td><td style={{ textAlign: 'right' }}>{rupees(summary.grossPaise)}</td></tr>
              <tr><td style={{ paddingLeft: '1rem', color: '#64748b' }}>Earned base</td><td style={{ textAlign: 'right', color: '#64748b' }}>{rupees(summary.earnedBasePaise)}</td></tr>
              <tr><td style={{ paddingLeft: '1rem', color: '#64748b' }}>Variable earnings</td><td style={{ textAlign: 'right', color: '#64748b' }}>{rupees(summary.variablePaise)}</td></tr>
              <tr><td style={{ paddingLeft: '1rem', color: '#64748b' }}>Incentives</td><td style={{ textAlign: 'right', color: '#64748b' }}>{rupees(summary.incentivePaise)}</td></tr>
              <tr><td style={{ paddingLeft: '1rem', color: '#64748b' }}>Custom additions</td><td style={{ textAlign: 'right', color: '#64748b' }}>{rupees(summary.customAdditionsPaise)}</td></tr>
              <tr><td>Employee deductions: advance recovery</td><td style={{ textAlign: 'right' }}>{rupees(summary.advanceDeductionPaise)}</td></tr>
              <tr><td>Employee deductions: other</td><td style={{ textAlign: 'right' }}>{rupees(summary.otherDeductionsPaise)}</td></tr>
              <tr style={{ fontWeight: 700 }}><td>Net salary payable to employees</td><td style={{ textAlign: 'right' }}>{rupees(summary.netPayablePaise)}</td></tr>
              <tr style={{ fontWeight: 700 }}><td>Total employer payroll cost</td><td style={{ textAlign: 'right', color: '#b45309' }}>Not available</td></tr>
            </tbody>
          </table>
          <p style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '0.35rem' }}>{summary.employerCost.reason}</p>
          <h4 style={{ marginTop: '1rem', fontSize: '0.85rem' }}>By branch (unmapped branches are shown, not dropped)</h4>
          <table style={{ width: '100%', fontSize: '0.82rem' }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b' }}><th>Branch</th><th>Employees</th><th style={{ textAlign: 'right' }}>Gross</th><th style={{ textAlign: 'right' }}>Deductions</th><th style={{ textAlign: 'right' }}>Net payable</th></tr></thead>
            <tbody>
              {rows.map(([name, g]) => (
                <tr key={name}><td>{name}</td><td>{g.employees}</td><td style={{ textAlign: 'right' }}>{rupees(g.grossPaise)}</td><td style={{ textAlign: 'right' }}>{rupees(g.advanceDeductionPaise + g.otherDeductionsPaise)}</td><td style={{ textAlign: 'right' }}>{rupees(g.netPayablePaise)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
