// mobile/src/app/(tabs)/bodyshop-repair.tsx
import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, ActivityIndicator, Modal, FlatList, Alert,
} from 'react-native'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomerType = 'individual' | 'firm' | 'foc' | 'cash'
type OverallStatus = 'active' | 'delivered' | 'cancelled'

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
  overall_status: OverallStatus
  received_at: string | null
}

interface StageLog {
  id: number
  repair_card_id: number
  stage_no: number
  stage_name: string
  status: string
  done_by_name: string | null
  notes: string | null
  hold_reason: string | null
  logged_at: string
}

const STAGE_LABELS: Record<number, string> = {
  1: 'Vehicle Receiving', 2: 'Receiving Photos', 3: 'Job Card',
  4: 'Customer Group',    5: 'Documentation',    6: 'Estimation',
  7: 'Est. Approval',     8: 'Claim Intimation', 9: 'Survey',
  10: 'Parts Status',     11: 'Floor Assignment', 12: 'Add. Approval',
  13: 'Quality Check',    14: 'Re-Inspection',   15: 'Billing',
  16: 'DO Status',        17: 'Delivery',         18: 'Payment',
}

const STAGE_GROUPS = [
  { label: 'SA Intake',    stages: [1,2,3,4,5,6,7,8,9,10], color: '#3b82f6' },
  { label: 'Floor Work',   stages: [11,12],                  color: '#8b5cf6' },
  { label: 'QC',           stages: [13,14],                  color: '#f59e0b' },
  { label: 'Billing',      stages: [15,16],                  color: '#10b981' },
  { label: 'Delivery',     stages: [17,18],                  color: '#6b7280' },
]

function getGroupColor(stage: number): string {
  return STAGE_GROUPS.find((g) => g.stages.includes(stage))?.color ?? '#3b82f6'
}

function fmtDate(v: string | null | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BodyshopRepairScreen() {
  const { user } = useAuth()

  const [cards, setCards]       = useState<RepairCard[]>([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'delivered'>('active')

  // Detail modal
  const [selected, setSelected]     = useState<RepairCard | null>(null)
  const [stageLogs, setStageLogs]   = useState<StageLog[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  // New card modal
  const [newModalVisible, setNewModalVisible] = useState(false)
  const [newForm, setNewForm] = useState({
    job_card_no: '', reg_number: '', customer_name: '',
    customer_phone: '', branch: '',
  })
  const [saving, setSaving] = useState(false)
  const [branches, setBranches] = useState<string[]>([])

  useEffect(() => { void loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [cardsRes, branchesRes] = await Promise.all([
      supabase
        .from('bodyshop_repair_cards')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('service_branches').select('name').order('name'),
    ])
    if (cardsRes.data) setCards(cardsRes.data as RepairCard[])
    if (branchesRes.data) setBranches((branchesRes.data as { name: string }[]).map((b) => b.name))
    setLoading(false)
  }

  async function onRefresh() {
    setRefreshing(true)
    await loadAll()
    setRefreshing(false)
  }

  async function openDetail(card: RepairCard) {
    setSelected(card)
    setDetailLoading(true)
    const { data } = await supabase
      .from('bodyshop_stage_logs')
      .select('*')
      .eq('repair_card_id', card.id)
      .order('logged_at', { ascending: true })
    setStageLogs((data as StageLog[]) ?? [])
    setDetailLoading(false)
  }

  async function handleCreate() {
    if (!newForm.job_card_no.trim()) {
      Alert.alert('Error', 'Job card number is required')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('bodyshop_repair_cards').insert({
      ...newForm,
      customer_type: 'individual',
      current_stage: 1,
      current_stage_name: 'vehicle_receiving',
      overall_status: 'active',
      created_by: user?.id,
    })
    setSaving(false)
    if (error) { Alert.alert('Error', error.message); return }
    setNewModalVisible(false)
    setNewForm({ job_card_no: '', reg_number: '', customer_name: '', customer_phone: '', branch: '' })
    void loadAll()
  }

  async function handleAdvance(card: RepairCard) {
    if (card.current_stage >= 18) return
    Alert.alert(
      'Advance Stage',
      `Mark Stage ${card.current_stage} done and move to Stage ${card.current_stage + 1}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            const nextStage = card.current_stage + 1
            await supabase.from('bodyshop_stage_logs').insert({
              repair_card_id: card.id,
              stage_no: card.current_stage,
              stage_name: STAGE_LABELS[card.current_stage] ?? '',
              status: 'done',
              done_by_name: user?.email ?? 'User',
              done_by_role: 'staff',
            })
            await supabase.from('bodyshop_repair_cards').update({
              current_stage: nextStage,
              current_stage_name: STAGE_LABELS[nextStage] ?? '',
              updated_at: new Date().toISOString(),
            }).eq('id', card.id)

            // Refresh detail
            const updated = { ...card, current_stage: nextStage }
            setSelected(updated)
            void loadAll()
          },
        },
      ]
    )
  }

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (statusFilter !== 'all' && c.overall_status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          c.job_card_no?.toLowerCase().includes(q) ||
          (c.reg_number ?? '').toLowerCase().includes(q) ||
          (c.customer_name ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [cards, statusFilter, search])

  const pipeline = useMemo(() =>
    STAGE_GROUPS.map((g) => ({
      ...g,
      count: cards.filter((c) => g.stages.includes(c.current_stage) && c.overall_status === 'active').length,
    })),
  [cards])

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>

      {/* Header */}
      <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', padding: 16, paddingTop: 52 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>🔧 Bodyshop Repairs</Text>
          <TouchableOpacity
            onPress={() => setNewModalVisible(true)}
            style={{ backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>+ New Intake</Text>
          </TouchableOpacity>
        </View>

        {/* Pipeline chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          {pipeline.map((g) => (
            <View key={g.label}
              style={{ marginRight: 8, borderRadius: 20, borderWidth: 1.5, borderColor: g.color,
                       paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: g.color }}>{g.count}</Text>
              <Text style={{ fontSize: 11, color: g.color }}>{g.label}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Search */}
        <TextInput
          style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, marginBottom: 8 }}
          placeholder="Search job card, reg, customer…"
          value={search}
          onChangeText={setSearch}
        />

        {/* Status filter tabs */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['all','active','delivered'] as const).map((s) => (
            <TouchableOpacity key={s} onPress={() => setStatusFilter(s)}
              style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
                       backgroundColor: statusFilter === s ? '#2563eb' : '#f3f4f6' }}>
              <Text style={{ fontSize: 12, fontWeight: '600',
                             color: statusFilter === s ? '#fff' : '#6b7280' }}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Cards list */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2563eb" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 100 }}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', marginTop: 40, color: '#9ca3af' }}>No repair cards found</Text>
          }
          renderItem={({ item: card }) => {
            const color = getGroupColor(card.current_stage)
            return (
              <TouchableOpacity
                onPress={() => void openDetail(card)}
                style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14,
                         borderLeftWidth: 4, borderLeftColor: color,
                         shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontWeight: '700', fontSize: 15, color: '#111827' }}>{card.job_card_no}</Text>
                  <View style={{ backgroundColor: card.overall_status === 'active' ? '#dbeafe' : '#d1fae5',
                                 paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                    <Text style={{ fontSize: 11, color: card.overall_status === 'active' ? '#1d4ed8' : '#065f46', fontWeight: '600' }}>
                      {card.overall_status}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>{card.reg_number ?? '—'} · {card.customer_name ?? '—'}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <View style={{ backgroundColor: `${color}20`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color }}>
                      Stage {card.current_stage} — {STAGE_LABELS[card.current_stage]}
                    </Text>
                  </View>
                  {card.branch && (
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>{card.branch}</Text>
                  )}
                </View>
                <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                  In: {fmtDate(card.received_at)} · SA: {card.sa_name ?? '—'}
                </Text>
              </TouchableOpacity>
            )
          }}
        />
      )}

      {/* ── Detail Modal ──────────────────────────────────────────────────── */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
            <View style={{ backgroundColor: '#fff', padding: 16, paddingTop: 52,
                           borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827' }}>
                    {selected.job_card_no} — {selected.reg_number ?? '—'}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                    {selected.customer_name} · {selected.branch}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelected(null)}
                  style={{ padding: 8 }}>
                  <Text style={{ fontSize: 20, color: '#6b7280' }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Stage progress */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                {STAGE_GROUPS.map((g) => {
                  const inGroup = g.stages.includes(selected.current_stage)
                  const done = g.stages[g.stages.length - 1] < selected.current_stage
                  return (
                    <View key={g.label}
                      style={{ marginRight: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
                               backgroundColor: done ? g.color : inGroup ? `${g.color}30` : '#f3f4f6',
                               borderWidth: inGroup ? 1.5 : 0, borderColor: g.color }}>
                      <Text style={{ fontSize: 11, fontWeight: '600',
                                     color: done ? '#fff' : inGroup ? g.color : '#9ca3af' }}>
                        {done ? '✓ ' : ''}{g.label}
                      </Text>
                    </View>
                  )
                })}
              </ScrollView>

              {/* Current stage badge */}
              <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ backgroundColor: `${getGroupColor(selected.current_stage)}20`,
                               paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontWeight: '700', color: getGroupColor(selected.current_stage) }}>
                    Stage {selected.current_stage} — {STAGE_LABELS[selected.current_stage]}
                  </Text>
                </View>
              </View>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
              {/* Advance stage button */}
              {selected.overall_status === 'active' && selected.current_stage < 18 && (
                <TouchableOpacity
                  onPress={() => void handleAdvance(selected)}
                  style={{ backgroundColor: '#2563eb', borderRadius: 10, padding: 14,
                           alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                    ✓ Done — Advance to Stage {selected.current_stage + 1}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Stage history */}
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 10 }}>
                Stage History
              </Text>
              {detailLoading ? (
                <ActivityIndicator color="#2563eb" />
              ) : (
                Object.entries(STAGE_LABELS).map(([numStr, label]) => {
                  const num = Number(numStr)
                  const log = stageLogs.find((l) => l.stage_no === num && l.status === 'done')
                  const isHold = stageLogs.some((l) => l.stage_no === num && l.status === 'hold')
                  const isCurrent = selected.current_stage === num
                  const isDone = selected.current_stage > num
                  const color = getGroupColor(num)

                  return (
                    <View key={num}
                      style={{ flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' }}>
                      {/* dot */}
                      <View style={{ width: 18, height: 18, borderRadius: 9, marginTop: 2, marginRight: 10,
                                     backgroundColor: isDone ? color : isCurrent ? color : '#e5e7eb',
                                     borderWidth: isCurrent ? 2 : 0, borderColor: color }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: isCurrent ? '700' : '500',
                                       color: isDone ? '#374151' : isCurrent ? '#111827' : '#9ca3af' }}>
                          {num}. {label}
                          {isCurrent && <Text style={{ color }}> ← current</Text>}
                          {isHold && <Text style={{ color: '#ef4444' }}> ⚠ hold</Text>}
                        </Text>
                        {isDone && log && (
                          <Text style={{ fontSize: 11, color: '#9ca3af' }}>
                            {log.done_by_name ?? '—'} · {fmtDate(log.logged_at)}
                          </Text>
                        )}
                      </View>
                    </View>
                  )
                })
              )}
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* ── New Card Modal ────────────────────────────────────────────────── */}
      <Modal visible={newModalVisible} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setNewModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ padding: 16, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
                         flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '700' }}>New Car Intake</Text>
            <TouchableOpacity onPress={() => setNewModalVisible(false)}>
              <Text style={{ fontSize: 16, color: '#6b7280' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            {[
              { key: 'job_card_no', label: 'Job Card No. *', placeholder: 'e.g. JC-2026-001' },
              { key: 'reg_number',  label: 'Reg. Number',    placeholder: 'e.g. RJ14AB1234' },
              { key: 'customer_name', label: 'Customer Name', placeholder: '' },
              { key: 'customer_phone', label: 'Customer Phone', placeholder: '' },
              { key: 'branch',      label: 'Branch',         placeholder: 'e.g. Sitapura' },
            ].map((f) => (
              <View key={f.key}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 }}>{f.label}</Text>
                <TextInput
                  style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 12,
                           paddingVertical: 10, fontSize: 14 }}
                  placeholder={f.placeholder}
                  value={(newForm as any)[f.key]}
                  onChangeText={(v) => setNewForm((prev) => ({ ...prev, [f.key]: v }))}
                />
              </View>
            ))}

            <TouchableOpacity
              onPress={() => void handleCreate()}
              disabled={saving}
              style={{ backgroundColor: saving ? '#93c5fd' : '#2563eb', borderRadius: 10,
                       padding: 14, alignItems: 'center', marginTop: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {saving ? 'Creating…' : 'Create Repair Card'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

    </View>
  )
}
