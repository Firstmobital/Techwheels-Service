import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, ActivityIndicator, Modal, FlatList, Alert,
} from 'react-native'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobCard {
  id: number
  job_card_number: string
  branch: string
  status: string | null
  vehicle_registration_number: string | null
  sr_type: string | null
  open_for_days: number | null
  product_line: string | null
  chassis_number: string | null
}

interface Employee {
  id: number
  employee_code: string
  employee_name: string
  location: string
  role?: string | null
}

interface Assignment {
  id?: number
  job_card_number: string
  technician_code: string
  technician_name: string
  assigned_at: string
  assigned_by: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FloorInchargeScreen() {
  const { user } = useAuth()

  const [jobCards, setJobCards] = useState<JobCard[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('All')

  // Picker modal state
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerJobCard, setPickerJobCard] = useState<string | null>(null)
  const [empSearch, setEmpSearch] = useState('')

  useEffect(() => { fetchAll() }, [])

  // ── Fetch ───────────────────────────────────────────────────────────────────

  async function fetchAll(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const [jcRes, empRes, assignRes] = await Promise.all([
        supabase
          .from('open_job_cards')
          .select('id, job_card_number, branch, status, vehicle_registration_number, sr_type, open_for_days, product_line, chassis_number')
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('employee_master')
          .select('id, employee_code, employee_name, location, role')
          .ilike('role', 'technician')
          .order('employee_name'),
        supabase.from('technician_assignments').select('*'),
      ])

      const technicianEmployees = (empRes.data ?? []).filter((employee) =>
        String(employee.role ?? '').trim().toLowerCase() === 'technician',
      )

      setJobCards(jcRes.data ?? [])
      setEmployees(technicianEmployees)

      const map: Record<string, Assignment> = {}
      if (!assignRes.error && assignRes.data) {
        for (const a of assignRes.data as Assignment[]) {
          map[a.job_card_number] = a
        }
      }
      setAssignments(map)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // ── Assign ───────────────────────────────────────────────────────────────────

  async function assignTechnician(jobCardNumber: string, emp: Employee) {
    setPickerVisible(false)
    setPickerJobCard(null)
    setSaving(jobCardNumber)

    const payload: Omit<Assignment, 'id'> = {
      job_card_number: jobCardNumber,
      technician_code: emp.employee_code,
      technician_name: emp.employee_name,
      assigned_at: new Date().toISOString(),
      assigned_by: user?.email ?? null,
    }

    try {
      const existing = assignments[jobCardNumber]
      let result
      if (existing?.id) {
        result = await supabase
          .from('technician_assignments')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single()
      } else {
        result = await supabase
          .from('technician_assignments')
          .insert(payload)
          .select()
          .single()
      }

      if (result.error) throw result.error
      setAssignments(prev => ({ ...prev, [jobCardNumber]: result.data as Assignment }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to assign'
      Alert.alert('Error', msg)
    } finally {
      setSaving(null)
    }
  }

  // ── Filtering ────────────────────────────────────────────────────────────────

  const branches = useMemo(() => {
    const b = new Set(jobCards.map(j => j.branch).filter(Boolean))
    return ['All', ...Array.from(b).sort()]
  }, [jobCards])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return jobCards.filter(jc => {
      const matchBranch = branchFilter === 'All' || jc.branch === branchFilter
      const matchSearch =
        !q ||
        jc.job_card_number?.toLowerCase().includes(q) ||
        (jc.vehicle_registration_number ?? '').toLowerCase().includes(q) ||
        (jc.chassis_number ?? '').toLowerCase().includes(q)
      return matchBranch && matchSearch
    })
  }, [jobCards, search, branchFilter])

  const filteredEmps = useMemo(() => {
    const q = empSearch.toLowerCase()
    return !q ? employees : employees.filter(e =>
      e.employee_name.toLowerCase().includes(q) ||
      e.employee_code.toLowerCase().includes(q)
    )
  }, [employees, empSearch])

  const assignedCount = filtered.filter(jc => !!assignments[jc.job_card_number]).length

  // ── Open Days badge ──────────────────────────────────────────────────────────

  function daysBadge(days: number | null) {
    if (days == null) return null
    const bg = days > 5 ? '#fef2f2' : days > 2 ? '#fffbeb' : '#f0fdf4'
    const color = days > 5 ? '#b91c1c' : days > 2 ? '#b45309' : '#15803d'
    return (
      <View style={{ backgroundColor: bg, borderRadius: 20, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Text style={{ color, fontSize: 10, fontWeight: '700' }}>{days}d</Text>
      </View>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={{ color: '#94a3b8', marginTop: 12, fontSize: 14 }}>Loading job cards…</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>

      {/* Stats bar */}
      <View style={{ backgroundColor: '#1e293b', paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 10, alignItems: 'center' }}>
          <Text style={{ color: '#93c5fd', fontSize: 22, fontWeight: '800' }}>{filtered.length}</Text>
          <Text style={{ color: '#94a3b8', fontSize: 10, marginTop: 2 }}>Total</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 10, alignItems: 'center' }}>
          <Text style={{ color: '#86efac', fontSize: 22, fontWeight: '800' }}>{assignedCount}</Text>
          <Text style={{ color: '#94a3b8', fontSize: 10, marginTop: 2 }}>Assigned</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 10, alignItems: 'center' }}>
          <Text style={{ color: '#fde68a', fontSize: 22, fontWeight: '800' }}>{filtered.length - assignedCount}</Text>
          <Text style={{ color: '#94a3b8', fontSize: 10, marginTop: 2 }}>Pending</Text>
        </View>
      </View>

      {/* Search */}
      <View style={{ backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search job card, reg. no, chassis…"
          placeholderTextColor="#94a3b8"
          style={{ backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: '#1e293b' }}
        />
      </View>

      {/* Branch filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}
      >
        {branches.map(b => (
          <TouchableOpacity
            key={b}
            onPress={() => setBranchFilter(b)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              backgroundColor: branchFilter === b ? '#2563eb' : '#f1f5f9',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: branchFilter === b ? '#fff' : '#64748b' }}>
              {b}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Job card list */}
      <FlatList
        data={filtered}
        keyExtractor={item => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAll(true)} colors={['#2563eb']} />}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Text style={{ fontSize: 36 }}>📋</Text>
            <Text style={{ color: '#94a3b8', marginTop: 10, fontSize: 14 }}>No job cards found</Text>
          </View>
        }
        renderItem={({ item: jc }) => {
          const assignment = assignments[jc.job_card_number]
          const isSaving = saving === jc.job_card_number

          return (
            <View style={{
              backgroundColor: '#fff',
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: assignment ? '#bbf7d0' : '#e2e8f0',
              shadowColor: '#000',
              shadowOpacity: 0.04,
              shadowRadius: 4,
              elevation: 2,
            }}>
              {/* Top row */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontWeight: '700', fontSize: 13, color: '#2563eb', flexShrink: 1, marginRight: 8 }}>
                  {jc.job_card_number}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  {daysBadge(jc.open_for_days)}
                  {assignment ? (
                    <View style={{ backgroundColor: '#dcfce7', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: '#15803d', fontSize: 10, fontWeight: '700' }}>✓ ASSIGNED</Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: '#fef9c3', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: '#854d0e', fontSize: 10, fontWeight: '700' }}>PENDING</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Details grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                {jc.vehicle_registration_number ? (
                  <View style={{ backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, color: '#475569', fontWeight: '500' }}>🚗 {jc.vehicle_registration_number}</Text>
                  </View>
                ) : null}
                {jc.branch ? (
                  <View style={{ backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, color: '#475569', fontWeight: '500' }}>📍 {jc.branch}</Text>
                  </View>
                ) : null}
                {jc.sr_type ? (
                  <View style={{ backgroundColor: '#ede9fe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, color: '#6d28d9', fontWeight: '500' }}>{jc.sr_type}</Text>
                  </View>
                ) : null}
                {jc.product_line ? (
                  <View style={{ backgroundColor: '#f0fdf4', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '100%' }}>
                    <Text style={{ fontSize: 10, color: '#166534' }} numberOfLines={1}>{jc.product_line}</Text>
                  </View>
                ) : null}
              </View>

              {/* Assigned technician display */}
              {assignment && (
                <View style={{ backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, marginRight: 6 }}>🔧</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: '#166534', fontWeight: '600' }}>{assignment.technician_name}</Text>
                    <Text style={{ fontSize: 10, color: '#4ade80' }}>{assignment.technician_code}</Text>
                  </View>
                </View>
              )}

              {/* Assign button */}
              <TouchableOpacity
                onPress={() => {
                  setPickerJobCard(jc.job_card_number)
                  setEmpSearch('')
                  setPickerVisible(true)
                }}
                disabled={isSaving}
                style={{
                  backgroundColor: isSaving ? '#e2e8f0' : assignment ? '#f0fdf4' : '#2563eb',
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderWidth: assignment ? 1 : 0,
                  borderColor: '#bbf7d0',
                }}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#64748b" />
                ) : (
                  <Text style={{ color: assignment ? '#15803d' : '#fff', fontWeight: '700', fontSize: 13 }}>
                    {assignment ? '↻ Reassign Technician' : '+ Assign Technician'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )
        }}
      />

      {/* Technician Picker Modal */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          {/* Modal header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>Select Technician</Text>
              <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }} numberOfLines={1}>
                {pickerJobCard}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setPickerVisible(false)}
              style={{ backgroundColor: '#f1f5f9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 }}
            >
              <Text style={{ color: '#64748b', fontWeight: '600', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Search employees */}
          <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
            <TextInput
              value={empSearch}
              onChangeText={setEmpSearch}
              placeholder="Search technician name or code…"
              placeholderTextColor="#94a3b8"
              autoFocus
              style={{ backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: '#1e293b' }}
            />
          </View>

          {/* Employee list */}
          <FlatList
            data={filteredEmps}
            keyExtractor={item => item.employee_code}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', marginTop: 40 }}>
                <Text style={{ color: '#94a3b8', fontSize: 14 }}>No technicians found</Text>
              </View>
            }
            renderItem={({ item: emp }) => {
              const isCurrentlyAssigned = pickerJobCard ? assignments[pickerJobCard]?.technician_code === emp.employee_code : false
              return (
                <TouchableOpacity
                  onPress={() => pickerJobCard && assignTechnician(pickerJobCard, emp)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    marginBottom: 6,
                    backgroundColor: isCurrentlyAssigned ? '#f0fdf4' : '#f8fafc',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isCurrentlyAssigned ? '#86efac' : '#e2e8f0',
                  }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isCurrentlyAssigned ? '#dcfce7' : '#e0e7ff', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ fontSize: 18 }}>{isCurrentlyAssigned ? '✓' : '🔧'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', fontSize: 14, color: '#0f172a' }}>{emp.employee_name}</Text>
                    <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{emp.employee_code} · {emp.location}</Text>
                  </View>
                  {isCurrentlyAssigned && (
                    <View style={{ backgroundColor: '#dcfce7', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 10, color: '#15803d', fontWeight: '700' }}>Current</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )
            }}
          />
        </View>
      </Modal>
    </View>
  )
}
