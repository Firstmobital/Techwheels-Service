import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { STAGE_LABELS } from '../lib/api/bodyshopRepair'

type StageHistoryRow = {
  id: number
  from_stage: number | null
  to_stage: number
  source: string
  reason: string | null
  actor: string | null
  created_at: string
}

const SOURCE_LABEL: Record<string, string> = {
  reconcile: 'Automatic (rules)',
  direct_update: 'Edited in the app',
  baseline: 'Starting point (2026-11-16)',
}

function stageText(n: number | null) {
  if (n == null) return '—'
  return `${n} · ${STAGE_LABELS[n] ?? ''}`.trim()
}

function whenText(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
}

/** Admin-only audit trail of every current_stage change (table bodyshop_repair_card_stage_history). */
export function BodyshopStageHistory({ repairCardId }: { repairCardId: number }) {
  const [rows, setRows] = useState<StageHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void supabase
      .from('bodyshop_repair_card_stage_history')
      .select('id, from_stage, to_stage, source, reason, actor, created_at')
      .eq('repair_card_id', repairCardId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) setError(err.message)
        else setRows((data ?? []) as StageHistoryRow[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repairCardId])

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Stage history</div>
      {loading && <div style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>Loading…</div>}
      {error && <div style={{ color: '#dc2626', fontSize: '0.85rem' }}>Could not load stage history: {error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>No stage changes recorded for this card.</div>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-2)' }}>
                <th style={{ padding: '4px 8px' }}>When (IST)</th>
                <th style={{ padding: '4px 8px' }}>Change</th>
                <th style={{ padding: '4px 8px' }}>How</th>
                <th style={{ padding: '4px 8px' }}>Note / user</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
                  <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{whenText(r.created_at)}</td>
                  <td style={{ padding: '4px 8px' }}>
                    {r.source === 'baseline'
                      ? `At stage ${stageText(r.to_stage)}`
                      : `${stageText(r.from_stage)} → ${stageText(r.to_stage)}`}
                  </td>
                  <td style={{ padding: '4px 8px' }}>{SOURCE_LABEL[r.source] ?? r.source}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-2)' }} title={r.actor ?? undefined}>
                    {r.reason ?? ''}
                    {r.reason && r.actor ? ' · ' : ''}
                    {r.actor ? `user ${r.actor.slice(0, 8)}` : r.reason ? '' : 'system'}
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
