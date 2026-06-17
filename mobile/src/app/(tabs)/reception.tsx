/**
 * mobile/src/app/(tabs)/reception.tsx
 * Full-parity mobile mirror of the web ReceptionPage
 * - Uses employee_master (same as web)
 * - Date-range filter (This Month / Today toggle)
 * - Location + Portal (fuel type) + Service Type filters
 * - RBAC: Owner Name, Owner Phone, SA Name required
 * - Auto-creates bodyshop_repair_cards for Accident entries
 * - Exact validation logic as web
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

// ─── Constants ────────────────────────────────────────────────────────────────
const SOURCE_OPTIONS = ['Self', 'Driver Pickup', 'Walk-in', 'RSA']

const RECEPTION_SERVICE_TYPE_OPTIONS = [
  'Running Repairs', 'First Free Service', 'Second Free Service',
  'Third Free Service', 'Paid Service', 'Accident', 'Rusting',
  'PDI', 'Campaign', 'E Breakdown', 'Updation',
]

const SERVICE_TYPE_ABB: Record<string, string> = {
  'running repairs': 'RR', 'first free service': 'FFS', 'second free service': 'SFS',
  'third free service': 'TFS', 'paid service': 'PS', 'accident': 'ACC',
  'rusting': 'RST', 'pdi': 'PDI', 'campaign': 'CMP', 'e breakdown': 'EBD',
  'updation': 'UPD', 'null': 'NULL',
}

const ST_COLOR: Record<string, { bg: string; text: string }> = {
  'RR':  { bg: '#eff6ff', text: '#2563eb' }, 'FFS': { bg: '#f0fdf4', text: '#16a34a' },
  'SFS': { bg: '#f0fdf4', text: '#15803d' }, 'TFS': { bg: '#dcfce7', text: '#14532d' },
  'PS':  { bg: '#faf5ff', text: '#7c3aed' }, 'ACC': { bg: '#fef2f2', text: '#dc2626' },
  'RST': { bg: '#fff7ed', text: '#c2410c' }, 'PDI': { bg: '#f0f9ff', text: '#0284c7' },
  'CMP': { bg: '#fffbeb', text: '#b45309' }, 'EBD': { bg: '#fdf4ff', text: '#a21caf' },
  'UPD': { bg: '#f8fafc', text: '#475569' }, 'NULL': { bg: '#f1f5f9', text: '#94a3b8' },
}

const DEFAULT_MODELS = [
  'Nexon', 'Nexon EV', 'Punch', 'Punch CNG', 'Punch EV', 'Tiago', 'Tiago EV',
  'Tigor', 'Tigor EV', 'Altroz', 'Harrier', 'Harrier EV', 'Safari',
  'Curvv', 'Curvv EV', 'Hexa', 'Sierra', 'Xpres T Ev',
]

const UNKNOWN_FUEL_TYPE = 'Unknown'
const UNKNOWN_LOCATION = 'Unknown'
const UNKNOWN_SERVICE_TYPE = 'Null'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReceptionEntry {
  id: number
  reg_number: string
  jc_number: string | null
  model: string | null
  service_type: string | null
  sa_name: string | null
  sa_display_name: string | null
  sa_employee_code: string | null
  owner_name: string | null
  owner_phone: string | null
  source: string
  branch: string | null
  fuel_type: string | null
  km_reading: number | null
  created_by: string
  created_at: string
}

interface Employee {
  employee_code: string
  employee_name: string
  department: string | null
  fuel_type: string | null
  role: string | null
}

type FormState = {
  reg_number: string
  km_reading: string
  model: string
  sa_employee_code: string
  owner_name: string
  owner_phone: string
  source: string
  service_type: string
}

const EMPTY_FORM: FormState = {
  reg_number: '', km_reading: '', model: '',
  sa_employee_code: '', owner_name: '', owner_phone: '',
  source: SOURCE_OPTIONS[0], service_type: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function abbr(serviceType: string | null): string {
  const key = String(serviceType ?? '').trim().toLowerCase()
  return SERVICE_TYPE_ABB[key] ?? (serviceType?.slice(0, 3).toUpperCase() ?? '?')
}

function stColor(serviceType: string | null) {
  const key = abbr(serviceType)
  return ST_COLOR[key] ?? { bg: '#f1f5f9', text: '#64748b' }
}

function toISTDate(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
    hour12: true, timeZone: 'Asia/Kolkata',
  })
}

function getLocationLabel(value: string | null | undefined): string {
  return String(value ?? '').trim() || UNKNOWN_LOCATION
}

function getFuelTypeLabel(value: string | null | undefined): string {
  return String(value ?? '').trim() || UNKNOWN_FUEL_TYPE
}

function getServiceTypeLabel(value: string | null | undefined): string {
  const n = String(value ?? '').trim()
  if (!n || n.toLowerCase() === 'null') return UNKNOWN_SERVICE_TYPE
  return n
}

function normalizeDept(value: string | null | undefined): string {
  const n = String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
  return n === 'BODYSHOP' ? 'BODY SHOP' : n
}

function getRequiredDept(serviceType: string): 'SERVICE' | 'BODY SHOP' | 'PDI' {
  const s = serviceType.toLowerCase().trim()
  if (s === 'accident') return 'BODY SHOP'
  if (s === 'pdi') return 'PDI'
  return 'SERVICE'
}

function shouldApplyFuelFilter(serviceType: string): boolean {
  return serviceType.toLowerCase().trim() !== 'accident'
}

function inferFuelBucket(model: string): 'EV' | 'PV' {
  return /EV/i.test(model) ? 'EV' : 'PV'
}

function normFuelBucket(value: string | null | undefined): 'EV' | 'PV' | '' {
  const n = String(value ?? '').trim().toUpperCase()
  if (!n) return ''
  return n.includes('EV') ? 'EV' : 'PV'
}

function currentMonthIST(): { from: string; to: string } {
  const now = new Date()
  const y = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 4)
  const m = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(5, 7)
  const lastDay = new Date(Number(y), Number(m), 0).getDate()
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(lastDay).padStart(2, '0')}` }
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ReceptionScreen() {
  const { user } = useAuth()

  const [entries, setEntries] = useState<ReceptionEntry[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [modelOptions, setModelOptions] = useState<string[]>(DEFAULT_MODELS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Date/list mode
  const [listMode, setListMode] = useState<'today' | 'month'>('today')

  // Filter state
  const [search, setSearch] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [selectedFuelType, setSelectedFuelType] = useState<string>('all')
  const [selectedServiceType, setSelectedServiceType] = useState<string>('all')

  // Form modal
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Picker modals
  const [modelPicker, setModelPicker] = useState(false)
  const [saPicker, setSaPicker] = useState(false)
  const [stPicker, setStPicker] = useState(false)
  const [sourcePicker, setSourcePicker] = useState(false)
  const [saSearch, setSaSearch] = useState('')
  const [modelSearch, setModelSearch] = useState('')

  useFocusEffect(useCallback(() => { void loadAll() }, []))

  // ── Load ────────────────────────────────────────────────────────────────────
  async function loadAll(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    setError(null)

    const { from, to } = currentMonthIST()

    const [entriesRes, empRes, modelsRes] = await Promise.all([
      supabase
        .from('service_reception_entries')
        .select('id,reg_number,jc_number,model,service_type,sa_name,sa_display_name,sa_employee_code,owner_name,owner_phone,source,branch,fuel_type,km_reading,created_by,created_at')
        .gte('created_at', `${from}T00:00:00+05:30`)
        .lte('created_at', `${to}T23:59:59+05:30`)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('employee_master')
        .select('employee_code,employee_name,department,fuel_type,role')
        .order('employee_name'),
      supabase.from('settings_models').select('model_name').order('model_name'),
    ])

    if (entriesRes.error) setError(entriesRes.error.message)
    else setEntries((entriesRes.data ?? []) as ReceptionEntry[])

    if (empRes.data && empRes.data.length > 0)
      setEmployees(empRes.data as Employee[])

    if (modelsRes.data && modelsRes.data.length > 0)
      setModelOptions(modelsRes.data.map((r: any) => r.model_name).filter(Boolean))

    setLoading(false); setRefreshing(false)
  }

  // ── Derived / filtered entries ───────────────────────────────────────────────
  const todayStr = useMemo(() => toISTDate(new Date()), [])

  const todayEntries = useMemo(() =>
    entries.filter(e => toISTDate(new Date(e.created_at)) === todayStr),
    [entries, todayStr])

  // Employee fuel type lookup maps (same as web)
  const empFuelByCode = useMemo(() =>
    new Map(employees.map(e => [String(e.employee_code ?? '').trim().toUpperCase(), getFuelTypeLabel(e.fuel_type)])),
    [employees])

  const empFuelByName = useMemo(() =>
    new Map(employees.map(e => [String(e.employee_name ?? '').trim().toLowerCase(), getFuelTypeLabel(e.fuel_type)])),
    [employees])

  function getEntryFuelType(entry: ReceptionEntry): string {
    const raw = String(entry.fuel_type ?? '').trim()
    if (raw) return raw
    const byCode = empFuelByCode.get(String(entry.sa_employee_code ?? '').trim().toUpperCase())
    if (byCode) return byCode
    const byName = empFuelByName.get(String(entry.sa_name ?? '').trim().toLowerCase())
    if (byName) return byName
    return UNKNOWN_FUEL_TYPE
  }

  // Base entries depend on list mode
  const listModeEntries = useMemo(() =>
    listMode === 'today' ? todayEntries : entries,
    [listMode, todayEntries, entries])

  // Location filter
  const locationOptions = useMemo(() => {
    const vals = Array.from(new Set(listModeEntries.map(e => getLocationLabel(e.branch))))
    return vals.sort((a, b) => a.localeCompare(b))
  }, [listModeEntries])

  const locationFiltered = useMemo(() => {
    if (selectedLocation === 'all') return listModeEntries
    return listModeEntries.filter(e => getLocationLabel(e.branch) === selectedLocation)
  }, [listModeEntries, selectedLocation])

  // Fuel (Portal) filter
  const fuelTypeOptions = useMemo(() => {
    const vals = Array.from(new Set(locationFiltered.map(e => getEntryFuelType(e))))
    return vals.sort((a, b) => a.localeCompare(b))
  }, [locationFiltered, empFuelByCode, empFuelByName])

  const fuelFiltered = useMemo(() => {
    if (selectedFuelType === 'all') return locationFiltered
    return locationFiltered.filter(e => getEntryFuelType(e) === selectedFuelType)
  }, [locationFiltered, selectedFuelType, empFuelByCode, empFuelByName])

  // Service type counts
  const serviceTypeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    fuelFiltered.forEach(e => {
      const label = getServiceTypeLabel(e.service_type)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    })
    return counts
  }, [fuelFiltered])

  const serviceTypeOptions = useMemo(() =>
    Array.from(serviceTypeCounts.keys()).sort((a, b) => a.localeCompare(b)),
    [serviceTypeCounts])

  const serviceTypeFiltered = useMemo(() => {
    if (selectedServiceType === 'all') return fuelFiltered
    return fuelFiltered.filter(e => getServiceTypeLabel(e.service_type) === selectedServiceType)
  }, [fuelFiltered, selectedServiceType])

  // Search
  const filtered = useMemo(() => {
    if (!search.trim()) return serviceTypeFiltered
    const q = search.trim().toLowerCase()
    return serviceTypeFiltered.filter(e =>
      (e.reg_number ?? '').toLowerCase().includes(q) ||
      (e.jc_number ?? '').toLowerCase().includes(q) ||
      (e.owner_name ?? '').toLowerCase().includes(q) ||
      (e.sa_name ?? '').toLowerCase().includes(q) ||
      (e.model ?? '').toLowerCase().includes(q)
    )
  }, [serviceTypeFiltered, search])

  // Today stats
  const todayStats = useMemo(() => {
    const counts: Record<string, number> = {}
    todayEntries.forEach(e => {
      const k = abbr(e.service_type)
      counts[k] = (counts[k] ?? 0) + 1
    })
    return counts
  }, [todayEntries])

  // ── SA options filtered by dept+fuel (exact as web) ─────────────────────────
  const filteredSAs = useMemo(() => {
    const reqDept = form.service_type ? getRequiredDept(form.service_type) : 'SERVICE'
    const useFuel = form.service_type ? shouldApplyFuelFilter(form.service_type) : true
    const reqFuel = form.model ? inferFuelBucket(form.model) : null

    // Only show SA / SSA roles (same logic as web ReceptionPage)
    const allowedRoles = new Set(['sa', 'ssa', 'service advisor', 'service_advisor'])
    const hasServiceType = !!form.service_type.trim()
    return employees.filter(e => {
      const role = String(e.role ?? '').trim().toLowerCase()
      if (!allowedRoles.has(role)) return false
      // If no service type selected yet, show all SAs across all depts
      if (!hasServiceType) return true
      const dept = normalizeDept(e.department)
      if (dept !== reqDept) return false
      if (!useFuel) return true
      if (!reqFuel) return true
      return normFuelBucket(e.fuel_type) === reqFuel
    }).filter(e => {
      if (!saSearch.trim()) return true
      const q = saSearch.toLowerCase()
      return e.employee_name.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q)
    })
  }, [employees, form.service_type, form.model, saSearch])

  const hasSelectedSAInOptions = useMemo(() => {
    const code = form.sa_employee_code.trim().toUpperCase()
    if (!code) return false
    return filteredSAs.some(e => e.employee_code.trim().toUpperCase() === code)
  }, [form.sa_employee_code, filteredSAs])

  // Reset SA when it falls outside filtered options
  useEffect(() => {
    if (editingId !== null) return
    if (!form.sa_employee_code) return
    if (hasSelectedSAInOptions) return
    setForm(p => ({ ...p, sa_employee_code: '' }))
  }, [editingId, form.sa_employee_code, hasSelectedSAInOptions])

  // ── Open form helpers ────────────────────────────────────────────────────────
  function openNew() {
    setForm(EMPTY_FORM); setEditingId(null); setNotice(null); setError(null); setShowForm(true)
  }

  function openEdit(entry: ReceptionEntry) {
    const byCode = employees.find(e => e.employee_code.trim().toUpperCase() === String(entry.sa_employee_code ?? '').trim().toUpperCase())
    const byName = employees.find(e => e.employee_name.trim().toLowerCase() === String(entry.sa_name ?? '').trim().toLowerCase())
    const resolvedCode = byCode?.employee_code ?? byName?.employee_code ?? entry.sa_employee_code ?? ''
    setEditingId(entry.id)
    setForm({
      reg_number: entry.reg_number,
      km_reading: entry.km_reading == null ? '' : String(entry.km_reading),
      model: entry.model ?? '',
      sa_employee_code: resolvedCode,
      owner_name: entry.owner_name ?? '',
      owner_phone: entry.owner_phone ?? '',
      source: entry.source,
      service_type: entry.service_type ?? '',
    })
    setNotice(null); setError(null); setShowForm(true)
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.reg_number.trim()) { Alert.alert('Required', 'Registration number is required'); return }
    if (!form.model.trim()) { Alert.alert('Required', 'Model is required'); return }
    if (!form.sa_employee_code.trim()) { Alert.alert('Required', 'Select a Service Advisor'); return }
    if (!form.owner_name.trim()) { Alert.alert('Required', 'Owner name is required'); return }
    if (!form.owner_phone.trim()) { Alert.alert('Required', 'Owner phone is required'); return }
    if (form.owner_phone.replace(/\D/g, '').length !== 10) { Alert.alert('Invalid', 'Owner phone must be exactly 10 digits'); return }

    setSaving(true)
    const sa = employees.find(e => e.employee_code === form.sa_employee_code)
    const payload = {
      reg_number: form.reg_number.trim().toUpperCase(),
      km_reading: form.km_reading ? parseInt(form.km_reading) : null,
      model: form.model || null,
      sa_employee_code: form.sa_employee_code,
      sa_name: sa?.employee_name ?? null,
      owner_name: form.owner_name.trim() || null,
      owner_phone: form.owner_phone.trim() || null,
      source: form.source,
      service_type: form.service_type || null,
    }

    let result: { data?: any; error?: any }
    if (editingId) {
      result = await supabase.from('service_reception_entries').update(payload).eq('id', editingId).select().single()
    } else {
      result = await supabase.from('service_reception_entries').insert([payload]).select().single()
    }

    if (result.error) {
      Alert.alert('Error', result.error.message)
      setSaving(false)
      return
    }

    // Auto-create bodyshop repair card for Accident (mirrors web logic)
    if (!editingId && form.service_type === 'Accident' && result.data) {
      const entry = result.data as ReceptionEntry & { id: number }
      const jcNo = String(entry.jc_number ?? '').trim().toUpperCase()
      const receptionEntryId = Number(entry.id)

      let existingCard: { id: number } | null = null

      if (Number.isFinite(receptionEntryId)) {
        const byRecepRes = await supabase
          .from('bodyshop_repair_cards')
          .select('id')
          .eq('reception_entry_id', receptionEntryId)
          .order('updated_at', { ascending: false })
          .limit(1)
        existingCard = ((byRecepRes.data ?? []) as Array<{ id: number }>)[0] ?? null
      }

      if (!existingCard && jcNo) {
        const byJcRes = await supabase
          .from('bodyshop_repair_cards')
          .select('id')
          .eq('job_card_no', jcNo)
          .order('updated_at', { ascending: false })
          .limit(1)
        existingCard = ((byJcRes.data ?? []) as Array<{ id: number }>)[0] ?? null
      }

      if (!existingCard) {
        await supabase.from('bodyshop_repair_cards').insert({
          reception_entry_id: Number.isFinite(receptionEntryId) ? receptionEntryId : null,
          job_card_no: jcNo || '',
          reg_number: form.reg_number.trim().toUpperCase(),
          customer_name: form.owner_name.trim() || null,
          customer_phone: form.owner_phone.trim() || null,
          customer_type: null,
          branch: entry.branch ?? null,
          sa_name: entry.sa_name ?? entry.sa_display_name ?? sa?.employee_name ?? null,
          current_stage: 1,
          current_stage_name: 'Vehicle Receiving',
          overall_status: 'active',
          received_at: new Date().toISOString(),
        })
      }
    }

    setSaving(false)
    setShowForm(false)
    setForm(EMPTY_FORM)
    setEditingId(null)
    setNotice(editingId ? 'Entry updated' : 'Entry created')
    void loadAll()
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    Alert.alert('Delete Entry', 'Are you sure you want to delete this reception entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setDeletingId(id)
          const { error: err } = await supabase.from('service_reception_entries').delete().eq('id', id)
          setDeletingId(null)
          if (err) { Alert.alert('Error', err.message); return }
          setNotice('Entry deleted')
          void loadAll()
        }
      }
    ])
  }

  // ─── Styles ──────────────────────────────────────────────────────────────────
  const tfStyle = {
    backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, borderWidth: 1, borderColor: '#e2e8f0', color: '#1e293b',
  }
  const pickerStyle = {
    backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
    borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row' as const, alignItems: 'center' as const,
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['top']}>

      {/* ── Header ── */}
      <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 16, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#1e293b' }}>🏢 Reception</Text>
            <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>
              {listModeEntries.length} records · {listMode === 'today' ? 'Today' : 'This Month'}
            </Text>
          </View>
          <TouchableOpacity onPress={openNew}
            style={{ backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>＋ New Entry</Text>
          </TouchableOpacity>
        </View>

        {/* Today / Month toggle */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          {(['today', 'month'] as const).map(m => (
            <TouchableOpacity key={m} onPress={() => { setListMode(m); setSelectedLocation('all'); setSelectedFuelType('all'); setSelectedServiceType('all') }}
              style={{ backgroundColor: listMode === m ? '#2563eb' : '#f1f5f9', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: listMode === m ? '#fff' : '#64748b' }}>
                {m === 'today' ? `Today (${todayEntries.length})` : `This Month (${entries.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Today Stats ── */}
      {todayEntries.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
          {Object.entries(todayStats).map(([k, v]) => {
            const c = ST_COLOR[k] ?? { bg: '#f1f5f9', text: '#64748b' }
            return (
              <View key={k} style={{ backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 48 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: c.text }}>{v}</Text>
                <Text style={{ fontSize: 10, fontWeight: '600', color: c.text, marginTop: 1 }}>{k}</Text>
              </View>
            )
          })}
          <View style={{ backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 48 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1e293b' }}>{todayEntries.length}</Text>
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#64748b', marginTop: 1 }}>Total</Text>
          </View>
        </ScrollView>
      )}

      {/* ── Filters ── */}
      <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 6 }}>
        {/* Location filter */}
        {locationOptions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 5, paddingBottom: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748b', alignSelf: 'center', marginRight: 2 }}>Loc:</Text>
            <FilterChip label={`All (${listModeEntries.length})`} active={selectedLocation === 'all'} onPress={() => setSelectedLocation('all')} />
            {locationOptions.map(loc => (
              <FilterChip key={loc} label={`${loc} (${listModeEntries.filter(e => getLocationLabel(e.branch) === loc).length})`}
                active={selectedLocation === loc} onPress={() => setSelectedLocation(loc)} />
            ))}
          </ScrollView>
        )}

        {/* Portal (fuel type) filter */}
        {fuelTypeOptions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 5, paddingBottom: 4, paddingTop: 2 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748b', alignSelf: 'center', marginRight: 2 }}>Portal:</Text>
            <FilterChip label={`All (${locationFiltered.length})`} active={selectedFuelType === 'all'} onPress={() => setSelectedFuelType('all')} />
            {fuelTypeOptions.map(ft => (
              <FilterChip key={ft} label={`${ft} (${locationFiltered.filter(e => getEntryFuelType(e) === ft).length})`}
                active={selectedFuelType === ft} onPress={() => setSelectedFuelType(ft)} />
            ))}
          </ScrollView>
        )}

        {/* Service type chips */}
        {serviceTypeOptions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 5, paddingTop: 2 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748b', alignSelf: 'center', marginRight: 2 }}>Type:</Text>
            <FilterChip label={`All SR (${fuelFiltered.length})`} active={selectedServiceType === 'all'} onPress={() => setSelectedServiceType('all')} />
            {serviceTypeOptions.map(st => {
              const c = stColor(st)
              return (
                <TouchableOpacity key={st} onPress={() => setSelectedServiceType(st)}
                  style={{ backgroundColor: selectedServiceType === st ? c.bg : '#f8fafc', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: selectedServiceType === st ? c.text : '#e2e8f0' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: selectedServiceType === st ? c.text : '#64748b' }}>
                    {abbr(st)} · {serviceTypeCounts.get(st) ?? 0}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )}
      </View>

      {/* ── Search ── */}
      <View style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
        <TextInput
          placeholder="🔍 Search reg / name / model / SA / JC…"
          value={search} onChangeText={setSearch}
          style={{ backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderWidth: 1, borderColor: '#e2e8f0', color: '#1e293b' }}
          placeholderTextColor="#94a3b8"
        />
      </View>

      {/* Notice */}
      {notice && (
        <View style={{ backgroundColor: '#f0fdf4', padding: 10, marginHorizontal: 12, marginTop: 8, borderRadius: 8 }}>
          <Text style={{ color: '#16a34a', fontSize: 13, fontWeight: '600' }}>✓ {notice}</Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={{ backgroundColor: '#fef2f2', padding: 10, marginHorizontal: 12, marginTop: 8, borderRadius: 8 }}>
          <Text style={{ color: '#dc2626', fontSize: 13 }}>⚠️ {error}</Text>
        </View>
      )}

      {/* ── List ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={{ marginTop: 8, color: '#94a3b8', fontSize: 13 }}>Loading entries…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} tintColor="#2563eb" />}
          contentContainerStyle={{ padding: 12, paddingBottom: 100, gap: 8 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 48 }}>
              <Text style={{ fontSize: 36 }}>🏁</Text>
              <Text style={{ fontWeight: '700', color: '#475569', marginTop: 8 }}>No entries found</Text>
              <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>Pull to refresh or add a new entry</Text>
              <TouchableOpacity onPress={openNew}
                style={{ marginTop: 16, backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>＋ Add Entry</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item: e }) => {
            const c = stColor(e.service_type)
            const isDeleting = deletingId === e.id
            return (
              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  {/* Service type badge */}
                  <View style={{ backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 10, minWidth: 42, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: c.text }}>{abbr(e.service_type)}</Text>
                  </View>

                  {/* Main info */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <Text style={{ fontWeight: '800', fontSize: 15, color: '#1e293b', letterSpacing: 0.5 }}>{e.reg_number}</Text>
                      {e.jc_number && (
                        <View style={{ backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, color: '#16a34a', fontWeight: '700' }}>✓ {e.jc_number}</Text>
                        </View>
                      )}
                      {/* Source pill */}
                      <View style={{ backgroundColor: e.source === 'Walk-in' ? '#f0fdf4' : e.source === 'Self' ? '#fafafa' : '#eff6ff', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#475569' }}>{e.source}</Text>
                      </View>
                    </View>

                    {e.model && <Text style={{ fontSize: 13, color: '#475569', marginTop: 1 }}>{e.model}</Text>}

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                      {(e.sa_display_name || e.sa_name) &&
                        <Text style={{ fontSize: 12, color: '#64748b' }}>👤 {e.sa_display_name || e.sa_name}</Text>}
                      {e.owner_name &&
                        <Text style={{ fontSize: 12, color: '#64748b' }}>🙍 {e.owner_name}{e.owner_phone ? ` · ${e.owner_phone}` : ''}</Text>}
                    </View>

                    {e.km_reading != null &&
                      <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>🛣 {e.km_reading.toLocaleString('en-IN')} km</Text>}

                    <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {fmtDateTime(e.created_at)} · By {e.created_by}
                    </Text>
                  </View>
                </View>

                {/* Actions */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                  <TouchableOpacity onPress={() => openEdit(e)}
                    style={{ flex: 1, backgroundColor: '#eff6ff', borderRadius: 6, paddingVertical: 7, alignItems: 'center' }}>
                    <Text style={{ color: '#2563eb', fontWeight: '700', fontSize: 13 }}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(e.id)} disabled={isDeleting}
                    style={{ flex: 1, backgroundColor: '#fef2f2', borderRadius: 6, paddingVertical: 7, alignItems: 'center' }}>
                    <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 13 }}>{isDeleting ? 'Deleting…' : 'Delete'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          }}
        />
      )}

      {/* ══ ADD / EDIT FORM MODAL ══ */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowForm(false); setForm(EMPTY_FORM); setEditingId(null) }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>

            {/* Modal Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
              <TouchableOpacity onPress={() => { setShowForm(false); setForm(EMPTY_FORM); setEditingId(null) }}>
                <Text style={{ color: '#64748b', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#1e293b' }}>
                {editingId ? 'Edit Entry' : '➕ New Intake'}
              </Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}
                style={{ backgroundColor: saving ? '#93c5fd' : '#2563eb', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{saving ? '…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

              {/* Registration No */}
              <FormField label="Registration No *">
                <TextInput style={tfStyle} placeholder="e.g. RJ14XX1234" placeholderTextColor="#94a3b8"
                  value={form.reg_number} autoCapitalize="characters"
                  onChangeText={t => setForm(p => ({ ...p, reg_number: t.toUpperCase() }))} />
              </FormField>

              {/* KM Reading */}
              <FormField label="KM Reading">
                <TextInput style={tfStyle} placeholder="e.g. 24560" placeholderTextColor="#94a3b8"
                  value={form.km_reading} keyboardType="numeric"
                  onChangeText={t => setForm(p => ({ ...p, km_reading: t.replace(/[^0-9]/g, '') }))} />
              </FormField>

              {/* Model */}
              <FormField label="Model *">
                <TouchableOpacity style={pickerStyle} onPress={() => { setModelSearch(''); setModelPicker(true) }}>
                  <Text style={{ fontSize: 14, color: form.model ? '#1e293b' : '#94a3b8', flex: 1 }}>{form.model || 'Select model…'}</Text>
                  <Text style={{ color: '#94a3b8' }}>▾</Text>
                </TouchableOpacity>
              </FormField>

              {/* Source */}
              <FormField label="Source *">
                <TouchableOpacity style={pickerStyle} onPress={() => setSourcePicker(true)}>
                  <Text style={{ fontSize: 14, color: '#1e293b', flex: 1 }}>{form.source}</Text>
                  <Text style={{ color: '#94a3b8' }}>▾</Text>
                </TouchableOpacity>
              </FormField>

              {/* Service Type */}
              <FormField label="Service Type">
                <TouchableOpacity
                  style={[pickerStyle, form.service_type === 'Accident' ? { borderColor: '#ef4444' } : {}]}
                  onPress={() => setStPicker(true)}>
                  <Text style={{ fontSize: 14, color: form.service_type ? '#1e293b' : '#94a3b8', flex: 1 }}>{form.service_type || 'Select service type…'}</Text>
                  <Text style={{ color: '#94a3b8' }}>▾</Text>
                </TouchableOpacity>
                {form.service_type === 'Accident' && (
                  <Text style={{ fontSize: 12, color: '#ef4444', marginTop: 4, fontWeight: '600' }}>
                    ⚠️ Accident — will appear in Bodyshop Repair Tracker
                  </Text>
                )}
              </FormField>

              {/* SA Name */}
              <FormField label={`SA Name * · ${filteredSAs.length} available`}>
                <TouchableOpacity style={pickerStyle} onPress={() => { setSaSearch(''); setSaPicker(true) }}>
                  <Text style={{ fontSize: 14, color: form.sa_employee_code ? '#1e293b' : '#94a3b8', flex: 1 }}>
                    {form.sa_employee_code
                      ? (employees.find(e => e.employee_code === form.sa_employee_code)?.employee_name ?? form.sa_employee_code)
                      : `Select SA (${form.service_type ? getRequiredDept(form.service_type) : 'SERVICE'}${form.model && form.service_type && shouldApplyFuelFilter(form.service_type) ? ' + ' + inferFuelBucket(form.model) : ''})…`}
                  </Text>
                  <Text style={{ color: '#94a3b8' }}>▾</Text>
                </TouchableOpacity>
              </FormField>

              {/* Owner Name */}
              <FormField label="Owner Name *">
                <TextInput style={tfStyle} placeholder="Customer name" placeholderTextColor="#94a3b8"
                  value={form.owner_name} onChangeText={t => setForm(p => ({ ...p, owner_name: t }))} />
              </FormField>

              {/* Owner Phone */}
              <FormField label="Owner Phone * (10 digits)">
                <TextInput style={tfStyle} placeholder="10-digit mobile" placeholderTextColor="#94a3b8"
                  value={form.owner_phone} keyboardType="phone-pad" maxLength={10}
                  onChangeText={t => setForm(p => ({ ...p, owner_phone: t.replace(/\D/g, '').slice(0, 10) }))} />
              </FormField>

            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Model Picker ── */}
      <PickerModal visible={modelPicker} title="Select Model" onClose={() => setModelPicker(false)}
        search={modelSearch} onSearch={setModelSearch}
        items={modelOptions.filter(m => !modelSearch.trim() || m.toLowerCase().includes(modelSearch.toLowerCase()))}
        renderItem={m => (
          <TouchableOpacity key={m} onPress={() => { setForm(p => ({ ...p, model: m })); setModelPicker(false) }}
            style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center' }}>
            {form.model === m && <Text style={{ color: '#2563eb', marginRight: 8, fontWeight: '800' }}>✓</Text>}
            <Text style={{ fontSize: 15, color: '#1e293b', fontWeight: form.model === m ? '700' : '400' }}>{m}</Text>
          </TouchableOpacity>
        )} />

      {/* ── Service Type Picker ── */}
      <PickerModal visible={stPicker} title="Select Service Type" onClose={() => setStPicker(false)}
        items={RECEPTION_SERVICE_TYPE_OPTIONS}
        renderItem={st => (
          <TouchableOpacity key={st} onPress={() => { setForm(p => ({ ...p, service_type: st })); setStPicker(false) }}
            style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {form.service_type === st && <Text style={{ color: '#2563eb', fontWeight: '800' }}>✓</Text>}
            <View style={{ backgroundColor: stColor(st).bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: stColor(st).text }}>{abbr(st)}</Text>
            </View>
            <Text style={{ fontSize: 15, color: '#1e293b', flex: 1, fontWeight: form.service_type === st ? '700' : '400' }}>{st}</Text>
          </TouchableOpacity>
        )} />

      {/* ── Source Picker ── */}
      <PickerModal visible={sourcePicker} title="Select Source" onClose={() => setSourcePicker(false)}
        items={SOURCE_OPTIONS}
        renderItem={src => (
          <TouchableOpacity key={src} onPress={() => { setForm(p => ({ ...p, source: src })); setSourcePicker(false) }}
            style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center' }}>
            {form.source === src && <Text style={{ color: '#2563eb', marginRight: 8, fontWeight: '800' }}>✓</Text>}
            <Text style={{ fontSize: 15, color: '#1e293b', fontWeight: form.source === src ? '700' : '400' }}>{src}</Text>
          </TouchableOpacity>
        )} />

      {/* ── SA Picker ── */}
      <PickerModal visible={saPicker} title="Select Service Advisor" onClose={() => setSaPicker(false)}
        search={saSearch} onSearch={setSaSearch}
        items={filteredSAs}
        renderItem={emp => (
          <TouchableOpacity key={emp.employee_code} onPress={() => { setForm(p => ({ ...p, sa_employee_code: emp.employee_code })); setSaPicker(false) }}
            style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {form.sa_employee_code === emp.employee_code && <Text style={{ color: '#2563eb', fontWeight: '800' }}>✓</Text>}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: '#1e293b', fontWeight: form.sa_employee_code === emp.employee_code ? '700' : '400' }}>{emp.employee_name}</Text>
              <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{emp.employee_code} · {normalizeDept(emp.department)} · {getFuelTypeLabel(emp.fuel_type)}</Text>
            </View>
          </TouchableOpacity>
        )} />

    </SafeAreaView>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>{label}</Text>
      {children}
    </View>
  )
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress}
      style={{ backgroundColor: active ? '#2563eb' : '#f1f5f9', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : '#64748b' }}>{label}</Text>
    </TouchableOpacity>
  )
}

function PickerModal({ visible, title, onClose, search, onSearch, items, renderItem }: {
  visible: boolean; title: string; onClose: () => void
  search?: string; onSearch?: (s: string) => void
  items: any[]; renderItem: (item: any) => JSX.Element
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: '#1e293b' }}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#64748b' }}>Done</Text>
          </TouchableOpacity>
        </View>
        {onSearch && (
          <View style={{ padding: 12 }}>
            <TextInput placeholder="Search…" placeholderTextColor="#94a3b8"
              value={search} onChangeText={onSearch}
              style={{ backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, borderWidth: 1, borderColor: '#e2e8f0' }} />
          </View>
        )}
        <FlatList
          data={items}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => { return renderItem(item) as JSX.Element }}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled" />
      </SafeAreaView>
    </Modal>
  )
}
