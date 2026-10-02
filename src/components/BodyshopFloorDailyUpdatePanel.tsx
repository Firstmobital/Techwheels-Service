import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  bodyshopFloorDailyUpdateHasContent,
  bodyshopFloorTodayIstDate,
  isBodyshopFloorDailyUpdateActive,
  type BodyshopFloorDailyUpdateRow,
} from '../lib/bodyshopFloorDailyUpdate'
import { upsertBodyshopFloorDailyUpdate } from '../lib/api/bodyshopFloorDailyUpdate'
import { getDealerContext } from '../lib/api'

type Props = {
  jobCardNumber: string
  repairCardId?: number | null
  row: BodyshopFloorDailyUpdateRow | null
  onSaved: (row: BodyshopFloorDailyUpdateRow) => void
  canEdit: boolean
}

export function bodyshopFloorDailySummary(row: BodyshopFloorDailyUpdateRow | null | undefined) {
  const active = isBodyshopFloorDailyUpdateActive(row) ? row : null
  if (!bodyshopFloorDailyUpdateHasContent(active)) {
    return { pending: true, preview: null as string | null }
  }
  const text = String(active?.note_text ?? '').trim()
  return { pending: false, preview: text || null }
}

export default function BodyshopFloorDailyUpdatePanel({
  jobCardNumber,
  repairCardId,
  row,
  onSaved,
  canEdit,
}: Props) {
  const today = bodyshopFloorTodayIstDate()
  const activeRow = isBodyshopFloorDailyUpdateActive(row, today) ? row : null
  const [note, setNote] = useState(String(activeRow?.note_text ?? ''))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setNote(String(activeRow?.note_text ?? ''))
  }, [activeRow?.id, activeRow?.updated_at, today])

  async function save() {
    const trimmed = note.trim()
    if (!trimmed) {
      alert('Please enter today\'s status or reason.')
      return
    }
    setSaving(true)
    try {
      const dealerCtx = await getDealerContext()
      if (dealerCtx.error || !dealerCtx.data?.dealerCode) throw new Error(dealerCtx.error ?? 'Dealer code missing')
      const { data: { user } } = await supabase.auth.getUser()

      const res = await upsertBodyshopFloorDailyUpdate({
        jobCardNumber,
        repairCardId: repairCardId ?? null,
        dealerCode: dealerCtx.data.dealerCode,
        noteText: trimmed,
        actorEmail: user?.email ?? null,
      })
      if (res.error || !res.data) throw new Error(res.error ?? 'Save failed')
      onSaved(res.data)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const hasContent = bodyshopFloorDailyUpdateHasContent(activeRow)

  return (
    <div className="bsf-daily-update" style={{
      margin: '10px 0 14px',
      padding: '12px 14px',
      borderRadius: 10,
      border: `1px solid ${hasContent ? '#cadcf8' : '#f1dcb8'}`,
      background: hasContent ? '#f8fbff' : '#fffaf3',
    }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Today&apos;s floor update (IST)</div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
        {hasContent
          ? 'Saved for today — admin can view on web. Resubmit tomorrow.'
          : 'Daily update required. Yesterday’s note expires at midnight IST.'}
      </div>

      {canEdit ? (
        <>
          <textarea
            className="inp"
            rows={3}
            placeholder="Today’s reason / progress (unassigned, in process, hold…)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ width: '100%', resize: 'vertical' }}
          />
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save today\'s update'}
            </button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13 }}>
          {activeRow?.note_text ? (
            <p style={{ margin: 0 }}>{activeRow.note_text}</p>
          ) : (
            <p style={{ margin: 0, color: '#94a3b8' }}>No update today.</p>
          )}
          {activeRow?.updated_by ? (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>By {activeRow.updated_by}</div>
          ) : null}
        </div>
      )}
    </div>
  )
}
