import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  fetchFloorWorkPhotoCountsForJobCards,
  fetchRoleDailyLogPhotos,
  fetchRoleDailyLogsForDate,
  upsertRoleDailyLog,
  uploadRoleDailyLogPhoto,
  type FloorWorkPhotoWithLog,
} from '../lib/api/bodyshopFloorRoleWorkLog'
import type { BodyshopFloorRoleDailyLogPhotoRow } from '../lib/bodyshopFloorRoleWorkLog'
import { BodyshopFloorWorkPhotoGallery } from '../components/BodyshopFloorWorkPhotoGallery'
import Icon from '../components/Icon'
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
  sortJobCardsByFloorDayRecency,
  edpVehicleOptionLabel,
  floorWorkStandingLine,
  floorWorkJobCardLookupKeys,
  floorWorkPhotoBelongsToVehicle,
  floorWorkVehicleHasTodayLogUpdate,
  buildFloorWorkMonthFilterOptions,
  floorWorkFloorDayBucket,
  floorWorkFloorDayLabel,
  istYearMonthFromIso,
  type FloorWorkFloorDayBucket,
  type FloorWorkVehicleMeta,
  buildMinimalFloorWorkVehicleMeta,
} from '../lib/bodyshopFloorWork/display'

const FLOOR_WORK_LIST_PAGE_SIZE = 24

type UpdateFilter = 'all' | 'pending' | 'done'
type FloorDayFilter = 'all' | FloorWorkFloorDayBucket

function buildAssignmentCreatedAtByJc(assRows: Record<string, unknown>[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of assRows) {
    const jc = String(row.job_card_number ?? '').trim().toUpperCase()
    const at = String(row.created_at ?? '').trim()
    if (!jc || !at) continue
    const prev = out[jc]
    if (!prev || new Date(at).getTime() < new Date(prev).getTime()) out[jc] = at
  }
  return out
}

function jobCardMatchesSearch(
  jc: string,
  cardByJc: Record<string, FloorWorkVehicleMeta>,
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
  cardByJc: Record<string, FloorWorkVehicleMeta>,
  photos: FloorWorkPhotoWithLog[],
): Record<string, FloorWorkPhotoWithLog[]> {
  const byVehicle: Record<string, FloorWorkPhotoWithLog[]> = {}
  for (const jc of jcList) byVehicle[jc] = []

  for (const p of photos) {
    for (const jc of jcList) {
      if (!floorWorkPhotoBelongsToVehicle(jc, cardByJc[jc], p)) continue
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
  const [cardByJc, setCardByJc] = useState<Record<string, FloorWorkVehicleMeta>>({})
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
  const [floorMonthFilter, setFloorMonthFilter] = useState('all')
  const [floorDayFilter, setFloorDayFilter] = useState<FloorDayFilter>('all')
  const [updateFilter, setUpdateFilter] = useState<UpdateFilter>('all')
  const [photoCountByJc, setPhotoCountByJc] = useState<Record<string, number>>({})
  const [loadingPhotoCounts, setLoadingPhotoCounts] = useState(false)
  const [loadingSelectedPhotos, setLoadingSelectedPhotos] = useState(false)
  const [selectedPhotosError, setSelectedPhotosError] = useState<string | null>(null)
  const [listVisibleCount, setListVisibleCount] = useState(FLOOR_WORK_LIST_PAGE_SIZE)
  const [loadingMoreMeta, setLoadingMoreMeta] = useState(false)
  const assignmentCreatedAtRef = useRef<Record<string, string>>({})
  const metaLoadedJcsRef = useRef<Set<string>>(new Set())

  const monthFilterOptions = useMemo(() => buildFloorWorkMonthFilterOptions(today, 5), [today])

  useEffect(() => {
    setListVisibleCount(FLOOR_WORK_LIST_PAGE_SIZE)
  }, [vehicleSearch, floorMonthFilter, floorDayFilter, updateFilter])

  const vehicleHasTodayUpdate = useCallback(
    (jobCardNumber: string, rowTasks: BodyshopFloorWorkTask[]) => {
      const meta = cardByJc[jobCardNumber]
      if (isAdminOverview) {
        return floorWorkVehicleHasTodayLogUpdate(jobCardNumber, meta, logsByKey)
      }
      if (rowTasks.length === 0) return false
      const me = String(employeeCode ?? '').trim().toUpperCase()
      return rowTasks.some((t) => {
        if (workTaskEmployeeCode(t, employeeCode) !== me) return false
        const slot = workTaskEmployeeCode(t, employeeCode)
        const k = workLogMapKey(t.jobCardNumber, t.floorRole, slot, t.isSupport)
        return Boolean(logsByKey[k]?.note_text?.trim())
      })
    },
    [employeeCode, isAdminOverview, logsByKey, cardByJc],
  )

  const vehicleInWorkerScope = useCallback(
    (rowTasks: BodyshopFloorWorkTask[]) => {
      if (isAdminOverview) return true
      const me = String(employeeCode ?? '').trim().toUpperCase()
      return rowTasks.some((t) => workTaskEmployeeCode(t, employeeCode) === me)
    },
    [isAdminOverview, employeeCode],
  )

  const vehicleMatchesSearchAndMonth = useCallback(
    (jc: string, q: string) => {
      if (q && !jobCardMatchesSearch(jc, cardByJc, q)) return false
      const meta = cardByJc[jc]
      if (floorMonthFilter !== 'all') {
        const ym = istYearMonthFromIso(meta?.floorSinceAt)
        if (ym !== floorMonthFilter) return false
      }
      return true
    },
    [cardByJc, floorMonthFilter],
  )

  const baseJobCards = useMemo(() => {
    const set = new Set<string>()
    if (isAdminOverview) {
      for (const jc of allFloorJcs) set.add(jc)
      for (const t of tasks) set.add(t.jobCardNumber)
    } else {
      for (const t of tasks) set.add(t.jobCardNumber)
    }
    return sortJobCardsByFloorDayRecency([...set], cardByJc, today)
  }, [isAdminOverview, allFloorJcs, tasks, cardByJc, today])

  const edpJobCardsSorted = useMemo(
    () => sortJobCardsByFloorDayRecency(allFloorJcs, cardByJc, today),
    [allFloorJcs, cardByJc, today],
  )

  const filterCounts = useMemo(() => {
    const floorDay = { all: 0, today: 0, yesterday: 0, older: 0, unknown: 0 }
    const updates = { all: 0, pending: 0, done: 0 }
    const q = vehicleSearch.trim().toLowerCase()

    for (const jc of baseJobCards) {
      if (!vehicleMatchesSearchAndMonth(jc, q)) continue
      const meta = cardByJc[jc]
      const rowTasks = tasks.filter((t) => t.jobCardNumber === jc)
      if (!vehicleInWorkerScope(rowTasks)) continue

      const bucket = floorWorkFloorDayBucket(meta?.floorSinceAt, today)
      const hasUpdate = vehicleHasTodayUpdate(jc, rowTasks)

      const passesUpdateFacet =
        updateFilter === 'all'
        || (updateFilter === 'pending' && !hasUpdate)
        || (updateFilter === 'done' && hasUpdate)
      const passesFloorDayFacet = floorDayFilter === 'all' || floorDayFilter === bucket

      if (passesUpdateFacet) {
        floorDay.all += 1
        floorDay[bucket] += 1
      }
      if (passesFloorDayFacet) {
        updates.all += 1
        if (hasUpdate) updates.done += 1
        else updates.pending += 1
      }
    }
    return { floorDay, updates }
  }, [
    baseJobCards,
    cardByJc,
    vehicleSearch,
    tasks,
    today,
    floorDayFilter,
    updateFilter,
    vehicleMatchesSearchAndMonth,
    vehicleInWorkerScope,
    vehicleHasTodayUpdate,
  ])

  const vehicleRows = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase()
    const rows: Array<{ jobCardNumber: string; tasks: BodyshopFloorWorkTask[] }> = []

    for (const jc of baseJobCards) {
      if (!vehicleMatchesSearchAndMonth(jc, q)) continue
      const meta = cardByJc[jc]
      if (floorDayFilter !== 'all') {
        const bucket = floorWorkFloorDayBucket(meta?.floorSinceAt, today)
        if (bucket !== floorDayFilter) continue
      }
      const rowTasks = tasks.filter((t) => t.jobCardNumber === jc)
      if (!vehicleInWorkerScope(rowTasks)) continue
      if (updateFilter === 'pending' && vehicleHasTodayUpdate(jc, rowTasks)) continue
      if (updateFilter === 'done' && !vehicleHasTodayUpdate(jc, rowTasks)) continue
      rows.push({ jobCardNumber: jc, tasks: rowTasks })
    }
    return rows
  }, [
    baseJobCards,
    cardByJc,
    vehicleSearch,
    floorDayFilter,
    updateFilter,
    tasks,
    today,
    vehicleMatchesSearchAndMonth,
    vehicleInWorkerScope,
    vehicleHasTodayUpdate,
  ])

  const displayedVehicleRows = useMemo(
    () => vehicleRows.slice(0, listVisibleCount),
    [vehicleRows, listVisibleCount],
  )

  const selectedTask = useMemo(() => {
    if (!selectedJc) return null
    const onVehicle = tasks.filter((t) => t.jobCardNumber === selectedJc)
    const me = String(employeeCode ?? '').trim().toUpperCase()
    const mine = onVehicle.find((t) => workTaskEmployeeCode(t, employeeCode) === me)
    return mine ?? onVehicle[0] ?? null
  }, [selectedJc, tasks, employeeCode])

  const selectedVehiclePhotos = selectedJc ? (photosByVehicle[selectedJc] ?? []) : []

  const refreshPhotoCounts = useCallback(async (jcs: string[], cards: typeof cardByJc) => {
    if (jcs.length === 0) {
      setPhotoCountByJc({})
      return
    }
    setLoadingPhotoCounts(true)
    try {
      const lookup = new Set<string>()
      for (const jc of jcs) {
        for (const k of floorWorkJobCardLookupKeys(jc, cards[jc])) lookup.add(k)
      }
      const phRes = await fetchFloorWorkPhotoCountsForJobCards([...lookup])
      if (phRes.error || !phRes.data) return
      const byVehicle: Record<string, number> = {}
      for (const jc of jcs) {
        let n = 0
        for (const k of floorWorkJobCardLookupKeys(jc, cards[jc])) {
          n += phRes.data[k] ?? 0
        }
        byVehicle[jc] = n
      }
      setPhotoCountByJc((prev) => ({ ...prev, ...byVehicle }))
    } finally {
      setLoadingPhotoCounts(false)
    }
  }, [])

  const enrichVehicleMetaBatch = useCallback(
    async (jcs: string[]) => {
      const todo = jcs.filter((jc) => jc && !metaLoadedJcsRef.current.has(jc))
      if (todo.length === 0) return
      setLoadingMoreMeta(true)
      try {
        const batch = await fetchRepairCardVehicleByJcs(todo, {
          assignmentCreatedAtByJc: assignmentCreatedAtRef.current,
        })
        for (const jc of todo) metaLoadedJcsRef.current.add(jc)
        setCardByJc((prev) => ({ ...prev, ...batch }))
        await refreshPhotoCounts(todo, batch)
      } finally {
        setLoadingMoreMeta(false)
      }
    },
    [refreshPhotoCounts],
  )

  const loadMoreVehicles = useCallback(() => {
    const next = listVisibleCount + FLOOR_WORK_LIST_PAGE_SIZE
    setListVisibleCount(next)
    const jcs = vehicleRows.slice(0, next).map((r) => r.jobCardNumber)
    void enrichVehicleMetaBatch(jcs)
  }, [listVisibleCount, vehicleRows, enrichVehicleMetaBatch])

  const loadPhotosForVehicle = useCallback(
    async (jc: string, cards: typeof cardByJc) => {
      setLoadingSelectedPhotos(true)
      setSelectedPhotosError(null)
      try {
        const lookup = new Set<string>()
        for (const k of floorWorkJobCardLookupKeys(jc, cards[jc])) lookup.add(k)
        const phRes = await fetchAllFloorWorkPhotosForJobCards([...lookup])
        if (phRes.error) {
          setSelectedPhotosError(phRes.error)
          return
        }
        setPhotosByVehicle((prev) => ({
          ...prev,
          ...groupPhotosByVehicle([jc], cards, phRes.data ?? []),
        }))
      } finally {
        setLoadingSelectedPhotos(false)
      }
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
      const assignmentCreatedAtByJc = buildAssignmentCreatedAtByJc(assRows)
      const liveFloorJcs = adminOverview ? await fetchLiveOnFloorJobCardKeys() : []
      const allJcs = Array.from(new Set([...assignmentJcs, ...liveFloorJcs, ...myTasks.map((t) => t.jobCardNumber)]))
      setAllFloorJcs(allJcs)
      assignmentCreatedAtRef.current = assignmentCreatedAtByJc
      metaLoadedJcsRef.current = new Set()
      setListVisibleCount(FLOOR_WORK_LIST_PAGE_SIZE)

      const minimalCards =
        allJcs.length > 0
          ? buildMinimalFloorWorkVehicleMeta(allJcs, assignmentCreatedAtByJc)
          : ({} as Record<string, FloorWorkVehicleMeta>)
      setCardByJc(minimalCards)

      const logsRes = adminOverview
        ? await fetchRoleDailyLogsForDate(today)
        : await fetchRoleDailyLogsForDate(today, allJcs.length ? allJcs : undefined)

      if (logsRes.error) throw new Error(logsRes.error)
      const lmap: Record<string, BodyshopFloorRoleDailyLogRow> = {}
      for (const row of logsRes.data ?? []) {
        lmap[workLogMapKey(row.job_card_number, row.floor_role, row.employee_code, row.is_support)] = row
      }
      setLogsByKey(lmap)
      setPhotosByVehicle({})
      setPhotoCountByJc({})

      const firstBatch = sortJobCardsByFloorDayRecency(allJcs, minimalCards, today).slice(
        0,
        FLOOR_WORK_LIST_PAGE_SIZE,
      )
      void enrichVehicleMetaBatch(firstBatch)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [today, enrichVehicleMetaBatch])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (loading || displayedVehicleRows.length === 0) return
    const jcs = displayedVehicleRows.map((r) => r.jobCardNumber)
    void enrichVehicleMetaBatch(jcs)
  }, [loading, displayedVehicleRows, enrichVehicleMetaBatch])

  useEffect(() => {
    if (!selectedJc) return
    void loadPhotosForVehicle(selectedJc, cardByJc)
  }, [selectedJc, cardByJc, loadPhotosForVehicle])

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
      if (selected.jobCardNumber) {
        await loadPhotosForVehicle(selected.jobCardNumber, cardByJc)
        void refreshPhotoCounts(allFloorJcs.length ? allFloorJcs : [selected.jobCardNumber], cardByJc)
      }
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
            {vehicleRows.length > 0 || isAdminOverview || baseJobCards.length > 0 ? (
              <>
                <div className="bfw-filters">
                  <div className="bfw-filters__top">
                    <div className="bsf-search">
                      <Icon name="search" size={16} />
                      <input
                        className="bsf-search__input"
                        type="search"
                        placeholder="Search reg / customer / JC…"
                        value={vehicleSearch}
                        onChange={(e) => setVehicleSearch(e.target.value)}
                      />
                    </div>
                    <div className="bsf-group">
                      <span className="bsf-label">Month on floor</span>
                      <select
                        className="sel sel--advisor-filter"
                        value={floorMonthFilter}
                        onChange={(e) => setFloorMonthFilter(e.target.value)}
                        aria-label="Month on floor"
                      >
                        {monthFilterOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="bfw-filters__row">
                    <div className="bsf-group">
                      <span className="bsf-label">On floor (IST)</span>
                      {(['all', 'today', 'yesterday', 'older', 'unknown'] as const).map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={`bsf-chip ${floorDayFilter === key ? 'is-active' : ''}`}
                          onClick={() => setFloorDayFilter(key)}
                        >
                          {key === 'all' ? 'All' : floorWorkFloorDayLabel(key)}
                          <span className="bsf-chip__n">{filterCounts.floorDay[key]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bfw-filters__row">
                    <div className="bsf-group">
                      <span className="bsf-label">Today&apos;s update</span>
                      {(['all', 'pending', 'done'] as const).map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={`bsf-chip ${updateFilter === key ? 'is-active' : ''}`}
                          onClick={() => setUpdateFilter(key)}
                        >
                          {key === 'all' ? 'All' : key === 'pending' ? 'Pending' : 'Updated'}
                          <span className="bsf-chip__n">{filterCounts.updates[key]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 0, marginBottom: 12 }}>
                  Showing {vehicleRows.length} vehicle{vehicleRows.length === 1 ? '' : 's'}
                  {' · '}Sorted: on floor today → yesterday → longer wait
                  {loadingPhotoCounts ? ' · Photo counts loading…' : ''}
                </p>
              </>
            ) : null}
            {vehicleRows.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>
                {baseJobCards.length === 0
                  ? isAdminOverview
                    ? 'No vehicles on floor or active assignments yet.'
                    : 'No active floor assignment for your employee code. Floor Incharge must assign you on Bodyshop Floor.'
                  : 'No vehicles match the current filters. Try All for On floor and Today\'s update, or clear search.'}
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 12,
                }}
              >
                {displayedVehicleRows.map(({ jobCardNumber, tasks: rowTasks }) => {
                  const card = cardByJc[jobCardNumber]
                  const todayUpdated = vehicleHasTodayUpdate(jobCardNumber, rowTasks)
                  const photoCount = photoCountByJc[jobCardNumber] ?? 0
                  const active = selectedJc === jobCardNumber
                  const floorDay = floorWorkFloorDayBucket(card?.floorSinceAt, today)
                  return (
                    <button
                      key={jobCardNumber}
                      type="button"
                      onClick={() => setSelectedJc(jobCardNumber)}
                      className="card"
                      style={{
                        textAlign: 'left',
                        cursor: 'pointer',
                        margin: 0,
                        padding: 14,
                        border: active ? '2px solid var(--primary, #0d9488)' : '1px solid var(--border, #e5e7eb)',
                        boxShadow: active ? '0 0 0 1px var(--primary, #0d9488)' : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <strong style={{ fontSize: 16 }}>{floorWorkVehicleTitle(card, jobCardNumber)}</strong>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: todayUpdated ? 'var(--surface-2, #e0f2fe)' : 'var(--surface-3, #fef3c7)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {rowTasks.length === 0
                            ? '—'
                            : isAdminOverview
                              ? (todayUpdated ? 'Updated' : 'Pending')
                              : (todayUpdated ? 'Done' : 'Pending')}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--muted)' }}>
                        {floorWorkVehicleSubtitle(card, jobCardNumber) || 'Customer —'}
                      </p>
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>
                        {floorWorkStandingLine(card) ?? 'Time on floor —'}
                        {' · '}{floorWorkFloorDayLabel(floorDay)}
                      </p>
                      {rowTasks.length > 0 ? (
                        <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.4 }}>
                          {isAdminOverview ? 'Roles: ' : 'Role: '}
                          {rowTasks.map((t) => BODYSHOP_FLOOR_WORK_ROLE_LABELS[t.floorRole]).join(', ')}
                        </p>
                      ) : null}
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>
                        Photos: {photoCount}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
            {vehicleRows.length > 0 ? (
              <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                  Showing {Math.min(listVisibleCount, vehicleRows.length)} of {vehicleRows.length} vehicles
                  {loadingMoreMeta ? ' · Loading details…' : ''}
                </p>
                {listVisibleCount < vehicleRows.length ? (
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    disabled={loadingMoreMeta}
                    onClick={() => loadMoreVehicles()}
                  >
                    {loadingMoreMeta ? 'Loading…' : `Load more (${FLOOR_WORK_LIST_PAGE_SIZE})`}
                  </button>
                ) : null}
              </div>
            ) : null}
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, marginBottom: 0 }}>
              Click a card to view all role photos and submit today&apos;s update (if assigned).
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

              {selectedPhotosError ? (
                <p style={{ fontSize: 13, color: 'var(--danger, #b91c1c)' }}>{selectedPhotosError}</p>
              ) : null}
              {loadingSelectedPhotos ? (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading photos…</p>
              ) : (
                <BodyshopFloorWorkPhotoGallery
                  photos={selectedVehiclePhotos}
                  title={`All floor work photos — ${selectedVehiclePhotos.length} total (A→Z / oldest first)`}
                />
              )}
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
