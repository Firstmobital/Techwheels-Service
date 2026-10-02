import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
  floorWorkVehicleSubtitle,
  floorWorkVehicleTitle,
  sortFloorWorkTasksByVehicle,
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

export default function BodyshopFloorWorkScreen() {
  const today = bodyshopFloorWorkTodayIstDate()
  const [loading, setLoading] = useState(true)
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

  const sortedTasks = useMemo(
    () => sortFloorWorkTasksByVehicle(tasks, vehicleByJc),
    [tasks, vehicleByJc],
  )

  const visibleTasks = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase()
    if (!q) return sortedTasks
    return sortedTasks.filter((t) => {
      const meta = vehicleByJc[t.jobCardNumber]
      const title = floorWorkVehicleTitle(meta, t.jobCardNumber).toLowerCase()
      const sub = floorWorkVehicleSubtitle(meta, t.jobCardNumber).toLowerCase()
      return title.includes(q) || sub.includes(q) || t.jobCardNumber.toLowerCase().includes(q)
    })
  }, [sortedTasks, vehicleByJc, vehicleSearch])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ctx = await getLinkedEmployeeContext()
      const adminOverview = Boolean(ctx.isAdminOverview)
      setIsAdminOverview(adminOverview)
      setEmployeeCode(ctx.employeeCode)
      setEmployeeName(ctx.employeeName)

      let assRows: Record<string, unknown>[] = []
      let supportRows: Record<string, unknown>[] = []
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
      } else {
        assRows = await fetchBodyshopAssignmentsForEmployee(ctx.employeeCode)
        supportRows = await fetchBodyshopSupportAssignmentsForEmployee(ctx.employeeCode)
      }

      const taskList = adminOverview
        ? listAllWorkTasksForAdmin(assRows, supportRows)
        : listWorkTasksForEmployee(ctx.employeeCode, assRows, supportRows)
      setTasks(taskList)

      const jcs = adminOverview
        ? Array.from(new Set(assRows.map((r) => String(r.job_card_number ?? '').trim().toUpperCase()).filter(Boolean)))
        : Array.from(new Set(taskList.map((t) => t.jobCardNumber)))
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
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => {
    void load()
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

  async function pickPhotos() {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Camera', 'Permission needed to attach work photos.')
      return
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 })
    if (res.canceled || !res.assets[0]?.uri) return
    setPhotoUris((prev) => [...prev, { uri: res.assets[0].uri, mime: res.assets[0].mimeType ?? 'image/jpeg' }])
  }

  async function save() {
    if (!selected) return
    const slotCode = workTaskEmployeeCode(selected, employeeCode)
    if (!slotCode) return
    const trimmed = note.trim()
    if (!trimmed) {
      Alert.alert('Update', 'Enter today\'s work description.')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: dealerCodeRaw, error: dealerErr } = await supabase.rpc('my_dealer_code')
      if (dealerErr) throw new Error(dealerErr.message)
      const dealerCode = String(dealerCodeRaw ?? selected.dealerCode ?? '').trim()
      if (!dealerCode) throw new Error('Dealer code missing')

      const row = await upsertRoleDailyLog({
        jobCardNumber: selected.jobCardNumber,
        repairCardId: selected.repairCardId,
        dealerCode,
        floorRole: selected.floorRole,
        employeeCode: slotCode,
        employeeName: selected.employeeName ?? employeeName,
        noteText: trimmed,
        isSupport: selected.isSupport,
        actorEmail: user?.email ?? null,
      })

      for (let i = 0; i < photoUris.length; i++) {
        const uploaded = await uploadRoleDailyLogPhotoFromUri({
          logId: row.id,
          dealerCode,
          jobCardNumber: selected.jobCardNumber,
          regNumber: vehicleByJc[selected.jobCardNumber]?.reg ?? null,
          uri: photoUris[i].uri,
          mimeType: photoUris[i].mime,
          sortOrder: i,
        })
        setSavedPhotos((prev) => [...prev, uploaded])
      }

      const key = workLogMapKey(selected.jobCardNumber, selected.floorRole, slotCode, selected.isSupport)
      setLogsByKey((prev) => ({ ...prev, [key]: row }))
      setPhotoUris([])
      Alert.alert('Saved', 'Today\'s update saved (IST).')
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2a4cd0" />
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', marginBottom: 8 }}>Floor Work</Text>
        <Text style={{ color: '#DC2626', marginBottom: 12 }}>{error}</Text>
        <Text style={{ color: '#82858f', lineHeight: 20 }}>
          Admin: grant module bodyshop_floor_work, map user → employee code, set Employee Master role (DENTOR/PAINTER/…).
        </Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f6f4ee' }} edges={['top']}>
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#e7e3d9', backgroundColor: '#fff' }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#1a1b21' }}>Floor Work</Text>
        <Text style={{ fontSize: 12, color: '#82858f', marginTop: 4 }}>
          {employeeName ?? employeeCode} · {today}
        </Text>
      </View>

      {selected ? (
        <View style={{ padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e7e3d9' }}>
          <TouchableOpacity onPress={() => setSelected(null)}>
            <Text style={{ color: '#2a4cd0', fontWeight: '700', marginBottom: 8 }}>← Back to list</Text>
          </TouchableOpacity>
          <Text style={{ fontWeight: '800', fontSize: 18 }}>
            {floorWorkVehicleTitle(vehicleByJc[selected.jobCardNumber], selected.jobCardNumber)}
          </Text>
          <Text style={{ fontSize: 12, color: '#82858f', marginTop: 4 }}>
            {floorWorkVehicleSubtitle(vehicleByJc[selected.jobCardNumber], selected.jobCardNumber)}
          </Text>
          <Text style={{ fontSize: 12, color: '#82858f', marginTop: 4 }}>
            {BODYSHOP_FLOOR_WORK_ROLE_LABELS[selected.floorRole]}
          </Text>
          <TextInput
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderColor: '#e7e3d9',
              borderRadius: 8,
              padding: 10,
              minHeight: 80,
              textAlignVertical: 'top',
            }}
            multiline
            placeholder="Today's work…"
            value={note}
            onChangeText={setNote}
          />
          <TouchableOpacity onPress={() => void pickPhotos()} style={{ marginTop: 10 }}>
            <Text style={{ color: '#2a4cd0', fontWeight: '700' }}>+ Add photo ({photoUris.length})</Text>
          </TouchableOpacity>
          {savedPhotos.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              {savedPhotos.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => void openRoleDailyLogPhoto(p).catch((e) => Alert.alert('Photo', e instanceof Error ? e.message : 'Open failed'))}
                  style={{ paddingVertical: 6 }}
                >
                  <Text style={{ color: '#2a4cd0', fontSize: 13 }}>
                    {p.file_name ?? `Photo ${p.sort_order + 1}`}
                    {p.drive_url ? ' · Drive' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <TouchableOpacity
            onPress={() => void save()}
            disabled={saving}
            style={{
              marginTop: 14,
              backgroundColor: '#2a4cd0',
              padding: 12,
              borderRadius: 8,
              alignItems: 'center',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Save today&apos;s update</Text>}
          </TouchableOpacity>
        </View>
      ) : null}

      {!selected ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <TextInput
            placeholder="Search reg no. / customer / JC…"
            value={vehicleSearch}
            onChangeText={setVehicleSearch}
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#e7e3d9',
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
        </View>
      ) : null}

      <FlatList
        data={visibleTasks}
        keyExtractor={(item) => `${item.jobCardNumber}-${item.floorRole}-${item.isSupport}`}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#82858f', marginTop: 24 }}>
            No assignment for your code yet. Floor Incharge must assign you on Bodyshop Floor.
          </Text>
        }
        renderItem={({ item }) => {
          const slotCode = workTaskEmployeeCode(item, employeeCode)
          const key = workLogMapKey(item.jobCardNumber, item.floorRole, slotCode, item.isSupport)
          const done = Boolean(logsByKey[key]?.note_text?.trim())
          const meta = vehicleByJc[item.jobCardNumber]
          return (
            <TouchableOpacity
              onPress={() => setSelected(item)}
              style={{
                backgroundColor: '#fff',
                padding: 14,
                borderRadius: 12,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: done ? '#cadcf8' : '#f1dcb8',
              }}
            >
              <Text style={{ fontWeight: '800', color: '#1a1b21', fontSize: 17 }}>
                {floorWorkVehicleTitle(meta, item.jobCardNumber)}
              </Text>
              <Text style={{ fontSize: 12, color: '#82858f', marginTop: 4 }}>
                {floorWorkVehicleSubtitle(meta, item.jobCardNumber)}
              </Text>
              <Text style={{ fontSize: 12, color: '#82858f', marginTop: 4 }}>
                {BODYSHOP_FLOOR_WORK_ROLE_LABELS[item.floorRole]}
                {item.isSupport ? ' · support' : ''} · {done ? '✓ updated' : 'pending today'}
              </Text>
            </TouchableOpacity>
          )
        }}
      />
    </SafeAreaView>
  )
}
