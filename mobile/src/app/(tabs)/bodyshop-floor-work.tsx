import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { fetchRepairCardVehicleByJcs } from '../../lib/api/bodyshopFloorWorkVehicles'
import {
  floorWorkAssignmentDayBucket,
  floorWorkAssignmentDayChipLabel,
  floorWorkVehicleSubtitle,
  floorWorkVehicleTitle,
  floorWorkStandingLine,
  buildFloorWorkMonthFilterOptions,
  currentIstYearMonth,
  istYearMonthFromIso,
  sortFloorWorkTasksByNewestAssignment,
  type FloorWorkAssignmentDayBucket,
  type FloorWorkVehicleMeta,
} from '../../lib/bodyshopFloorWork/display'
import {
  BODYSHOP_FLOOR_WORK_ROLE_LABELS,
  listAllWorkTasksForAdmin,
  listWorkTasksForEmployee,
  workTaskEmployeeCode,
  type BodyshopFloorWorkTask,
} from '../../lib/bodyshopFloorWork/roles'
import {
  bodyshopFloorWorkTodayIstDate,
  workLogMapKey,
  type BodyshopFloorRoleDailyLogRow,
} from '../../lib/bodyshopFloorRoleWorkLog'
import {
  fetchRoleDailyLogPhotos,
  fetchRoleDailyLogsForDate,
  openRoleDailyLogPhoto,
  uploadRoleDailyLogPhotoFromUri,
  upsertRoleDailyLog,
} from '../../lib/api/bodyshopFloorRoleWorkLog'
import type { BodyshopFloorRoleDailyLogPhotoRow } from '../../lib/bodyshopFloorRoleWorkLog'

type AssignmentDayFilter = 'all' | FloorWorkAssignmentDayBucket
type UpdateFilter = 'all' | 'pending' | 'done'

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
  const [vehicleSearch, setVehicleSearch] = useState('')
  const [assignmentMonthFilter, setAssignmentMonthFilter] = useState(() => currentIstYearMonth(today))
  const [assignmentDayFilter, setAssignmentDayFilter] = useState<AssignmentDayFilter>('all')
  const [updateFilter, setUpdateFilter] = useState<UpdateFilter>('pending')

  const monthFilterOptions = useMemo(() => buildFloorWorkMonthFilterOptions(today, 5), [today])

  const isTaskDone = useCallback(
    (t: BodyshopFloorWorkTask) => {
      const slotCode = workTaskEmployeeCode(t, employeeCode)
      if (!slotCode) return false
      const key = workLogMapKey(t.jobCardNumber, t.floorRole, slotCode, t.isSupport)
      return Boolean(logsByKey[key]?.note_text?.trim())
    },
    [employeeCode, logsByKey],
  )

  const monthFilteredTasks = useMemo(() => {
    if (assignmentMonthFilter === 'all') return tasks
    return tasks.filter((t) => istYearMonthFromIso(t.assignedAt) === assignmentMonthFilter)
  }, [tasks, assignmentMonthFilter])

  const searchFilteredTasks = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase()
    const sorted = sortFloorWorkTasksByNewestAssignment(monthFilteredTasks, vehicleByJc)
    if (!q) return sorted
    return sorted.filter((t) => {
      const meta = vehicleByJc[t.jobCardNumber]
      const title = floorWorkVehicleTitle(meta, t.jobCardNumber).toLowerCase()
      const sub = floorWorkVehicleSubtitle(meta, t.jobCardNumber).toLowerCase()
      return title.includes(q) || sub.includes(q) || t.jobCardNumber.toLowerCase().includes(q)
    })
  }, [monthFilteredTasks, vehicleByJc, vehicleSearch])

  const filterCounts = useMemo(() => {
    const assignmentDay = { all: 0, today: 0, yesterday: 0, older: 0, unknown: 0 }
    const updates = { all: 0, pending: 0, done: 0 }
    for (const t of searchFilteredTasks) {
      assignmentDay.all += 1
      const bucket = floorWorkAssignmentDayBucket(t.assignedAt, today)
      assignmentDay[bucket] += 1
      updates.all += 1
      if (isTaskDone(t)) updates.done += 1
      else updates.pending += 1
    }
    return { assignmentDay, updates }
  }, [searchFilteredTasks, today, isTaskDone])

  const visibleTasks = useMemo(() => {
    return searchFilteredTasks.filter((t) => {
      if (assignmentDayFilter !== 'all') {
        const bucket = floorWorkAssignmentDayBucket(t.assignedAt, today)
        if (bucket !== assignmentDayFilter) return false
      }
      if (updateFilter === 'pending' && isTaskDone(t)) return false
      if (updateFilter === 'done' && !isTaskDone(t)) return false
      return true
    })
  }, [searchFilteredTasks, today, assignmentDayFilter, updateFilter, isTaskDone])

  const load = useCallback(async () => {
    setError(null)
    try {
      const ctx = await getLinkedEmployeeContext()
      const myCode = String(ctx.employeeCode ?? '').trim().toUpperCase()
      const adminOverview = Boolean(ctx.isAdminOverview) && !myCode
      setIsAdminOverview(adminOverview)
      setEmployeeCode(myCode)
      setEmployeeName(ctx.employeeName)

      let assRows: Record<string, unknown>[] = []
      let supportRows: Record<string, unknown>[] = []
      let taskList: BodyshopFloorWorkTask[] = []

      if (myCode) {
        assRows = await fetchBodyshopAssignmentsForEmployee(myCode)
        supportRows = await fetchBodyshopSupportAssignmentsForEmployee(myCode)
        taskList = listWorkTasksForEmployee(myCode, assRows, supportRows)
      } else if (adminOverview) {
        const { data: assAll, error: assErr } = await supabase.from('bodyshop_assignments').select('*').eq('is_active', true)
        if (assErr) throw assErr
        const { data: supAll, error: supErr } = await supabase
          .from('bodyshop_floor_support_assignments')
          .select('*')
          .eq('is_active', true)
        if (supErr) throw supErr
        assRows = assAll ?? []
        supportRows = supAll ?? []
        taskList = listAllWorkTasksForAdmin(assRows, supportRows)
      } else {
        throw new Error('No employee linked to your login.')
      }

      setTasks(taskList)

      const jcs = Array.from(new Set(taskList.map((t) => t.jobCardNumber)))
      if (jcs.length > 0) {
        setVehicleByJc(await fetchRepairCardVehicleByJcs(jcs))
      } else {
        setVehicleByJc({})
      }
      const logs = await fetchRoleDailyLogsForDate(today, jcs)
      const lmap: Record<string, BodyshopFloorRoleDailyLogRow> = {}
      for (const row of logs) {
        lmap[workLogMapKey(row.job_card_number, row.floor_role, row.employee_code, row.is_support)] = row
      }
      setLogsByKey(lmap)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    }
  }, [today])

  useEffect(() => {
    setLoading(true)
    void load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

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

  async function save() {
    if (!selected) return
    const slotCode = workTaskEmployeeCode(selected, employeeCode)
    if (!slotCode) return
    const trimmed = note.trim()
    if (!trimmed) {
      Alert.alert('Update', "Enter today's work description.")
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
      const employeeCodeForLog = loginEmployeeCode || slotCode

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
      const driveHint =
        uploadedPhotos.length > 0
          ? ' Photos are saved. Google Drive link will sync in the background (no need to wait).'
          : ''
      Alert.alert('Submitted', `Today's update is saved (IST).${driveHint}`)
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
      <SafeAreaView style={{ flex: 1, padding: 20 }}>
        <Text style={S.screenTitle}>Floor Work</Text>
        <Text style={{ color: '#DC2626', marginBottom: 12 }}>{error}</Text>
        <Text style={{ color: '#82858f', lineHeight: 20 }}>
          Admin: grant module bodyshop_floor_work, map user → employee code, set Employee Master role (DENTOR/PAINTER/…).
        </Text>
      </SafeAreaView>
    )
  }

  const pendingToday = filterCounts.updates.pending
  const doneToday = filterCounts.updates.done

  return (
    <SafeAreaView style={S.root} edges={['top']}>
      <View style={S.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={S.screenTitle}>Floor Work</Text>
          <Text style={S.screenSubtitle}>
            {employeeName ?? employeeCode}
            {isAdminOverview ? ' · Admin' : ''} · {today} (IST)
          </Text>
        </View>
        <TouchableOpacity onPress={() => void onRefresh()} style={S.refreshBtn} accessibilityLabel="Refresh">
          <Text style={S.refreshBtnText}>↻</Text>
        </TouchableOpacity>
      </View>

      {!selected ? (
        <View style={S.summaryRow}>
          <View style={[S.summaryPill, S.summaryPillPending]}>
            <Text style={S.summaryPillN}>{pendingToday}</Text>
            <Text style={S.summaryPillL}>Pending today</Text>
          </View>
          <View style={[S.summaryPill, S.summaryPillDone]}>
            <Text style={S.summaryPillN}>{doneToday}</Text>
            <Text style={S.summaryPillL}>Updated today</Text>
          </View>
        </View>
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
              <Text style={S.backBtnText}>← Back to list</Text>
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
              <Text style={S.arrivalBadge}>
                {floorWorkAssignmentDayChipLabel(floorWorkAssignmentDayBucket(selected.assignedAt, today))}
              </Text>
            </View>
            {floorWorkStandingLine(vehicleByJc[selected.jobCardNumber]) ? (
              <Text style={S.standingLine}>{floorWorkStandingLine(vehicleByJc[selected.jobCardNumber])}</Text>
            ) : null}
            <Text style={S.fieldLabel}>Today&apos;s work (IST)</Text>
            <TextInput
              style={S.noteInput}
              multiline
              placeholder="Today's work…"
              placeholderTextColor="#a8abb4"
              value={note}
              onChangeText={setNote}
            />
            <TouchableOpacity onPress={pickPhotos} style={S.photoLink}>
              <Text style={S.photoLinkText}>
                + Photo — Camera or Gallery ({photoUris.length} new)
              </Text>
            </TouchableOpacity>
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
            <TouchableOpacity onPress={() => void save()} disabled={saving} style={[S.saveBtn, saving && S.saveBtnDisabled]}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={S.saveBtnText}>Submit today&apos;s update</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <>
          <View style={S.searchWrap}>
            <TextInput
              placeholder="Search reg / customer…"
              placeholderTextColor="#a8abb4"
              value={vehicleSearch}
              onChangeText={setVehicleSearch}
              style={S.searchInput}
            />
          </View>

          <Text style={S.filterSectionLabel}>Assignment month (IST)</Text>
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

          <Text style={S.filterSectionLabel}>My assignment date</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={S.filterScrollRow}
            contentContainerStyle={S.filterScrollContent}
          >
            <FilterChip
              label="All"
              count={filterCounts.assignmentDay.all}
              active={assignmentDayFilter === 'all'}
              onPress={() => setAssignmentDayFilter('all')}
            />
            <FilterChip
              label="Assigned today"
              count={filterCounts.assignmentDay.today}
              active={assignmentDayFilter === 'today'}
              onPress={() => setAssignmentDayFilter('today')}
            />
            <FilterChip
              label="Assigned yesterday"
              count={filterCounts.assignmentDay.yesterday}
              active={assignmentDayFilter === 'yesterday'}
              onPress={() => setAssignmentDayFilter('yesterday')}
            />
            <FilterChip
              label="Assigned earlier"
              count={filterCounts.assignmentDay.older}
              active={assignmentDayFilter === 'older'}
              onPress={() => setAssignmentDayFilter('older')}
            />
          </ScrollView>

          <Text style={S.filterSectionLabel}>Today&apos;s update</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={S.filterScrollRow}
            contentContainerStyle={S.filterScrollContent}
          >
            <FilterChip
              label="Pending"
              count={filterCounts.updates.pending}
              active={updateFilter === 'pending'}
              onPress={() => setUpdateFilter('pending')}
              tone="accent"
            />
            <FilterChip
              label="Updated"
              count={filterCounts.updates.done}
              active={updateFilter === 'done'}
              onPress={() => setUpdateFilter('done')}
            />
            <FilterChip
              label="All"
              count={filterCounts.updates.all}
              active={updateFilter === 'all'}
              onPress={() => setUpdateFilter('all')}
            />
          </ScrollView>

          <Text style={S.listOrderHint}>Newest assignments first · no assign date at bottom</Text>

          <FlatList
            data={visibleTasks}
            keyExtractor={(item) => `${item.jobCardNumber}-${item.floorRole}-${item.isSupport}`}
            contentContainerStyle={S.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#2a4cd0" />}
            ListEmptyComponent={
              <View style={S.empty}>
                <Text style={S.emptyIcon}>🚗</Text>
                <Text style={S.emptyText}>
                  {tasks.length === 0
                    ? 'No assignment for your code yet. Floor Incharge must assign you on Bodyshop Floor.'
                    : 'No vehicles match these filters — try another month or filter.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const slotCode = workTaskEmployeeCode(item, employeeCode)
              const key = workLogMapKey(item.jobCardNumber, item.floorRole, slotCode, item.isSupport)
              const done = Boolean(logsByKey[key]?.note_text?.trim())
              const meta = vehicleByJc[item.jobCardNumber]
              const assignmentDay = floorWorkAssignmentDayBucket(item.assignedAt, today)
              return (
                <TouchableOpacity onPress={() => setSelected(item)} style={[S.card, done ? S.cardDone : S.cardPending]}>
                  <View style={S.cardTopRow}>
                    <Text style={S.cardTitle}>{floorWorkVehicleTitle(meta, item.jobCardNumber)}</Text>
                    <View style={[S.statusPill, done ? S.statusPillDone : S.statusPillPending]}>
                      <Text style={[S.statusPillText, done ? S.statusPillTextDone : S.statusPillTextPending]}>
                        {done ? 'Done' : 'Pending'}
                      </Text>
                    </View>
                  </View>
                  {floorWorkVehicleSubtitle(meta, item.jobCardNumber) ? (
                    <Text style={S.cardSub}>{floorWorkVehicleSubtitle(meta, item.jobCardNumber)}</Text>
                  ) : null}
                  {floorWorkStandingLine(meta) ? (
                    <Text style={S.cardStanding}>{floorWorkStandingLine(meta)}</Text>
                  ) : null}
                  <View style={S.cardFooter}>
                    <Text style={S.cardRole}>
                      {BODYSHOP_FLOOR_WORK_ROLE_LABELS[item.floorRole]}
                      {item.isSupport ? ' · support' : ''}
                    </Text>
                    <Text style={S.cardArrival}>{floorWorkAssignmentDayChipLabel(assignmentDay)}</Text>
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
})
