import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getLinkedEmployeeContext } from '../lib/api/bodyshopFloorWorkContext'
import {
  BODYSHOP_FLOOR_WORK_LOG_ROLES,
  BODYSHOP_FLOOR_WORK_ROLE_LABELS,
  listWorkTasksForEmployee,
  resolveBodyshopFloorWorkUiModes,
  type BodyshopFloorWorkTask,
} from '../lib/bodyshopFloorWork/roles'
import {
  bodyshopFloorWorkTodayIstDate,
  workLogMapKey,
  type BodyshopFloorRoleDailyLogRow,
} from '../lib/bodyshopFloorRoleWorkLog'
import {
  fetchRoleDailyLogPhotos,
  fetchRoleDailyLogsForDate,
  openRoleDailyLogPhoto,
  upsertRoleDailyLog,
  uploadRoleDailyLogPhoto,
} from '../lib/api/bodyshopFloorRoleWorkLog'
import type { BodyshopFloorRoleDailyLogPhotoRow } from '../lib/bodyshopFloorRoleWorkLog'
import { upsertBodyshopFloorDailyUpdate } from '../lib/api/bodyshopFloorDailyUpdate'
import { getDealerContext } from '../lib/api'

export default function BodyshopFloorWorkPage() {
  const today = bodyshopFloorWorkTodayIstDate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [employeeCode, setEmployeeCode] = useState('')
  const [employeeName, setEmployeeName] = useState<string | null>(null)
  const [, setEmployeeRole] = useState<string | null>(null)
  const [uiModes, setUiModes] = useState<Array<'worker' | 'edp'>>(['worker'])
  const [tab, setTab] = useState<'worker' | 'edp'>('worker')

  const [tasks, setTasks] = useState<BodyshopFloorWorkTask[]>([])
  const [cardByJc, setCardByJc] = useState<Record<string, { reg: string | null; customer: string | null }>>({})
  const [logsByKey, setLogsByKey] = useState<Record<string, BodyshopFloorRoleDailyLogRow>>({})
  const [selected, setSelected] = useState<BodyshopFloorWorkTask | null>(null)
  const [note, setNote] = useState('')
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [savedPhotos, setSavedPhotos] = useState<BodyshopFloorRoleDailyLogPhotoRow[]>([])
  const [saving, setSaving] = useState(false)
  const [allFloorJcs, setAllFloorJcs] = useState<string[]>([])

  const [edpJc, setEdpJc] = useState<string | null>(null)
  const [edpNote, setEdpNote] = useState('')
  const [edpSaving, setEdpSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ctx = await getLinkedEmployeeContext()
      if (ctx.error || !ctx.data) throw new Error(ctx.error ?? 'Employee link missing')
      setEmployeeCode(ctx.data.employeeCode)
      setEmployeeName(ctx.data.employeeName)
      setEmployeeRole(ctx.data.employeeRole)
      const modes = resolveBodyshopFloorWorkUiModes(ctx.data.employeeRole)
      setUiModes(modes)
      setTab(modes.includes('worker') ? 'worker' : 'edp')

      const { data: assRows, error: assErr } = await supabase.from('bodyshop_assignments').select('*').eq('is_active', true)
      if (assErr) throw assErr
      const { data: supportRows, error: supErr } = await supabase
        .from('bodyshop_floor_support_assignments')
        .select('*')
        .eq('is_active', true)
      if (supErr) throw supErr

      const myTasks = listWorkTasksForEmployee(ctx.data.employeeCode, assRows ?? [], supportRows ?? [])
      setTasks(myTasks)

      const jcs = Array.from(new Set([...(assRows ?? []).map((r) => String(r.job_card_number ?? '').trim().toUpperCase())].filter(Boolean)))
      if (jcs.length > 0) {
        const { data: cards } = await supabase
          .from('bodyshop_repair_cards')
          .select('job_card_no, reg_number, customer_name')
          .in('job_card_no', jcs)
        const map: Record<string, { reg: string | null; customer: string | null }> = {}
        for (const c of cards ?? []) {
          const k = String(c.job_card_no ?? '').trim().toUpperCase()
          if (!k) continue
          map[k] = { reg: c.reg_number ?? null, customer: c.customer_name ?? null }
        }
        setCardByJc(map)
      } else {
        setCardByJc({})
      }

      const logsRes = await fetchRoleDailyLogsForDate(today, jcs.length ? jcs : undefined)
      if (logsRes.error) throw new Error(logsRes.error)
      const lmap: Record<string, BodyshopFloorRoleDailyLogRow> = {}
      for (const row of logsRes.data ?? []) {
        lmap[workLogMapKey(row.job_card_number, row.floor_role, row.employee_code, row.is_support)] = row
      }
      setLogsByKey(lmap)

      const allJcs = Array.from(
        new Set((assRows ?? []).map((r) => String(r.job_card_number ?? '').trim().toUpperCase()).filter(Boolean)),
      ).sort()
      setAllFloorJcs(allJcs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => {
    void load()
  }, [load])

  const edpJobCards = allFloorJcs

  useEffect(() => {
    if (!selected) {
      setNote('')
      setSavedPhotos([])
      return
    }
    const key = workLogMapKey(selected.jobCardNumber, selected.floorRole, employeeCode, selected.isSupport)
    setNote(String(logsByKey[key]?.note_text ?? ''))
    setPendingPhotos([])
    const logId = logsByKey[key]?.id
    if (!logId) {
      setSavedPhotos([])
      return
    }
    void fetchRoleDailyLogPhotos([logId]).then((res) => {
      if (!res.error) setSavedPhotos(res.data ?? [])
    })
  }, [selected, logsByKey, employeeCode])

  async function viewSavedPhoto(photo: BodyshopFloorRoleDailyLogPhotoRow) {
    const res = await openRoleDailyLogPhoto(photo)
    if (res.error || !res.data) {
      alert(res.error ?? 'Could not open photo')
      return
    }
    window.open(res.data, '_blank', 'noopener,noreferrer')
  }

  async function saveWorkerLog() {
    if (!selected || !employeeCode) return
    const trimmed = note.trim()
    if (!trimmed) {
      alert('Enter today\'s work description.')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const dealerCtx = await getDealerContext()
      const dealerCode = selected.dealerCode || dealerCtx.data?.dealerCode || ''
      if (!dealerCode) throw new Error('Dealer code missing')

      const up = await upsertRoleDailyLog({
        jobCardNumber: selected.jobCardNumber,
        repairCardId: selected.repairCardId,
        dealerCode,
        floorRole: selected.floorRole,
        employeeCode,
        employeeName,
        noteText: trimmed,
        isSupport: selected.isSupport,
        actorEmail: user?.email ?? null,
      })
      if (up.error || !up.data) throw new Error(up.error ?? 'Save failed')

      for (let i = 0; i < pendingPhotos.length; i++) {
        const file = pendingPhotos[i]
        const ph = await uploadRoleDailyLogPhoto({
          logId: up.data.id,
          dealerCode,
          jobCardNumber: selected.jobCardNumber,
          regNumber: cardByJc[selected.jobCardNumber]?.reg ?? null,
          file,
          sortOrder: i,
        })
        if (ph.error) throw new Error(ph.error)
        if (ph.data) setSavedPhotos((prev) => [...prev, ph.data!])
      }
      setPendingPhotos([])

      const key = workLogMapKey(selected.jobCardNumber, selected.floorRole, employeeCode, selected.isSupport)
      setLogsByKey((prev) => ({ ...prev, [key]: up.data! }))
      alert('Saved for today (IST).')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function compileEdpDaily() {
    if (!edpJc) return
    setEdpSaving(true)
    try {
      const logsRes = await fetchRoleDailyLogsForDate(today, [edpJc])
      if (logsRes.error) throw new Error(logsRes.error)
      const parts: string[] = []
      for (const role of BODYSHOP_FLOOR_WORK_LOG_ROLES) {
        const row = (logsRes.data ?? []).find((l) => l.floor_role === role && String(l.note_text ?? '').trim())
        if (row) parts.push(`${BODYSHOP_FLOOR_WORK_ROLE_LABELS[role]}: ${String(row.note_text).trim()}`)
      }
      const merged = (edpNote.trim() || parts.join(' | ')).trim()
      if (!merged) throw new Error('No role updates to publish for this job card today.')

      const dealerCtx = await getDealerContext()
      if (dealerCtx.error || !dealerCtx.data?.dealerCode) throw new Error(dealerCtx.error ?? 'Dealer missing')
      const { data: { user } } = await supabase.auth.getUser()
      const res = await upsertBodyshopFloorDailyUpdate({
        jobCardNumber: edpJc,
        repairCardId: null,
        dealerCode: dealerCtx.data.dealerCode,
        noteText: merged,
        actorEmail: user?.email ?? null,
      })
      if (res.error || !res.data) throw new Error(res.error ?? 'Publish failed')
      alert('Daily floor update published for this job card.')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setEdpSaving(false)
    }
  }

  if (loading) {
    return <div className="page-pad"><p>Loading…</p></div>
  }

  if (error) {
    return (
      <div className="page-pad">
        <h1>Bodyshop Floor Work</h1>
        <p className="alert alert--err">{error}</p>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Ask admin: link your login to employee code in Admin → Mappings, set Employee Master role (DENTOR/PAINTER/…),
          and grant module <b>bodyshop_floor_work</b>.
        </p>
      </div>
    )
  }

  return (
    <div className="page-pad">
      <h1>Bodyshop Floor Work</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        {employeeName ?? employeeCode} · IST date {today}
      </p>

      {uiModes.length > 1 ? (
        <div className="toolbar" style={{ marginBottom: 16 }}>
          {uiModes.includes('worker') ? (
            <button type="button" className={`btn btn--sm ${tab === 'worker' ? 'btn--primary' : 'btn--quiet'}`} onClick={() => setTab('worker')}>
              My assigned work
            </button>
          ) : null}
          {uiModes.includes('edp') ? (
            <button type="button" className={`btn btn--sm ${tab === 'edp' ? 'btn--primary' : 'btn--quiet'}`} onClick={() => setTab('edp')}>
              EDP compile
            </button>
          ) : null}
        </div>
      ) : null}

      {tab === 'worker' ? (
        <div className="grid-2">
          <div className="card">
            <h2 style={{ fontSize: 16, marginTop: 0 }}>My assignments today</h2>
            {tasks.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>No active floor assignment for your employee code. Floor Incharge must assign you on Bodyshop Floor.</p>
            ) : (
              <ul className="plain-list">
                {tasks.map((t) => {
                  const key = workLogMapKey(t.jobCardNumber, t.floorRole, employeeCode, t.isSupport)
                  const hasLog = Boolean(logsByKey[key]?.note_text?.trim())
                  const card = cardByJc[t.jobCardNumber]
                  return (
                    <li key={`${key}-${t.jobCardNumber}`}>
                      <button
                        type="button"
                        className="btn btn--quiet btn--block"
                        style={{ textAlign: 'left', marginBottom: 8 }}
                        onClick={() => setSelected(t)}
                      >
                        <strong>{t.jobCardNumber}</strong>
                        {card?.reg ? ` · ${card.reg}` : ''}
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {BODYSHOP_FLOOR_WORK_ROLE_LABELS[t.floorRole]}
                          {t.isSupport ? ' (support)' : ''}
                          {hasLog ? ' · ✓ update saved' : ' · pending today'}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="card">
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Today&apos;s update</h2>
            {!selected ? (
              <p style={{ color: 'var(--muted)' }}>Select a job card from the list.</p>
            ) : (
              <>
                <p style={{ fontSize: 13 }}>
                  <b>{selected.jobCardNumber}</b> — {BODYSHOP_FLOOR_WORK_ROLE_LABELS[selected.floorRole]}
                </p>
                <textarea
                  className="inp"
                  rows={5}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What work was done today? (panels, stage, hold reason…)"
                />
                <label className="field" style={{ marginTop: 10 }}>
                  <span className="label">Photos (optional)</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setPendingPhotos(Array.from(e.target.files ?? []))}
                  />
                </label>
                {pendingPhotos.length > 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>{pendingPhotos.length} photo(s) ready to upload</p>
                ) : null}
                {savedPhotos.length > 0 ? (
                  <ul className="plain-list" style={{ marginTop: 10, fontSize: 13 }}>
                    {savedPhotos.map((p) => (
                      <li key={p.id}>
                        <button type="button" className="btn btn--quiet btn--sm" onClick={() => void viewSavedPhoto(p)}>
                          {p.file_name ?? `Photo ${p.sort_order + 1}`}
                          {p.drive_url ? ' · Drive' : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void saveWorkerLog()}>
                  {saving ? 'Saving…' : 'Save today\'s update'}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'edp' ? (
        <div className="card">
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Publish daily floor line (EDP)</h2>
          <label className="field">
            <span className="label">Job card</span>
            <select className="sel" value={edpJc ?? ''} onChange={(e) => setEdpJc(e.target.value || null)}>
              <option value="">Select…</option>
              {edpJobCards.map((jc) => (
                <option key={jc} value={jc}>{jc}</option>
              ))}
            </select>
          </label>
          <textarea
            className="inp"
            rows={4}
            value={edpNote}
            onChange={(e) => setEdpNote(e.target.value)}
            placeholder="Optional override — leave blank to auto-merge today’s role logs"
            style={{ marginTop: 10 }}
          />
          <button type="button" className="btn btn--primary" style={{ marginTop: 10 }} disabled={edpSaving || !edpJc} onClick={() => void compileEdpDaily()}>
            {edpSaving ? 'Publishing…' : 'Publish to official daily update'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
