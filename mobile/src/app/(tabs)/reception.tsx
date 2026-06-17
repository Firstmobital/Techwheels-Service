/**
 * mobile/src/app/(tabs)/reception.tsx
 * Mobile mirror of the web ReceptionPage
 * Read-only list + today stats + Add Entry form
 */
import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, FlatList,
  Alert, KeyboardAvoidingView, Platform,
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
  'updation': 'UPD',
}

const ST_COLOR: Record<string, { bg: string; text: string }> = {
  'RR':  { bg: '#eff6ff', text: '#2563eb' }, 'FFS': { bg: '#f0fdf4', text: '#16a34a' },
  'SFS': { bg: '#f0fdf4', text: '#15803d' }, 'TFS': { bg: '#dcfce7', text: '#14532d' },
  'PS':  { bg: '#faf5ff', text: '#7c3aed' }, 'ACC': { bg: '#fef2f2', text: '#dc2626' },
  'RST': { bg: '#fff7ed', text: '#c2410c' }, 'PDI': { bg: '#f0f9ff', text: '#0284c7' },
  'CMP': { bg: '#fffbeb', text: '#b45309' }, 'EBD': { bg: '#fdf4ff', text: '#a21caf' },
  'UPD': { bg: '#f8fafc', text: '#475569' },
}

const DEFAULT_MODELS = [
  'Nexon', 'Nexon EV', 'Punch', 'Punch CNG', 'Punch EV', 'Tiago', 'Tiago EV',
  'Tigor', 'Tigor EV', 'Altroz', 'Harrier', 'Harrier EV', 'Safari',
  'Curvv', 'Curvv EV', 'Hexa', 'Sierra', 'Xpres T Ev',
]

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
  created_at: string
}

interface Employee {
  employee_code: string
  employee_name: string
  department: string | null
  fuel_type: string | null
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

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
}

function inferFuelType(model: string): 'EV' | 'PV' {
  return /EV/i.test(model) ? 'EV' : 'PV'
}

function getRequiredDept(serviceType: string): string {
  const st = serviceType.toLowerCase().trim()
  if (st === 'accident' || st === 'rusting') return 'BODY SHOP'
  if (st === 'pdi') return 'PDI'
  return 'SERVICE'
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

  // Filters
  const [search, setSearch] = useState('')
  const [filterST, setFilterST] = useState('all')
  const [listMode, setListMode] = useState<'today' | 'all'>('today')

  // Form modal
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

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

    const today = toISTDate(new Date())
    const monthStart = today.slice(0, 8) + '01'

    const [entriesRes, empRes, modelsRes] = await Promise.all([
      supabase.from('service_reception_entries')
        .select('id,reg_number,jc_number,model,service_type,sa_name,sa_display_name,sa_employee_code,owner_name,owner_phone,source,branch,fuel_type,km_reading,created_at')
        .gte('created_at', `${monthStart}T00:00:00+05:30`)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('employees')
        .select('employee_code,employee_name,department,fuel_type')
        .eq('is_active', true)
        .order('employee_name'),
      supabase.from('settings_models').select('model_name').order('model_name'),
    ])

    if (entriesRes.error) setError(entriesRes.error.message)
    else setEntries((entriesRes.data ?? []) as ReceptionEntry[])

    if (empRes.data) setEmployees(empRes.data as Employee[])

    if (modelsRes.data && modelsRes.data.length > 0) {
      setModelOptions(modelsRes.data.map((r: any) => r.model_name).filter(Boolean))
    }

    setLoading(false); setRefreshing(false)
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const todayStr = useMemo(() => toISTDate(new Date()), [])

  const todayEntries = useMemo(() =>
    entries.filter(e => toISTDate(new Date(e.created_at)) === todayStr),
    [entries, todayStr])

  const baseEntries = listMode === 'today' ? todayEntries : entries

  const filtered = useMemo(() => {
    let rows = baseEntries
    if (filterST !== 'all') rows = rows.filter(e => abbr(e.service_type) === filterST)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(e =>
        (e.reg_number ?? '').toLowerCase().includes(q) ||
        (e.jc_number ?? '').toLowerCase().includes(q) ||
        (e.owner_name ?? '').toLowerCase().includes(q) ||
        (e.sa_name ?? '').toLowerCase().includes(q) ||
        (e.model ?? '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [baseEntries, filterST, search])

  // Stats for today
  const stats = useMemo(() => {
    const counts: Record<string, number> = {}
    todayEntries.forEach(e => {
      const k = abbr(e.service_type)
      counts[k] = (counts[k] ?? 0) + 1
    })
    return counts
  }, [todayEntries])

  // Filtered SA options based on form
  const filteredSAs = useMemo(() => {
    const reqDept = form.service_type ? getRequiredDept(form.service_type) : 'SERVICE'
    const reqFuel = form.model ? inferFuelType(form.model) : null
    const useBodyShop = reqDept === 'BODY SHOP'

    return employees.filter(e => {
      const dept = (e.department ?? '').toUpperCase().replace('BODYSHOP', 'BODY SHOP').trim()
      if (dept !== reqDept) return false
      if (useBodyShop) return true // Accident: no fuel filter
      if (!reqFuel) return true
      const ef = (e.fuel_type ?? '').trim().toUpperCase()
      return ef === reqFuel || ef === 'PV' && reqFuel === 'PV' || ef === 'EV' && reqFuel === 'EV'
    }).filter(e => {
      if (!saSearch.trim()) return true
      const q = saSearch.toLowerCase()
      return e.employee_name.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q)
    })
  }, [employees, form.service_type, form.model, saSearch])

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.reg_number.trim()) { Alert.alert('Required', 'Registration number is required'); return }
    if (!form.sa_employee_code.trim()) { Alert.alert('Required', 'Select a Service Advisor'); return }

    setSaving(true)
    const sa = employees.find(e => e.employee_code === form.sa_employee_code)
    const payload = {
      reg_number: form.reg_number.trim().toUpperCase(),
      km_reading: form.km_reading ? parseInt(form.km_reading) : null,
      model: form.model || null,
      sa_employee_code: form.sa_employee_code,
      sa_name: sa?.employee_name ?? null,
      owner_name: form.owner_name || null,
      owner_phone: form.owner_phone || null,
      source: form.source,
      service_type: form.service_type || null,
    }

    let result
    if (editingId) {
      result = await supabase.from('service_reception_entries').update(payload).eq('id', editingId)
    } else {
      result = await supabase.from('service_reception_entries').insert([payload])
    }

    if (result.error) {
      Alert.alert('Error', result.error.message)
    } else {
      setShowForm(false)
      setForm(EMPTY_FORM)
      setEditingId(null)
      void loadAll()
    }
    setSaving(false)
  }

  function openNew() {
    setForm(EMPTY_FORM); setEditingId(null); setShowForm(true)
  }

  function openEdit(entry: ReceptionEntry) {
    setForm({
      reg_number: entry.reg_number ?? '',
      km_reading: entry.km_reading ? String(entry.km_reading) : '',
      model: entry.model ?? '',
      sa_employee_code: entry.sa_employee_code ?? '',
      owner_name: entry.owner_name ?? '',
      owner_phone: entry.owner_phone ?? '',
      source: entry.source ?? SOURCE_OPTIONS[0],
      service_type: entry.service_type ?? '',
    })
    setEditingId(entry.id)
    setShowForm(true)
  }

  // ── UI helpers ───────────────────────────────────────────────────────────────
  const filteredModels = useMemo(() =>
    modelOptions.filter(m => !modelSearch || m.toLowerCase().includes(modelSearch.toLowerCase())),
    [modelOptions, modelSearch])

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['top']}>

      {/* ── Header ── */}
      <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#1e293b' }}>🏁 Reception</Text>
            <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>Today's entries & vehicle intake</Text>
          </View>
          <TouchableOpacity onPress={openNew}
            style={{ backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>＋ Add</Text>
          </TouchableOpacity>
        </View>

        {/* Toggle today / month */}
        <View style={{ flexDirection: 'row', marginTop: 10, backgroundColor: '#f1f5f9', borderRadius: 8, padding: 3 }}>
          {(['today', 'all'] as const).map(m => (
            <TouchableOpacity key={m} onPress={() => setListMode(m)} style={{ flex: 1, borderRadius: 6, paddingVertical: 5, backgroundColor: listMode === m ? '#fff' : 'transparent', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: listMode === m ? '700' : '500', color: listMode === m ? '#1e293b' : '#64748b' }}>
                {m === 'today' ? `Today (${todayEntries.length})` : `This Month (${entries.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Stats chips ── */}
      {Object.keys(stats).length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row' }}>
          <TouchableOpacity onPress={() => setFilterST('all')}
            style={{ backgroundColor: filterST === 'all' ? '#1e293b' : '#f1f5f9', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: filterST === 'all' ? '#1e293b' : '#e2e8f0' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: filterST === 'all' ? '#fff' : '#64748b' }}>All {todayEntries.length}</Text>
          </TouchableOpacity>
          {Object.entries(stats).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
            const c = ST_COLOR[k] ?? { bg: '#f1f5f9', text: '#64748b' }
            const active = filterST === k
            return (
              <TouchableOpacity key={k} onPress={() => setFilterST(active ? 'all' : k)}
                style={{ backgroundColor: active ? c.text : c.bg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: c.text + '40' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : c.text }}>{k} {v}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {/* ── Search ── */}
      <View style={{ paddingHorizontal: 12, paddingBottom: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
        <TextInput
          placeholder="🔍 Search reg / name / JC…"
          value={search} onChangeText={setSearch}
          style={{ backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderWidth: 1, borderColor: '#e2e8f0', color: '#1e293b' }}
          placeholderTextColor="#94a3b8"
        />
      </View>

      {error && (
        <View style={{ backgroundColor: '#fef2f2', padding: 10, margin: 12, borderRadius: 8 }}>
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
              <TouchableOpacity onPress={openNew} style={{ marginTop: 16, backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>＋ Add Entry</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item: e }) => {
            const c = stColor(e.service_type)
            return (
              <TouchableOpacity onPress={() => openEdit(e)} activeOpacity={0.85}
                style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  {/* Service type badge */}
                  <View style={{ backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 10, minWidth: 40, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: c.text }}>{abbr(e.service_type)}</Text>
                  </View>

                  {/* Main info */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontWeight: '800', fontSize: 15, color: '#1e293b', letterSpacing: 0.5 }}>{e.reg_number}</Text>
                      {e.jc_number && (
                        <View style={{ backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, color: '#16a34a', fontWeight: '700' }}>✓ {e.jc_number}</Text>
                        </View>
                      )}
                    </View>

                    {e.model && <Text style={{ fontSize: 13, color: '#475569', marginTop: 1 }}>{e.model}</Text>}

                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                      {(e.sa_display_name || e.sa_name) && (
                        <Text style={{ fontSize: 12, color: '#64748b' }}>👤 {e.sa_display_name || e.sa_name}</Text>
                      )}
                      {e.source && (
                        <Text style={{ fontSize: 12, color: '#64748b' }}>
                          {e.source === 'Walk-in' ? '🚶' : e.source === 'Self' ? '🙋' : e.source === 'Driver Pickup' ? '🚗' : '📞'} {e.source}
                        </Text>
                      )}
                    </View>

                    {e.owner_name && <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{e.owner_name}{e.owner_phone ? ` · ${e.owner_phone}` : ''}</Text>}
                  </View>

                  {/* Time */}
                  <Text style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{fmtTime(e.created_at)}</Text>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}

      {/* ══ ADD / EDIT FORM MODAL ══ */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>

            {/* Modal Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
              <TouchableOpacity onPress={() => { setShowForm(false); setForm(EMPTY_FORM); setEditingId(null) }}>
                <Text style={{ color: '#64748b', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#1e293b' }}>
                {editingId ? 'Edit Entry' : '➕ New Entry'}
              </Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}
                style={{ backgroundColor: saving ? '#93c5fd' : '#2563eb', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{saving ? '…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">

              {/* Reg Number */}
              <FormField label="Registration Number *">
                <TextInput
                  style={tfStyle} placeholder="e.g. RJ14XX1234" placeholderTextColor="#94a3b8"
                  value={form.reg_number} autoCapitalize="characters"
                  onChangeText={t => setForm(p => ({ ...p, reg_number: t.toUpperCase() }))}
                />
              </FormField>

              {/* KM Reading */}
              <FormField label="KM Reading">
                <TextInput
                  style={tfStyle} placeholder="Current odometer" placeholderTextColor="#94a3b8"
                  value={form.km_reading} keyboardType="numeric"
                  onChangeText={t => setForm(p => ({ ...p, km_reading: t }))}
                />
              </FormField>

              {/* Model Picker */}
              <FormField label="Model">
                <TouchableOpacity style={pickerStyle} onPress={() => { setModelSearch(''); setModelPicker(true) }}>
                  <Text style={{ fontSize: 14, color: form.model ? '#1e293b' : '#94a3b8', flex: 1 }}>{form.model || 'Select model…'}</Text>
                  <Text style={{ color: '#94a3b8' }}>▾</Text>
                </TouchableOpacity>
              </FormField>

              {/* Service Type Picker */}
              <FormField label="Service Type">
                <TouchableOpacity style={pickerStyle} onPress={() => setStPicker(true)}>
                  <Text style={{ fontSize: 14, color: form.service_type ? '#1e293b' : '#94a3b8', flex: 1 }}>{form.service_type || 'Select service type…'}</Text>
                  <Text style={{ color: '#94a3b8' }}>▾</Text>
                </TouchableOpacity>
              </FormField>

              {/* Source Picker */}
              <FormField label="Source">
                <TouchableOpacity style={pickerStyle} onPress={() => setSourcePicker(true)}>
                  <Text style={{ fontSize: 14, color: '#1e293b', flex: 1 }}>{form.source}</Text>
                  <Text style={{ color: '#94a3b8' }}>▾</Text>
                </TouchableOpacity>
              </FormField>

              {/* SA Picker */}
              <FormField label="Service Advisor *">
                <TouchableOpacity style={pickerStyle} onPress={() => { setSaSearch(''); setSaPicker(true) }}>
                  <Text style={{ fontSize: 14, color: form.sa_employee_code ? '#1e293b' : '#94a3b8', flex: 1 }}>
                    {form.sa_employee_code
                      ? employees.find(e => e.employee_code === form.sa_employee_code)?.employee_name ?? form.sa_employee_code
                      : 'Select SA…'}
                  </Text>
                  <Text style={{ color: '#94a3b8' }}>▾</Text>
                </TouchableOpacity>
              </FormField>

              {/* Owner Name */}
              <FormField label="Owner Name">
                <TextInput style={tfStyle} placeholder="Customer name" placeholderTextColor="#94a3b8"
                  value={form.owner_name} onChangeText={t => setForm(p => ({ ...p, owner_name: t }))} />
              </FormField>

              {/* Owner Phone */}
              <FormField label="Owner Phone">
                <TextInput style={tfStyle} placeholder="10-digit mobile" placeholderTextColor="#94a3b8"
                  value={form.owner_phone} keyboardType="phone-pad"
                  onChangeText={t => setForm(p => ({ ...p, owner_phone: t }))} />
              </FormField>

            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Model Picker Modal ── */}
      <PickerModal
        visible={modelPicker} title="Select Model"
        onClose={() => setModelPicker(false)}
        search={modelSearch} onSearch={setModelSearch}
        items={filteredModels}
        renderItem={m => (
          <TouchableOpacity key={m} onPress={() => { setForm(p => ({ ...p, model: m, sa_employee_code: '' })); setModelPicker(false) }}
            style={{ ...listItemStyle, backgroundColor: form.model === m ? '#eff6ff' : '#fff' }}>
            <Text style={{ fontSize: 14, color: form.model === m ? '#2563eb' : '#1e293b', fontWeight: form.model === m ? '700' : '400' }}>{m}</Text>
            {form.model === m && <Text style={{ color: '#2563eb' }}>✓</Text>}
          </TouchableOpacity>
        )}
      />

      {/* ── SA Picker Modal ── */}
      <PickerModal
        visible={saPicker} title="Select Service Advisor"
        onClose={() => setSaPicker(false)}
        search={saSearch} onSearch={setSaSearch}
        items={filteredSAs}
        renderItem={e => (
          <TouchableOpacity key={e.employee_code} onPress={() => { setForm(p => ({ ...p, sa_employee_code: e.employee_code })); setSaPicker(false) }}
            style={{ ...listItemStyle, backgroundColor: form.sa_employee_code === e.employee_code ? '#eff6ff' : '#fff' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: form.sa_employee_code === e.employee_code ? '#2563eb' : '#1e293b' }}>{e.employee_name}</Text>
              <Text style={{ fontSize: 11, color: '#94a3b8' }}>{e.employee_code} · {e.fuel_type ?? 'PV'}</Text>
            </View>
            {form.sa_employee_code === e.employee_code && <Text style={{ color: '#2563eb' }}>✓</Text>}
          </TouchableOpacity>
        )}
      />

      {/* ── Service Type Picker ── */}
      <PickerModal
        visible={stPicker} title="Service Type"
        onClose={() => setStPicker(false)}
        items={RECEPTION_SERVICE_TYPE_OPTIONS}
        renderItem={st => (
          <TouchableOpacity key={st} onPress={() => { setForm(p => ({ ...p, service_type: st, sa_employee_code: '' })); setStPicker(false) }}
            style={{ ...listItemStyle, backgroundColor: form.service_type === st ? '#eff6ff' : '#fff' }}>
            {(() => { const c = stColor(st); const a = abbr(st); return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={{ backgroundColor: c.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: c.text }}>{a}</Text>
                </View>
                <Text style={{ fontSize: 14, color: form.service_type === st ? '#2563eb' : '#1e293b', fontWeight: form.service_type === st ? '700' : '400' }}>{st}</Text>
              </View>
            )})()}
            {form.service_type === st && <Text style={{ color: '#2563eb' }}>✓</Text>}
          </TouchableOpacity>
        )}
      />

      {/* ── Source Picker ── */}
      <PickerModal
        visible={sourcePicker} title="Booking Source"
        onClose={() => setSourcePicker(false)}
        items={SOURCE_OPTIONS}
        renderItem={s => (
          <TouchableOpacity key={s} onPress={() => { setForm(p => ({ ...p, source: s })); setSourcePicker(false) }}
            style={{ ...listItemStyle, backgroundColor: form.source === s ? '#eff6ff' : '#fff' }}>
            <Text style={{ fontSize: 14, color: form.source === s ? '#2563eb' : '#1e293b', fontWeight: form.source === s ? '700' : '400', flex: 1 }}>{s}</Text>
            {form.source === s && <Text style={{ color: '#2563eb' }}>✓</Text>}
          </TouchableOpacity>
        )}
      />

    </SafeAreaView>
  )
}

// ─── Reusable sub-components ──────────────────────────────────────────────────
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#475569' }}>{label}</Text>
      {children}
    </View>
  )
}

function PickerModal({
  visible, title, onClose, search, onSearch, items, renderItem,
}: {
  visible: boolean; title: string; onClose: () => void
  search?: string; onSearch?: (s: string) => void
  items: any[]; renderItem: (item: any) => React.ReactNode
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
            <TextInput
              placeholder="Search…" placeholderTextColor="#94a3b8"
              value={search} onChangeText={onSearch}
              style={{ backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, borderWidth: 1, borderColor: '#e2e8f0' }}
            />
          </View>
        )}
        <FlatList
          data={items}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => renderItem(item) as any}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </SafeAreaView>
    </Modal>
  )
}

const tfStyle = {
  borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
  paddingHorizontal: 12, paddingVertical: 10,
  fontSize: 14, color: '#1e293b', backgroundColor: '#fff',
}

const pickerStyle = {
  borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
  paddingHorizontal: 12, paddingVertical: 11,
  backgroundColor: '#fff', flexDirection: 'row' as const, alignItems: 'center' as const,
}

const listItemStyle = {
  flexDirection: 'row' as const, alignItems: 'center' as const,
  paddingHorizontal: 16, paddingVertical: 13,
  borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
}
