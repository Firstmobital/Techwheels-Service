import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { getLinkedEmployeeContext } from '../../lib/api/bodyshopFloorWorkContext'
import {
  fetchBodyshopAssignmentsForEmployee,
  fetchBodyshopSupportAssignmentsForEmployee,
} from '../../lib/api/bodyshopFloorWorkAssignments'
import {
  attachQcStatusToVehicleMeta,
  fetchLiveOnFloorJobCardKeys,
  fetchRepairCardVehicleByJcs,
} from '../../lib/api/bodyshopFloorWorkVehicles'
import {
  floorWorkVehicleSubtitle,
  floorWorkVehicleTitle,
  floorWorkStandingLine,
  buildFloorWorkMonthFilterOptions,
  istYearMonthFromIso,
  sortFloorWorkTasksByFloorDayRecency,
  floorWorkJobCardLookupKeys,
  buildMinimalFloorWorkVehicleMeta,
  currentIstYearMonth,
  type FloorWorkVehicleMeta,
} from '../../lib/bodyshopFloorWork/display'
import {
  activePipelineStepLabel,
  buildAssignmentRowByJobCard,
  canSubmitFloorWorkTask,
  isFloorWorkTaskAtActivePipelineStep,
  isFloorWorkTaskStepCompleted,
  isFloorWorkTaskVisible,
  isWorkerQcTurn,
} from '../../lib/bodyshopFloorWork/pipeline'
import { saveWorkerQcFromFloorWork, type WorkerQcDecision } from '../../lib/api/bodyshopFloorWorkerQc'
import { filterTasksByFloorWorkGoLive } from '../../lib/bodyshopFloorWork/eligibility'
import { completeBodyshopFloorWorkRoleOnAssignment } from '../../lib/api/bodyshopFloorWorkPipeline'
import {
  buildAdminFloorWorkerRoster,
  fetchAdminRosterPeopleAndIncome,
  fetchAdminRosterIncome,
  fetchAllActiveBodyshopAssignmentRows,
  fetchMyBodyshopIncomeForMonth,
  formatBodyshopIncomeInr,
  type AdminFloorWorkerCard,
  type AdminRosterPerson,
} from '../../lib/api/bodyshopFloorWorkerHome'

const FLOOR_WORK_LIST_PAGE_SIZE = 20
import {
  BODYSHOP_FLOOR_WORK_ROLE_LABELS,
  listAllWorkTasksForAdmin,
  listWorkTasksForEmployee,
  workTaskEmployeeCode,
  type BodyshopFloorWorkTask,
} from '../../lib/bodyshopFloorWork/roles'

function normFloorEmployeeCode(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toUpperCase()
}

function formatJobCardAssignments(slots: BodyshopFloorWorkTask[] | undefined, jobCardNumber: string): string {
  const list = [...(slots ?? [])].sort((a, b) => a.floorRole.localeCompare(b.floorRole))
  if (list.length === 0) return 'Assigned: —'
  const parts = list.map((t) => {
    const role = BODYSHOP_FLOOR_WORK_ROLE_LABELS[t.floorRole]
    const who = t.employeeName?.trim() || t.assignedEmployeeCode || '—'
    return `${role}: ${who}${t.isSupport ? ' (support)' : ''}`
  })
  return parts.join(' · ')
}

function employeeTasksOnJobCard(
  tasks: BodyshopFloorWorkTask[],
  jobCardNumber: string,
  employeeCode: string,
): BodyshopFloorWorkTask[] {
  const code = normFloorEmployeeCode(employeeCode)
  return tasks.filter(
    (t) => t.jobCardNumber === jobCardNumber && normFloorEmployeeCode(t.assignedEmployeeCode) === code,
  )
}
import {
  bodyshopFloorWorkTodayIstDate,
  workLogMapKey,
  type BodyshopFloorRoleDailyLogRow,
} from '../../lib/bodyshopFloorRoleWorkLog'
import {
  fetchAllFloorWorkPhotosForJobCardKeys,
  fetchRoleDailyLogPhotos,
  fetchRoleDailyLogsForDate,
  openRoleDailyLogPhoto,
  uploadRoleDailyLogPhotoFromUri,
  upsertRoleDailyLog,
} from '../../lib/api/bodyshopFloorRoleWorkLog'
import type { BodyshopFloorRoleDailyLogPhotoRow } from '../../lib/bodyshopFloorRoleWorkLog'

function FloorWorkStatsThree({
  total,
  pending,
  done,
  compact,
}: {
  total: number
  pending: number
  done: number
  compact?: boolean
}) {
  return (
    <View style={[S.statsThreeRow, compact && S.statsThreeRowCompact]}>
      <View style={S.statsThreeCell}>
        <Text style={S.statsThreeL}>Total</Text>
        <Text style={S.statsThreeN}>{total}</Text>
      </View>
      <View style={S.statsThreeCell}>
        <Text style={S.statsThreeL}>Pending</Text>
        <Text style={S.statsThreeN}>{pending}</Text>
      </View>
      <View style={S.statsThreeCell}>
        <Text style={S.statsThreeL}>Done</Text>
        <Text style={S.statsThreeN}>{done}</Text>
      </View>
    </View>
  )
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

function AdminFloorTeamRoster({
  cards,
  loading,
  error,
  onSelect,
}: {
  cards: AdminFloorWorkerCard[] | null
  loading: boolean
  error: string | null
  onSelect: (person: AdminFloorWorkerCard) => void
}) {
  const monthLabel = cards?.[0]?.monthLabel
  const groups: Array<'Denters' | 'Painters'> = ['Denters', 'Painters']
  return (
    <ScrollView contentContainerStyle={S.rosterScroll}>
      <Text style={S.rosterIntro}>
        Tap a team member to see their vehicles and pipeline step — same as web admin floor work.
        {monthLabel ? ` · ${monthLabel}` : ''}
      </Text>
      {loading && cards === null ? (
        <ActivityIndicator color="#2a4cd0" style={{ marginVertical: 16 }} />
      ) : null}
      {error ? <Text style={S.rosterError}>{error}</Text> : null}
      {groups.map((group) => {
        const people = (cards ?? []).filter((card) => card.groupLabel === group)
        if (!loading && people.length === 0) return null
        return (
          <View key={group} style={S.rosterGroup}>
            <Text style={S.rosterGroupTitle}>{group}</Text>
            {people.map((person) => (
              <TouchableOpacity
                key={person.employeeCode}
                onPress={() => onSelect(person)}
                style={S.rosterCard}
                activeOpacity={0.85}
              >
                <Text style={S.rosterName}>{person.employeeName}</Text>
                <Text style={S.rosterMeta}>
                  {person.roleLabel} · {person.employeeCode}
                </Text>
                <FloorWorkStatsThree
                  total={person.vehiclesTotal}
                  pending={person.vehiclesPending}
                  done={person.vehiclesDone}
                  compact
                />
                <Text style={S.rosterIncome}>{formatBodyshopIncomeInr(person.bodyshopIncomeMonth)}</Text>
                <Text style={S.rosterTapHint}>View work →</Text>
              </TouchableOpacity>
            ))}
          </View>
        )
      })}
      {!loading && (cards?.length ?? 0) === 0 && !error ? (
        <Text style={S.emptyText}>No active denters or painters in Employee Master.</Text>
      ) : null}
    </ScrollView>
  )
}

function FilterChip({
  label,
  count,
  active,
  onPress,
  tone = 'default',
}: {
  label: string
  count?: number
  active: boolean
  onPress: () => void
  tone?: 'default' | 'accent'
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        S.filterChip,
        active && (tone === 'accent' ? S.filterChipAccentActive : S.filterChipActive),
      ]}
    >
      <Text style={[S.filterChipText, active && S.filterChipTextActive]}>
        {label}
        {count !== undefined ? ` (${count})` : ''}
      </Text>
    </TouchableOpacity>
  )
}

export default function BodyshopFloorWorkScreen() {
  const today = bodyshopFloorWorkTodayIstDate()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [employeeCode, setEmployeeCode] = useState('')
  const [employeeName, setEmployeeName] = useState<string | null>(null)
  const [tasks, setTasks] = useState<BodyshopFloorWorkTask[]>([])
  const [logsByKey, setLogsByKey] = useState<Record<string, BodyshopFloorRoleDailyLogRow>>({})
  const [selected, setSelected] = useState<BodyshopFloorWorkTask | null>(null)
  const [note, setNote] = useState('')
  const [photoUris, setPhotoUris] = useState<Array<{ uri: string; mime?: string }>>([])
  const [savedPhotos, setSavedPhotos] = useState<BodyshopFloorRoleDailyLogPhotoRow[]>([])
  const [vehicleByJc, setVehicleByJc] = useState<Record<string, FloorWorkVehicleMeta>>({})
  const [saving, setSaving] = useState(false)
  const [isAdminOverview, setIsAdminOverview] = useState(false)
  const [selectedAdminEmployee, setSelectedAdminEmployee] = useState<AdminFloorWorkerCard | null>(null)
  const [adminRosterPeople, setAdminRosterPeople] = useState<AdminRosterPerson[]>([])
  const [adminIncomeByCode, setAdminIncomeByCode] = useState<Map<string, number>>(new Map())
  const [adminRosterLoading, setAdminRosterLoading] = useState(false)
  const [adminRosterError, setAdminRosterError] = useState<string | null>(null)
  const [adminPrimaryRows, setAdminPrimaryRows] = useState<Record<string, unknown>[]>([])
  const [adminSupportRows, setAdminSupportRows] = useState<Record<string, unknown>[]>([])
  const [assignmentMonthFilter, setAssignmentMonthFilter] = useState('all')
  const [assignmentByJc, setAssignmentByJc] = useState<Record<string, Record<string, unknown>>>({})
  const [workerAssignedSlotCount, setWorkerAssignedSlotCount] = useState(0)
  const [trackerIncomeMonth, setTrackerIncomeMonth] = useState<number | null>(null)
  const [incomeLoading, setIncomeLoading] = useState(false)
  const [allVehiclePhotos, setAllVehiclePhotos] = useState<BodyshopFloorRoleDailyLogPhotoRow[]>([])
  const [loadingAllPhotos, setLoadingAllPhotos] = useState(false)
  const [listLimit, setListLimit] = useState(FLOOR_WORK_LIST_PAGE_SIZE)
  const [loadingMoreMeta, setLoadingMoreMeta] = useState(false)
  const [workerQcFailReason, setWorkerQcFailReason] = useState('')
  const assignmentCreatedAtRef = useRef<Record<string, string>>({})
  const metaLoadedJcsRef = useRef<Set<string>>(new Set())

  const monthFilterOptions = useMemo(() => buildFloorWorkMonthFilterOptions(today, 5), [today])

  const adminRoster = useMemo(() => {
    if (!isAdminOverview || adminRosterPeople.length === 0) return null
    return buildAdminFloorWorkerRoster(
      assignmentMonthFilter,
      adminRosterPeople,
      adminPrimaryRows,
      adminSupportRows,
      adminIncomeByCode,
    )
  }, [
    isAdminOverview,
    adminRosterPeople,
    adminPrimaryRows,
    adminSupportRows,
    adminIncomeByCode,
    assignmentMonthFilter,
  ])

  const tasksByJobCard = useMemo(() => {
    const map = new Map<string, BodyshopFloorWorkTask[]>()
    for (const t of tasks) {
      const list = map.get(t.jobCardNumber) ?? []
      list.push(t)
      map.set(t.jobCardNumber, list)
    }
    return map
  }, [tasks])

  const adminEmployeeScopedTasks = useMemo(() => {
    if (!isAdminOverview || !selectedAdminEmployee) return tasks
    if (adminPrimaryRows.length > 0 || adminSupportRows.length > 0) {
      return listWorkTasksForEmployee(
        selectedAdminEmployee.employeeCode,
        adminPrimaryRows,
        adminSupportRows,
      )
    }
    const code = selectedAdminEmployee.employeeCode
    return tasks.filter((t) => normFloorEmployeeCode(t.assignedEmployeeCode) === code)
  }, [tasks, isAdminOverview, selectedAdminEmployee, adminPrimaryRows, adminSupportRows])

  const tasksForList = isAdminOverview && selectedAdminEmployee ? adminEmployeeScopedTasks : tasks

  const monthFilteredTasks = useMemo(() => {
    if (assignmentMonthFilter === 'all') return tasksForList
    return tasksForList.filter((t) => {
      const ym =
        istYearMonthFromIso(vehicleByJc[t.jobCardNumber]?.floorSinceAt)
        ?? istYearMonthFromIso(t.assignedAt)
      return ym === assignmentMonthFilter
    })
  }, [tasksForList, assignmentMonthFilter, vehicleByJc])

  const sortedMonthTasks = useMemo(
    () => sortFloorWorkTasksByFloorDayRecency(monthFilteredTasks, vehicleByJc, today),
    [monthFilteredTasks, vehicleByJc, today],
  )

  const vehicleStepPendingForAdmin = useCallback(
    (jobCardNumber: string, employeeCode?: string | null) => {
      const row = assignmentByJc[jobCardNumber]
      const slots = employeeCode
        ? employeeTasksOnJobCard(adminEmployeeScopedTasks, jobCardNumber, employeeCode)
        : tasks.filter((t) => t.jobCardNumber === jobCardNumber)
      if (slots.length === 0) return true
      return slots.some((t) => !isFloorWorkTaskStepCompleted(t, row))
    },
    [assignmentByJc, adminEmployeeScopedTasks, tasks],
  )

  const qcStatusForTask = useCallback(
    (t: BodyshopFloorWorkTask) =>
      vehicleByJc[t.jobCardNumber]?.qcStatus
      ?? (t.repairCardId ? undefined : undefined),
    [vehicleByJc],
  )

  const visibleTasks = useMemo(() => {
    if (isAdminOverview) return sortedMonthTasks
    return sortedMonthTasks.filter((t) =>
      isFloorWorkTaskVisible(t, assignmentByJc[t.jobCardNumber], qcStatusForTask(t)),
    )
  }, [sortedMonthTasks, isAdminOverview, assignmentByJc, qcStatusForTask])

  const visibleListTasks = useMemo(() => {
    if (!isAdminOverview || !selectedAdminEmployee) return visibleTasks
    const code = selectedAdminEmployee.employeeCode
    const ordered: BodyshopFloorWorkTask[] = []
    const seen = new Set<string>()
    for (const t of visibleTasks) {
      if (seen.has(t.jobCardNumber)) continue
      seen.add(t.jobCardNumber)
      const onJc = employeeTasksOnJobCard(adminEmployeeScopedTasks, t.jobCardNumber, code)
      if (onJc.length === 0) continue
      const row = assignmentByJc[t.jobCardNumber]
      const pick =
        onJc.find((x) => isWorkerQcTurn(x, row, qcStatusForTask(x)))
        ?? onJc.find((x) => isFloorWorkTaskAtActivePipelineStep(x, row))
        ?? onJc.find((x) => !isFloorWorkTaskStepCompleted(x, row))
        ?? onJc[0]
      ordered.push(pick)
    }
    return ordered
  }, [visibleTasks, isAdminOverview, selectedAdminEmployee, adminEmployeeScopedTasks, assignmentByJc, qcStatusForTask])

  const pagedTasks = useMemo(
    () => visibleListTasks.slice(0, listLimit),
    [visibleListTasks, listLimit],
  )

  const adminEmployeeVehicleStats = useMemo(() => {
    if (!isAdminOverview || !selectedAdminEmployee) return null
    const code = selectedAdminEmployee.employeeCode
    let total = 0
    let pending = 0
    let done = 0
    const seen = new Set<string>()
    for (const t of sortedMonthTasks) {
      if (seen.has(t.jobCardNumber)) continue
      if (employeeTasksOnJobCard(adminEmployeeScopedTasks, t.jobCardNumber, code).length === 0) continue
      seen.add(t.jobCardNumber)
      total += 1
      if (vehicleStepPendingForAdmin(t.jobCardNumber, code)) pending += 1
      else done += 1
    }
    return { total, pending, done }
  }, [
    isAdminOverview,
    selectedAdminEmployee,
    sortedMonthTasks,
    adminEmployeeScopedTasks,
    vehicleStepPendingForAdmin,
  ])

  useEffect(() => {
    setListLimit(FLOOR_WORK_LIST_PAGE_SIZE)
  }, [assignmentMonthFilter, selectedAdminEmployee?.employeeCode])

  const adminIncomeMonthLoaded = useRef(false)

  useEffect(() => {
    if (!isAdminOverview || adminRosterPeople.length === 0) return
    if (!adminIncomeMonthLoaded.current) {
      adminIncomeMonthLoaded.current = true
      return
    }
    let cancelled = false
    void fetchAdminRosterIncome(assignmentMonthFilter)
      .then((incomeByCode) => {
        if (!cancelled) setAdminIncomeByCode(incomeByCode)
      })
      .catch(() => {
        if (!cancelled) setAdminIncomeByCode(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [isAdminOverview, assignmentMonthFilter, adminRosterPeople.length])

  useEffect(() => {
    if (!adminRoster) return
    setSelectedAdminEmployee((prev) => {
      if (!prev) return null
      const fresh = adminRoster.find((c) => c.employeeCode === prev.employeeCode)
      if (!fresh) return prev
      if (
        fresh.vehiclesTotal === prev.vehiclesTotal
        && fresh.vehiclesPending === prev.vehiclesPending
        && fresh.vehiclesDone === prev.vehiclesDone
        && fresh.bodyshopIncomeMonth === prev.bodyshopIncomeMonth
      ) {
        return prev
      }
      return fresh
    })
  }, [adminRoster])

  const uniqueJcsFromTasks = useCallback((taskList: BodyshopFloorWorkTask[], maxJcs: number) => {
    const seen = new Set<string>()
    const jcs: string[] = []
    for (const t of taskList) {
      if (seen.has(t.jobCardNumber)) continue
      seen.add(t.jobCardNumber)
      jcs.push(t.jobCardNumber)
      if (jcs.length >= maxJcs) break
    }
    return jcs
  }, [])

  const enrichVehicleMetaBatch = useCallback(async (jcs: string[]) => {
    const todo = jcs.filter((jc) => jc && !metaLoadedJcsRef.current.has(jc))
    if (todo.length === 0) return
    setLoadingMoreMeta(true)
    try {
      const batch = await fetchRepairCardVehicleByJcs(todo, {
        assignmentCreatedAtByJc: assignmentCreatedAtRef.current,
      })
      for (const jc of todo) metaLoadedJcsRef.current.add(jc)
      setVehicleByJc((prev) => ({ ...prev, ...batch }))
    } finally {
      setLoadingMoreMeta(false)
    }
  }, [])

  const loadMoreList = useCallback(() => {
    if (listLimit >= visibleListTasks.length) return
    const next = Math.min(listLimit + FLOOR_WORK_LIST_PAGE_SIZE, visibleListTasks.length)
    setListLimit(next)
    const jcs = uniqueJcsFromTasks(visibleListTasks.slice(0, next), next)
    void enrichVehicleMetaBatch(jcs)
  }, [listLimit, visibleListTasks, uniqueJcsFromTasks, enrichVehicleMetaBatch])

  const load = useCallback(async () => {
    setError(null)
    try {
      const ctx = await getLinkedEmployeeContext()
      const myCode = String(ctx.employeeCode ?? '').trim().toUpperCase()
      const adminOverview = Boolean(ctx.isAdminOverview) || Boolean(ctx.isFloorWorkAdminView)
      setIsAdminOverview(adminOverview)
      setEmployeeCode(myCode)
      setEmployeeName(ctx.employeeName)

      let assRows: Record<string, unknown>[] = []
      let supportRows: Record<string, unknown>[] = []
      let taskList: BodyshopFloorWorkTask[] = []

      if (adminOverview) {
        const loaded = await fetchAllActiveBodyshopAssignmentRows()
        assRows = loaded.primaryRows
        supportRows = loaded.supportRows
        taskList = listAllWorkTasksForAdmin(assRows, supportRows)
        setAdminPrimaryRows(assRows)
        setAdminSupportRows(supportRows)
      } else if (myCode) {
        setAdminPrimaryRows([])
        setAdminSupportRows([])
        assRows = await fetchBodyshopAssignmentsForEmployee(myCode)
        supportRows = await fetchBodyshopSupportAssignmentsForEmployee(myCode)
        taskList = listWorkTasksForEmployee(myCode, assRows, supportRows)
      } else {
        throw new Error('No employee linked to your login.')
      }

      const assignmentMap = buildAssignmentRowByJobCard(assRows)
      if (!adminOverview) {
        setWorkerAssignedSlotCount(taskList.length)
        taskList = taskList.filter((t) => {
          const meta = minimal[t.jobCardNumber]
          return isFloorWorkTaskVisible(t, assignmentMap[t.jobCardNumber], meta?.qcStatus)
        })
        setAssignmentMonthFilter(currentIstYearMonth(today))
      } else {
        setWorkerAssignedSlotCount(0)
        setAssignmentMonthFilter('all')
      }
      const assignmentCreatedAtByJc = buildAssignmentCreatedAtByJc(assRows)
      assignmentCreatedAtRef.current = assignmentCreatedAtByJc

      const assignmentJcs = Array.from(
        new Set((assRows ?? []).map((r) => String(r.job_card_number ?? '').trim().toUpperCase()).filter(Boolean)),
      )
      const liveFloorJcs = await fetchLiveOnFloorJobCardKeys()
      const allJcs = Array.from(
        new Set([...assignmentJcs, ...liveFloorJcs, ...taskList.map((t) => t.jobCardNumber)]),
      )
      let minimal =
        allJcs.length > 0 ? buildMinimalFloorWorkVehicleMeta(allJcs, assignmentCreatedAtByJc) : {}
      if (allJcs.length > 0) {
        minimal = await attachQcStatusToVehicleMeta(minimal, allJcs)
      }
      taskList = filterTasksByFloorWorkGoLive(taskList, minimal, assignmentMap)

      setAssignmentByJc(assignmentMap)
      setTasks(taskList)

      metaLoadedJcsRef.current = new Set()
      setListLimit(FLOOR_WORK_LIST_PAGE_SIZE)
      if (allJcs.length > 0) {
        setVehicleByJc(minimal)
        const sorted = sortFloorWorkTasksByFloorDayRecency(taskList, minimal, today)
        void enrichVehicleMetaBatch(uniqueJcsFromTasks(sorted, FLOOR_WORK_LIST_PAGE_SIZE))
      } else {
        setVehicleByJc({})
      }
      if (!adminOverview) {
        const logJcKeys = allJcs.length > 0 ? allJcs : taskList.map((t) => t.jobCardNumber)
        try {
          const logs = await fetchRoleDailyLogsForDate(today, logJcKeys.length > 0 ? logJcKeys : undefined)
          const lmap: Record<string, BodyshopFloorRoleDailyLogRow> = {}
          for (const row of logs) {
            lmap[workLogMapKey(row.job_card_number, row.floor_role, row.employee_code, row.is_support)] = row
          }
          setLogsByKey(lmap)
        } catch {
          setLogsByKey({})
        }
      } else {
        setLogsByKey({})
      }

      if (!adminOverview && myCode) {
        setIncomeLoading(true)
        setTrackerIncomeMonth(null)
        void fetchMyBodyshopIncomeForMonth(myCode, currentIstYearMonth(today))
          .then((amount) => setTrackerIncomeMonth(amount))
          .catch(() => setTrackerIncomeMonth(0))
          .finally(() => setIncomeLoading(false))
      } else {
        setTrackerIncomeMonth(null)
        setIncomeLoading(false)
      }

      if (adminOverview) {
        adminIncomeMonthLoaded.current = false
        setAdminRosterLoading(true)
        setAdminRosterError(null)
        void fetchAdminRosterPeopleAndIncome('all')
          .then(({ people, incomeByCode }) => {
            setAdminRosterPeople(people)
            setAdminIncomeByCode(incomeByCode)
            setSelectedAdminEmployee((prev) => {
              if (!prev) return null
              const cards = buildAdminFloorWorkerRoster('all', people, assRows, supportRows, incomeByCode)
              return cards.find((c) => c.employeeCode === prev.employeeCode) ?? null
            })
          })
          .catch((e) => {
            setAdminRosterPeople([])
            setAdminIncomeByCode(new Map())
            setAdminRosterError(e instanceof Error ? e.message : 'Could not load floor team')
          })
          .finally(() => {
            adminIncomeMonthLoaded.current = true
            setAdminRosterLoading(false)
          })
      } else {
        setAdminRosterPeople([])
        setAdminIncomeByCode(new Map())
        setAdminRosterError(null)
        setSelectedAdminEmployee(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    }
  }, [today, enrichVehicleMetaBatch, uniqueJcsFromTasks])

  useEffect(() => {
    setLoading(true)
    void load().finally(() => setLoading(false))
  }, [load])

  useEffect(() => {
    if (loading || pagedTasks.length === 0) return
    const jcs = uniqueJcsFromTasks(pagedTasks, pagedTasks.length)
    void enrichVehicleMetaBatch(jcs)
  }, [loading, pagedTasks, uniqueJcsFromTasks, enrichVehicleMetaBatch])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  useEffect(() => {
    if (!selected) {
      setAllVehiclePhotos([])
      return
    }
    if (!isAdminOverview) {
      setAllVehiclePhotos([])
      return
    }
    const meta = vehicleByJc[selected.jobCardNumber]
    const keys = floorWorkJobCardLookupKeys(selected.jobCardNumber, meta)
    setLoadingAllPhotos(true)
    void fetchAllFloorWorkPhotosForJobCardKeys(keys)
      .then(setAllVehiclePhotos)
      .catch(() => setAllVehiclePhotos([]))
      .finally(() => setLoadingAllPhotos(false))
  }, [selected, isAdminOverview, vehicleByJc])

  const reloadAdminVehiclePhotos = useCallback(async (task: BodyshopFloorWorkTask) => {
    if (!isAdminOverview) return
    const meta = vehicleByJc[task.jobCardNumber]
    const keys = floorWorkJobCardLookupKeys(task.jobCardNumber, meta)
    try {
      const photos = await fetchAllFloorWorkPhotosForJobCardKeys(keys)
      setAllVehiclePhotos(photos)
    } catch {
      setAllVehiclePhotos([])
    }
  }, [isAdminOverview, vehicleByJc])

  useEffect(() => {
    if (!selected) {
      setNote('')
      setPhotoUris([])
      setSavedPhotos([])
      return
    }
    const slotCode = workTaskEmployeeCode(selected, employeeCode)
    if (!slotCode) {
      setNote('')
      setPhotoUris([])
      setSavedPhotos([])
      return
    }
    const key = workLogMapKey(selected.jobCardNumber, selected.floorRole, slotCode, selected.isSupport)
    setNote(String(logsByKey[key]?.note_text ?? ''))
    setPhotoUris([])
    const logId = logsByKey[key]?.id
    if (!logId) {
      setSavedPhotos([])
      return
    }
    void fetchRoleDailyLogPhotos([logId])
      .then(setSavedPhotos)
      .catch(() => setSavedPhotos([]))
  }, [selected, logsByKey, employeeCode])

  async function addPhotosFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Camera', 'Permission needed to take work photos.')
      return
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 })
    if (res.canceled || !res.assets[0]?.uri) return
    setPhotoUris((prev) => [...prev, { uri: res.assets[0].uri, mime: res.assets[0].mimeType ?? 'image/jpeg' }])
  }

  async function addPhotosFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Gallery', 'Permission needed to pick photos from gallery.')
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    })
    if (res.canceled || !res.assets?.length) return
    setPhotoUris((prev) => [
      ...prev,
      ...res.assets.map((a) => ({ uri: a.uri, mime: a.mimeType ?? 'image/jpeg' })),
    ])
  }

  function pickPhotos() {
    Alert.alert('Add photo', 'Choose how to attach work photos', [
      { text: 'Camera', onPress: () => void addPhotosFromCamera() },
      { text: 'Gallery', onPress: () => void addPhotosFromGallery() },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const canSubmitSelected = useMemo(() => {
    if (!selected) return false
    const row = assignmentByJc[selected.jobCardNumber]
    const meta = vehicleByJc[selected.jobCardNumber]
    return canSubmitFloorWorkTask(selected, row, meta?.qcStatus, { isAdminOverview })
  }, [selected, isAdminOverview, assignmentByJc, vehicleByJc])

  const selectedWorkerQcTurn = useMemo(() => {
    if (!selected) return false
    const row = assignmentByJc[selected.jobCardNumber]
    const meta = vehicleByJc[selected.jobCardNumber]
    return isWorkerQcTurn(selected, row, meta?.qcStatus)
  }, [selected, assignmentByJc, vehicleByJc])

  async function submitWorkerQc(decision: WorkerQcDecision) {
    if (!selected || !canSubmitSelected || !selectedWorkerQcTurn) return
    if (decision === 'fail' && !workerQcFailReason.trim()) {
      Alert.alert('QC Fail', 'Enter a fail reason before submitting.')
      return
    }
    const row = assignmentByJc[selected.jobCardNumber] as Record<string, unknown> | undefined
    const assignmentId = typeof row?.id === 'number' && row.id > 0 ? row.id : null
    const meta = vehicleByJc[selected.jobCardNumber]
    const repairCardId = meta?.repairCardId ?? selected.repairCardId
    if (!assignmentId || !repairCardId) {
      Alert.alert('QC', 'Vehicle record is still loading. Pull to refresh and try again.')
      return
    }
    const checker = String(selected.employeeName ?? employeeName ?? employeeCode).trim()
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const result = await saveWorkerQcFromFloorWork({
        repairCardId,
        jobCardNumber: selected.jobCardNumber,
        assignmentRowId: assignmentId,
        decision,
        checkerName: checker,
        failReason: workerQcFailReason,
        actorEmail: user?.email ?? null,
      })
      setVehicleByJc((prev) => ({
        ...prev,
        [selected.jobCardNumber]: {
          ...(prev[selected.jobCardNumber] ?? { reg: null, customer: null }),
          qcStatus: result.qc_status,
        },
      }))
      const jc = selected.jobCardNumber
      const passQc = decision === 'pass' ? 'pass' : result.qc_status
      const now = new Date().toISOString()
      const nextRow =
        decision === 'pass' && row ? { ...row, bs_floor_completed_at: now } : row
      setAssignmentByJc((prev) => ({
        ...prev,
        [jc]: nextRow ?? prev[jc],
      }))
      setWorkerQcFailReason('')
      setTasks((prev) =>
        prev.filter((t) => {
          const assignRow =
            t.jobCardNumber === jc ? (nextRow ?? assignmentByJc[t.jobCardNumber]) : assignmentByJc[t.jobCardNumber]
          const qc =
            t.jobCardNumber === jc
              ? passQc
              : vehicleByJc[t.jobCardNumber]?.qcStatus
          return isFloorWorkTaskVisible(t, assignRow, qc)
        }),
      )
      setSelected(null)
      Alert.alert(
        decision === 'pass' ? 'QC passed' : 'QC failed',
        decision === 'pass'
          ? 'Floor incharge can complete Re-Inspection on Bodyshop Floor.'
          : 'Fail reason saved. Fix work and submit QC again.',
      )
    } catch (e) {
      Alert.alert('QC failed', e instanceof Error ? e.message : 'Could not save QC')
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    if (!selected || !canSubmitSelected) return
    const slotCode = workTaskEmployeeCode(selected, employeeCode)
    if (!slotCode) return
    const trimmed = note.trim()
    if (photoUris.length === 0 && savedPhotos.length === 0) {
      Alert.alert('Photos required', 'Add at least one work photo before marking Done.')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: dealerCodeRaw, error: dealerErr }, { data: myCodeRaw, error: myCodeErr }] = await Promise.all([
        supabase.rpc('my_dealer_code'),
        supabase.rpc('my_employee_code'),
      ])
      if (dealerErr) throw new Error(dealerErr.message)
      if (myCodeErr) throw new Error(myCodeErr.message)
      const dealerCode = String(dealerCodeRaw ?? selected.dealerCode ?? '').trim()
      if (!dealerCode) throw new Error('Dealer code missing')
      const loginEmployeeCode = String(myCodeRaw ?? employeeCode ?? slotCode).trim().toUpperCase()
      const employeeCodeForLog = isAdminOverview ? slotCode : loginEmployeeCode || slotCode

      const row = await upsertRoleDailyLog({
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

      const uploadedPhotos = await Promise.all(
        photoUris.map((p, i) =>
          uploadRoleDailyLogPhotoFromUri({
            logId: row.id,
            dealerCode,
            jobCardNumber: selected.jobCardNumber,
            regNumber: vehicleByJc[selected.jobCardNumber]?.reg ?? null,
            uri: p.uri,
            mimeType: p.mime,
            sortOrder: i,
          }),
        ),
      )
      if (uploadedPhotos.length > 0) {
        setSavedPhotos((prev) => [...prev, ...uploadedPhotos])
      }

      const key = workLogMapKey(selected.jobCardNumber, selected.floorRole, employeeCodeForLog, selected.isSupport)
      setLogsByKey((prev) => ({ ...prev, [key]: row }))
      setPhotoUris([])

      await completeBodyshopFloorWorkRoleOnAssignment({
        jobCardNumber: selected.jobCardNumber,
        floorRole: selected.floorRole,
        actorEmail: user?.email ?? null,
      })

      const { data: assRow, error: assReadErr } = await supabase
        .from('bodyshop_assignments')
        .select('*')
        .eq('is_active', true)
        .eq('job_card_number', selected.jobCardNumber)
        .maybeSingle()
      if (assReadErr) throw new Error(assReadErr.message)
      if (assRow) {
        const assignmentRow = assRow as Record<string, unknown>
        setAssignmentByJc((prev) => ({ ...prev, [selected.jobCardNumber]: assignmentRow }))
        if (!isAdminOverview) {
          setTasks((prev) =>
            prev.filter((t) => {
              const rowForTask =
                t.jobCardNumber === selected.jobCardNumber ? assignmentRow : assignmentByJc[t.jobCardNumber]
              const meta = vehicleByJc[t.jobCardNumber]
              return isFloorWorkTaskVisible(t, rowForTask, meta?.qcStatus)
            }),
          )
        }
      }

      if (uploadedPhotos.length > 0) {
        void reloadAdminVehiclePhotos(selected)
      }
      const driveHint =
        uploadedPhotos.length > 0
          ? ' Photos are saved. Google Drive link will sync in the background (no need to wait).'
          : ''
      Alert.alert('Done', `Your step is complete — vehicle moves to the next role.${driveHint}`)
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={S.centered}>
        <ActivityIndicator size="large" color="#2a4cd0" />
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 20, backgroundColor: '#f4f2ec' }}>
        <Text style={S.screenTitle}>Floor Work</Text>
        <Text style={{ color: '#DC2626', marginBottom: 12, fontWeight: '700' }}>{error}</Text>
        <Text style={{ color: '#4b4e59', lineHeight: 22, marginBottom: 12 }}>
          Common reasons: login not linked to employee code, slow network, or session expired. Pull down after Retry or sign in again.
        </Text>
        <Text style={{ color: '#82858f', lineHeight: 20, marginBottom: 16 }}>
          Admin: module <Text style={{ fontWeight: '700' }}>bodyshop_floor_work</Text>, user → employee mapping, role DENTOR/PAINTER in Employee Master.
        </Text>
        <TouchableOpacity onPress={() => void onRefresh()} style={S.loadMoreBtn}>
          <Text style={S.loadMoreBtnText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const adminRosterView = isAdminOverview && !selected && !selectedAdminEmployee
  const adminEmployeeWorkView = isAdminOverview && !selected && Boolean(selectedAdminEmployee)

  const monthFilterBar = (
    <>
      <Text style={S.filterSectionLabel}>Month on floor (IST)</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={S.filterScrollRow}
        contentContainerStyle={S.filterScrollContent}
      >
        {monthFilterOptions.map((opt) => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            active={assignmentMonthFilter === opt.value}
            onPress={() => setAssignmentMonthFilter(opt.value)}
          />
        ))}
      </ScrollView>
    </>
  )

  return (
    <SafeAreaView style={S.root} edges={['top']}>
      <View style={S.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={S.screenTitle}>Floor Work</Text>
          <Text style={S.screenSubtitle}>
            {isAdminOverview
              ? selectedAdminEmployee
                ? `${selectedAdminEmployee.employeeName} · ${selectedAdminEmployee.roleLabel}`
                : `Admin · floor team · ${today} (IST)`
              : `${employeeName ?? employeeCode} · ${today} (IST)`}
          </Text>
        </View>
        <TouchableOpacity onPress={() => void onRefresh()} style={S.refreshBtn} accessibilityLabel="Refresh">
          <Text style={S.refreshBtnText}>↻</Text>
        </TouchableOpacity>
      </View>

      {!selected && !isAdminOverview ? (
        <View style={S.incomeBanner}>
          <Text style={S.incomeBannerLabel}>Bodyshop income · {currentIstYearMonth(today)}</Text>
          {incomeLoading ? (
            <ActivityIndicator color="#065f46" style={{ marginTop: 8, alignSelf: 'flex-start' }} />
          ) : (
            <Text style={S.incomeBannerAmount}>
              {trackerIncomeMonth !== null ? formatBodyshopIncomeInr(trackerIncomeMonth) : '—'}
            </Text>
          )}
          <Text style={S.incomeBannerHint}>Tracker / payroll calculation (closed accident jobs)</Text>
        </View>
      ) : null}

      {adminRosterView ? (
        <>
          {monthFilterBar}
          <AdminFloorTeamRoster
            cards={adminRoster}
            loading={adminRosterLoading || loading}
            error={adminRosterError}
            onSelect={(person) => setSelectedAdminEmployee(person)}
          />
        </>
      ) : null}

      {selected ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={8}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={S.detailScroll}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity onPress={() => setSelected(null)} style={S.backBtn}>
              <Text style={S.backBtnText}>
                {isAdminOverview && selectedAdminEmployee ? '← Back to vehicles' : '← Back to list'}
              </Text>
            </TouchableOpacity>
            <Text style={S.detailTitle}>
              {floorWorkVehicleTitle(vehicleByJc[selected.jobCardNumber], selected.jobCardNumber)}
            </Text>
            <Text style={S.detailSub}>
              {floorWorkVehicleSubtitle(vehicleByJc[selected.jobCardNumber], selected.jobCardNumber)}
            </Text>
            <View style={S.detailMetaRow}>
              <View style={S.roleBadge}>
                <Text style={S.roleBadgeText}>
                  {BODYSHOP_FLOOR_WORK_ROLE_LABELS[selected.floorRole]}
                  {selected.isSupport ? ' · support' : ''}
                </Text>
              </View>
              {isAdminOverview ? (
                <Text style={S.arrivalBadge}>
                  {selected.employeeName?.trim() || selected.assignedEmployeeCode || '—'}
                </Text>
              ) : null}
            </View>
            {!canSubmitSelected && isAdminOverview ? (
              <Text style={S.adminViewOnlyHint}>
                This pipeline step is not active on this vehicle — view all photos below, or open the row for the active role to add work (same as denter/painter).
              </Text>
            ) : null}
            {floorWorkStandingLine(vehicleByJc[selected.jobCardNumber]) ? (
              <Text style={S.standingLine}>{floorWorkStandingLine(vehicleByJc[selected.jobCardNumber])}</Text>
            ) : null}
            {canSubmitSelected && !selectedWorkerQcTurn && isFloorWorkTaskAtActivePipelineStep(selected, assignmentByJc[selected.jobCardNumber]) ? (
              <View style={S.stepBanner}>
                <Text style={S.stepBannerTitle}>Your turn — {BODYSHOP_FLOOR_WORK_ROLE_LABELS[selected.floorRole]}</Text>
                <Text style={S.stepBannerHint}>
                  Pipeline: Dentor → Painter → Technician → Rubbing → QC. Active lane:{' '}
                  {activePipelineStepLabel(assignmentByJc[selected.jobCardNumber]) ?? '—'}. Add at least one photo, tap Done — Floor Incharge sees it on Bodyshop Floor under Worker updates.
                </Text>
              </View>
            ) : null}
            {selectedWorkerQcTurn && canSubmitSelected ? (
              <View style={S.qcPanel}>
                <Text style={S.qcPanelTitle}>Quality check — your turn</Text>
                <Text style={S.qcPanelHint}>
                  All floor steps are done. As the last pipeline role on this job, pass or fail QC here (usually Rubbing).
                </Text>
                <View style={S.qcBtnRow}>
                  <TouchableOpacity
                    style={[S.qcBtn, S.qcBtnPass, saving && S.saveBtnDisabled]}
                    disabled={saving}
                    onPress={() => void submitWorkerQc('pass')}
                  >
                    <Text style={S.qcBtnPassText}>QC Pass</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.qcBtn, S.qcBtnFail, saving && S.saveBtnDisabled]}
                    disabled={saving}
                    onPress={() => void submitWorkerQc('fail')}
                  >
                    <Text style={S.qcBtnFailText}>QC Fail</Text>
                  </TouchableOpacity>
                </View>
                <Text style={S.fieldLabel}>Fail reason (required if Fail)</Text>
                <TextInput
                  style={S.noteInput}
                  multiline
                  placeholder="Describe defect if QC fails"
                  placeholderTextColor="#a8abb4"
                  value={workerQcFailReason}
                  onChangeText={setWorkerQcFailReason}
                />
              </View>
            ) : null}
            {canSubmitSelected && !selectedWorkerQcTurn ? (
              <>
            <Text style={S.fieldLabel}>Work update (optional)</Text>
            <TextInput
              style={S.noteInput}
              multiline
              placeholder="Optional — short note about the work"
              placeholderTextColor="#a8abb4"
              value={note}
              onChangeText={setNote}
            />
            <TouchableOpacity onPress={pickPhotos} style={S.photoLink}>
              <Text style={S.photoLinkText}>
                + Photo — Camera or Gallery ({photoUris.length} new)
              </Text>
            </TouchableOpacity>
              </>
            ) : null}
              {isAdminOverview ? (
                <View style={S.savedPhotosBox}>
                  <Text style={S.savedPhotosHint}>
                    {loadingAllPhotos
                      ? 'Loading all floor photos for this vehicle…'
                      : `All floor photos (${allVehiclePhotos.length}) — tap to open`}
                  </Text>
                  {allVehiclePhotos.map((p) => (
                    <TouchableOpacity
                      key={`all-${p.id}`}
                      onPress={() =>
                        void openRoleDailyLogPhoto(p).catch((e) =>
                          Alert.alert('Photo', e instanceof Error ? e.message : 'Open failed'),
                        )
                      }
                      style={S.savedPhotoRow}
                    >
                      <Text style={S.savedPhotoText}>
                        {p.file_name ?? `Photo ${p.sort_order + 1}`}
                        {p.drive_url ? ' · Drive' : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              {savedPhotos.length > 0 ? (
                <View style={S.savedPhotosBox}>
                  <Text style={S.savedPhotosHint}>
                    Tap to open. Drive link appears after background sync.
                  </Text>
                  {savedPhotos.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() =>
                      void openRoleDailyLogPhoto(p).catch((e) =>
                        Alert.alert('Photo', e instanceof Error ? e.message : 'Open failed'),
                      )
                    }
                    style={S.savedPhotoRow}
                  >
                    <Text style={S.savedPhotoText}>
                      {p.file_name ?? `Photo ${p.sort_order + 1}`}
                      {p.drive_url ? ' · Drive' : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {canSubmitSelected && !selectedWorkerQcTurn ? (
            <TouchableOpacity onPress={() => void save()} disabled={saving} style={[S.saveBtn, saving && S.saveBtnDisabled]}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={S.saveBtnText}>Done — send to next step</Text>}
            </TouchableOpacity>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : adminRosterView ? null : (
        <>
          {adminEmployeeWorkView && selectedAdminEmployee ? (
            <>
              <TouchableOpacity onPress={() => setSelectedAdminEmployee(null)} style={S.backBtn}>
                <Text style={S.backBtnText}>← Floor team</Text>
              </TouchableOpacity>
              <View style={S.adminStatsCard}>
                <Text style={S.adminStatsTitle}>{selectedAdminEmployee.employeeName}</Text>
                <Text style={S.adminStatsSub}>
                  {selectedAdminEmployee.roleLabel} · {assignmentMonthFilter === 'all' ? 'All months' : selectedAdminEmployee.monthLabel}
                </Text>
                <FloorWorkStatsThree
                  total={adminEmployeeVehicleStats?.total ?? selectedAdminEmployee.vehiclesTotal}
                  pending={adminEmployeeVehicleStats?.pending ?? selectedAdminEmployee.vehiclesPending}
                  done={adminEmployeeVehicleStats?.done ?? selectedAdminEmployee.vehiclesDone}
                />
                <Text style={S.adminStatsIncome}>
                  Bodyshop income · {formatBodyshopIncomeInr(selectedAdminEmployee.bodyshopIncomeMonth)}
                </Text>
              </View>
            </>
          ) : null}

          {isAdminOverview ? monthFilterBar : (
            <>
              <Text style={S.filterSectionLabel}>Month on floor (IST)</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={S.filterScrollRow}
                contentContainerStyle={S.filterScrollContent}
              >
                {monthFilterOptions.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    label={opt.label}
                    active={assignmentMonthFilter === opt.value}
                    onPress={() => setAssignmentMonthFilter(opt.value)}
                  />
                ))}
              </ScrollView>
            </>
          )}

          <Text style={S.listOrderHint}>
            {isAdminOverview
              ? `${selectedAdminEmployee?.employeeName ?? 'Employee'} — vehicles (newest on floor first)`
              : 'Your pipeline step only · pick month above'}
            {' · '}
            Showing {pagedTasks.length} of {visibleListTasks.length}{' '}
            {adminEmployeeWorkView ? 'vehicles' : 'rows'}
            {loadingMoreMeta ? ' · loading details…' : ''}
          </Text>

          <FlatList
            data={pagedTasks}
            keyExtractor={(item) =>
              adminEmployeeWorkView
                ? item.jobCardNumber
                : `${item.jobCardNumber}-${item.floorRole}-${item.isSupport}`
            }
            contentContainerStyle={S.listContent}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews
            onEndReached={() => loadMoreList()}
            onEndReachedThreshold={0.35}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#2a4cd0" />}
            ListFooterComponent={
              listLimit < visibleListTasks.length ? (
                <TouchableOpacity
                  onPress={() => loadMoreList()}
                  disabled={loadingMoreMeta}
                  style={S.loadMoreBtn}
                >
                  <Text style={S.loadMoreBtnText}>
                    {loadingMoreMeta ? 'Loading…' : `Load more (${FLOOR_WORK_LIST_PAGE_SIZE})`}
                  </Text>
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              <View style={S.empty}>
                <Text style={S.emptyIcon}>🚗</Text>
                <Text style={S.emptyText}>
                  {isAdminOverview
                    ? adminEmployeeWorkView
                      ? tasksForList.length === 0
                        ? 'No active assignments for this employee.'
                        : 'No vehicles for this month — try All months.'
                      : tasks.length === 0
                        ? 'No active floor assignments yet.'
                        : 'No vehicles for this month — try All months.'
                    : workerAssignedSlotCount === 0
                      ? 'No vehicle assigned to you on Bodyshop Floor yet. Ask Floor Incharge to put your name on that job card (Dentor / Painter / etc.).'
                      : tasks.length === 0
                        ? 'You have assignments, but none at your pipeline step yet — wait until the previous role finishes.'
                        : 'No rows for this month — try All months.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const meta = vehicleByJc[item.jobCardNumber]
              const assignRow = assignmentByJc[item.jobCardNumber]
              const qcTurn = !isAdminOverview && isWorkerQcTurn(item, assignRow, meta?.qcStatus)
              const yourTurn = !isAdminOverview && isFloorWorkTaskAtActivePipelineStep(item, assignRow)
              const stepDone = isFloorWorkTaskStepCompleted(item, assignRow)
              const done = adminEmployeeWorkView && selectedAdminEmployee
                ? !vehicleStepPendingForAdmin(item.jobCardNumber, selectedAdminEmployee.employeeCode)
                : qcTurn ? false : stepDone
              const pillLabel = qcTurn ? 'QC due' : yourTurn ? 'Your turn' : done ? 'Done' : 'Waiting'
              const assigneeLine = formatJobCardAssignments(tasksByJobCard.get(item.jobCardNumber), item.jobCardNumber)
              const employeeSlots = selectedAdminEmployee
                ? employeeTasksOnJobCard(adminEmployeeScopedTasks, item.jobCardNumber, selectedAdminEmployee.employeeCode)
                : [item]
              const roleLine = employeeSlots
                .map((t) => `${BODYSHOP_FLOOR_WORK_ROLE_LABELS[t.floorRole]}${t.isSupport ? ' (support)' : ''}`)
                .join(', ')
              return (
                <TouchableOpacity
                  onPress={() => setSelected(item)}
                  style={[
                    S.card,
                    qcTurn ? S.cardQc : done ? S.cardDone : yourTurn ? S.cardPending : S.cardWaiting,
                  ]}
                >
                  <View style={S.cardTopRow}>
                    <Text style={S.cardTitle}>{floorWorkVehicleTitle(meta, item.jobCardNumber)}</Text>
                    <View style={[
                      S.statusPill,
                      qcTurn ? S.statusPillQc : done ? S.statusPillDone : yourTurn ? S.statusPillPending : S.statusPillWaiting,
                    ]}>
                      <Text style={[
                        S.statusPillText,
                        qcTurn ? S.statusPillTextQc : done ? S.statusPillTextDone : yourTurn ? S.statusPillTextPending : S.statusPillTextWaiting,
                      ]}>
                        {pillLabel}
                      </Text>
                    </View>
                  </View>
                  {floorWorkVehicleSubtitle(meta, item.jobCardNumber) ? (
                    <Text style={S.cardSub}>{floorWorkVehicleSubtitle(meta, item.jobCardNumber)}</Text>
                  ) : null}
                  {isAdminOverview ? (
                    <Text style={S.cardAssignee}>{assigneeLine}</Text>
                  ) : null}
                  {floorWorkStandingLine(meta) ? (
                    <Text style={S.cardStanding}>{floorWorkStandingLine(meta)}</Text>
                  ) : null}
                  <View style={S.cardFooter}>
                    <Text style={S.cardRole}>
                      {adminEmployeeWorkView
                        ? (roleLine || '—')
                        : `${BODYSHOP_FLOOR_WORK_ROLE_LABELS[item.floorRole]}${item.isSupport ? ' · support' : ''}`}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            }}
          />
        </>
      )}
    </SafeAreaView>
  )
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f2ec' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e7e3d9',
  },
  screenTitle: { fontSize: 20, fontWeight: '800', color: '#1a1b21' },
  screenSubtitle: { fontSize: 12, color: '#82858f', marginTop: 3 },
  refreshBtn: { padding: 8 },
  refreshBtnText: { fontSize: 22, color: '#2a4cd0', fontWeight: '700' },
  incomeBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  incomeBannerLabel: { fontSize: 11, fontWeight: '700', color: '#047857', textTransform: 'uppercase' },
  incomeBannerAmount: { fontSize: 22, fontWeight: '800', color: '#065f46', marginTop: 4 },
  incomeBannerHint: { fontSize: 11, color: '#047857', marginTop: 6, opacity: 0.85 },
  rosterScroll: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },
  rosterIntro: { fontSize: 12, color: '#82858f', lineHeight: 18, marginBottom: 12 },
  rosterError: { color: '#DC2626', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  rosterGroup: { marginBottom: 8 },
  rosterGroupTitle: { fontSize: 16, fontWeight: '800', color: '#1a1b21', marginBottom: 8 },
  rosterCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e3d9',
    padding: 14,
    marginBottom: 10,
  },
  rosterName: { fontSize: 16, fontWeight: '800', color: '#1a1b21' },
  rosterMeta: { fontSize: 11, color: '#82858f', marginTop: 2, marginBottom: 10 },
  statsThreeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 6,
  },
  statsThreeRowCompact: { marginTop: 10, marginBottom: 8 },
  statsThreeCell: { flex: 1, alignItems: 'center' },
  statsThreeL: { fontSize: 10, color: '#82858f', fontWeight: '700', textTransform: 'uppercase' },
  statsThreeN: { fontSize: 18, fontWeight: '800', color: '#1a1b21', marginTop: 4 },
  rosterIncome: { fontSize: 14, fontWeight: '800', color: '#065f46', marginTop: 4 },
  adminStatsCard: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e3d9',
  },
  adminStatsTitle: { fontSize: 17, fontWeight: '800', color: '#1a1b21' },
  adminStatsSub: { fontSize: 12, color: '#82858f', marginTop: 2, marginBottom: 4 },
  adminStatsIncome: { fontSize: 12, fontWeight: '700', color: '#065f46', marginTop: 8 },
  rosterTapHint: { fontSize: 11, color: '#2a4cd0', fontWeight: '700', marginTop: 6 },
  summaryRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  summaryPill: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  summaryPillPending: { backgroundColor: '#fff8ed', borderColor: '#f1dcb8' },
  summaryPillDone: { backgroundColor: '#eef6ff', borderColor: '#cadcf8' },
  summaryPillN: { fontSize: 20, fontWeight: '800', color: '#1a1b21' },
  summaryPillL: { fontSize: 11, fontWeight: '600', color: '#82858f', marginTop: 2 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 8 },
  searchInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e3d9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1a1b21',
  },
  filterSectionLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#82858f',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  filterScrollRow: { flexGrow: 0, flexShrink: 0 },
  filterScrollRowLast: { marginBottom: 6 },
  listOrderHint: {
    fontSize: 11,
    color: '#82858f',
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 2,
  },
  filterScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e3d9',
  },
  filterChipActive: { backgroundColor: '#1a1b21', borderColor: '#1a1b21' },
  filterChipAccentActive: { backgroundColor: '#2a4cd0', borderColor: '#2a4cd0' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: '#4b4e59' },
  filterChipTextActive: { color: '#fff' },
  loadMoreBtn: {
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#2a4cd0',
    alignItems: 'center',
  },
  loadMoreBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  listContent: { padding: 16, paddingTop: 8, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardPending: { borderColor: '#f1dcb8' },
  cardDone: { borderColor: '#cadcf8' },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardTitle: { flex: 1, fontWeight: '800', color: '#1a1b21', fontSize: 17 },
  cardSub: { fontSize: 12, color: '#4b4e59', marginTop: 4 },
  cardAssignee: { fontSize: 12, color: '#1a1b21', fontWeight: '600', marginTop: 6, lineHeight: 17 },
  cardStanding: { fontSize: 12, color: '#2a4cd0', marginTop: 6, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  cardRole: { fontSize: 11.5, color: '#82858f', fontWeight: '600', flex: 1 },
  cardArrival: { fontSize: 11, fontWeight: '800', color: '#41617f' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusPillPending: { backgroundColor: '#fff8ed', borderColor: '#f1dcb8' },
  statusPillDone: { backgroundColor: '#eef6ff', borderColor: '#cadcf8' },
  statusPillText: { fontSize: 10, fontWeight: '800' },
  statusPillTextPending: { color: '#9a6700' },
  statusPillTextDone: { color: '#2a4cd0' },
  empty: { alignItems: 'center', marginTop: 48, gap: 8, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 14, color: '#82858f', textAlign: 'center', lineHeight: 20 },
  detailScroll: { padding: 16, paddingBottom: 40 },
  backBtn: { marginBottom: 10 },
  backBtnText: { color: '#2a4cd0', fontWeight: '700', fontSize: 15 },
  detailTitle: { fontWeight: '800', fontSize: 20, color: '#1a1b21' },
  detailSub: { fontSize: 13, color: '#4b4e59', marginTop: 4, lineHeight: 18 },
  detailMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  roleBadge: { backgroundColor: '#e9eef3', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  roleBadgeText: { fontSize: 12, fontWeight: '700', color: '#41617f' },
  arrivalBadge: { fontSize: 12, fontWeight: '800', color: '#4b4e59', alignSelf: 'center' },
  adminViewOnlyHint: { fontSize: 13, color: '#82858f', marginTop: 10, lineHeight: 18 },
  standingLine: { fontSize: 12, color: '#2a4cd0', marginTop: 8, fontWeight: '700' },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#82858f',
    marginTop: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#e7e3d9',
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 14,
    color: '#1a1b21',
    backgroundColor: '#fff',
  },
  photoLink: { marginTop: 12 },
  photoLinkText: { color: '#2a4cd0', fontWeight: '700', fontSize: 14 },
  savedPhotosBox: { marginTop: 12, backgroundColor: '#fff', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#e7e3d9' },
  savedPhotosHint: { fontSize: 11, color: '#82858f', marginBottom: 6 },
  savedPhotoRow: { paddingVertical: 6 },
  savedPhotoText: { color: '#2a4cd0', fontSize: 13 },
  saveBtn: {
    marginTop: 18,
    backgroundColor: '#2a4cd0',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  qcPanel: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cadcf8',
  },
  qcPanelTitle: { fontSize: 15, fontWeight: '800', color: '#1a1b21', marginBottom: 6 },
  qcPanelHint: { fontSize: 12, color: '#4b4e59', lineHeight: 18, marginBottom: 12 },
  qcBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  qcBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  qcBtnPass: { backgroundColor: '#e4f4ec', borderColor: '#1c8f63' },
  qcBtnFail: { backgroundColor: '#fbe9ec', borderColor: '#c33b53' },
  qcBtnPassText: { fontWeight: '800', color: '#1c8f63', fontSize: 14 },
  qcBtnFailText: { fontWeight: '800', color: '#c33b53', fontSize: 14 },
  stepBanner: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#e9f0fd',
    borderWidth: 1,
    borderColor: '#cadcf8',
  },
  stepBannerTitle: { fontSize: 14, fontWeight: '800', color: '#2f63cf', marginBottom: 6 },
  stepBannerHint: { fontSize: 12, color: '#4b4e59', lineHeight: 18 },
  cardQc: { borderColor: '#7048cf', backgroundColor: '#faf8ff' },
  cardWaiting: { borderColor: '#e7e3d9', opacity: 0.92 },
  statusPillQc: { backgroundColor: '#efeafb' },
  statusPillWaiting: { backgroundColor: '#f6f4ee' },
  statusPillTextQc: { color: '#7048cf' },
  statusPillTextWaiting: { color: '#82858f' },
})
