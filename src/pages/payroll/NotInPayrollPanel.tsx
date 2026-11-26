import { useCallback, useEffect, useState } from 'react'
import { excludeItem, loadNotInPayroll, withdrawExclusion } from '../../lib/api/payrollExceptions'
import { formatCurrency } from '../../lib/payroll/calculations'
import { EARNING_LABELS, openSummary, REASON_LABELS, type ResolvedItem } from '../../lib/payroll/notInPayroll'
import { exportToCSV } from '../../lib/exportUtils'

interface Props {
  payrollMonth: string
  canModify: boolean
  /** Changes when Payroll reloads, so the list follows a recompute or finalize. */
  refreshToken: unknown
  runSecured: (action: () => Promise<void>) => Promise<unknown>
}

export default function NotInPayrollPanel({ payrollMonth, canModify, refreshToken, runSecured }: Props) {
  const [data, setData] = useState<{ month: string; items: ResolvedItem[]; finalized: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [excluding, setExcluding] = useState<{ key: string; reason: string } | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setExcluding(null)
    loadNotInPayroll(payrollMonth)
      .then((r) => { if (active) setData({ month: payrollMonth, ...r }) })
      .catch((err: Error) => { if (active) { setData(null); setError(err.message) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [payrollMonth, refreshToken, version])

  const change = useCallback((action: () => Promise<void>) => {
    void runSecured(async () => {
      try {
        await action()
        setVersion((v) => v + 1)
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }, [runSecured])

  const ready = data && data.month === payrollMonth ? data : null
  const summary = ready ? openSummary(ready.items) : null
  const editable = canModify && !!ready && !ready.finalized

  const exportList = () => {
    if (!ready) return
    exportToCSV(ready.items.map((i) => ({
      type: EARNING_LABELS[i.type], reason: REASON_LABELS[i.reason].reason, employee_code: i.employeeCode, name: i.employeeName,
      job_card: i.jobCardNumber, amount: i.amountPaise / 100, suggested_match: i.suggestion,
      status: i.open ? 'Open' : `Excluded: ${i.exclusion?.reason ?? ''}`,
    })), `not-in-payroll-${payrollMonth.slice(0, 7)}`)
  }

  return (
    <div style={{ border: '1px solid #fcd34d', background: '#fffbeb', borderRadius: 8, padding: '0.6rem 0.8rem', marginBottom: '0.75rem', fontSize: '0.8rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <strong>Not in Payroll</strong>
        <span>
          {loading ? 'Checking earnings…' : summary
            ? `${summary.count} open · ${formatCurrency(summary.missingPaise / 100)} not in salary${summary.outOfDate ? ` · ${summary.outOfDate} saved figure(s) out of date` : ''}`
            : 'Check not available'}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn--ghost btn--sm" disabled={loading} onClick={() => setVersion((v) => v + 1)}>Check again</button>
        {ready && ready.items.length > 0 && (
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={exportList}>Export</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen((v) => !v)}>{open ? 'Hide list' : 'Show list'}</button>
          </>
        )}
      </div>
      {error && <div className="toast error">{error}</div>}
      {ready?.finalized && <div style={{ marginTop: 4 }}>This month is finalized and is not changed. The list uses today’s records; check an amount was not paid another way before acting.</div>}
      {open && ready && (
        <div className="table-scroll-pane" style={{ maxHeight: 360, marginTop: 8, background: '#fff' }}>
          <table style={{ width: '100%', fontSize: '0.76rem' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}><th>Employee / job card</th><th>Earning</th><th>Reason and action</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              {ready.items.map((i) => (
                <tr key={i.key} style={{ borderTop: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                  <td>
                    {i.reason === 'no_code' ? `Job card ${i.jobCardNumber}` : i.employeeCode}
                    <div style={{ color: '#64748b' }}>{i.employeeName || 'No name recorded'}</div>
                    {i.suggestion && <div style={{ color: '#1d4ed8' }}>Possible match (confirm first): {i.suggestion}</div>}
                  </td>
                  <td>{EARNING_LABELS[i.type]}</td>
                  <td>{REASON_LABELS[i.reason].reason}<div style={{ color: '#64748b' }}>{REASON_LABELS[i.reason].action}</div></td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(i.amountPaise / 100)}</td>
                  <td>
                    {!i.open ? (
                      <>
                        Excluded: {i.exclusion?.reason}
                        <div style={{ color: '#64748b' }}>{i.exclusion?.createdBy} {i.exclusion ? new Date(i.exclusion.createdAt).toLocaleDateString('en-IN') : ''}</div>
                        {editable && i.exclusion && <button type="button" className="btn btn--ghost btn--sm" onClick={() => change(() => withdrawExclusion(i.exclusion!.id))}>Undo</button>}
                      </>
                    ) : excluding?.key === i.key ? (
                      <form onSubmit={(e) => { e.preventDefault(); const reason = excluding.reason; change(() => excludeItem(payrollMonth, i, reason)) }}>
                        <input autoFocus aria-label="Reason for exclusion" placeholder="Reason (required)" maxLength={300} value={excluding.reason} onChange={(e) => setExcluding({ key: i.key, reason: e.target.value })} />
                        <button type="submit" className="btn btn--primary btn--sm" disabled={!excluding.reason.trim()}>Save</button>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setExcluding(null)}>Close</button>
                      </form>
                    ) : (
                      <>
                        Open{i.exclusion ? ' (amount changed since exclusion)' : ''}
                        {editable && i.reason !== 'out_of_date' && <div><button type="button" className="btn btn--ghost btn--sm" onClick={() => setExcluding({ key: i.key, reason: '' })}>Exclude…</button></div>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
