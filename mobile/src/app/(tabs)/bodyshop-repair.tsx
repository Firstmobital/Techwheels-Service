// mobile/src/app/(tabs)/bodyshop-repair.tsx
import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, ActivityIndicator, Modal, Alert, FlatList,
} from 'react-native'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

type CustomerType = 'individual' | 'firm' | 'foc' | 'cash'

interface RepairCard {
  id: number
  job_card_no: string
  reg_number: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_type: CustomerType | null
  branch: string | null
  sa_name: string | null
  current_stage: number
  current_stage_name: string
  overall_status: string
  received_at: string | null
  // insurance details
  insurance_policy_no: string | null
  insurance_company: string | null
  insurance_valid_date: string | null
  // docs
  doc_claim_form: boolean; doc_rc: boolean; doc_insurance: boolean
  doc_dl: boolean; doc_aadhaar: boolean; doc_pan: boolean; doc_kyc: boolean
  // survey
  survey_status: string | null; claim_intimation_no: string | null
  surveyor_name: string | null; surveyor_contact: string | null
  // floor
  denter_name: string | null; painter_name: string | null; technician_name: string | null
  floor_status: string | null
  // qc
  qc_status: string | null; qc_checked_by: string | null
  qc_checked_at: string | null; qc_passed_by: string | null; qc_passed_at: string | null
  delivery_status: string | null
  // billing
  billed_amount: number | null; do_amount: number | null
  payment_status: string | null; do_status: string | null
}

type MobileAssignmentRow = {
  dentor_employee_name: string | null
  painter_employee_name: string | null
  technician_employee_name: string | null
  electrician_employee_name: string | null
  det_employee_name: string | null
}

type MobileSupportRow = {
  employee_name: string | null
}

type MobileEmployeeMasterRow = {
  employee_name: string | null
  department: string | null
}

const STAGE_LABELS: Record<number, string> = {
  1:'Vehicle Receiving', 2:'Receiving Photos', 3:'Job Card', 4:'Customer Group',
  5:'Documentation', 6:'Estimation', 7:'Est. Approval', 8:'Claim Intimation',
  9:'Survey', 10:'Parts Status', 11:'Floor Assignment', 12:'Add. Approval',
  13:'Quality Check', 14:'Re-Inspection', 15:'Billing', 16:'DO Status',
  17:'Delivery', 18:'Payment',
}
const STAGE_GROUPS = [
  { label: 'SA Intake',  stages: [1,2,3,4,5,6,7,8,9,10], color: '#3b82f6' },
  { label: 'Floor',      stages: [11,12],                  color: '#8b5cf6' },
  { label: 'QC',         stages: [13,14],                  color: '#f59e0b' },
  { label: 'Billing',    stages: [15,16],                  color: '#10b981' },
  { label: 'Delivery',   stages: [17,18],                  color: '#6b7280' },
]
function grpColor(stage: number) {
  return STAGE_GROUPS.find(g => g.stages.includes(stage))?.color ?? '#3b82f6'
}
function inr(v: number | null) { return v == null ? '—' : '₹' + v.toLocaleString('en-IN') }
function fmtD(v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
}

function fmtTs(v: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

function parseQcCheckedByNames(raw: string | null | undefined): string[] {
  const tokens = String(raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const seen = new Set<string>()
  const result: string[] = []
  tokens.forEach((name) => {
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push(name)
  })
  return result
}

function joinQcCheckedByNames(names: string[]): string {
  return names.map((name) => name.trim()).filter(Boolean).join(', ')
}

function isBodyshopDepartmentMobile(raw: string | null | undefined): boolean {
  const value = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (!value) return false
  return value.includes('BODY')
}

type TabKey = 'overview' | 'docs' | 'survey' | 'floor' | 'qc' | 'billing'
const TABS: TabKey[] = ['overview','docs','survey','floor','qc','billing']

export default function BodyshopRepairScreen() {
  const { user } = useAuth()
  const [cards, setCards]           = useState<RepairCard[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState('active')

  // detail
  const [selected, setSelected]     = useState<RepairCard | null>(null)
  const [tab, setTab]               = useState<TabKey>('overview')
  const [patch, setPatch]           = useState<Partial<RepairCard>>({})
  const [saving, setSaving]         = useState(false)
  const [qcAssignedCheckerNames, setQcAssignedCheckerNames] = useState<string[]>([])
  const [qcOtherCheckerNames, setQcOtherCheckerNames] = useState<string[]>([])
  const [qcOtherOpen, setQcOtherOpen] = useState(false)
  const [qcOtherSearch, setQcOtherSearch] = useState('')

  // new
  const [showNew, setShowNew]       = useState(false)
  const [nf, setNf]                 = useState({ job_card_no:'', reg_number:'', customer_name:'', customer_phone:'', branch:'' })

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const [cardsRes] = await Promise.all([
      supabase.from('bodyshop_repair_cards').select('*').order('created_at', { ascending: false }).limit(300),
    ])
    if (cardsRes.data) setCards(cardsRes.data as RepairCard[])
    setLoading(false)
  }

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  async function loadQcCheckerOptions(card: RepairCard) {
    const jc = String(card.job_card_no ?? '').trim().toUpperCase()
    if (!jc) {
      setQcAssignedCheckerNames([])
      setQcOtherCheckerNames([])
      return
    }

    const [primaryRes, supportRes, empRes] = await Promise.all([
      supabase
        .from('bodyshop_assignments')
        .select('dentor_employee_name,painter_employee_name,technician_employee_name,electrician_employee_name,det_employee_name')
        .eq('is_active', true)
        .eq('job_card_number', jc)
        .order('updated_at', { ascending: false })
        .limit(1),
      supabase
        .from('bodyshop_floor_support_assignments')
        .select('employee_name')
        .eq('is_active', true)
        .eq('job_card_number', jc),
      supabase
        .from('employee_master')
        .select('employee_name,department')
        .limit(1000),
    ])

    const assignedNames: string[] = []
    const primary = (primaryRes.data?.[0] as MobileAssignmentRow | undefined) ?? null
    if (primary) {
      ;[
        primary.dentor_employee_name,
        primary.painter_employee_name,
        primary.technician_employee_name,
        primary.electrician_employee_name,
        primary.det_employee_name,
      ].forEach((name) => {
        const clean = String(name ?? '').trim()
        if (clean) assignedNames.push(clean)
      })
    }

    ;((supportRes.data ?? []) as MobileSupportRow[]).forEach((row) => {
      const clean = String(row.employee_name ?? '').trim()
      if (clean) assignedNames.push(clean)
    })

    const dedupAssigned: string[] = []
    const assignedSet = new Set<string>()
    assignedNames.forEach((name) => {
      const key = name.toLowerCase()
      if (assignedSet.has(key)) return
      assignedSet.add(key)
      dedupAssigned.push(name)
    })
    dedupAssigned.sort((a, b) => a.localeCompare(b))
    setQcAssignedCheckerNames(dedupAssigned)

    const allBodyshopNames = ((empRes.data ?? []) as MobileEmployeeMasterRow[])
      .filter((row) => isBodyshopDepartmentMobile(row.department))
      .map((row) => String(row.employee_name ?? '').trim())
      .filter(Boolean)

    const dedupOther: string[] = []
    const seenOther = new Set<string>()
    allBodyshopNames.forEach((name) => {
      const key = name.toLowerCase()
      if (assignedSet.has(key) || seenOther.has(key)) return
      seenOther.add(key)
      dedupOther.push(name)
    })

    dedupOther.sort((a, b) => a.localeCompare(b))
    setQcOtherCheckerNames(dedupOther)
  }

  useEffect(() => {
    if (!selected || tab !== 'qc') return
    void loadQcCheckerOptions(selected)
  }, [selected?.id, selected?.job_card_no, tab])

  function applyPatch(key: keyof RepairCard, val: any) {
    setPatch(p => ({ ...p, [key]: val }))
    setSelected(s => s ? { ...s, [key]: val } : s)
  }

  async function savePatch() {
    if (!selected || !Object.keys(patch).length) return
    setSaving(true)
    const qcKeysTouched = ['qc_status', 'qc_checked_by', 'qc_checked_at', 'qc_fail_reason'].some((k) => k in patch)
    let patchToSave: Partial<RepairCard> = patch

    if (qcKeysTouched) {
      const nowIso = new Date().toISOString()
      const nextStatus = String((patch.qc_status ?? selected.qc_status ?? 'pending')).trim().toLowerCase()
      const nextFailReason = String((patch.qc_fail_reason ?? selected.qc_fail_reason ?? '')).trim()
      const selectedCheckers = parseQcCheckedByNames(String(patch.qc_checked_by ?? selected.qc_checked_by ?? ''))

      if (!selectedCheckers.length) {
        setSaving(false)
        Alert.alert('Validation', 'Select at least one QC Checked By person')
        return
      }

      if (nextStatus === 'fail' && !nextFailReason) {
        setSaving(false)
        Alert.alert('Validation', 'Fail Reason is required when QC Status is Fail')
        return
      }

      const checkedByText = joinQcCheckedByNames(selectedCheckers)

      if (nextStatus === 'pass') {
        patchToSave = {
          ...patch,
          qc_checked_by: checkedByText,
          qc_checked_at: nowIso,
          qc_passed_by: checkedByText,
          qc_passed_at: nowIso,
        }
      } else {
        patchToSave = {
          ...patch,
          qc_checked_by: checkedByText,
          qc_checked_at: nowIso,
          qc_passed_by: null,
          qc_passed_at: null,
        }
      }
    }

    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .update({ ...patchToSave, updated_at: new Date().toISOString() })
      .eq('id', selected.id)
      .select().single()
    setSaving(false)
    if (error) { Alert.alert('Error', error.message); return }
    setSelected(data as RepairCard)
    setCards(prev => prev.map(c => c.id === selected.id ? data as RepairCard : c))
    setPatch({})
  }

  async function handleAdvance() {
    if (!selected) return
    Alert.alert('Advance Stage', `Mark Stage ${selected.current_stage} done?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async () => {
        const next = Math.min(selected.current_stage + 1, 18)
        const isLast = next >= 18 && selected.current_stage === 18
        const { data, error } = await supabase
          .from('bodyshop_repair_cards')
          .update({ current_stage: next, current_stage_name: STAGE_LABELS[next], updated_at: new Date().toISOString() })
          .eq('id', selected.id).select().single()
        if (error) { Alert.alert('Error', error.message); return }
        setSelected(data as RepairCard)
        setCards(prev => prev.map(c => c.id === selected.id ? data as RepairCard : c))
      }},
    ])
  }

  async function handleCreate() {
    if (!nf.job_card_no.trim()) { Alert.alert('Error','Job card number required'); return }
    setSaving(true)
    const { error } = await supabase.from('bodyshop_repair_cards').insert({
      ...nf, customer_type: 'individual', current_stage: 1,
      current_stage_name: 'vehicle_receiving', overall_status: 'active', created_by: user?.id,
    })
    setSaving(false)
    if (error) { Alert.alert('Error', error.message); return }
    setShowNew(false)
    setNf({ job_card_no:'', reg_number:'', customer_name:'', customer_phone:'', branch:'' })
    void load()
  }

  const filtered = useMemo(() => cards.filter(c => {
    if (statusFilter !== 'all' && c.overall_status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return c.job_card_no?.toLowerCase().includes(q) ||
             (c.reg_number ?? '').toLowerCase().includes(q) ||
             (c.customer_name ?? '').toLowerCase().includes(q)
    }
    return true
  }), [cards, statusFilter, search])

  const pipeline = useMemo(() => STAGE_GROUPS.map(g => ({
    ...g, count: cards.filter(c => g.stages.includes(c.current_stage) && c.overall_status === 'active').length,
  })), [cards])

  return (
    <View style={{ flex:1, backgroundColor:'#f8fafc' }}>
      {/* Header */}
      <View style={{ backgroundColor:'#fff', borderBottomWidth:1, borderBottomColor:'#e5e7eb', padding:16, paddingTop:52 }}>
        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <Text style={{ fontSize:17, fontWeight:'700' }}>🔧 Bodyshop Repairs</Text>
          <TouchableOpacity onPress={() => setShowNew(true)}
            style={{ backgroundColor:'#2563eb', borderRadius:8, paddingHorizontal:12, paddingVertical:7 }}>
            <Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>+ New</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:10 }}>
          {pipeline.map(g => (
            <View key={g.label} style={{ marginRight:8, borderRadius:20, borderWidth:1.5, borderColor:g.color, paddingHorizontal:10, paddingVertical:4, flexDirection:'row', alignItems:'center', gap:4 }}>
              <Text style={{ fontSize:15, fontWeight:'700', color:g.color }}>{g.count}</Text>
              <Text style={{ fontSize:11, color:g.color }}>{g.label}</Text>
            </View>
          ))}
        </ScrollView>

        <TextInput
          style={{ backgroundColor:'#f3f4f6', borderRadius:8, paddingHorizontal:12, paddingVertical:8, fontSize:14, marginBottom:8 }}
          placeholder="Search job card / reg / customer…"
          value={search} onChangeText={setSearch} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {['all','active','delivered','cancelled'].map(s => (
            <TouchableOpacity key={s} onPress={() => setStatusFilter(s)}
              style={{ marginRight:6, borderRadius:20, paddingHorizontal:12, paddingVertical:5, backgroundColor: statusFilter === s ? '#2563eb' : '#f3f4f6' }}>
              <Text style={{ fontSize:12, fontWeight:'600', color: statusFilter === s ? '#fff' : '#6b7280' }}>
                {s.charAt(0).toUpperCase()+s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      {loading ? <ActivityIndicator style={{ marginTop:40 }} size="large" color="#2563eb" /> : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding:12, gap:10, paddingBottom:100 }}
          ListEmptyComponent={<Text style={{ textAlign:'center', marginTop:40, color:'#9ca3af' }}>No repair cards found</Text>}
          renderItem={({ item: card }) => {
            const color = grpColor(card.current_stage)
            return (
              <TouchableOpacity onPress={() => { setSelected(card); setTab('overview'); setPatch({}) }}
                style={{ backgroundColor:'#fff', borderRadius:12, padding:14, borderLeftWidth:4, borderLeftColor:color, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:4, elevation:2 }}>
                <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:4 }}>
                  <Text style={{ fontWeight:'700', fontSize:15 }}>{card.job_card_no}</Text>
                  <View style={{ backgroundColor: card.overall_status==='active' ? '#dbeafe' : card.overall_status==='delivered' ? '#d1fae5' : '#fee2e2', paddingHorizontal:8, paddingVertical:2, borderRadius:10 }}>
                    <Text style={{ fontSize:11, fontWeight:'600', color: card.overall_status==='active' ? '#1d4ed8' : card.overall_status==='delivered' ? '#065f46' : '#991b1b' }}>
                      {card.overall_status}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize:13, color:'#6b7280' }}>{card.reg_number ?? '—'} · {card.customer_name ?? '—'}</Text>
                <View style={{ marginTop:6, flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                  <View style={{ backgroundColor:`${color}20`, paddingHorizontal:8, paddingVertical:3, borderRadius:6 }}>
                    <Text style={{ fontSize:11, fontWeight:'600', color }}>Stage {card.current_stage} — {STAGE_LABELS[card.current_stage]}</Text>
                  </View>
                  <Text style={{ fontSize:11, color:'#9ca3af' }}>{card.branch ?? '—'}</Text>
                </View>
                <Text style={{ fontSize:11, color:'#9ca3af', marginTop:4 }}>In: {fmtD(card.received_at)} · SA: {card.sa_name ?? '—'}</Text>
              </TouchableOpacity>
            )
          }}
        />
      )}

      {/* Detail Modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <View style={{ flex:1, backgroundColor:'#f8fafc' }}>
            <View style={{ backgroundColor:'#fff', padding:16, paddingTop:52, borderBottomWidth:1, borderBottomColor:'#e5e7eb' }}>
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
                <View style={{ flex:1 }}>
                  <Text style={{ fontSize:17, fontWeight:'700' }}>{selected.job_card_no} — {selected.reg_number ?? '—'}</Text>
                  <Text style={{ fontSize:13, color:'#6b7280', marginTop:2 }}>{selected.customer_name} · {selected.branch}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelected(null)} style={{ padding:8 }}>
                  <Text style={{ fontSize:20, color:'#6b7280' }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* stage groups */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop:10 }}>
                {STAGE_GROUPS.map(g => {
                  const inGrp = g.stages.includes(selected.current_stage)
                  const done  = g.stages[g.stages.length-1] < selected.current_stage
                  return (
                    <View key={g.label} style={{ marginRight:6, paddingHorizontal:10, paddingVertical:5, borderRadius:16,
                      backgroundColor: done ? g.color : inGrp ? `${g.color}30` : '#f3f4f6',
                      borderWidth: inGrp ? 1.5 : 0, borderColor: g.color }}>
                      <Text style={{ fontSize:11, fontWeight:'600', color: done ? '#fff' : inGrp ? g.color : '#9ca3af' }}>
                        {done ? '✓ ' : ''}{g.label}
                      </Text>
                    </View>
                  )
                })}
              </ScrollView>

              {/* tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop:8 }}>
                {TABS.map(t => (
                  <TouchableOpacity key={t} onPress={() => setTab(t)}
                    style={{ marginRight:4, paddingHorizontal:12, paddingVertical:6, borderRadius:16,
                      backgroundColor: tab===t ? '#2563eb' : '#f3f4f6' }}>
                    <Text style={{ fontSize:12, fontWeight:'600', color: tab===t ? '#fff' : '#6b7280' }}>
                      {t.charAt(0).toUpperCase()+t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:120 }}>

              {/* Overview */}
              {tab==='overview' && (
                <View>
                  {selected.overall_status==='active' && selected.current_stage < 18 && (
                    <TouchableOpacity onPress={handleAdvance}
                      style={{ backgroundColor:'#2563eb', borderRadius:10, padding:14, alignItems:'center', marginBottom:16 }}>
                      <Text style={{ color:'#fff', fontWeight:'700' }}>✓ Done — Advance to Stage {selected.current_stage+1}</Text>
                    </TouchableOpacity>
                  )}
                  <View style={{ backgroundColor:'#fff', borderRadius:10, padding:14, marginBottom:12 }}>
                    {[
                      ['Current Stage', `Stage ${selected.current_stage} — ${STAGE_LABELS[selected.current_stage]}`],
                      ['Reg No.', selected.reg_number ?? '—'],
                      ['Customer', selected.customer_name ?? '—'],
                      ['Branch', selected.branch ?? '—'],
                      ['SA', selected.sa_name ?? '—'],
                      ['Received', fmtD(selected.received_at)],
                    ].map(([l,v]) => (
                      <View key={String(l)} style={{ flexDirection:'row', justifyContent:'space-between', paddingVertical:6, borderBottomWidth:1, borderBottomColor:'#f3f4f6' }}>
                        <Text style={{ fontSize:13, color:'#9ca3af' }}>{l}</Text>
                        <Text style={{ fontSize:13, fontWeight:'600', color:'#111827' }}>{v}</Text>
                      </View>
                    ))}
                  </View>
                  {/* stage stepper */}
                  <Text style={{ fontSize:14, fontWeight:'700', marginBottom:8 }}>All Stages</Text>
                  <View style={{ flexDirection:'row', flexWrap:'wrap', gap:6 }}>
                    {Object.entries(STAGE_LABELS).map(([ns, label]) => {
                      const n = Number(ns)
                      const isDone = selected.current_stage > n
                      const isCur  = selected.current_stage === n
                      const color  = grpColor(n)
                      return (
                        <View key={n} style={{ flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:10, paddingVertical:5, borderRadius:8,
                          backgroundColor: isCur ? `${color}15` : isDone ? '#f0fdf4' : '#f9fafb',
                          borderWidth:1, borderColor: isCur ? color : isDone ? '#bbf7d0' : '#e5e7eb',
                          width:'47%' }}>
                          <View style={{ width:10, height:10, borderRadius:5, backgroundColor: isDone ? '#16a34a' : isCur ? color : '#d1d5db' }} />
                          <Text style={{ fontSize:11, fontWeight: isCur ? '700' : '500', color: isCur ? color : isDone ? '#374151' : '#9ca3af', flex:1 }}>
                            {n}. {label}
                          </Text>
                        </View>
                      )
                    })}
                  </View>
                </View>
              )}

              {/* Docs */}
              {tab==='docs' && (() => {
                const ct = selected.customer_type ?? 'individual'
                const noDocsRequired = ct === 'cash' || ct === 'foc'
                type DocEntry = { k: keyof RepairCard; label: string; mandatoryFor: string[] }
                const ALL_DOCS: DocEntry[] = [
                  { k:'doc_claim_form',  label:'Claim Form',       mandatoryFor:['individual','firm'] },
                  { k:'doc_rc',          label:'RC',               mandatoryFor:['individual','firm'] },
                  { k:'doc_insurance',   label:'Insurance Copy',   mandatoryFor:['individual','firm'] },
                  { k:'doc_dl',          label:'Driving Licence',  mandatoryFor:['individual','firm'] },
                  { k:'doc_aadhaar',     label:'Aadhaar Card',     mandatoryFor:['individual','firm'] },
                  { k:'doc_pan',         label:'PAN Card',         mandatoryFor:['individual','firm'] },
                  { k:'doc_kyc',         label:'KYC',              mandatoryFor:['individual'] },
                  { k:'doc_gst',         label:'GST',              mandatoryFor:['firm'] },
                  { k:'doc_company_pan', label:'Company PAN Card', mandatoryFor:['firm'] },
                  { k:'doc_bank_detail', label:'Bank Detail',      mandatoryFor:[] },
                ]
                const visibleDocs = noDocsRequired ? [] : ALL_DOCS
                const mandatoryDocs = visibleDocs.filter(d => d.mandatoryFor.includes(ct))
                const optionalDocs  = visibleDocs.filter(d => !d.mandatoryFor.includes(ct))
                const collectedMandatory = mandatoryDocs.filter(d => (selected as any)[d.k]).length
                const allDone = mandatoryDocs.length > 0 && collectedMandatory === mandatoryDocs.length

                return (
                  <View>
                    {/* Customer Type buttons */}
                    <View style={{ backgroundColor:'#f8fafc', borderRadius:10, padding:12, marginBottom:14 }}>
                      <Text style={{ fontSize:13, fontWeight:'700', color:'#374151', marginBottom:8 }}>Customer Type</Text>
                      <View style={{ flexDirection:'row', gap:8, flexWrap:'wrap' }}>
                        {(['individual','firm','foc','cash'] as const).map(t => (
                          <TouchableOpacity key={t} onPress={() => applyPatch('customer_type', t)}
                            style={{ paddingHorizontal:14, paddingVertical:7, borderRadius:20, borderWidth:1.5,
                              borderColor: ct===t ? '#2563eb' : '#e5e7eb',
                              backgroundColor: ct===t ? '#2563eb' : '#fff' }}>
                            <Text style={{ fontSize:13, fontWeight:'600', color: ct===t ? '#fff' : '#6b7280', textTransform:'capitalize' }}>
                              {t.charAt(0).toUpperCase()+t.slice(1)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Insurance Details */}
                    {!noDocsRequired && (
                      <View style={{ backgroundColor:'#f8fafc', borderRadius:10, padding:14, marginBottom:14, borderWidth:1, borderColor:'#e5e7eb' }}>
                        <Text style={{ fontSize:13, fontWeight:'700', color:'#374151', marginBottom:10 }}>🛡️ Insurance Details</Text>
                        <View style={{ marginBottom:10 }}>
                          <Text style={{ fontSize:11, fontWeight:'600', color:'#6b7280', marginBottom:4 }}>Policy No.</Text>
                          <TextInput
                            value={selected.insurance_policy_no ?? ''}
                            onChangeText={(t) => applyPatch('insurance_policy_no', t || null)}
                            placeholder="e.g. POL-2024-001234"
                            placeholderTextColor="#9ca3af"
                            style={{ borderWidth:1, borderColor:'#e5e7eb', borderRadius:8, padding:10, fontSize:14, backgroundColor:'#fff' }}
                          />
                        </View>
                        <View style={{ marginBottom:10 }}>
                          <Text style={{ fontSize:11, fontWeight:'600', color:'#6b7280', marginBottom:4 }}>Insurance Company</Text>
                          <TextInput
                            value={selected.insurance_company ?? ''}
                            onChangeText={(t) => applyPatch('insurance_company', t || null)}
                            placeholder="e.g. New India Assurance"
                            placeholderTextColor="#9ca3af"
                            style={{ borderWidth:1, borderColor:'#e5e7eb', borderRadius:8, padding:10, fontSize:14, backgroundColor:'#fff' }}
                          />
                        </View>
                        <View>
                          <Text style={{ fontSize:11, fontWeight:'600', color:'#6b7280', marginBottom:4 }}>Valid Until (YYYY-MM-DD)</Text>
                          <TextInput
                            value={selected.insurance_valid_date ?? ''}
                            onChangeText={(t) => applyPatch('insurance_valid_date', t || null)}
                            placeholder="e.g. 2025-12-31"
                            placeholderTextColor="#9ca3af"
                            style={{ borderWidth:1, borderColor:'#e5e7eb', borderRadius:8, padding:10, fontSize:14, backgroundColor:'#fff' }}
                          />
                        </View>
                      </View>
                    )}

                    {noDocsRequired ? (
                      <View style={{ alignItems:'center', padding:32, backgroundColor:'#f0fdf4', borderRadius:12, borderWidth:1, borderColor:'#bbf7d0' }}>
                        <Text style={{ fontSize:32, marginBottom:8 }}>✅</Text>
                        <Text style={{ fontSize:15, fontWeight:'700', color:'#15803d' }}>No Documents Required</Text>
                        <Text style={{ fontSize:13, color:'#6b7280', marginTop:4, textAlign:'center' }}>
                          {ct === 'cash' ? 'Cash' : 'FOC'} customers do not require any documentation.
                        </Text>
                      </View>
                    ) : (
                      <View>
                        {/* Progress */}
                        <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:6 }}>
                          <Text style={{ fontSize:13, fontWeight:'700', color:'#374151' }}>Mandatory Documents</Text>
                          <Text style={{ fontSize:13, fontWeight:'700', color: allDone ? '#16a34a' : '#dc2626' }}>
                            {collectedMandatory}/{mandatoryDocs.length} {allDone ? '✓' : '⚠'}
                          </Text>
                        </View>
                        <View style={{ height:6, backgroundColor:'#e5e7eb', borderRadius:4, marginBottom:14, overflow:'hidden' }}>
                          <View style={{ height:6, borderRadius:4,
                            width: mandatoryDocs.length ? `${(collectedMandatory/mandatoryDocs.length)*100}%` : '0%',
                            backgroundColor: allDone ? '#16a34a' : '#f59e0b' } as any} />
                        </View>

                        {mandatoryDocs.map(({ k, label }) => {
                          const checked = (selected as any)[k] ?? false
                          return (
                            <TouchableOpacity key={k} onPress={() => applyPatch(k, !checked)}
                              style={{ flexDirection:'row', alignItems:'center', padding:12, borderRadius:10, marginBottom:8,
                                backgroundColor: checked ? '#f0fdf4' : '#fff9f9',
                                borderWidth:1.5, borderColor: checked ? '#86efac' : '#fca5a5' }}>
                              <View style={{ width:22, height:22, borderRadius:5, borderWidth:2, marginRight:12,
                                borderColor: checked ? '#16a34a' : '#ef4444',
                                backgroundColor: checked ? '#16a34a' : '#fff',
                                alignItems:'center', justifyContent:'center' }}>
                                {checked && <Text style={{ color:'#fff', fontSize:13, fontWeight:'800' }}>✓</Text>}
                              </View>
                              <View style={{ flex:1 }}>
                                <Text style={{ fontSize:14, fontWeight:'600', color:'#111827' }}>{label}</Text>
                                <Text style={{ fontSize:11, fontWeight:'600', color: checked ? '#16a34a' : '#ef4444' }}>
                                  {checked ? 'Collected' : 'Required'}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          )
                        })}

                        {optionalDocs.length > 0 && (
                          <View style={{ marginTop:8 }}>
                            <Text style={{ fontSize:11, fontWeight:'700', color:'#9ca3af', marginBottom:8, textTransform:'uppercase', letterSpacing:1 }}>Optional</Text>
                            {optionalDocs.map(({ k, label }) => {
                              const checked = (selected as any)[k] ?? false
                              return (
                                <TouchableOpacity key={k} onPress={() => applyPatch(k, !checked)}
                                  style={{ flexDirection:'row', alignItems:'center', padding:12, borderRadius:10, marginBottom:6,
                                    backgroundColor: checked ? '#f0fdf4' : '#fafafa',
                                    borderWidth:1, borderColor: checked ? '#86efac' : '#e5e7eb' }}>
                                  <View style={{ width:22, height:22, borderRadius:5, borderWidth:2, marginRight:12,
                                    borderColor: checked ? '#16a34a' : '#d1d5db',
                                    backgroundColor: checked ? '#16a34a' : '#fff',
                                    alignItems:'center', justifyContent:'center' }}>
                                    {checked && <Text style={{ color:'#fff', fontSize:13, fontWeight:'800' }}>✓</Text>}
                                  </View>
                                  <View style={{ flex:1 }}>
                                    <Text style={{ fontSize:14, fontWeight:'500', color:'#374151' }}>{label}</Text>
                                    <Text style={{ fontSize:11, color:'#9ca3af' }}>Optional</Text>
                                  </View>
                                </TouchableOpacity>
                              )
                            })}
                          </View>
                        )}
                      </View>
                    )}

                    {Object.keys(patch).length > 0 && (
                      <TouchableOpacity onPress={savePatch} disabled={saving}
                        style={{ backgroundColor:'#2563eb', borderRadius:10, padding:14, alignItems:'center', marginTop:16 }}>
                        <Text style={{ color:'#fff', fontWeight:'700' }}>{saving ? 'Saving…' : 'Save Documents'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })()}

              {/* Survey */}
              {tab==='survey' && (
                <View style={{ gap:12 }}>
                  {[
                    {k:'claim_intimation_no',label:'Claim Intimation No.'},
                    {k:'surveyor_name',label:'Surveyor Name'},
                    {k:'surveyor_contact',label:'Surveyor Contact'},
                    {k:'approved_parts',label:'Approved Parts'},
                    {k:'estimation_by',label:'Estimation By'},
                    {k:'survey_hold_reason',label:'Hold Reason'},
                  ].map(({k,label}) => (
                    <View key={k}>
                      <Text style={{ fontSize:12, color:'#6b7280', marginBottom:4 }}>{label}</Text>
                      <TextInput style={{ backgroundColor:'#fff', borderRadius:8, padding:10, fontSize:14, borderWidth:1, borderColor:'#e5e7eb' }}
                        value={(selected as any)[k] ?? ''} onChangeText={v => applyPatch(k as keyof RepairCard, v)} />
                    </View>
                  ))}
                  {Object.keys(patch).length > 0 && (
                    <TouchableOpacity onPress={savePatch} disabled={saving}
                      style={{ backgroundColor:'#2563eb', borderRadius:10, padding:14, alignItems:'center' }}>
                      <Text style={{ color:'#fff', fontWeight:'700' }}>{saving ? 'Saving…' : 'Save Survey'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Floor */}
              {tab==='floor' && (
                <View style={{ gap:12 }}>
                  {[
                    {k:'denter_name',label:'Denter Name'}, {k:'painter_name',label:'Painter Name'},
                    {k:'technician_name',label:'Technician Name'}, {k:'floor_hold_reason',label:'Hold Reason'},
                    {k:'additional_approval',label:'Additional Approval'},
                  ].map(({k,label}) => (
                    <View key={k}>
                      <Text style={{ fontSize:12, color:'#6b7280', marginBottom:4 }}>{label}</Text>
                      <TextInput style={{ backgroundColor:'#fff', borderRadius:8, padding:10, fontSize:14, borderWidth:1, borderColor:'#e5e7eb' }}
                        value={(selected as any)[k] ?? ''} onChangeText={v => applyPatch(k as keyof RepairCard, v)} />
                    </View>
                  ))}
                  {Object.keys(patch).length > 0 && (
                    <TouchableOpacity onPress={savePatch} disabled={saving}
                      style={{ backgroundColor:'#2563eb', borderRadius:10, padding:14, alignItems:'center' }}>
                      <Text style={{ color:'#fff', fontWeight:'700' }}>{saving ? 'Saving…' : 'Save Floor'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* QC */}
              {tab==='qc' && (
                <View style={{ gap:12 }}>
                  {(() => {
                    const selectedCheckerNames = parseQcCheckedByNames(selected.qc_checked_by)
                    const otherSearchNorm = qcOtherSearch.trim().toLowerCase()
                    const filteredOtherNames = qcOtherCheckerNames.filter((name) => !otherSearchNorm || name.toLowerCase().includes(otherSearchNorm))

                    const toggleQcChecker = (name: string) => {
                      const key = name.toLowerCase()
                      const next = selectedCheckerNames.some((item) => item.toLowerCase() === key)
                        ? selectedCheckerNames.filter((item) => item.toLowerCase() !== key)
                        : [...selectedCheckerNames, name]
                      applyPatch('qc_checked_by', joinQcCheckedByNames(next))
                    }

                    return (
                      <>
                  <View style={{ backgroundColor:'#fff', borderRadius:10, padding:14, gap:10 }}>
                    {[
                      ['QC', selected.qc_status ?? 'pending', ['pending','pass','fail']],
                      ['Delivery', selected.delivery_status ?? 'pending', ['pending','done']],
                    ].map(([label, val, opts]) => (
                      <View key={String(label)}>
                        <Text style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>{label} Status</Text>
                        <View style={{ flexDirection:'row', gap:8 }}>
                          {(opts as string[]).map(o => (
                            <TouchableOpacity key={o} onPress={() => applyPatch(label==='QC' ? 'qc_status' : 'delivery_status', o)}
                              style={{ flex:1, padding:8, borderRadius:8, alignItems:'center',
                                backgroundColor: val===o ? '#2563eb' : '#f3f4f6' }}>
                              <Text style={{ fontSize:12, fontWeight:'600', color: val===o ? '#fff' : '#6b7280', textTransform:'capitalize' }}>{o}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>

                  <View style={{ backgroundColor:'#fff', borderRadius:10, padding:14, gap:10 }}>
                    <Text style={{ fontSize:12, color:'#6b7280' }}>QC Checked By</Text>

                    <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
                      {selectedCheckerNames.length === 0 ? (
                        <Text style={{ fontSize:12, color:'#9ca3af' }}>No checker selected</Text>
                      ) : (
                        selectedCheckerNames.map((name) => (
                          <TouchableOpacity
                            key={`sel-${name}`}
                            onPress={() => toggleQcChecker(name)}
                            style={{ backgroundColor:'#eff6ff', borderColor:'#bfdbfe', borderWidth:1, borderRadius:999, paddingHorizontal:10, paddingVertical:4 }}
                          >
                            <Text style={{ fontSize:12, color:'#1e40af', fontWeight:'600' }}>{name} ×</Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>

                    <Text style={{ fontSize:11, color:'#94a3b8' }}>Assigned Workforce</Text>
                    <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
                      {qcAssignedCheckerNames.length === 0 ? (
                        <Text style={{ fontSize:12, color:'#9ca3af' }}>No assigned workforce found</Text>
                      ) : (
                        qcAssignedCheckerNames.map((name) => {
                          const active = selectedCheckerNames.some((item) => item.toLowerCase() === name.toLowerCase())
                          return (
                            <TouchableOpacity
                              key={`ass-${name}`}
                              onPress={() => toggleQcChecker(name)}
                              style={{
                                backgroundColor: active ? '#2563eb' : '#f3f4f6',
                                borderRadius:8,
                                paddingHorizontal:10,
                                paddingVertical:6,
                              }}
                            >
                              <Text style={{ color: active ? '#fff' : '#475569', fontSize:12, fontWeight:'600' }}>{name}</Text>
                            </TouchableOpacity>
                          )
                        })
                      )}
                    </View>

                    <TouchableOpacity
                      onPress={() => setQcOtherOpen((prev) => !prev)}
                      style={{ alignSelf:'flex-start', backgroundColor:'#f8fafc', borderColor:'#cbd5e1', borderWidth:1, borderRadius:8, paddingHorizontal:10, paddingVertical:6 }}
                    >
                      <Text style={{ fontSize:12, color:'#334155', fontWeight:'600' }}>{qcOtherOpen ? 'Hide Other Employees' : 'Other Employees'}</Text>
                    </TouchableOpacity>

                    {qcOtherOpen && (
                      <View style={{ gap:8 }}>
                        <TextInput
                          style={{ backgroundColor:'#fff', borderRadius:8, padding:10, fontSize:14, borderWidth:1, borderColor:'#e5e7eb' }}
                          value={qcOtherSearch}
                          onChangeText={setQcOtherSearch}
                          placeholder="Search bodyshop employee by name"
                        />
                        <View style={{ maxHeight:160, borderWidth:1, borderColor:'#e5e7eb', borderRadius:8, padding:8, gap:6 }}>
                          {filteredOtherNames.length === 0 ? (
                            <Text style={{ fontSize:12, color:'#9ca3af' }}>No matching employees</Text>
                          ) : (
                            filteredOtherNames.map((name) => {
                              const active = selectedCheckerNames.some((item) => item.toLowerCase() === name.toLowerCase())
                              return (
                                <TouchableOpacity
                                  key={`oth-${name}`}
                                  onPress={() => toggleQcChecker(name)}
                                  style={{
                                    backgroundColor: active ? '#2563eb' : '#f8fafc',
                                    borderRadius:8,
                                    paddingHorizontal:10,
                                    paddingVertical:6,
                                  }}
                                >
                                  <Text style={{ color: active ? '#fff' : '#334155', fontSize:12, fontWeight:'600' }}>{name}</Text>
                                </TouchableOpacity>
                              )
                            })
                          )}
                        </View>
                      </View>
                    )}

                    <Text style={{ fontSize:12, color:'#6b7280' }}>QC Checked At</Text>
                    <View style={{ backgroundColor:'#f8fafc', borderRadius:8, padding:10, borderWidth:1, borderColor:'#e5e7eb' }}>
                      <Text style={{ fontSize:13, color:'#334155' }}>{fmtTs(selected.qc_checked_at)}</Text>
                    </View>
                  </View>

                  {[{k:'qc_fail_reason',label:'Fail Reason'},{k:'reinspection_by',label:'Re-Inspection By'}].map(({k,label}) => (
                    <View key={k}>
                      <Text style={{ fontSize:12, color:'#6b7280', marginBottom:4 }}>{label}</Text>
                      <TextInput style={{ backgroundColor:'#fff', borderRadius:8, padding:10, fontSize:14, borderWidth:1, borderColor:'#e5e7eb' }}
                        value={(selected as any)[k] ?? ''} onChangeText={v => applyPatch(k as keyof RepairCard, v)} />
                    </View>
                  ))}
                      </>
                    )
                  })()}
                  {Object.keys(patch).length > 0 && (
                    <TouchableOpacity onPress={savePatch} disabled={saving}
                      style={{ backgroundColor:'#2563eb', borderRadius:10, padding:14, alignItems:'center' }}>
                      <Text style={{ color:'#fff', fontWeight:'700' }}>{saving ? 'Saving…' : 'Save QC'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Billing */}
              {tab==='billing' && (
                <View style={{ gap:12 }}>
                  <View style={{ backgroundColor:'#fff', borderRadius:10, padding:14, flexDirection:'row', justifyContent:'space-around' }}>
                    {[['Billed', selected.billed_amount],['DO', selected.do_amount]].map(([l,v]) => (
                      <View key={String(l)} style={{ alignItems:'center' }}>
                        <Text style={{ fontSize:11, color:'#9ca3af' }}>{l}</Text>
                        <Text style={{ fontSize:18, fontWeight:'700', color:'#111827' }}>{inr(v as number|null)}</Text>
                      </View>
                    ))}
                  </View>
                  {[{k:'billed_amount',label:'Billed Amount (₹)',num:true},{k:'do_amount',label:'DO Amount (₹)',num:true},{k:'customer_diff_amount',label:'Customer Diff (₹)',num:true}].map(({k,label,num}) => (
                    <View key={k}>
                      <Text style={{ fontSize:12, color:'#6b7280', marginBottom:4 }}>{label}</Text>
                      <TextInput style={{ backgroundColor:'#fff', borderRadius:8, padding:10, fontSize:14, borderWidth:1, borderColor:'#e5e7eb' }}
                        keyboardType={num ? 'numeric' : 'default'}
                        value={(selected as any)[k]?.toString() ?? ''}
                        onChangeText={v => applyPatch(k as keyof RepairCard, num ? (v ? Number(v) : null) : v)} />
                    </View>
                  ))}
                  {Object.keys(patch).length > 0 && (
                    <TouchableOpacity onPress={savePatch} disabled={saving}
                      style={{ backgroundColor:'#2563eb', borderRadius:10, padding:14, alignItems:'center' }}>
                      <Text style={{ color:'#fff', fontWeight:'700' }}>{saving ? 'Saving…' : 'Save Billing'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

            </ScrollView>
          </View>
        )}
      </Modal>

      {/* New Card Modal */}
      <Modal visible={showNew} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowNew(false)}>
        <View style={{ flex:1, backgroundColor:'#fff' }}>
          <View style={{ padding:16, paddingTop:52, borderBottomWidth:1, borderBottomColor:'#e5e7eb', flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
            <Text style={{ fontSize:17, fontWeight:'700' }}>New Car Intake</Text>
            <TouchableOpacity onPress={() => setShowNew(false)}>
              <Text style={{ fontSize:16, color:'#6b7280' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding:16, gap:14 }}>
            {[
              {k:'job_card_no',label:'Job Card No. *'},
              {k:'reg_number',label:'Reg. Number'},
              {k:'customer_name',label:'Customer Name'},
              {k:'customer_phone',label:'Customer Phone'},
              {k:'branch',label:'Branch'},
            ].map(({k,label}) => (
              <View key={k}>
                <Text style={{ fontSize:13, fontWeight:'600', color:'#374151', marginBottom:4 }}>{label}</Text>
                <TextInput style={{ backgroundColor:'#f3f4f6', borderRadius:8, paddingHorizontal:12, paddingVertical:10, fontSize:14 }}
                  value={(nf as any)[k]} onChangeText={v => setNf(p => ({ ...p, [k]: v }))} />
              </View>
            ))}
            <TouchableOpacity onPress={handleCreate} disabled={saving}
              style={{ backgroundColor: saving ? '#93c5fd' : '#2563eb', borderRadius:10, padding:14, alignItems:'center', marginTop:8 }}>
              <Text style={{ color:'#fff', fontWeight:'700', fontSize:15 }}>{saving ? 'Creating…' : 'Create Repair Card'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}
