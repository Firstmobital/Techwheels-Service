import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getLinkedEmployeeContext } from '../lib/api/bodyshopFloorWorkContext'
import {
  BODYSHOP_FLOOR_WORK_LOG_ROLES,
  BODYSHOP_FLOOR_WORK_ROLE_LABELS,
  listAllWorkTasksForAdmin,
  listWorkTasksForEmployee,
  resolveBodyshopFloorWorkUiModes,
  workTaskEmployeeCode,
  type BodyshopFloorWorkTask,
} from '../lib/bodyshopFloorWork/roles'
import {
  bodyshopFloorWorkTodayIstDate,
  workLogMapKey,
  type BodyshopFloorRoleDailyLogRow,
} from '../lib/bodyshopFloorRoleWorkLog'
import {
  fetchAllFloorWorkPhotosForJobCards,
  fetchRoleDailyLogPhotos,
  fetchRoleDailyLogsForDate,
  upsertRoleDailyLog,
  uploadRoleDailyLogPhoto,
  type FloorWorkPhotoWithLog,
} from '../lib/api/bodyshopFloorRoleWorkLog'
import type { BodyshopFloorRoleDailyLogPhotoRow } from '../lib/bodyshopFloorRoleWorkLog'
import { BodyshopFloorWorkPhotoGallery } from '../components/BodyshopFloorWorkPhotoGallery'
import { upsertBodyshopFloorDailyUpdate } from '../lib/api/bodyshopFloorDailyUpdate'
import { getDealerContext } from '../lib/api'
import {
  fetchBodyshopAssignmentsForEmployee,
  fetchBodyshopSupportAssignmentsForEmployee,
} from '../lib/api/bodyshopFloorWorkAssignments'
import { fetchLiveOnFloorJobCardKeys, fetchRepairCardVehicleByJcs } from '../lib/api/bodyshopFloorWorkVehicles'
import {
  floorWorkVehicleSubtitle,
  floorWorkVehicleTitle,
  sortFloorWorkTasksByVehicle,
  sortJobCardsByVehicle,
  edpVehicleOptionLabel,
  floorWorkStandingLine,
  floorWorkJobCardLookupKeys,
  normalizeFloorWorkAssignmentKey,
} from '../lib/bodyshopFloorWork/display'

function jobCardMatchesSearch(
  jc: string,
  cardByJc: Record<string, { reg: string | null; customer: string | null }>,
  q: string,
): boolean {
  if (!q) return true
  const meta = cardByJc[jc]
  const title = floorWorkVehicleTitle(meta, jc).toLowerCase()
  const sub = floorWorkVehicleSubtitle(meta, jc).toLowerCase()
  return title.includes(q) || sub.includes(q) || jc.toLowerCase().includes(q)
}

function groupPhotosByVehicle(
  jcList: string[],
  cardByJc: Record<string, { reg: string | null; customer: string | null }>,
  photos: FloorWorkPhotoWithLog[],
): Record<string, FloorWorkPhotoWithLog[]> {
  const byVehicle: Record<string, FloorWorkPhotoWithLog[]> = {}
  for (const jc of jcList) byVehicle[jc] = []

  for (const p of photos) {
    const logJc = normalizeFloorWorkAssignmentKey(p.log_job_card_number)
    for (const jc of jcList) {
      const keys = floorWorkJobCardLookupKeys(jc, cardByJc[jc])
      if (!keys.includes(logJc)) continue
      if (!byVehicle[jc].some((x) => x.id === p.id)) byVehicle[jc].push(p)
    }
  }

  for (const jc of jcList) {
    byVehicle[jc].sort((a, b) => {
      const ta = new Date(a.created_at).getTime()
      const tb = new Date(b.created_at).getTime()
      if (ta !== tb) return ta - tb
      return String(a.file_name ?? '').localeCompare(String(b.file_name ?? ''), 'en')
    })
  }
  return byVehicle
}

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
  const [selectedJc, setSelectedJc] = useState<string | null>(null)
  const [photosByVehicle, setPhotosByVehicle] = useState<Record<string, FloorWorkPhotoWithLog[]>>({})
  const [note, setNote] = useState('')
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [savedPhotos, setSavedPhotos] = useState<BodyshopFloorRoleDailyLogPhotoRow[]>([])
  const [saving, setSaving] = useState(false)
  const [allFloorJcs, setAllFloorJcs] = useState<string[]>([])

  const [edpJc, setEdpJc] = useState<string | null>(null)
  const [edpNote, setEdpNote] = useState('')
  const [edpSaving, setEdpSaving] = useState(false)
  const [isAdminOverview, setIsAdminOverview] = useState(false)
  const [vehicleSearch, setVehicleSearch] = useState('')

  const sortedTasks = useMemo(
    () => sortFloorWorkTasksByVehicle(tasks, cardByJc),
    [tasks, cardByJc],
  )

  const visibleTasks = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase()
    if (!q) return sortedTasks
    return sortedTasks.filter((t) => {
      const meta = cardByJc[t.jobCardNumber]
      const title = floorWorkVehicleTitle(meta, t.jobCardNumber).toLowerCase()
      const sub = floorWorkVehicleSubtitle(meta, t.jobCardNumber).toLowerCase()
      return title.includes(q) || sub.includes(q) || t.jobCardNumber.toLowerCase().includes(q)
    })
  }, [sortedTasks, cardByJc, vehicleSearch])

  const edpJobCardsSorted = useMemo(
    () => sortJobCardsByVehicle(allFloorJcs, cardByJc),
    [allFloorJcs, cardByJc],
  )

  const vehicleRows = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase()
    let jcList = isAdminOverview
      ? sortJobCardsByVehicle(
          Array.from(new Set([...allFloorJcs, ...tasks.map((t) => t.jobCardNumber)])),
          cardByJc,
        )
      : null
    if (jcList && q) {
      jcList = jcList.filter((jc) => jobCardMatchesSearch(jc, cardByJc, q))
    }

    const seen = new Set<string>()
    const rows: Array<{ jobCardNumber: string; tasks: BodyshopFloorWorkTask[] }> = []

    const sourceJcs = jcList ?? visibleTasks.map((t) => t.jobCardNumber)
    for (const jc of sourceJcs) {
      if (seen.has(jc)) continue
      seen.add(jc)
      const rowTasks = tasks.filter((t) => t.jobCardNumber === jc)
      if (!isAdminOverview) {
        const visibleOnJc = visibleTasks.filter((x) => x.jobCardNumber === jc)
        if (visibleOnJc.length === 0) continue
      }
      rows.push({ jobCardNumber: jc, tasks: rowTasks })
    }
    return rows
  }, [visibleTasks, isAdminOverview, allFloorJcs, tasks, cardByJc, vehicleSearch])

  const selectedTask = useMemo(() => {
    if (!selectedJc) return null
    const onVehicle = tasks.filter((t) => t.jobCardNumber === selectedJc)
    const me = String(employeeCode ?? '').trim().toUpperCase()
    const mine = onVehicle.find((t) => workTaskEmployeeCode(t, employeeCode) === me)
    return mine ?? onVehicle[0] ?? null
  }, [selectedJc, tasks, employeeCode])

  const selectedVehiclePhotos = selectedJc ? (photosByVehicle[selectedJc] ?? []) : []

  const refreshVehiclePhotos = useCallback(
    async (taskList: BodyshopFloorWorkTask[], cards: typeof cardByJc, extraJcs?: string[]) => {
      const jcList = Array.from(
        new Set([...taskList.map((t) => t.jobCardNumber), ...(extraJcs ?? [])]),
      )
      const lookup = new Set<string>()
      for (const jc of jcList) {
        for (const k of floorWorkJobCardLookupKeys(jc, cards[jc])) {
          lookup.add(k)
        }
      }
      const phRes = await fetchAllFloorWorkPhotosForJobCards([...lookup])
      if (phRes.error) return
      setPhotosByVehicle(groupPhotosByVehicle(jcList, cards, phRes.data ?? []))
    },
    [],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ctx = await getLinkedEmployeeContext()
      if (ctx.error || !ctx.data) throw new Error(ctx.error ?? 'Employee link missing')
      const myCode = String(ctx.data.employeeCode ?? '').trim().toUpperCase()
      const adminOverview =
        Boolean(ctx.data.isAdminOverview) || Boolean(ctx.data.isFloorWorkAdminView)
      setIsAdminOverview(adminOverview)
      setEmployeeCode(myCode)
      setEmployeeName(ctx.data.employeeName)
      setEmployeeRole(ctx.data.employeeRole)
      const modes = adminOverview
        ? (['worker', 'edp'] as const)
        : resolveBodyshopFloorWorkUiModes(ctx.data.employeeRole)
      setUiModes([...modes])
      setTab(modes.includes('worker') ? 'worker' : 'edp')

      let assRows: Record<string, unknown>[] = []
      let supportRows: Record<string, unknown>[] = []
      let myTasks: BodyshopFloorWorkTask[] = []

      if (adminOverview) {
        const { data: assAll, error: assErr } = await supabase.from('bodyshop_assignments').select('*').eq('is_active', true)
        if (assErr) throw assErr
        const { data: supAll, error: supErr } = await supabase
          .from('bodyshop_floor_support_assignments')
          .select('*')
          .eq('is_active', true)
        if (supErr) throw supErr
        assRows = assAll ?? []
        supportRows = supAll ?? []
        myTasks = listAllWorkTasksForAdmin(assRows, supportRows)
      } else if (myCode) {
        const [assRes, supRes] = await Promise.all([
          fetchBodyshopAssignmentsForEmployee(myCode),
          fetchBodyshopSupportAssignmentsForEmployee(myCode),
        ])
        if (assRes.error) throw new Error(assRes.error)
        if (supRes.error) throw new Error(supRes.error)
        assRows = assRes.data ?? []
        supportRows = supRes.data ?? []
        myTasks = listWorkTasksForEmployee(myCode, assRows, supportRows)
      } else {
        throw new Error('No employee linked to your login.')
      }

      setTasks(myTasks)

      const assignmentJcs = Array.from(
        new Set((assRows ?? []).map((r) => String(r.job_card_number ?? '').trim().toUpperCase()).filter(Boolean)),
      )
      const liveFloorJcs = adminOverview ? await fetchLiveOnFloorJobCardKeys() : []
      const allJcs = Array.from(new Set([...assignmentJcs, ...liveFloorJcs, ...myTasks.map((t) => t.jobCardNumber)])).sort()
      setAllFloorJcs(allJcs)

      const cards = allJcs.length > 0 ? await fetchRepairCardVehicleByJcs(allJcs) : {}
      setCardByJc(cards)

      const logsRes = await fetchRoleDailyLogsForDate(today, allJcs.length ? allJcs : undefined)
      if (logsRes.error) throw new Error(logsRes.error)
      const lmap: Record<string, BodyshopFloorRoleDailyLogRow> = {}
      for (const row of logsRes.data ?? []) {
        lmap[workLogMapKey(row.job_card_number, row.floor_role, row.employee_code, row.is_support)] = row
      }
      setLogsByKey(lmap)

      await refreshVehiclePhotos(myTasks, cards, adminOverview ? allJcs : undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [today, refreshVehiclePhotos])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selectedTask) {
      setNote('')
      setSavedPhotos([])
      return
    }
    const slotCode = workTaskEmployeeCode(selectedTask, employeeCode)
    const key = workLogMapKey(selectedTask.jobCardNumber, selectedTask.floorRole, slotCode, selectedTask.isSupport)
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
  }, [selectedTask, logsByKey, employeeCode])

  async function saveWorkerLog() {
    if (!selectedTask) return
    const selected = selectedTask
    const slotCode = workTaskEmployeeCode(selected, employeeCode)
    if (!slotCode) return
    const trimmed = note.trim()
    if (!trimmed) {
      alert('Enter today\'s work description.')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const [dealerCtx, { data: myCodeRaw, error: myCodeErr }] = await Promise.all([
        getDealerContext(),
        supabase.rpc('my_employee_code'),
      ])
      const dealerCode = selected.dealerCode || dealerCtx.data?.dealerCode || ''
      if (!dealerCode) throw new Error('Dealer code missing')
      if (myCodeErr) throw new Error(myCodeErr.message)
      const employeeCodeForLog =
        String(myCodeRaw ?? employeeCode ?? slotCode).trim().toUpperCase() || slotCode

      const up = await upsertRoleDailyLog({
        jobCardNumber: selected.jobCardNumber,
        repairCardId: selected.repairCardId,
        dealerCode,
        floorRole: selected.floorRole,
        employeeCode: employeeCodeForLog,
        employeeName: selected.employeeName ?? employeeName,
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

      const key = workLogMapKey(selected.jobCardNumber, selected.floorRole, employeeCodeForLog, selected.isSupport)
      setLogsByKey((prev) => ({ ...prev, [key]: up.data! }))
      await refreshVehiclePhotos(tasks, cardByJc)
      alert('Submitted for today (IST).')
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
        {(employeeName ?? employeeCode) || 'Admin'}
        {isAdminOverview ? ' · Admin overview (all floor assignments)' : ''}
        {' · IST date '}{today}
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
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>{isAdminOverview ? 'All assigned vehicles' : 'My assigned vehicles'}</h2>
            {vehicleRows.length > 0 || isAdminOverview ? (
              <input
                className="inp"
                type="search"
                placeholder="Search reg no. / customer / JC…"
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
                style={{ marginBottom: 12, maxWidth: 420 }}
              />
            ) : null}
            {vehicleRows.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>
                {isAdminOverview
                  ? 'No vehicles on floor or active assignments yet.'
                  : 'No active floor assignment for your employee code. Floor Incharge must assign you on Bodyshop Floor.'}
              </p>
            ) : (
              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Reg no.</th>
                      <th>Customer</th>
                      <th>{isAdminOverview ? 'Roles on floor' : 'My role'}</th>
                      <th>Today</th>
                      <th>Photos</th>
                      <th>Time on floor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleRows.map(({ jobCardNumber, tasks: rowTasks }) => {
                      const card = cardByJc[jobCardNumber]
                      const todayUpdated = rowTasks.some((t) => {
                        const slot = workTaskEmployeeCode(t, employeeCode)
                        const k = workLogMapKey(t.jobCardNumber, t.floorRole, slot, t.isSupport)
                        return Boolean(logsByKey[k]?.note_text?.trim())
                      })
                      const photoCount = (photosByVehicle[jobCardNumber] ?? []).length
                      const active = selectedJc === jobCardNumber
                      return (
                        <tr
                          key={jobCardNumber}
                          onClick={() => setSelectedJc(jobCardNumber)}
                          style={{
                            cursor: 'pointer',
                            background: active ? 'var(--surface-2, #f3f4f6)' : undefined,
                          }}
                        >
                          <td><strong>{floorWorkVehicleTitle(card, jobCardNumber)}</strong></td>
                          <td>{floorWorkVehicleSubtitle(card, jobCardNumber) || '—'}</td>
                          <td>
                            {rowTasks.length === 0
                              ? '—'
                              : rowTasks.map((t) => BODYSHOP_FLOOR_WORK_ROLE_LABELS[t.floorRole]).join(', ')
                                  + (rowTasks.some((t) => t.isSupport) ? ' (support)' : '')}
                          </td>
                          <td>
                            {rowTasks.length === 0
                              ? '—'
                              : isAdminOverview
                                ? (todayUpdated ? 'Some roles updated' : 'Pending')
                                : (todayUpdated ? '✓ Updated' : 'Pending')}
                          </td>
                          <td>{photoCount}</td>
                          <td>{floorWorkStandingLine(card) ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, marginBottom: 0 }}>
              Click a row to submit today&apos;s update and view all photos (every role, every date) for that vehicle.
            </p>
          </div>

          {selectedJc ? (
            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>
                {floorWorkVehicleTitle(cardByJc[selectedJc], selectedJc)}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                {floorWorkVehicleSubtitle(cardByJc[selectedJc], selectedJc)}
                {selectedTask ? (
                  <>
                    {' · Your role: '}
                    {BODYSHOP_FLOOR_WORK_ROLE_LABELS[selectedTask.floorRole]}
                    {selectedTask.isSupport ? ' (support)' : ''}
                  </>
                ) : isAdminOverview ? (
                  <> · Admin view — all role photos below</>
                ) : null}
              </p>

              {selectedTask ? (
                <>
                  <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>Today&apos;s update (IST)</h3>
                  <textarea
                    className="inp"
                    rows={4}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What work was done today?"
                  />
                  <label className="field" style={{ marginTop: 10 }}>
                    <span className="label">Add photos (optional)</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => setPendingPhotos(Array.from(e.target.files ?? []))}
                    />
                  </label>
                  {pendingPhotos.length > 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--muted)' }}>{pendingPhotos.length} new photo(s) on submit</p>
                  ) : null}
                  {savedPhotos.length > 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                      {savedPhotos.length} photo(s) on today&apos;s log for your role.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn--primary"
                    style={{ marginTop: 12 }}
                    disabled={saving}
                    onClick={() => void saveWorkerLog()}
                  >
                    {saving ? 'Submitting…' : 'Submit today\'s update'}
                  </button>
                </>
              ) : isAdminOverview ? (
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                  You are not assigned on this vehicle — use EDP compile or view photos only.
                </p>
              ) : null}

              <BodyshopFloorWorkPhotoGallery
                photos={selectedVehiclePhotos}
                title={`All floor work photos — ${selectedVehiclePhotos.length} total (A→Z / oldest first)`}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {tab === 'edp' ? (
        <div className="card">
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Publish daily floor line (EDP)</h2>
          <label className="field">
            <span className="label">Vehicle (reg no.)</span>
            <select className="sel" value={edpJc ?? ''} onChange={(e) => setEdpJc(e.target.value || null)}>
              <option value="">Select…</option>
              {edpJobCardsSorted.map((jc) => (
                <option key={jc} value={jc}>{edpVehicleOptionLabel(jc, cardByJc[jc])}</option>
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
