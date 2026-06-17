/**
 * mobile/src/app/(tabs)/reception.tsx
 * Mobile mirror of web ReceptionPage — business logic 100% identical to web.
 * UI is mobile-specific (React Native). All data columns, filtering, validation,
 * SA logic, and bodyshop card creation match the web version exactly.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

// ─── Constants (exact match with web ReceptionPage) ─────────────────────────────
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

// Exact same select columns as web RECEPTION_ENTRY_SELECT_COLUMNS
const ENTRY_SELECT = [
  'id', 'dealer_code', 'reg_number', 'model', 'service_type',
  'sa_name', 'sa_employee_code', 'sa_display_name', 'jc_number',
  'owner_name', 'owner_phone', 'branch', 'location', 'portal',
  'branch_label', 'km_reading', 'source', 'remark',
  'created_by', 'created_at', 'updated_at',
].join(', ')

// ─── Types (mirrors web ReceptionEntryRow) ────────────────────────────────────
interface ReceptionEntry {
  id: number
  dealer_code: string | null
  reg_number: string
  model: string | null
  service_type: string | null
  sa_name: string | null
  sa_employee_code: string | null
  sa_display_name: string | null
  jc_number: string | null
  owner_name: string | null
  owner_phone: string | null
  branch: string | null
  location: string | null
  portal: string | null
  branch_label: string | null
  km_reading: number | null
  source: string
  remark: string | null
  created_by: string
  created_at: string
  updated_at: string | null
  fuel_type?: string | null  // runtime-enriched, not in DB
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
  service_type: string
  sa_employee_code: string
  owner_name: string
  owner_phone: string
  source: string
  remark: string
}

const EMPTY_FORM: FormState = {
  reg_number: '', km_reading: '', model: '', service_type: '',
  sa_employee_code: '', owner_name: '', owner_phone: '', source: '', remark: '',
}

// ─── Pure helpers — exact same logic as web ──────────────────────────────────
function normalizeServiceType(v: string | null | undefined): string {
  const s = String(v ?? '').trim()
  if (!s || s.toLowerCase() === 'null') return 'Null'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function getServiceTypeAbbr(st: string | null | undefined): string {
  const key = normalizeServiceType(st).toLowerCase()
  return SERVICE_TYPE_ABB[key] ?? (st?.slice(0, 3).toUpperCase() ?? '?')
}

function normalizeDept(v: string | null | undefined): string {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
  if (s === 'BODYSHOP') return 'BODY SHOP'
  return s
}

// Exact web: Accident->BODY SHOP, PDI->PDI, else->SERVICE
function getRequiredDeptForServiceType(st: string | null | undefined): 'SERVICE' | 'BODY SHOP' | 'PDI' {
  const key = normalizeServiceType(st).toLowerCase()
  if (key === 'accident') return 'BODY SHOP'
  if (key === 'pdi') return 'PDI'
  return 'SERVICE'
}

// Exact web: EV if contains EV, else PV
function normFuelBucket(v: string | null | undefined): 'EV' | 'PV' | '' {
  const s = String(v ?? '').trim().toUpperCase()
  if (!s) return ''
  return s.includes('EV') ? 'EV' : 'PV'
}

// Exact web: model contains EV => EV, else PV
function inferFuelFromModel(model: string | null | undefined): 'EV' | 'PV' {
  return String(model ?? '').trim().toUpperCase().includes('EV') ? 'EV' : 'PV'
}

// Exact web: Accident exempt from fuel filter
function shouldApplyFuelFilter(st: string | null | undefined): boolean {
  return normalizeServiceType(st).toLowerCase() !== 'accident'
}

function getLocationLabel(branch: string | null | undefined): string {
  return String(branch ?? '').trim() || 'Unknown'
}

function getFuelTypeLabel(v: string | null | undefined): string {
  const s = String(v ?? '').trim().toUpperCase()
  if (!s) return 'Unknown'
  return s.includes('EV') ? 'EV' : 'PV'
}

// Exact web: derive fuel from portal column, then employee lookup
function getEntryFuelLabel(
  entry: ReceptionEntry,
  empFuelByCode: Map<string, string>,
  empFuelByName: Map<string, string>,
): string {
  const raw = String(entry.portal ?? entry.fuel_type ?? '').trim()
  if (raw) return raw
  const code = String(entry.sa_employee_code ?? '').trim().toUpperCase()
  if (code) { const v = empFuelByCode.get(code); if (v) return v }
  const name = String(entry.sa_name ?? '').trim().toLowerCase()
  if (name) { const v = empFuelByName.get(name); if (v) return v }
  return 'Unknown'
}

// Exact web IST today key
function getTodayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function getEntryDateKey(createdAt: string): string {
  const d = new Date(createdAt)
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

function normalizePhone(v: string | null | undefined): string | null {
  const digits = String(v ?? '').replace(/\D/g, '')
  if (!digits) return null
  return digits.slice(0, 10)
}

function normalizeKm(v: string): number | null {
  const n = parseInt(v, 10)
  if (!isFinite(n) || n < 0) return null
  return Math.trunc(n)
}

// ─── Supabase helpers (mirrors web reception.ts) ──────────────────────────────
async function fetchAllEntries(): Promise<ReceptionEntry[]> {
  const PAGE = 500
  const rows: ReceptionEntry[] = []
  let cursorCreatedAt: string | null = null
  let cursorId: number | null = null

  while (true) {
    let q = supabase
      .from('service_reception_entries')
      .select(ENTRY_SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE)

    if (cursorCreatedAt && cursorId !== null) {
      q = q.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`)
    }

    const { data, error } = await q
    if (error) { console.warn('fetchAllEntries error:', error.message); break }
    const batch = (data ?? []) as ReceptionEntry[]
    rows.push(...batch)
    if (batch.length < PAGE) break
    const last = batch[batch.length - 1]
    cursorCreatedAt = last.created_at ?? null
    cursorId = last.id ?? null
    if (!cursorCreatedAt || cursorId === null) break
  }
  return rows
}

async function getEmployeeNameByCode(code: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('employee_master')
    .select('employee_name')
    .eq('employee_code', code)
    .single()
  if (error || !data) return null
  return String((data as { employee_name?: string }).employee_name ?? '').trim() || null
}

// Exact web enrichEntriesWithEmployeeBranch
async function enrichEntries(entries: ReceptionEntry[]): Promise<ReceptionEntry[]> {
  const needEnrich = entries.filter(e => !e.branch && e.sa_employee_code)
  if (!needEnrich.length) return entries
  const codes = [...new Set(needEnrich.map(e => e.sa_employee_code).filter(Boolean))] as string[]
  const { data: emps } = await supabase
    .from('employee_master')
    .select('employee_code, location, fuel_type')
    .in('employee_code', codes)
  const metaMap = new Map<string, { location: string; fuelType: string }>(
    (emps ?? []).map((emp: { employee_code?: string; location?: string | null; fuel_type?: string | null }) => [
      String(emp.employee_code ?? '').trim().toUpperCase(),
      { location: String(emp.location ?? '').trim(), fuelType: String(emp.fuel_type ?? '').trim() },
    ])
  )
  return entries.map(e => {
    if (!e.sa_employee_code) return e
    const meta = metaMap.get(e.sa_employee_code.trim().toUpperCase())
    if (!meta) return e
    const nextBranch = meta.location || e.branch || null
    const nextFuel = meta.fuelType || e.fuel_type || null
    return { ...e, branch: nextBranch, fuel_type: nextFuel }
  })
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ReceptionScreen() {
  const { user } = useAuth()

  const [entries, setEntries] = useState<ReceptionEntry[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)

  const [listMode, setListMode] = useState<'today' | 'month'>('today')
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [selectedFuelType, setSelectedFuelType] = useState<string>('all')
  const [selectedServiceType, setSelectedServiceType] = useState<string>('all')
  const [search, setSearch] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const [showPicker, setShowPicker] = useState<'model' | 'service_type' | 'source' | 'sa' | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadAll = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    const [entriesRaw, empRes, modelsRes] = await Promise.all([
      fetchAllEntries(),
      supabase
        .from('employee_master')
        .select('employee_code,employee_name,department,fuel_type,role')
        .order('employee_name'),
      supabase.from('settings_model_options').select('model_name').eq('is_active', true).order('sort_order', { ascending: true }).order('model_name', { ascending: true }),
    ])
    const enriched = await enrichEntries(entriesRaw)
    setEntries(enriched)

    // Exact web: only SA and SSA roles
    const allowedRoles = new Set(['sa', 'ssa', 'service advisor', 'service_advisor'])
    const empData = (empRes.data ?? []) as Employee[]
    setEmployees(empData.filter(e =>
      allowedRoles.has(String(e.role ?? '').trim().toLowerCase()) &&
      String(e.employee_code ?? '').trim().length > 0
    ))

    if (modelsRes.data && modelsRes.data.length > 0)
      setModelOptions([...new Set((modelsRes.data as { model_name: string }[]).map(r => String(r.model_name ?? '').trim()).filter(Boolean))])

    setLoading(false)
    setRefreshing(false)
  }, [])

  useFocusEffect(useCallback(() => { void loadAll() }, [loadAll]))

  // ── Derived state ─────────────────────────────────────────────────────────
  const todayKey = useMemo(() => getTodayKey(), [])
  const todayEntries = useMemo(() =>
    entries.filter(e => getEntryDateKey(e.created_at) === todayKey), [entries, todayKey])
  const baseEntries = useMemo(() =>
    listMode === 'today' ? todayEntries : entries, [listMode, todayEntries, entries])

  const empFuelByCode = useMemo(() =>
    new Map(employees.map(e => [String(e.employee_code ?? '').trim().toUpperCase(), getFuelTypeLabel(e.fuel_type)])),
    [employees])
  const empFuelByName = useMemo(() =>
    new Map(employees.map(e => [String(e.employee_name ?? '').trim().toLowerCase(), getFuelTypeLabel(e.fuel_type)])),
    [employees])

  const locationOptions = useMemo(() => {
    const vals = [...new Set(baseEntries.map(e => getLocationLabel(e.branch)))]
    return vals.sort((a, b) => a.localeCompare(b))
  }, [baseEntries])

  const locFiltered = useMemo(() =>
    selectedLocation === 'all' ? baseEntries
      : baseEntries.filter(e => getLocationLabel(e.branch) === selectedLocation),
    [baseEntries, selectedLocation])

  const fuelTypeOptions = useMemo(() => {
    const vals = [...new Set(locFiltered.map(e => getEntryFuelLabel(e, empFuelByCode, empFuelByName)))]
    return vals.sort((a, b) => a.localeCompare(b))
  }, [locFiltered, empFuelByCode, empFuelByName])

  const fuelFiltered = useMemo(() =>
    selectedFuelType === 'all' ? locFiltered
      : locFiltered.filter(e => getEntryFuelLabel(e, empFuelByCode, empFuelByName) === selectedFuelType),
    [locFiltered, selectedFuelType, empFuelByCode, empFuelByName])

  const serviceTypeCounts = useMemo(() => {
    const m = new Map<string, number>()
    fuelFiltered.forEach(e => {
      const label = normalizeServiceType(e.service_type)
      m.set(label, (m.get(label) ?? 0) + 1)
    })
    return m
  }, [fuelFiltered])

  const stFiltered = useMemo(() =>
    selectedServiceType === 'all' ? fuelFiltered
      : fuelFiltered.filter(e => normalizeServiceType(e.service_type) === selectedServiceType),
    [fuelFiltered, selectedServiceType])

  const displayEntries = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return stFiltered
    return stFiltered.filter(e =>
      (e.reg_number ?? '').toLowerCase().includes(q) ||
      (e.model ?? '').toLowerCase().includes(q) ||
      (e.sa_name ?? '').toLowerCase().includes(q) ||
      (e.sa_display_name ?? '').toLowerCase().includes(q) ||
      (e.jc_number ?? '').toLowerCase().includes(q) ||
      (e.owner_name ?? '').toLowerCase().includes(q)
    )
  }, [stFiltered, search])

  // ── SA dropdown — exact web business rules ────────────────────────────────
  const filteredSAs = useMemo(() => {
    const reqDept = getRequiredDeptForServiceType(form.service_type)
    const useFuel = shouldApplyFuelFilter(form.service_type)
    const reqFuel = inferFuelFromModel(form.model)
    const hasServiceType = !!form.service_type.trim()
    return employees
      .filter(e => {
        if (!hasServiceType) return true  // show all SAs when no service type chosen yet
        const dept = normalizeDept(e.department)
        if (dept !== reqDept) return false
        if (!useFuel) return true  // Accident: show all BODY SHOP, no fuel filter
        return normFuelBucket(e.fuel_type) === reqFuel
      })
      .sort((a, b) => a.employee_name.localeCompare(b.employee_name))
  }, [employees, form.model, form.service_type])

  // Clear SA if no longer valid after service_type/model change (exact web behavior)
  useEffect(() => {
    if (!form.sa_employee_code || !form.service_type) return
    const code = form.sa_employee_code.trim().toUpperCase()
    const valid = filteredSAs.some(e => e.employee_code.trim().toUpperCase() === code)
    if (!valid) setForm(p => ({ ...p, sa_employee_code: '' }))
  }, [form.sa_employee_code, form.service_type, filteredSAs])

  // ── Form actions ──────────────────────────────────────────────────────────
  function openAdd() {
    setForm(EMPTY_FORM); setEditingId(null); setFormError(null); setShowModal(true)
  }

  function openEdit(entry: ReceptionEntry) {
    setForm({
      reg_number:       entry.reg_number ?? '',
      km_reading:       entry.km_reading != null ? String(entry.km_reading) : '',
      model:            entry.model ?? '',
      service_type:     entry.service_type ?? '',
      sa_employee_code: entry.sa_employee_code ?? '',
      owner_name:       entry.owner_name ?? '',
      owner_phone:      entry.owner_phone ?? '',
      source:           entry.source ?? '',
      remark:           entry.remark ?? '',
    })
    setEditingId(entry.id); setFormError(null); setShowModal(true)
  }

  // ── Save — exact web validation + payload + bodyshop card logic ───────────
  async function handleSave() {
    setFormError(null)

    // Exact web required-field check
    if (!form.reg_number.trim() || !form.model.trim() || !form.sa_employee_code.trim() ||
        !form.owner_name.trim() || !form.owner_phone.trim() || !form.source.trim()) {
      setFormError('Please fill all required fields: Registration No, Model, SA Name, Owner Name, Owner Phone, Source')
      return
    }
    if (form.reg_number.trim().length > 10) {
      setFormError('Registration number must be 10 characters or less')
      return
    }
    if (form.owner_phone.replace(/\D/g, '').length !== 10) {
      setFormError('Owner phone must be exactly 10 digits')
      return
    }

    setSaving(true)

    // Exact web normalizePayload
    const payload = {
      reg_number:       form.reg_number.trim().toUpperCase(),
      model:            form.model.trim() || null,
      service_type:     form.service_type.trim() || null,
      sa_employee_code: form.sa_employee_code.trim().toUpperCase(),
      owner_name:       form.owner_name.trim() || null,
      owner_phone:      normalizePhone(form.owner_phone),
      km_reading:       normalizeKm(form.km_reading),
      source:           form.source.trim(),
      branch:           null as string | null,
      remark:           form.remark.trim() || null,
    }

    // Exact web: resolve sa_name from employee_master
    const saName = await getEmployeeNameByCode(payload.sa_employee_code)
    if (!saName) {
      setFormError(`Employee code '${payload.sa_employee_code}' not found`)
      setSaving(false)
      return
    }

    let resultData: ReceptionEntry | null = null
    let resultError: string | null = null

    if (editingId === null) {
      const { data, error } = await supabase
        .from('service_reception_entries')
        .insert({ ...payload, sa_name: saName, sa_display_name: saName })
        .select(ENTRY_SELECT)
        .single()
      resultData = data as ReceptionEntry | null
      resultError = error?.message ?? null
    } else {
      const { data, error } = await supabase
        .from('service_reception_entries')
        .update({ ...payload, sa_name: saName, sa_display_name: saName })
        .eq('id', editingId)
        .select(ENTRY_SELECT)
        .single()
      resultData = data as ReceptionEntry | null
      resultError = error?.message ?? null
    }

    setSaving(false)

    if (resultError) { setFormError(resultError); return }

    // ── Exact web: auto-create bodyshop_repair_card for Accident ─────────────
    if (editingId === null && form.service_type === 'Accident' && resultData) {
      const entry = resultData
      const jcNo = String(entry.jc_number ?? '').trim().toUpperCase()
      const receptionEntryId = Number(entry.id)
      let existingCard: { id: number } | null = null

      if (isFinite(receptionEntryId)) {
        const { data: byRec } = await supabase
          .from('bodyshop_repair_cards')
          .select('id')
          .eq('reception_entry_id', receptionEntryId)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
        existingCard = ((byRec ?? []) as { id: number }[])[0] ?? null
      }

      if (!existingCard && jcNo) {
        const { data: byJc } = await supabase
          .from('bodyshop_repair_cards')
          .select('id')
          .eq('job_card_no', jcNo)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
        existingCard = ((byJc ?? []) as { id: number }[])[0] ?? null
      }

      if (!existingCard) {
        await supabase.from('bodyshop_repair_cards').insert({
          reception_entry_id: isFinite(receptionEntryId) ? receptionEntryId : null,
          job_card_no:        jcNo || '',
          reg_number:         form.reg_number.trim().toUpperCase(),
          customer_name:      form.owner_name.trim() || null,
          customer_phone:     normalizePhone(form.owner_phone),
          customer_type:      null,
          branch:             entry.branch ?? null,
          sa_name:            saName,
          current_stage:      1,
          current_stage_name: 'Vehicle Receiving',
          overall_status:     'active',
          received_at:        new Date().toISOString(),
        })
      }
    }

    setShowModal(false)
    setForm(EMPTY_FORM)
    setEditingId(null)
    Alert.alert('Success', editingId === null ? 'Entry created successfully' : 'Entry updated successfully')
    await loadAll()
  }

  async function handleDelete(id: number) {
    Alert.alert('Delete Entry', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('service_reception_entries').delete().eq('id', id)
        if (error) { Alert.alert('Error', error.message); return }
        await loadAll()
      }},
    ])
  }

  // ── Picker helpers ────────────────────────────────────────────────────────
  function pickerItems(): string[] {
    const q = pickerSearch.toLowerCase()
    if (showPicker === 'model') return modelOptions.filter(m => m.toLowerCase().includes(q))
    if (showPicker === 'service_type') return RECEPTION_SERVICE_TYPE_OPTIONS.filter(s => s.toLowerCase().includes(q))
    if (showPicker === 'source') return SOURCE_OPTIONS.filter(s => s.toLowerCase().includes(q))
    if (showPicker === 'sa') return filteredSAs
      .filter(e => e.employee_name.toLowerCase().includes(q))
      .map(e => e.employee_code)
    return []
  }

  function pickerLabel(item: string): string {
    if (showPicker === 'sa') {
      const emp = employees.find(e => e.employee_code === item)
      return emp
        ? `${emp.employee_name}  ·  ${getFuelTypeLabel(emp.fuel_type)}  ·  ${normalizeDept(emp.department)}`
        : item
    }
    return item
  }

  function onPickerSelect(item: string) {
    if (showPicker === 'model') setForm(p => ({ ...p, model: item }))
    else if (showPicker === 'service_type') setForm(p => ({ ...p, service_type: item }))
    else if (showPicker === 'source') setForm(p => ({ ...p, source: item }))
    else if (showPicker === 'sa') setForm(p => ({ ...p, sa_employee_code: item }))
    setShowPicker(null); setPickerSearch('')
  }

  function getFormSALabel(): string {
    if (!form.sa_employee_code) return ''
    const emp = employees.find(e =>
      e.employee_code.trim().toUpperCase() === form.sa_employee_code.trim().toUpperCase()
    )
    return emp ? emp.employee_name : form.sa_employee_code
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  const s = styles

  function EntryCard({ entry }: { entry: ReceptionEntry }) {
    const abbr = getServiceTypeAbbr(entry.service_type)
    const col = ST_COLOR[abbr] ?? ST_COLOR['NULL']
    const fuelLabel = getEntryFuelLabel(entry, empFuelByCode, empFuelByName)
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.regNo}>{entry.reg_number}</Text>
          <View style={[s.stChip, { backgroundColor: col.bg }]}>
            <Text style={[s.stChipText, { color: col.text }]}>{abbr}</Text>
          </View>
        </View>
        <View style={s.cardRow}>
          <Text style={s.cardLabel}>Model</Text>
          <Text style={s.cardValue}>{entry.model ?? '—'}</Text>
          <Text style={[s.cardLabel, { marginLeft: 12 }]}>Fuel</Text>
          <Text style={s.cardValue}>{fuelLabel}</Text>
        </View>
        <View style={s.cardRow}>
          <Text style={s.cardLabel}>SA</Text>
          <Text style={s.cardValue}>{entry.sa_display_name ?? entry.sa_name ?? '—'}</Text>
        </View>
        <View style={s.cardRow}>
          <Text style={s.cardLabel}>Owner</Text>
          <Text style={s.cardValue}>{entry.owner_name ?? '—'}</Text>
          {entry.owner_phone ? (
            <><Text style={[s.cardLabel, { marginLeft: 8 }]}>Ph</Text>
            <Text style={s.cardValue}>{entry.owner_phone}</Text></>
          ) : null}
        </View>
        <View style={s.cardRow}>
          <Text style={s.cardLabel}>JC</Text>
          <Text style={s.cardValue}>{entry.jc_number ?? '—'}</Text>
        </View>
        <View style={s.cardRow}>
          <Text style={s.cardLabel}>Source</Text>
          <Text style={s.cardValue}>{entry.source}</Text>
          {entry.km_reading != null ? (
            <><Text style={[s.cardLabel, { marginLeft: 12 }]}>KM</Text>
            <Text style={s.cardValue}>{entry.km_reading.toLocaleString()}</Text></>
          ) : null}
        </View>
        {entry.remark ? (
          <View style={s.cardRow}>
            <Text style={s.cardLabel}>Remark</Text>
            <Text style={s.cardValue}>{entry.remark}</Text>
          </View>
        ) : null}
        <View style={s.cardActions}>
          <TouchableOpacity style={s.editBtn} onPress={() => openEdit(entry)}>
            <Text style={s.editBtnText}>✏️  Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.delBtn} onPress={() => handleDelete(entry.id)}>
            <Text style={s.delBtnText}>🗑️  Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={s.root}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>🏢 Reception</Text>
          <Text style={s.headerSub}>{displayEntries.length} records · {listMode === 'today' ? 'Today' : 'This Month'}</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openAdd}>
          <Text style={s.addBtnText}>+ New Entry</Text>
        </TouchableOpacity>
      </View>

      {/* Today / Month toggle */}
      <View style={s.toggleRow}>
        {(['today', 'month'] as const).map(m => (
          <TouchableOpacity key={m} style={[s.toggleBtn, listMode === m && s.toggleBtnActive]} onPress={() => setListMode(m)}>
            <Text style={[s.toggleBtnText, listMode === m && s.toggleBtnTextActive]}>
              {m === 'today' ? `Today (${todayEntries.length})` : `This Month (${entries.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <TextInput style={s.searchInput}
          placeholder="🔍 Search reg / name / model / SA / JC..."
          placeholderTextColor="#94a3b8"
          value={search} onChangeText={setSearch} clearButtonMode="while-editing"
        />
      </View>

      {/* Location filter */}
      {locationOptions.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
          {['all', ...locationOptions].map(loc => (
            <TouchableOpacity key={loc} style={[s.chip, selectedLocation === loc && s.chipActive]} onPress={() => setSelectedLocation(loc)}>
              <Text style={[s.chipText, selectedLocation === loc && s.chipTextActive]}>
                {loc === 'all' ? `All (${baseEntries.length})` : loc}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Fuel filter */}
      {fuelTypeOptions.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
          {['all', ...fuelTypeOptions].map(ft => (
            <TouchableOpacity key={ft} style={[s.chip, selectedFuelType === ft && s.chipActive]} onPress={() => setSelectedFuelType(ft)}>
              <Text style={[s.chipText, selectedFuelType === ft && s.chipTextActive]}>
                {ft === 'all' ? `All (${locFiltered.length})` : ft}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Service type filter */}
      {serviceTypeCounts.size > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
          <TouchableOpacity style={[s.chip, selectedServiceType === 'all' && s.chipActive]} onPress={() => setSelectedServiceType('all')}>
            <Text style={[s.chipText, selectedServiceType === 'all' && s.chipTextActive]}>All ({fuelFiltered.length})</Text>
          </TouchableOpacity>
          {[...serviceTypeCounts.entries()].map(([st, cnt]) => {
            const abbr = getServiceTypeAbbr(st)
            const col = ST_COLOR[abbr] ?? ST_COLOR['NULL']
            const active = selectedServiceType === st
            return (
              <TouchableOpacity key={st} style={[s.chip, active && { backgroundColor: col.bg, borderColor: col.text }]} onPress={() => setSelectedServiceType(st)}>
                <Text style={[s.chipText, active && { color: col.text }]}>{abbr} ({cnt})</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {/* List */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2563eb" />
      ) : (
        <FlatList
          data={displayEntries}
          keyExtractor={e => String(e.id)}
          renderItem={({ item }) => <EntryCard entry={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(true) }} />}
          contentContainerStyle={{ padding: 12, paddingBottom: 80, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🏁</Text>
              <Text style={s.emptyTitle}>No entries found</Text>
              <Text style={s.emptySub}>Pull to refresh or add a new entry</Text>
              <TouchableOpacity style={[s.addBtn, { marginTop: 16 }]} onPress={openAdd}>
                <Text style={s.addBtnText}>+ Add Entry</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* ── Add / Edit Modal ──────────────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>{editingId ? 'Edit Entry' : 'New Reception Entry'}</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Text style={{ fontSize: 24, color: '#64748b' }}>✕</Text>
                </TouchableOpacity>
              </View>

              {formError && <View style={s.errorBox}><Text style={s.errorText}>⚠️  {formError}</Text></View>}

              {form.service_type === 'Accident' && (
                <View style={s.warningBox}>
                  <Text style={s.warningText}>⚠️  Accident — will appear in Bodyshop Repair Tracker</Text>
                </View>
              )}

              <FormField label="Registration No *">
                <TextInput style={s.input}
                  placeholder="e.g. RJ14AB1234"
                  placeholderTextColor="#94a3b8"
                  value={form.reg_number}
                  maxLength={10}
                  autoCapitalize="characters"
                  onChangeText={t => setForm(p => ({ ...p, reg_number: t.toUpperCase() }))}
                />
              </FormField>

              <FormField label="Model *">
                <TouchableOpacity style={s.select} onPress={() => { setShowPicker('model'); setPickerSearch('') }}>
                  <Text style={form.model ? s.selectText : s.selectPlaceholder}>{form.model || 'Select model'}</Text>
                  <Text style={s.chevron}>▼</Text>
                </TouchableOpacity>
              </FormField>

              <FormField label="Service Type">
                <TouchableOpacity style={s.select} onPress={() => { setShowPicker('service_type'); setPickerSearch('') }}>
                  <Text style={form.service_type ? s.selectText : s.selectPlaceholder}>{form.service_type || 'Select service type'}</Text>
                  <Text style={s.chevron}>▼</Text>
                </TouchableOpacity>
              </FormField>

              <FormField label={`SA Name *  (${filteredSAs.length} available)`}>
                <TouchableOpacity style={s.select} onPress={() => { setShowPicker('sa'); setPickerSearch('') }}>
                  <Text style={form.sa_employee_code ? s.selectText : s.selectPlaceholder}>{getFormSALabel() || 'Select SA'}</Text>
                  <Text style={s.chevron}>▼</Text>
                </TouchableOpacity>
              </FormField>

              <FormField label="Owner Name *">
                <TextInput style={s.input}
                  placeholder="Customer name"
                  placeholderTextColor="#94a3b8"
                  value={form.owner_name}
                  onChangeText={t => setForm(p => ({ ...p, owner_name: t }))}
                />
              </FormField>

              <FormField label="Owner Phone *">
                <TextInput style={s.input}
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#94a3b8"
                  value={form.owner_phone}
                  keyboardType="phone-pad"
                  maxLength={10}
                  onChangeText={t => setForm(p => ({ ...p, owner_phone: t.replace(/\D/g, '') }))}
                />
              </FormField>

              <FormField label="Source *">
                <TouchableOpacity style={s.select} onPress={() => { setShowPicker('source'); setPickerSearch('') }}>
                  <Text style={form.source ? s.selectText : s.selectPlaceholder}>{form.source || 'Select source'}</Text>
                  <Text style={s.chevron}>▼</Text>
                </TouchableOpacity>
              </FormField>

              <FormField label="KM Reading">
                <TextInput style={s.input}
                  placeholder="e.g. 12500"
                  placeholderTextColor="#94a3b8"
                  value={form.km_reading}
                  keyboardType="number-pad"
                  onChangeText={t => setForm(p => ({ ...p, km_reading: t.replace(/\D/g, '') }))}
                />
              </FormField>

              <FormField label="Remark">
                <TextInput style={[s.input, { height: 72, textAlignVertical: 'top' }]}
                  placeholder="Optional note"
                  placeholderTextColor="#94a3b8"
                  value={form.remark}
                  multiline
                  onChangeText={t => setForm(p => ({ ...p, remark: t }))}
                />
              </FormField>

              <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.saveBtnText}>{editingId ? 'Update Entry' : 'Create Entry'}</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Picker Modal ─────────────────────────────────────────────────── */}
      <Modal visible={showPicker !== null} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#e2e8f0' }}>
            <TextInput
              style={{ flex: 1, fontSize: 15, backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
              placeholder="Search..."
              placeholderTextColor="#94a3b8"
              value={pickerSearch}
              onChangeText={setPickerSearch}
              autoFocus
            />
            <TouchableOpacity onPress={() => { setShowPicker(null); setPickerSearch('') }} style={{ marginLeft: 12 }}>
              <Text style={{ fontSize: 16, color: '#2563eb', fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={pickerItems()}
            keyExtractor={item => item}
            renderItem={({ item }) => (
              <TouchableOpacity style={{ padding: 16, borderBottomWidth: 1, borderColor: '#f1f5f9' }} onPress={() => onPickerSelect(item)}>
                <Text style={{ fontSize: 15, color: '#1e293b' }}>{pickerLabel(item)}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#94a3b8', marginTop: 40 }}>No options found</Text>}
          />
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  )
}

// ── Layout helper ─────────────────────────────────────────────────────────────
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 4 }}>{label}</Text>
      {children}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  root:               { flex: 1, backgroundColor: '#f8fafc' } as const,
  header:             { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  headerTitle:        { fontSize: 18, fontWeight: '700' as const, color: '#1e293b' },
  headerSub:          { fontSize: 12, color: '#64748b', marginTop: 2 },
  addBtn:             { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText:         { color: '#fff', fontWeight: '700' as const, fontSize: 14 },
  toggleRow:          { flexDirection: 'row' as const, padding: 10, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  toggleBtn:          { borderRadius: 6, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#f1f5f9' },
  toggleBtnActive:    { backgroundColor: '#2563eb' },
  toggleBtnText:      { fontSize: 13, fontWeight: '600' as const, color: '#64748b' },
  toggleBtnTextActive:{ color: '#fff' },
  searchRow:          { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  searchInput:        { backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#1e293b' },
  filterRow:          { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#f1f5f9', maxHeight: 44 },
  chip:               { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', marginRight: 6, alignSelf: 'center' as const },
  chipActive:         { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  chipText:           { fontSize: 12, fontWeight: '600' as const, color: '#64748b' },
  chipTextActive:     { color: '#2563eb' },
  card:               { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardHeader:         { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 8 },
  regNo:              { fontSize: 16, fontWeight: '800' as const, color: '#1e293b', letterSpacing: 0.5 },
  stChip:             { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  stChipText:         { fontSize: 11, fontWeight: '700' as const },
  cardRow:            { flexDirection: 'row' as const, flexWrap: 'wrap' as const, marginBottom: 4 },
  cardLabel:          { fontSize: 11, color: '#94a3b8', marginRight: 4, minWidth: 36 },
  cardValue:          { fontSize: 12, color: '#334155', fontWeight: '500' as const, marginRight: 4 },
  cardActions:        { flexDirection: 'row' as const, marginTop: 10, gap: 8 },
  editBtn:            { flex: 1, backgroundColor: '#eff6ff', borderRadius: 6, paddingVertical: 8, alignItems: 'center' as const },
  editBtnText:        { fontSize: 13, fontWeight: '600' as const, color: '#2563eb' },
  delBtn:             { flex: 1, backgroundColor: '#fef2f2', borderRadius: 6, paddingVertical: 8, alignItems: 'center' as const },
  delBtnText:         { fontSize: 13, fontWeight: '600' as const, color: '#dc2626' },
  empty:              { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingTop: 60 },
  emptyIcon:          { fontSize: 48, marginBottom: 12 },
  emptyTitle:         { fontSize: 16, fontWeight: '700' as const, color: '#1e293b' },
  emptySub:           { fontSize: 13, color: '#94a3b8', marginTop: 4 },
  modalHeader:        { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 16 },
  modalTitle:         { fontSize: 18, fontWeight: '700' as const, color: '#1e293b' },
  errorBox:           { backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 12 },
  errorText:          { color: '#dc2626', fontSize: 13 },
  warningBox:         { backgroundColor: '#fff7ed', borderRadius: 8, padding: 10, marginBottom: 12 },
  warningText:        { color: '#c2410c', fontSize: 13 },
  input:              { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1e293b' },
  select:             { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  selectText:         { fontSize: 14, color: '#1e293b' },
  selectPlaceholder:  { fontSize: 14, color: '#94a3b8' },
  chevron:            { fontSize: 10, color: '#94a3b8' },
  saveBtn:            { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center' as const, marginTop: 8 },
  saveBtnText:        { color: '#fff', fontWeight: '700' as const, fontSize: 16 },
}
