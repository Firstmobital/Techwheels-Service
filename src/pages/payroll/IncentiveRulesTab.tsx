import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { usePayrollSecurity } from './PayrollSecurityGate'

interface SettingRow {
  key: string
  value: string
  updated_at?: string
}

interface Props {
  canModify: boolean
}

function SettingsTable({
  title,
  table,
  roleLabel,
  canModify,
}: {
  title: string
  table: 'sa_earnings_settings' | 'technician_earnings_settings'
  roleLabel: string
  canModify: boolean
}) {
  const [rows, setRows] = useState<SettingRow[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { requireSecurityThen } = usePayrollSecurity()

  useEffect(() => {
    void (async () => {
      const res = await supabase.from(table).select('key, value, updated_at').order('key')
      if (!res.error && res.data) {
        setRows(res.data as SettingRow[])
        const d: Record<string, string> = {}
        ;(res.data as SettingRow[]).forEach((r) => { d[r.key] = r.value })
        setDraft(d)
      }
    })()
  }, [table])

  async function handleSave() {
    await requireSecurityThen(async () => {
      setSaving(true)
      setError(null)
      setMessage(null)
      try {
        const upserts = Object.entries(draft).map(([key, value]) => ({ key, value }))
        const res = await supabase.from(table).upsert(upserts)
        if (res.error) throw new Error(res.error.message)
        setMessage(`${title} settings saved`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed')
      } finally {
        setSaving(false)
      }
    })
  }

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem' }}>{title}</h3>
      <div className="payroll-table-scroll" style={{ maxHeight: 'min(40vh, 360px)', maxWidth: '720px' }}>
      <table className="table" style={{ fontSize: '0.78rem' }}>
        <thead>
          <tr>
            <th>Rule Group</th>
            <th>Applicable Role</th>
            <th>Setting / Rule</th>
            <th>Value</th>
            <th>Last Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>Variable Earnings</td>
              <td>{roleLabel}</td>
              <td>{row.key.replace(/_/g, ' ')}</td>
              <td>
                {canModify ? (
                  <input
                    value={draft[row.key] ?? row.value}
                    onChange={(ev) => setDraft((prev) => ({ ...prev, [row.key]: ev.target.value }))}
                    style={{ width: '80px' }}
                  />
                ) : row.value}
              </td>
              <td>{row.updated_at ? new Date(row.updated_at).toLocaleString('en-IN') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {canModify && (
        <button type="button" className="btn btn--primary btn--sm" style={{ marginTop: '0.5rem' }} disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Saving…' : `Save ${title} Rules`}
        </button>
      )}
      {message && <div className="toast" style={{ marginTop: '0.5rem' }}>{message}</div>}
      {error && <div className="toast error" style={{ marginTop: '0.5rem' }}>{error}</div>}
      <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.5rem' }}>
        Edits update the same {table} authority used by {roleLabel} Tracker. Payroll variable earnings reuse these rules.
      </p>
    </div>
  )
}

export default function IncentiveRulesTab({ canModify }: Props) {
  return (
    <div>
      <SettingsTable title="Service Advisor Earnings" table="sa_earnings_settings" roleLabel="Service Advisor" canModify={canModify} />
      <SettingsTable title="Technician Earnings" table="technician_earnings_settings" roleLabel="Technician" canModify={canModify} />
    </div>
  )
}
