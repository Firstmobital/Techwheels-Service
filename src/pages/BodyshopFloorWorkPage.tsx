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
import {
  classifyFloorWorkPipelineStage,
  emptyPipelineStageCounts,
  PIPELINE_STAGE_FILTER_BUCKETS,
  PIPELINE_STAGE_FILTER_LABELS,
  pipelineStageHasWorkerAssignment,
  type FloorWorkPipelineStageFilter,
} from '../lib/bodyshopFloorWork/pipelineStageFilter'
import Icon from '../components/Icon'
import { getDealerContext } from '../lib/api'
import {
  fetchBodyshopAssignmentsForEmployee,
  fetchBodyshopSupportAssignmentsForEmployee,
} from '../lib/api/bodyshopFloorWorkAssignments'
import {
  fetchLiveOnFloorVehicleCatalog,
  fetchRepairCardVehicleByJcs,
} from '../lib/api/bodyshopFloorWorkVehicles'
import {
  aliasAssignmentMapForVehicleCatalog,
  filterTasksForLiveFloorVehicle,
  resolveBodyshopAssignmentRow,
} from '../lib/bodyshopFloorWork/assignmentLookup'
import { floorWorkVehicleDetailPath } from '../lib/bodyshopFloorWork/floorWorkRoutes'
import { BODYSHOP_FLOOR_LIVE_LIST_LABEL } from '../lib/bodyshopFloorLive'
import { completeBodyshopFloorWorkRoleOnAssignment } from '../lib/api/bodyshopFloorWorkPipeline'
import {
  buildAssignmentRowByJobCard,
  canSubmitFloorWorkTask,
  isFloorWorkTaskAtActivePipelineStep,
  isFloorWorkTaskStepCompleted,
  isWorkerQcTurn,
  pickFloorWorkDetailTask,
  resolveCanonicalAssignmentRowForJobCard,
} from '../lib/bodyshopFloorWork/pipeline'
import {
  fetchWorkerRoleQcForJobCards,
  saveWorkerRoleQcFromFloorWork,
  type WorkerQcDecision,
} from '../lib/api/bodyshopFloorWorkerRoleQc'
import { isWorkerSelfQcRole, type WorkerRoleQcMap } from '../lib/bodyshopFloorWork/workerRoleQc'
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
  type FloorWorkVehicleMeta,
  buildMinimalFloorWorkVehicleMeta,
  floorWorkListSinceIso,
  floorWorkVehicleShowInList,
  floorWorkVehiclePhysicalFloor,
  type FloorWorkPhysicalFloorFilter,
} from '../lib/bodyshopFloorWork/display'
import {
  countAdminListFacet,
  matchesAdminListFacets,
  type AdminListFacetFilters,
  type FloorDayFilter,
  type FloorWorkListEntry,
  type UpdateFilter,
} from '../lib/bodyshopFloorWork/adminListFacetFilters'

const FLOOR_WORK_LIST_PAGE_SIZE = 24

function buildRepairCardIdByJc(assRows: Record<string, unknown>[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of assRows) {
    const jc = String(row.job_card_number ?? '').trim().toUpperCase()
    const id = typeof row.repair_card_id === 'number' ? row.repair_card_id : Number(row.repair_card_id)
    if (jc && Number.isFinite(id) && id > 0) out[jc] = id
  }
  return out
}

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
  const [physicalFloorFilter, setPhysicalFloorFilter] = useState<FloorWorkPhysicalFloorFilter>('all')
  const [pipelineStageFilter, setPipelineStageFilter] = useState<FloorWorkPipelineStageFilter>('all')
  const [photoCountByJc, setPhotoCountByJc] = useState<Record<string, number>>({})
  const [loadingPhotoCounts, setLoadingPhotoCounts] = useState(false)
  const [loadingSelectedPhotos, setLoadingSelectedPhotos] = useState(false)
  const [selectedPhotosError, setSelectedPhotosError] = useState<string | null>(null)
  const [listVisibleCount, setListVisibleCount] = useState(FLOOR_WORK_LIST_PAGE_SIZE)
  const [loadingMoreMeta, setLoadingMoreMeta] = useState(false)
  const [workerRoleQcByJc, setWorkerRoleQcByJc] = useState<Record<string, WorkerRoleQcMap>>({})
  const [workerQcFailReason, setWorkerQcFailReason] = useState('')
  const assignmentCreatedAtRef = useRef<Record<string, string>>({})
  const assignmentRepairCardIdRef = useRef<Record<string, number>>({})
  const assignmentRowsRef = useRef<Record<string, unknown>[]>([])
  const metaLoadedJcsRef = useRef<Set<string>>(new Set())
  const detailSectionRef = useRef<HTMLElement | null>(null)

  const assignmentRowForDisplayJc = useCallback(
    (displayJc: string) =>
      resolveBodyshopAssignmentRow(
        displayJc,
        cardByJc[displayJc],
        assignmentByJc,
        assignmentRowsRef.current,
      ),
    [cardByJc, assignmentByJc],
  )

  const tasksForDisplayJc = useCallback(
    (displayJc: string): BodyshopFloorWorkTask[] => {
      const meta = cardByJc[displayJc]
      const ass = assignmentRowForDisplayJc(displayJc)
      return filterTasksForLiveFloorVehicle(displayJc, meta, ass, tasks) as BodyshopFloorWorkTask[]
    },
    [cardByJc, tasks, assignmentRowForDisplayJc],
  )

  const monthFilterOptions = useMemo(() => buildFloorWorkMonthFilterOptions(today, 5), [today])

  useEffect(() => {
    setListVisibleCount(FLOOR_WORK_LIST_PAGE_SIZE)
  }, [vehicleSearch, floorMonthFilter, floorDayFilter, updateFilter, physicalFloorFilter, pipelineStageFilter])

  const vehicleHasPendingPipelineSteps = useCallback(
    (displayJc: string, rowTasks: BodyshopFloorWorkTask[]) => {
      const row = assignmentRowForDisplayJc(displayJc)
      if (rowTasks.length === 0) return true
      return rowTasks.some((t) => !isFloorWorkTaskStepCompleted(t, row))
    },
    [assignmentRowForDisplayJc],
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
        const ym = istYearMonthFromIso(floorWorkListSinceIso(meta) ?? undefined)
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
    } else {
      for (const t of tasks) set.add(t.jobCardNumber)
    }
    return sortJobCardsByFloorDayRecency([...set], cardByJc, today)
  }, [isAdminOverview, allFloorJcs, tasks, cardByJc, today])

  const adminListFacets = useMemo(
    (): AdminListFacetFilters => ({
      floorDay: floorDayFilter,
      physical: physicalFloorFilter,
      pipeline: pipelineStageFilter,
      update: updateFilter,
    }),
    [floorDayFilter, physicalFloorFilter, pipelineStageFilter, updateFilter],
  )

  const floorWorkListCatalog = useMemo((): FloorWorkListEntry[] => {
    const q = vehicleSearch.trim().toLowerCase()
    const catalog: FloorWorkListEntry[] = []
    for (const jc of baseJobCards) {
      if (!vehicleMatchesSearchAndMonth(jc, q)) continue
      const meta = cardByJc[jc]
      if (!isAdminOverview && !floorWorkVehicleShowInList(jc, meta)) continue
      let rowTasks = isAdminOverview ? tasksForDisplayJc(jc) : tasks.filter((t) => t.jobCardNumber === jc)
      if (!isAdminOverview) {
        rowTasks = rowTasks.filter((t) => isFloorWorkTaskAtActivePipelineStep(t, assignmentByJc[jc]))
      }
      if (!vehicleInWorkerScope(rowTasks)) continue
      const assignRow = assignmentRowForDisplayJc(jc)
      catalog.push({
        jobCardNumber: jc,
        tasks: rowTasks,
        floorDayBucket: floorWorkFloorDayBucket(floorWorkListSinceIso(meta), today),
        physicalFloorKey: (floorWorkVehiclePhysicalFloor(meta, assignRow) ?? 'unknown') as
          | 'Floor 2'
          | 'Floor 3'
          | 'unknown',
        pipelineStage: classifyFloorWorkPipelineStage(assignRow, {
          hasAssignment: rowTasks.length > 0 || pipelineStageHasWorkerAssignment(assignRow),
        }),
        hasPending: vehicleHasPendingPipelineSteps(jc, rowTasks),
      })
    }
    return catalog
  }, [
    baseJobCards,
    cardByJc,
    vehicleSearch,
    tasks,
    today,
    vehicleMatchesSearchAndMonth,
    vehicleInWorkerScope,
    vehicleHasPendingPipelineSteps,
    isAdminOverview,
    assignmentByJc,
    tasksForDisplayJc,
    assignmentRowForDisplayJc,
  ])

  const filterCounts = useMemo(() => {
    const facets = adminListFacets
    const floorDay = {
      all: countAdminListFacet(floorWorkListCatalog, facets, { floorDay: 'all' }),
      today: countAdminListFacet(floorWorkListCatalog, facets, { floorDay: 'today' }),
      yesterday: countAdminListFacet(floorWorkListCatalog, facets, { floorDay: 'yesterday' }),
      older: countAdminListFacet(floorWorkListCatalog, facets, { floorDay: 'older' }),
      unknown: countAdminListFacet(floorWorkListCatalog, facets, { floorDay: 'unknown' }),
    }
    const updates = {
      all: countAdminListFacet(floorWorkListCatalog, facets, { update: 'all' }),
      pending: countAdminListFacet(floorWorkListCatalog, facets, { update: 'pending' }),
      done: countAdminListFacet(floorWorkListCatalog, facets, { update: 'done' }),
    }
    const physicalFloor = {
      all: countAdminListFacet(floorWorkListCatalog, facets, { physical: 'all' }),
      'Floor 2': countAdminListFacet(floorWorkListCatalog, facets, { physical: 'Floor 2' }),
      'Floor 3': countAdminListFacet(floorWorkListCatalog, facets, { physical: 'Floor 3' }),
      unknown: countAdminListFacet(floorWorkListCatalog, facets, { physical: 'unknown' }),
    }
    const pipelineStageCountsByBucket = emptyPipelineStageCounts()
    for (const key of PIPELINE_STAGE_FILTER_BUCKETS) {
      pipelineStageCountsByBucket[key] = countAdminListFacet(floorWorkListCatalog, facets, { pipeline: key })
    }
    const pipelineStage = {
      all: countAdminListFacet(floorWorkListCatalog, facets, { pipeline: 'all' }),
      ...pipelineStageCountsByBucket,
    }
    return { floorDay, updates, physicalFloor, pipelineStage }
  }, [floorWorkListCatalog, adminListFacets])

  const vehicleRows = useMemo(() => {
    if (!isAdminOverview) {
      return floorWorkListCatalog.map(({ jobCardNumber, tasks: rowTasks }) => ({
        jobCardNumber,
        tasks: rowTasks,
      }))
    }
    return floorWorkListCatalog
      .filter((e) => matchesAdminListFacets(e, adminListFacets))
      .map(({ jobCardNumber, tasks: rowTasks }) => ({ jobCardNumber, tasks: rowTasks }))
  }, [floorWorkListCatalog, adminListFacets, isAdminOverview])

  const displayedVehicleRows = useMemo(
    () => vehicleRows.slice(0, listVisibleCount),
    [vehicleRows, listVisibleCount],
  )

  const selectedTask = useMemo(() => {
    if (!selectedJc) return null
    const onVehicle = isAdminOverview ? tasksForDisplayJc(selectedJc) : tasks.filter((t) => t.jobCardNumber === selectedJc)
    const row = assignmentRowForDisplayJc(selectedJc)
    const jc = selectedJc
    const roleQc = workerRoleQcByJc[jc] ?? {}
    const repairCardQc = cardByJc[jc]?.qcStatus
    return pickFloorWorkDetailTask(onVehicle, row, roleQc, employeeCode, repairCardQc)
  }, [selectedJc, tasks, employeeCode, isAdminOverview, cardByJc, tasksForDisplayJc, assignmentRowForDisplayJc, workerRoleQcByJc])

  const canEditSelectedTask = useMemo(() => {
    if (!selectedTask) return false
    const jc = selectedJc ?? selectedTask.jobCardNumber
    const row = assignmentRowForDisplayJc(jc)
    const roleQc = workerRoleQcByJc[jc] ?? {}
    const repairCardQc = cardByJc[jc]?.qcStatus
    return canSubmitFloorWorkTask(selectedTask, row, roleQc, { isAdminOverview, repairCardQcStatus: repairCardQc })
  }, [selectedTask, selectedJc, cardByJc, isAdminOverview, assignmentRowForDisplayJc, workerRoleQcByJc])

  const selectedWorkerQcTurn = useMemo(() => {
    if (!selectedTask || !selectedJc) return false
    const row = assignmentRowForDisplayJc(selectedJc)
    return isWorkerQcTurn(
      selectedTask,
      row,
      workerRoleQcByJc[selectedJc] ?? {},
      cardByJc[selectedJc]?.qcStatus,
    )
  }, [selectedTask, selectedJc, cardByJc, assignmentRowForDisplayJc, workerRoleQcByJc])

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
    async (jcs: string[], opts?: { quiet?: boolean }) => {
      const todo = jcs.filter((jc) => jc && !metaLoadedJcsRef.current.has(jc))
      if (todo.length === 0) return
      if (!opts?.quiet) setLoadingMoreMeta(true)
      try {
        const batch = await fetchRepairCardVehicleByJcs(todo, {
          assignmentCreatedAtByJc: assignmentCreatedAtRef.current,
          repairCardIdByJc: assignmentRepairCardIdRef.current,
        })
        for (const jc of todo) metaLoadedJcsRef.current.add(jc)
        setCardByJc((prev) => {
          const next = { ...prev, ...batch }
          void refreshPhotoCounts(todo, next)
          return next
        })
      } finally {
        if (!opts?.quiet) setLoadingMoreMeta(false)
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

      let assignmentMap = buildAssignmentRowByJobCard(assRows)
      if (!adminOverview) {
        setWorkerAssignedSlotCount(myTasks.length)
        myTasks = myTasks.filter((t) => isFloorWorkTaskAtActivePipelineStep(t, assignmentMap[t.jobCardNumber]))
        setFloorMonthFilter(currentIstYearMonth(today))
        setFloorDayFilter('all')
        setUpdateFilter('all')
        setPhysicalFloorFilter('all')
        setPipelineStageFilter('all')
      } else {
        setWorkerAssignedSlotCount(0)
        setFloorMonthFilter('all')
        setFloorDayFilter('all')
        setUpdateFilter('all')
        setPhysicalFloorFilter('all')
        setPipelineStageFilter('all')
      }
      setAssignmentByJc(assignmentMap)
      setTasks(myTasks)
      assignmentRowsRef.current = assRows

      const assignmentCreatedAtByJc = buildAssignmentCreatedAtByJc(assRows)
      assignmentCreatedAtRef.current = assignmentCreatedAtByJc
      assignmentRepairCardIdRef.current = buildRepairCardIdByJc(assRows)
      metaLoadedJcsRef.current = new Set()
      setListVisibleCount(FLOOR_WORK_LIST_PAGE_SIZE)

      let allJcs: string[] = []
      let cardMeta: Record<string, FloorWorkVehicleMeta> = {}

      if (adminOverview) {
        const catalog = await fetchLiveOnFloorVehicleCatalog()
        allJcs = catalog.jobCardKeys
        cardMeta = catalog.metaByJc
        for (const jc of allJcs) {
          const id = cardMeta[jc]?.repairCardId
          if (typeof id === 'number' && id > 0) {
            assignmentRepairCardIdRef.current[jc] = id
          }
        }
        metaLoadedJcsRef.current = new Set(allJcs)
        assignmentMap = aliasAssignmentMapForVehicleCatalog(assignmentMap, assRows, cardMeta, allJcs)
        setAssignmentByJc(assignmentMap)
      } else {
        const assignmentJcs = Array.from(
          new Set((assRows ?? []).map((r) => String(r.job_card_number ?? '').trim().toUpperCase()).filter(Boolean)),
        )
        allJcs = Array.from(new Set([...assignmentJcs, ...myTasks.map((t) => t.jobCardNumber)]))
        cardMeta =
          allJcs.length > 0
            ? buildMinimalFloorWorkVehicleMeta(allJcs, assignmentCreatedAtByJc)
            : ({} as Record<string, FloorWorkVehicleMeta>)
        const ordered = sortJobCardsByFloorDayRecency(allJcs, cardMeta, today)
        for (let i = 0; i < ordered.length; i += 80) {
          await enrichVehicleMetaBatch(ordered.slice(i, i + 80), { quiet: i > 0 })
        }
      }

      setAllFloorJcs(allJcs)
      setCardByJc(cardMeta)

      try {
        const qcMaps = allJcs.length > 0 ? await fetchWorkerRoleQcForJobCards(allJcs) : {}
        setWorkerRoleQcByJc(qcMaps)
      } catch {
        setWorkerRoleQcByJc({})
      }

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

      if (adminOverview && allJcs.length > 0) {
        void refreshPhotoCounts(allJcs, cardMeta)
      }
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

  async function submitWorkerRoleQc(decision: WorkerQcDecision) {
    if (!selectedTask || !selectedJc || !selectedWorkerQcTurn) return
    if (!isWorkerSelfQcRole(selectedTask.floorRole)) return
    if (decision === 'fail' && !workerQcFailReason.trim()) {
      alert('Enter a fail reason before QC Fail.')
      return
    }
    const row = assignmentRowForDisplayJc(selectedJc)
    if (!row) {
      alert('Assignment missing — refresh the page.')
      return
    }
    const repairCardId = cardByJc[selectedJc]?.repairCardId ?? selectedTask.repairCardId
    if (!repairCardId) {
      alert('Vehicle record still loading — refresh and try again.')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const checker = String(selectedTask.employeeName ?? employeeName ?? employeeCode).trim()
      const result = await saveWorkerRoleQcFromFloorWork({
        repairCardId,
        jobCardNumber: selectedJc,
        assignmentRow: row,
        floorRole: selectedTask.floorRole,
        decision,
        employeeCode: selectedTask.assignedEmployeeCode,
        checkerName: checker,
        failReason: workerQcFailReason,
        actorEmail: user?.email ?? null,
      })
      setWorkerRoleQcByJc((prev) => ({ ...prev, [selectedJc]: result.roleQcMap }))
      setCardByJc((prev) => ({
        ...prev,
        [selectedJc]: { ...(prev[selectedJc] ?? { reg: null, customer: null }), qcStatus: result.repairCardQcStatus },
      }))
      setWorkerQcFailReason('')
      alert(
        decision === 'pass'
          ? 'QC passed. When Dentor, Painter and Technician all pass (and floor work is finished), the vehicle goes to RI for Floor Incharge.'
          : 'QC failed — fix work and submit again.',
      )
      void load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'QC save failed')
    } finally {
      setSaving(false)
    }
  }

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

      const { data: assRows, error: assReadErr } = await supabase
        .from('bodyshop_assignments')
        .select('*')
        .eq('is_active', true)
        .ilike('job_card_number', selected.jobCardNumber.trim())
      if (assReadErr) throw new Error(assReadErr.message)
      const jcNorm = selected.jobCardNumber.trim().toUpperCase()
      const matching = ((assRows ?? []) as Record<string, unknown>[]).filter(
        (r) => String(r.job_card_number ?? '').trim().toUpperCase() === jcNorm,
      )
      const picked = resolveCanonicalAssignmentRowForJobCard(matching, selected.floorRole)
      if (picked) {
        const row = picked
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
    return (
      <div>
        <div className="pagehead">
          <div>
            <div className="greet">Bodyshop · Floor Work</div>
            <h1>Floor Work</h1>
          </div>
        </div>
        <div className="empty-state">Loading floor work…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="pagehead">
          <div>
            <div className="greet">Bodyshop · Floor Work</div>
            <h1>Floor Work</h1>
          </div>
        </div>
        <p className="alert alert--err">{error}</p>
        <p className="bsf-subline">
          Ask admin: link your login to employee code in Admin → Mappings, set Employee Master role (DENTOR/PAINTER/…),
          and grant module <b>bodyshop_floor_work</b>.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="greet">Bodyshop · Floor Work</div>
          <h1>Floor Work</h1>
          <p className="bsf-subline">
            {(employeeName ?? employeeCode) || 'Admin'}
            {isAdminOverview ? ` · Admin — ${BODYSHOP_FLOOR_LIVE_LIST_LABEL} (same vehicles as Bodyshop Floor)` : ' · Your pipeline step (Dentor → Painter → Technician → Rubbing)'}
            {' · IST '}{today}
            {' · '}{vehicleRows.length} showing / {floorWorkListCatalog.length} in catalog
            {loadingPhotoCounts ? ' · Photo counts loading…' : ''}
          </p>
        </div>
        <div className="bsf-top-actions">
          {!isAdminOverview ? (
            <label className="bsf-list-mode">
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
            </label>
          ) : null}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {isAdminOverview ? (
        <div className="bsf-kpis">
          <button
            type="button"
            className={`bsf-kpi bsf-kpi--all ${pipelineStageFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setPipelineStageFilter('all')}
          >
            <div className="bsf-kpi__count">{filterCounts.pipelineStage.all}</div>
            <div className="bsf-kpi__label">All lanes</div>
          </button>
          {PIPELINE_STAGE_FILTER_BUCKETS.map((key) => (
            <button
              key={key}
              type="button"
              className={`bsf-kpi bsf-kpi--work_inprocess ${pipelineStageFilter === key ? 'is-active' : ''}`}
              onClick={() => setPipelineStageFilter(key)}
              disabled={(filterCounts.pipelineStage[key] ?? 0) === 0}
            >
              <div className="bsf-kpi__count">{filterCounts.pipelineStage[key]}</div>
              <div className="bsf-kpi__label">{PIPELINE_STAGE_FILTER_LABELS[key]}</div>
            </button>
          ))}
        </div>
      ) : null}

      {(vehicleRows.length > 0 || isAdminOverview || baseJobCards.length > 0) ? (
        <div className="bsf-filterbar">
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
          {isAdminOverview ? (
            <>
              <span className="bsf-sep" />
              <div className="bsf-group bsf-group--wrap" style={{ flex: '1 1 100%', marginBottom: 4 }}>
                <span className="bsf-label">Work lane</span>
                <button
                  type="button"
                  className={`bsf-chip ${pipelineStageFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => setPipelineStageFilter('all')}
                >
                  All lanes <span className="bsf-chip__n">{filterCounts.pipelineStage.all}</span>
                </button>
                {PIPELINE_STAGE_FILTER_BUCKETS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`bsf-chip ${pipelineStageFilter === key ? 'is-active' : ''}`}
                    onClick={() => setPipelineStageFilter(key)}
                  >
                    {PIPELINE_STAGE_FILTER_LABELS[key]}{' '}
                    <span className="bsf-chip__n">{filterCounts.pipelineStage[key]}</span>
                  </button>
                ))}
              </div>
              <span className="bsf-sep" style={{ flexBasis: '100%', height: 0, margin: '4px 0' }} />
              <div className="bsf-group">
                <span className="bsf-label">Bodyshop floor</span>
                {(['all', 'Floor 2', 'Floor 3', 'unknown'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`bsf-chip ${physicalFloorFilter === key ? 'is-active' : ''}`}
                    onClick={() => setPhysicalFloorFilter(key)}
                  >
                    {key === 'all' ? 'All' : key === 'unknown' ? 'No floor' : key}{' '}
                    <span className="bsf-chip__n">{filterCounts.physicalFloor[key]}</span>
                  </button>
                ))}
              </div>
              <span className="bsf-sep" />
              <div className="bsf-group">
                <span className="bsf-label">On floor (IST)</span>
                {(['all', 'today', 'yesterday', 'older', 'unknown'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`bsf-chip ${floorDayFilter === key ? 'is-active' : ''}`}
                    onClick={() => setFloorDayFilter(key)}
                  >
                    {key === 'all' ? 'All' : floorWorkFloorDayLabel(key)}{' '}
                    <span className="bsf-chip__n">{filterCounts.floorDay[key]}</span>
                  </button>
                ))}
              </div>
              <span className="bsf-sep" />
              <div className="bsf-group">
                <span className="bsf-label">Pipeline step</span>
                {(['all', 'pending', 'done'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`bsf-chip ${updateFilter === key ? 'is-active' : ''}`}
                    onClick={() => setUpdateFilter(key)}
                  >
                    {key === 'all' ? 'All' : key === 'pending' ? 'Pending' : 'Updated'}{' '}
                    <span className="bsf-chip__n">{filterCounts.updates[key]}</span>
                  </button>
                ))}
              </div>
              <span className="bsf-sep" />
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
            </>
          ) : null}
        </div>
      ) : null}

      <div className="bsf-roster-shell">
        <div className="bsf-roster__title">
          {isAdminOverview ? 'On floor (live)' : 'My vehicles'}
        </div>
        {vehicleRows.length === 0 ? (
          <div className="empty-state">
            {isAdminOverview
              ? baseJobCards.length === 0
                ? 'No vehicles on floor or active assignments yet.'
                : 'No vehicles match the current filters (only cars with registration are listed). Try All for On floor, clear search, or add reg on Bodyshop Repair.'
              : workerAssignedSlotCount === 0
                ? 'No vehicle is assigned to you on Bodyshop Floor yet. Ask Floor Incharge to assign your name on the Bodyshop Floor screen.'
                : tasks.length === 0
                  ? 'You have floor assignments, but none are at your pipeline step right now.'
                  : 'No vehicles match this month. Try “All months” in the month filter.'}
          </div>
        ) : (
          <div className="bsf-roster-list">
            {displayedVehicleRows.map(({ jobCardNumber, tasks: rowTasks }) => {
              const card = cardByJc[jobCardNumber]
              const stepPending = vehicleHasPendingPipelineSteps(jobCardNumber, rowTasks)
              const photoCount = photoCountByJc[jobCardNumber] ?? 0
              const active = selectedJc === jobCardNumber
              const floorDay = floorWorkFloorDayBucket(card?.floorSinceAt, today)
              const statusLine = floorWorkVehicleStatusHeadline(
                assignmentRowForDisplayJc(jobCardNumber),
                card?.qcStatus,
                card,
              )
              const regTitle = floorWorkVehicleTitle(card, jobCardNumber)
              const stepLabel =
                rowTasks.length === 0
                  ? '—'
                  : isAdminOverview
                    ? (stepPending ? 'Pending' : 'Done')
                    : (stepPending ? 'Your turn' : 'Done')
              const cardInner = (
                <div className="bsf-vcard__top">
                  <div className="bsf-ident">
                    <div className="bsf-reg">{regTitle}</div>
                    <div className="bsf-model">{card?.model?.trim() || '—'}</div>
                    <code className="bsf-jc-code">{card?.systemJobCardNo?.trim() || jobCardNumber}</code>
                    <div className="bsf-meta">
                      {floorWorkVehicleSubtitle(card, jobCardNumber) || 'Customer —'}
                      <br />
                      {floorWorkStandingLine(card) ?? 'Time on floor —'}
                      {' · '}
                      {floorWorkFloorDayLabel(floorDay)}
                    </div>
                  </div>
                  <div className="bsf-vcard__work-summary">
                    <span className={`badge badge--no ${stepPending ? 'badge--open' : 'badge--closed'}`}>
                      {stepLabel}
                    </span>
                    <p className="bsf-stage-hint">{statusLine}</p>
                    {rowTasks.length > 0 ? (
                      <p className="bsf-owner-name">
                        {isAdminOverview ? 'Roles: ' : 'Role: '}
                        {rowTasks.map((t) => BODYSHOP_FLOOR_WORK_ROLE_LABELS[t.floorRole]).join(', ')}
                      </p>
                    ) : null}
                    <p className="bsf-owner-phone">Photos: {photoCount}</p>
                    {isAdminOverview ? <p className="bfw-vehicle-card__hint">Opens in new tab</p> : null}
                  </div>
                </div>
              )
              if (isAdminOverview) {
                return (
                  <a
                    key={jobCardNumber}
                    href={floorWorkVehicleDetailPath(jobCardNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bsf-vcard bsf-vcard--link"
                  >
                    {cardInner}
                  </a>
                )
              }
              return (
                <button
                  key={jobCardNumber}
                  type="button"
                  onClick={() => {
                    setSelectedJc(jobCardNumber)
                    requestAnimationFrame(() => {
                      detailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    })
                  }}
                  className={`bsf-vcard bsf-vcard--pick${active ? ' is-selected' : ''}`}
                >
                  {cardInner}
                </button>
              )
            })}
          </div>
        )}
        {vehicleRows.length > 0 ? (
          <div className="bfw-list-footer">
            <p className="bsf-subline" style={{ margin: 0 }}>
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
        <p className="bsf-subline">
          {isAdminOverview
            ? 'Click a vehicle to open pipeline, worker notes, and photos in a new tab.'
            : 'Select a vehicle — pipeline, worker notes, and photos appear below.'}
        </p>

        {!isAdminOverview ? (
          <section ref={detailSectionRef} className="bsf-vcard bfw-stack__detail">
            {selectedJc ? (
              <div className="bfw-stack__detail-inner">
                <BodyshopFloorWorkVehicleDetailPanel
                  jobCardNumber={selectedJc}
                  vehicleMeta={cardByJc[selectedJc]}
                  assignmentRow={assignmentRowForDisplayJc(selectedJc)}
                  qcStatus={cardByJc[selectedJc]?.qcStatus}
                  allPhotos={selectedVehiclePhotos}
                  loadingPhotos={loadingSelectedPhotos}
                  photosError={selectedPhotosError}
                  adminWorkReview={isAdminOverview}
                >
                  {selectedTask ? (
                    <div className="bfw-worker-form">
                      <h3 className="bfw-detail__section-title">
                        Your step
                        {' · '}
                        {BODYSHOP_FLOOR_WORK_ROLE_LABELS[selectedTask.floorRole]}
                        {selectedTask.isSupport ? ' (support)' : ''}
                      </h3>
                      {canEditSelectedTask && !selectedWorkerQcTurn ? (
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
                      ) : null}
                      {selectedWorkerQcTurn && canEditSelectedTask ? (
                        <div className="bfw-worker-qc" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                          <h3 className="bfw-detail__section-title">Quality check — your work</h3>
                          <p className="bfw-detail__muted">
                            Your step is Done. Pass or fail QC on this vehicle before it can go to RI (after all roles pass).
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                            <button
                              type="button"
                              className="btn btn--primary"
                              disabled={saving}
                              onClick={() => void submitWorkerRoleQc('pass')}
                            >
                              QC Pass
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost"
                              disabled={saving}
                              onClick={() => void submitWorkerRoleQc('fail')}
                            >
                              QC Fail
                            </button>
                          </div>
                          <label className="field" style={{ marginTop: 12 }}>
                            <span className="label">Fail reason (required if Fail)</span>
                            <textarea
                              className="inp"
                              rows={2}
                              value={workerQcFailReason}
                              onChange={(e) => setWorkerQcFailReason(e.target.value)}
                              placeholder="Describe the defect"
                            />
                          </label>
                        </div>
                      ) : !canEditSelectedTask ? (
                        isAdminOverview ? (
                        <p className="bfw-detail__muted">
                          Admin read-only: this vehicle is not on an active pipeline step for upload. Use work updates and
                          photo sections below to review what each worker submitted.
                        </p>
                      ) : (
                        <p className="bfw-detail__muted">
                          Not your turn yet — an earlier pipeline step must finish first, or QC is in progress.
                        </p>
                      )
                      ) : null}
                    </div>
                  ) : null}
                </BodyshopFloorWorkVehicleDetailPanel>
              </div>
            ) : (
              <div className="bfw-stack__placeholder">
                <h3 className="bsf-roster__title">Vehicle details</h3>
                <p className="bsf-subline" style={{ margin: 0 }}>
                  Select a vehicle from the list above to see pipeline status (Denting / Painting / …), who is working,
                  worker notes, and all photos.
                </p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  )
}
