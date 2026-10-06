import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getLinkedEmployeeContext } from '../lib/api/bodyshopFloorWorkContext'
import { loadBodyshopFloorInchargeScope } from '../lib/bodyshopFloorInchargeScope'
import { shouldUseFloorWorkAdminOverview } from '../lib/bodyshopFloorWork/inchargeOverview'
import {
  BODYSHOP_FLOOR_WORK_ROLE_LABELS,
  listAllWorkTasksForAdmin,
  listWorkTasksForEmployee,
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
  fetchFloorWorkPhotoCountsForAssignments,
  fetchRoleDailyLogPhotos,
  fetchRoleDailyLogsForDate,
  upsertRoleDailyLog,
  uploadRoleDailyLogPhoto,
  type FloorWorkPhotoWithLog,
} from '../lib/api/bodyshopFloorRoleWorkLog'
import type { BodyshopFloorRoleDailyLogPhotoRow } from '../lib/bodyshopFloorRoleWorkLog'
import {
  enqueueFloorWorkDriveAutoSync,
  floorWorkPhotoNeedsDriveSync,
  kickFloorWorkDriveAutoSync,
  subscribeFloorWorkDriveAutoSync,
} from '../lib/api/floorWorkDriveSyncQueue'

function mergeFloorWorkDrivePhotoRows(
  prev: BodyshopFloorRoleDailyLogPhotoRow[],
  synced: BodyshopFloorRoleDailyLogPhotoRow[],
): BodyshopFloorRoleDailyLogPhotoRow[] {
  if (synced.length === 0) return prev
  const byId = new Map(synced.map((p) => [p.id, p]))
  return prev.map((p) => byId.get(p.id) ?? p)
}
import { BodyshopFloorWorkVehicleDetailPanel } from '../components/BodyshopFloorWorkVehicleDetailPanel'
import { floorWorkVehicleStatusHeadline } from '../lib/bodyshopFloorWork/vehiclePipelineStatus'
import Icon from '../components/Icon'
import { getDealerContext } from '../lib/api'
import {
  fetchBodyshopAssignmentsForEmployee,
  fetchBodyshopSupportAssignmentsForEmployee,
} from '../lib/api/bodyshopFloorWorkAssignments'
import { fetchLiveOnFloorJobCardKeys, fetchRepairCardVehicleByJcs } from '../lib/api/bodyshopFloorWorkVehicles'
import { completeBodyshopFloorWorkRoleOnAssignment } from '../lib/api/bodyshopFloorWorkPipeline'
import {
  buildAssignmentRowByJobCard,
  canSubmitFloorWorkTask,
  isFloorWorkTaskAtActivePipelineStep,
  isFloorWorkTaskStepCompleted,
  pickFloorWorkDetailTask,
} from '../lib/bodyshopFloorWork/pipeline'
import {
  floorWorkVehicleSubtitle,
  floorWorkVehicleTitle,
  sortJobCardsByFloorDayRecency,
  floorWorkStandingLine,
  floorWorkJobCardLookupKeys,
  floorWorkPhotoBelongsToVehicle,
  buildFloorWorkMonthFilterOptions,
  floorWorkFloorDayBucket,
  floorWorkFloorDayLabel,
  istYearMonthFromIso,
  currentIstYearMonth,
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
  const [assignmentByJc, setAssignmentByJc] = useState<Record<string, Record<string, unknown>>>({})
  /** Worker slots on Bodyshop Floor before pipeline filter (for empty-state hints). */
  const [workerAssignedSlotCount, setWorkerAssignedSlotCount] = useState(0)

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

  const vehicleHasPendingPipelineSteps = useCallback(
    (jobCardNumber: string, rowTasks: BodyshopFloorWorkTask[]) => {
      const row = assignmentByJc[jobCardNumber]
      if (rowTasks.length === 0) return true
      return rowTasks.some((t) => !isFloorWorkTaskStepCompleted(t, row))
    },
    [assignmentByJc],
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

  const filterCounts = useMemo(() => {
    const floorDay = { all: 0, today: 0, yesterday: 0, older: 0, unknown: 0 }
    const updates = { all: 0, pending: 0, done: 0 }
    const q = vehicleSearch.trim().toLowerCase()

    for (const jc of baseJobCards) {
      if (!vehicleMatchesSearchAndMonth(jc, q)) continue
      const meta = cardByJc[jc]
      let rowTasks = tasks.filter((t) => t.jobCardNumber === jc)
      if (!isAdminOverview) {
        rowTasks = rowTasks.filter((t) => isFloorWorkTaskAtActivePipelineStep(t, assignmentByJc[jc]))
      }
      if (!vehicleInWorkerScope(rowTasks)) continue

      const bucket = floorWorkFloorDayBucket(meta?.floorSinceAt, today)
      const hasPending = vehicleHasPendingPipelineSteps(jc, rowTasks)

      const passesUpdateFacet =
        updateFilter === 'all'
        || (updateFilter === 'pending' && hasPending)
        || (updateFilter === 'done' && !hasPending)
      const passesFloorDayFacet = floorDayFilter === 'all' || floorDayFilter === bucket

      if (passesUpdateFacet) {
        floorDay.all += 1
        floorDay[bucket] += 1
      }
      if (passesFloorDayFacet) {
        updates.all += 1
        if (!hasPending) updates.done += 1
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
    vehicleHasPendingPipelineSteps,
    isAdminOverview,
    assignmentByJc,
  ])

  const vehicleRows = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase()
    const rows: Array<{ jobCardNumber: string; tasks: BodyshopFloorWorkTask[] }> = []

    for (const jc of baseJobCards) {
      if (!vehicleMatchesSearchAndMonth(jc, q)) continue
      const meta = cardByJc[jc]
      if (isAdminOverview && floorDayFilter !== 'all') {
        const bucket = floorWorkFloorDayBucket(meta?.floorSinceAt, today)
        if (bucket !== floorDayFilter) continue
      }
      let rowTasks = tasks.filter((t) => t.jobCardNumber === jc)
      if (!isAdminOverview) {
        rowTasks = rowTasks.filter((t) => isFloorWorkTaskAtActivePipelineStep(t, assignmentByJc[jc]))
      }
      if (!vehicleInWorkerScope(rowTasks)) continue
      if (isAdminOverview) {
        if (updateFilter === 'pending' && !vehicleHasPendingPipelineSteps(jc, rowTasks)) continue
        if (updateFilter === 'done' && vehicleHasPendingPipelineSteps(jc, rowTasks)) continue
      }
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
    vehicleHasPendingPipelineSteps,
    isAdminOverview,
    assignmentByJc,
  ])

  const displayedVehicleRows = useMemo(
    () => vehicleRows.slice(0, listVisibleCount),
    [vehicleRows, listVisibleCount],
  )

  const selectedTask = useMemo(() => {
    if (!selectedJc) return null
    const onVehicle = tasks.filter((t) => t.jobCardNumber === selectedJc)
    const row = assignmentByJc[selectedJc]
    const qcStatus = cardByJc[selectedJc]?.qcStatus
    if (isAdminOverview) {
      return pickFloorWorkDetailTask(onVehicle, row, qcStatus, employeeCode)
    }
    const me = String(employeeCode ?? '').trim().toUpperCase()
    const mine = onVehicle.find((t) => workTaskEmployeeCode(t, employeeCode) === me)
    return mine ?? onVehicle[0] ?? null
  }, [selectedJc, tasks, employeeCode, isAdminOverview, assignmentByJc, cardByJc])

  const canEditSelectedTask = useMemo(() => {
    if (!selectedTask) return false
    const row = assignmentByJc[selectedTask.jobCardNumber]
    const qcStatus = cardByJc[selectedTask.jobCardNumber]?.qcStatus
    return canSubmitFloorWorkTask(selectedTask, row, qcStatus, { isAdminOverview })
  }, [selectedTask, assignmentByJc, cardByJc, isAdminOverview])

  const selectedVehiclePhotos = selectedJc ? (photosByVehicle[selectedJc] ?? []) : []

  const refreshPhotoCounts = useCallback(async (jcs: string[], cards: typeof cardByJc) => {
    if (jcs.length === 0) {
      setPhotoCountByJc({})
      return
    }
    setLoadingPhotoCounts(true)
    try {
      const phRes = await fetchFloorWorkPhotoCountsForAssignments(
        jcs.map((jc) => ({ assignmentKey: jc, meta: cards[jc] })),
      )
      if (phRes.error || !phRes.data) return
      setPhotoCountByJc((prev) => ({ ...prev, ...phRes.data }))
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
        setCardByJc((prev) => {
          const next = { ...prev, ...batch }
          void refreshPhotoCounts(todo, next)
          return next
        })
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
      const inchargeScope = await loadBodyshopFloorInchargeScope()
      const adminOverview = shouldUseFloorWorkAdminOverview(ctx.data, inchargeScope)
      setIsAdminOverview(adminOverview)
      setEmployeeCode(myCode)
      setEmployeeName(ctx.data.employeeName)
      setEmployeeRole(ctx.data.employeeRole)
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

      const assignmentMap = buildAssignmentRowByJobCard(assRows)
      if (!adminOverview) {
        setWorkerAssignedSlotCount(myTasks.length)
        myTasks = myTasks.filter((t) => isFloorWorkTaskAtActivePipelineStep(t, assignmentMap[t.jobCardNumber]))
        setFloorMonthFilter(currentIstYearMonth(today))
        setFloorDayFilter('all')
        setUpdateFilter('all')
      } else {
        setWorkerAssignedSlotCount(0)
        setFloorMonthFilter('all')
        setFloorDayFilter('all')
        setUpdateFilter('all')
      }
      setAssignmentByJc(assignmentMap)
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
    if (!vehicleRows.some((r) => r.jobCardNumber === selectedJc)) {
      setSelectedJc(null)
    }
  }, [vehicleRows, selectedJc])

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

  const queueVisibleFloorWorkDriveSync = useCallback(() => {
    if (!selectedTask) return
    const pending = savedPhotos.filter(floorWorkPhotoNeedsDriveSync)
    if (pending.length > 0) enqueueFloorWorkDriveAutoSync(pending, selectedTask.jobCardNumber)
    else kickFloorWorkDriveAutoSync()
  }, [selectedTask, savedPhotos])

  useEffect(() => {
    return subscribeFloorWorkDriveAutoSync((synced) => {
      setSavedPhotos((prev) => mergeFloorWorkDrivePhotoRows(prev, synced))
    })
  }, [])

  useEffect(() => {
    queueVisibleFloorWorkDriveSync()
  }, [queueVisibleFloorWorkDriveSync])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') queueVisibleFloorWorkDriveSync()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [queueVisibleFloorWorkDriveSync])

  async function saveWorkerLog() {
    if (!selectedTask) return
    const selected = selectedTask
    const slotCode = workTaskEmployeeCode(selected, employeeCode)
    if (!slotCode) return
    const trimmed = note.trim()
    if (pendingPhotos.length === 0 && savedPhotos.length === 0) {
      alert('Add at least one work photo before marking Done.')
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
      const employeeCodeForLog = isAdminOverview
        ? slotCode
        : String(myCodeRaw ?? employeeCode ?? slotCode).trim().toUpperCase() || slotCode

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

      const completeRes = await completeBodyshopFloorWorkRoleOnAssignment({
        jobCardNumber: selected.jobCardNumber,
        floorRole: selected.floorRole,
        actorEmail: user?.email ?? null,
      })
      if (completeRes.error) throw new Error(completeRes.error)

      const { data: assRow, error: assReadErr } = await supabase
        .from('bodyshop_assignments')
        .select('*')
        .eq('is_active', true)
        .eq('job_card_number', selected.jobCardNumber)
        .maybeSingle()
      if (assReadErr) throw new Error(assReadErr.message)
      if (assRow) {
        const row = assRow as Record<string, unknown>
        setAssignmentByJc((prev) => ({ ...prev, [selected.jobCardNumber]: row }))
        if (!isAdminOverview) {
          setTasks((prev) => prev.filter((t) => isFloorWorkTaskAtActivePipelineStep(t, row)))
        }
      }

      if (selected.jobCardNumber) {
        await loadPhotosForVehicle(selected.jobCardNumber, cardByJc)
        void refreshPhotoCounts([selected.jobCardNumber], cardByJc)
      }
      alert('Done — your step is complete and the vehicle moves to the next role.')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
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

      <>
          <div className="bfw-layout">
          <div className="bfw-layout__list card" style={{ marginBottom: 0 }}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>{isAdminOverview ? 'All assigned vehicles' : 'My vehicles — your pipeline step'}</h2>
            {!isAdminOverview ? (
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 0, marginBottom: 10 }}>
                Your assigned vehicles this month, only when it is your turn in the pipeline
                (Dentor → Painter → Technician → Rubbing). Submit to complete your step.
              </p>
            ) : null}
            {vehicleRows.length > 0 || isAdminOverview || baseJobCards.length > 0 ? (
              <>
                <div className="bfw-filters">
                  <div className="bfw-filters__top">
                    {isAdminOverview ? (
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
                    ) : null}
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

                  {isAdminOverview ? (
                    <>
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
                          <span className="bsf-label">Pipeline step</span>
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
                    </>
                  ) : null}
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
                {isAdminOverview
                  ? baseJobCards.length === 0
                    ? 'No vehicles on floor or active assignments yet.'
                    : 'No vehicles match the current filters. Try All for On floor and Today\'s update, or clear search.'
                  : workerAssignedSlotCount === 0
                    ? 'No vehicle is assigned to you on Bodyshop Floor yet. Ask Floor Incharge to assign your name (Dentor / Painter / etc.) on the Bodyshop Floor screen for that job card.'
                    : tasks.length === 0
                      ? 'You have floor assignments, but none are at your pipeline step right now (an earlier role must finish first). Try another month above if the car arrived earlier.'
                      : 'No vehicles match this month or search. Try “All months” in the month filter.'}
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
                  const assignRow = assignmentByJc[jobCardNumber]
                  const stepPending = vehicleHasPendingPipelineSteps(jobCardNumber, rowTasks)
                  const photoCount = photoCountByJc[jobCardNumber] ?? 0
                  const active = selectedJc === jobCardNumber
                  const floorDay = floorWorkFloorDayBucket(card?.floorSinceAt, today)
                  const statusLine = floorWorkVehicleStatusHeadline(assignRow, card?.qcStatus)
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
                            background: stepPending ? 'var(--surface-3, #fef3c7)' : 'var(--surface-2, #e0f2fe)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {rowTasks.length === 0
                            ? '—'
                            : isAdminOverview
                              ? (stepPending ? 'Pending' : 'Done')
                              : (stepPending ? 'Your turn' : 'Done')}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--muted)' }}>
                        {floorWorkVehicleSubtitle(card, jobCardNumber) || 'Customer —'}
                      </p>
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>
                        {floorWorkStandingLine(card) ?? 'Time on floor —'}
                        {' · '}{floorWorkFloorDayLabel(floorDay)}
                      </p>
                      <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--primary, #0d9488)' }}>
                        {statusLine}
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
              Click a vehicle — summary &amp; pipeline on the right (desktop). Workers: add photos + Done on your active step.
            </p>
          </div>

          <div className="bfw-layout__detail">
            {selectedJc ? (
              <div className="card bfw-layout__detail-inner">
                <BodyshopFloorWorkVehicleDetailPanel
                  jobCardNumber={selectedJc}
                  vehicleMeta={cardByJc[selectedJc]}
                  assignmentRow={assignmentByJc[selectedJc]}
                  qcStatus={cardByJc[selectedJc]?.qcStatus}
                  allPhotos={selectedVehiclePhotos}
                  loadingPhotos={loadingSelectedPhotos}
                  photosError={selectedPhotosError}
                >
                  {selectedTask ? (
                    <div className="bfw-worker-form">
                      <h3 className="bfw-detail__section-title">
                        Your step
                        {' · '}
                        {BODYSHOP_FLOOR_WORK_ROLE_LABELS[selectedTask.floorRole]}
                        {selectedTask.isSupport ? ' (support)' : ''}
                      </h3>
                      {canEditSelectedTask ? (
                        <>
                          <p className="bfw-detail__muted">Optional note + work photos, then Done to send to the next role.</p>
                          <textarea
                            className="inp"
                            rows={3}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="What work did you finish?"
                          />
                          <label className="field" style={{ marginTop: 10 }}>
                            <span className="label">Work photos (required before Done)</span>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={(e) => setPendingPhotos(Array.from(e.target.files ?? []))}
                            />
                          </label>
                          {pendingPhotos.length > 0 ? (
                            <p className="bfw-detail__muted">{pendingPhotos.length} new photo(s) on submit</p>
                          ) : null}
                          {savedPhotos.length > 0 ? (
                            <p className="bfw-detail__muted">{savedPhotos.length} photo(s) saved for this step.</p>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn--primary"
                            style={{ marginTop: 12 }}
                            disabled={saving}
                            onClick={() => void saveWorkerLog()}
                          >
                            {saving ? 'Saving…' : 'Done — send to next step'}
                          </button>
                        </>
                      ) : isAdminOverview ? (
                        <p className="bfw-detail__muted">
                          Admin read-only: this vehicle is not on an active pipeline step for upload. Use work updates and
                          photo sections below to review what each worker submitted.
                        </p>
                      ) : (
                        <p className="bfw-detail__muted">
                          Not your turn yet — an earlier pipeline step must finish first, or QC is in progress.
                        </p>
                      )}
                    </div>
                  ) : null}
                </BodyshopFloorWorkVehicleDetailPanel>
              </div>
            ) : (
              <div className="card bfw-layout__placeholder">
                <h2 style={{ fontSize: 16, marginTop: 0 }}>Vehicle details</h2>
                <p style={{ color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                  Select a vehicle from the list to see pipeline status (Denting / Painting / …), who is working, worker notes,
                  and all photos — desktop-friendly layout.
                </p>
              </div>
            )}
          </div>
          </div>
        </>
    </div>
  )
}
