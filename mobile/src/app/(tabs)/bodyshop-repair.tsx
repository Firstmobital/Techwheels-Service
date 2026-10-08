/**
 * mobile/src/app/(tabs)/bodyshop-repair.tsx
 * Replaces the stale file entirely.
 * Ground truth: src/pages/BodyshopRepairPage.tsx (web) + src/lib/api/bodyshopRepair.ts
 * Structure: follows floor-incharge.tsx patterns (FlatList, expand/collapse, toast, useFocusEffect)
 */
import { useCallback, useMemo, useState, type ReactElement } from 'react'
import {
  ActivityIndicator, Alert, FlatList, Linking, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StaffNavigationChrome, StaffInlineMenuButton } from '../../components/staff/StaffScreenShell'
import { StaffRefreshButton } from '../../components/staff/StaffRefreshButton'
import { OptimisticActionErrorBar } from '../../components/OptimisticActionErrorBar'
import { useOptimisticAction } from '../../hooks/useOptimisticAction'
import { useListSearch } from '../../hooks/useListSearch'
import { supabase } from '../../lib/supabase'
import {
  fetchBodyshopAssignmentsForJobCards,
} from '../../lib/api/bodyshopFloorList'
import { StaffListLoadErrorBanner } from '../../components/staff/StaffListLoadErrorBanner'
import { BodyshopSettlementBilling } from '../../components/BodyshopSettlementBilling'
import { bodyshopBranchLabel, matchesBodyshopBranchFilter } from '../../lib/bodyshopBranchLabel'

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomerType = 'individual' | 'firm' | 'foc' | 'cash'
type OverallStatus = 'active' | 'delivered' | 'cancelled'
type RepairTab = 'overview' | 'docs' | 'survey' | 'floor' | 'qc' | 'billing'

interface RepairCard {
  id: number
  reception_entry_id: number | null
  job_card_no: string
  reg_number: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_type: CustomerType | null
  branch: string | null
  sa_employee_code: string | null
  sa_name: string | null
  current_stage: number
  current_stage_name: string | null
  overall_status: OverallStatus
  insurance_policy_no: string | null
  insurance_company: string | null
  insurance_type: 'TMI' | 'Non-TMI' | null
  insurance_valid_date: string | null
  doc_claim_form: boolean
  doc_rc: boolean
  doc_rc_back?: boolean
  doc_insurance: boolean
  doc_dl: boolean
  doc_dl_back?: boolean
  doc_aadhaar: boolean
  doc_aadhaar_back?: boolean
  doc_pan: boolean
  doc_kyc: boolean
  doc_gst: boolean
  doc_company_pan: boolean
  doc_bank_detail: boolean
  doc_tp_affidavit?: boolean
  doc_survey_approval: boolean | null
  doc_rejected_keys?: string[] | null
  survey_date: string | null
  survey_status: string | null
  survay_info_by: string | null
  claim_intimation_no: string | null
  surveyor_name: string | null
  surveyor_contact: string | null
  approved_parts: string | null
  customer_approved: boolean
  estimated_amount: number | null
  bodyshop_floor: string | null
  floor_hold_reason: string | null
  additional_approval: string | null
  qc_status: string | null
  qc_checked_by: string | null
  qc_checked_at: string | null
  qc_passed_by: string | null
  qc_passed_at: string | null
  qc_fail_reason: string | null
  reinspection_status: string | null
  reinspection_type: string | null
  reinspection_by: string | null
  reinspection_at: string | null
  parts_entry_status: string | null
  billed_amount: number | null
  do_status: string | null
  do_amount: number | null
  customer_diff_amount: number | null
  payment_status: string | null
  do_payment_status: string | null
  customer_payment_status: string | null
  customer_settlement_kind: 'due' | 'refund' | 'none' | null
  delivery_status: string | null
  received_at: string | null
  delivered_at: string | null
  created_at: string
}

interface FloorRoleInfo {
  role: string
  employeeName: string | null
  workStatus: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<number, string> = {
  1: 'Vehicle Receiving', 2: 'Receiving Photos', 3: 'Job Card',
  4: 'Customer Group', 5: 'Documentation', 6: 'Estimation',
  7: 'Estimation Approval', 8: 'Claim Intimation', 9: 'Survey',
  10: 'Parts Status', 11: 'Floor Assignment', 12: 'Additional Approval',
  13: 'Quality Check', 14: 'Re-Inspection', 15: 'Billing',
  16: 'DO Status', 17: 'Delivery', 18: 'Payment',
}

const DISPLAY_STAGE_GROUPS: { label: string; stages: number[]; color: string; bg: string }[] = [
  { label: 'SA Intake', stages: [1,2,3,4,5,6,7,8,9,10], color: '#2f63cf', bg: '#e9f0fd' },
  { label: 'Floor',     stages: [11,12],                 color: '#7048cf', bg: '#efeafb' },
  { label: 'QC',        stages: [13],                    color: '#c9751b', bg: '#fbefdd' },
  { label: 'RI',        stages: [14],                    color: '#0f766e', bg: '#e6f7f4' },
  { label: 'Billing',   stages: [15,16],                 color: '#1c8f63', bg: '#e4f4ec' },
  { label: 'Delivery',  stages: [17,18],                 color: '#41617f', bg: '#e9eef3' },
]

function getDisplayGroup(stage: number) {
  return DISPLAY_STAGE_GROUPS.find(g => g.stages.includes(stage)) ?? DISPLAY_STAGE_GROUPS[0]
}

const RI_DONE_BY_OPTIONS = [
  { value: 'floor_incharge', label: 'Floor Incharge' },
  { value: 'surveyor', label: 'Surveyor' },
  { value: 'other', label: 'Other' },
] as const

function normalizeRiDoneBy(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === 'team_member') return 'floor_incharge'
  if (value === 'floor_incharge' || value === 'surveyor' || value === 'other') return value
  return value
}

function labelForRiDoneBy(raw: string | null | undefined): string {
  const value = normalizeRiDoneBy(raw)
  const match = RI_DONE_BY_OPTIONS.find(opt => opt.value === value)
  return match?.label ?? (value || '—')
}

type DocDef = { key: keyof RepairCard; label: string; mandatoryFor: CustomerType[] }
const DOC_DEFS: DocDef[] = [
  { key: 'doc_claim_form',  label: 'Claim Form',   mandatoryFor: ['individual', 'firm'] },
  { key: 'doc_rc',          label: 'RC (Front)',   mandatoryFor: ['individual', 'firm'] },
  { key: 'doc_rc_back',     label: 'RC (Back)',    mandatoryFor: ['individual', 'firm'] },
  { key: 'doc_insurance',   label: 'Insurance',    mandatoryFor: ['individual', 'firm'] },
  { key: 'doc_dl',          label: 'DL (Front)',   mandatoryFor: ['individual', 'firm'] },
  { key: 'doc_dl_back',     label: 'DL (Back)',    mandatoryFor: ['individual', 'firm'] },
  { key: 'doc_aadhaar',     label: 'Aadhaar (Front)', mandatoryFor: ['individual', 'firm'] },
  { key: 'doc_aadhaar_back',label: 'Aadhaar (Back)',  mandatoryFor: ['individual', 'firm'] },
  { key: 'doc_pan',         label: 'PAN',          mandatoryFor: ['individual', 'firm'] },
  { key: 'doc_kyc',         label: 'KYC',          mandatoryFor: [] },
  { key: 'doc_gst',         label: 'GST',          mandatoryFor: ['firm'] },
  { key: 'doc_company_pan', label: 'Company PAN',  mandatoryFor: ['firm'] },
  { key: 'doc_bank_detail', label: 'Bank Detail',  mandatoryFor: [] },
  { key: 'doc_tp_affidavit', label: 'T/P Affidavit', mandatoryFor: [] },
  { key: 'doc_survey_approval', label: 'Survey Approval', mandatoryFor: [] },
]

const CUSTOMER_TYPES: { value: CustomerType; label: string }[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'firm',       label: 'Firm' },
  { value: 'foc',        label: 'FOC' },
  { value: 'cash',       label: 'Cash' },
]

const STATUS_FILTER: { value: string; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: 'active',    label: 'Active' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTs(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getEffectiveStageFlow(card: RepairCard): number[] {
  const base = [1,2,3,4,5,6,7,8,9,10,11,13,14,15,16,17,18]
  if (card.additional_approval) {
    const idx = base.indexOf(13)
    base.splice(idx, 0, 12)
  }
  return base
}

function parseQcNames(raw: string | null | undefined): string[] {
  return String(raw ?? '').split(',').map(s => s.trim()).filter(Boolean)
    .filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i)
}

function joinQcNames(names: string[]): string {
  return names.filter(Boolean).join(', ')
}

function parseApprovedPartsCount(raw: string | null | undefined): number {
  if (!raw) return 0
  try {
    const p = JSON.parse(raw)
    const parts = p?.parts ?? p?.approved_parts ?? []
    return Array.isArray(parts) ? parts.filter((x: unknown) => x).length : 0
  } catch { return 0 }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BodyshopRepairScreen() {
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [toast,      setToast]      = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const [cards,     setCards]     = useState<RepairCard[]>([])
  const [employees, setEmployees] = useState<Array<{ employee_name: string; department: string | null }>>([])
  const [floorAssignments, setFloorAssignments] = useState<Record<string, FloorRoleInfo[]>>({})

  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [pipelineGroupFilter, setPipelineGroupFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const listSearch = useListSearch()
  const [loadError,    setLoadError]    = useState<string | null>(null)

  const [selectedCard, setSelectedCard] = useState<RepairCard | null>(null)
  const [activeTab,    setActiveTab]    = useState<RepairTab>('overview')
  const [patch,        setPatch]        = useState<Partial<RepairCard>>({})
  const [saving,       setSaving]       = useState(false)
  const optimistic = useOptimisticAction()
  const [qcOtherOpen,  setQcOtherOpen]  = useState(false)
  const [qcOtherSearch,setQcOtherSearch]= useState('')

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    else setRefreshing(true)
    setLoadError(null)
    try {
      const { data, error } = await supabase
        .from('bodyshop_repair_cards')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      const cardList = (data ?? []) as RepairCard[]
      setCards(cardList)

      const { data: empData } = await supabase
        .from('employee_master')
        .select('employee_name, department')
        .eq('is_active', true)
        .limit(500)
      setEmployees((empData ?? []) as Array<{ employee_name: string; department: string | null }>)

      const assRows = await fetchBodyshopAssignmentsForJobCards<Record<string, string | null>>(
        cardList.map(c => String(c.job_card_no ?? '')),
      )
      const assMap: Record<string, FloorRoleInfo[]> = {}
      assRows.forEach((row) => {
        const jc = String(row.job_card_number ?? '').trim().toUpperCase()
        assMap[jc] = [
          { role: 'Floor Incharge',  employeeName: row.supervisor_employee_name,     workStatus: row.supervisor_work_status },
          { role: 'Dentor',          employeeName: row.dentor_employee_name,          workStatus: row.dentor_work_status },
          { role: 'Dentor Helper',   employeeName: row.dentor_helper_employee_name,   workStatus: row.dentor_helper_work_status },
          { role: 'Painter',         employeeName: row.painter_employee_name,         workStatus: row.painter_work_status },
          { role: 'Painter Helper',  employeeName: row.painter_helper_employee_name,  workStatus: row.painter_helper_work_status },
          { role: 'Technician',      employeeName: row.technician_employee_name,      workStatus: row.technician_work_status },
          { role: 'Rubbing',         employeeName: row.rubbing_employee_name,         workStatus: row.rubbing_work_status },
          { role: 'EDP',             employeeName: row.edp_employee_name,             workStatus: row.edp_work_status },
          { role: 'Parts Incharge',  employeeName: row.parts_incharge_employee_name, workStatus: row.parts_incharge_work_status },
        ]
      })
      setFloorAssignments(assMap)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Load failed', 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { void loadAll() }, [loadAll]))

  // ── Helpers ───────────────────────────────────────────────────────────────

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const [uploadedDocsByKey, setUploadedDocsByKey] = useState<Record<string, { id: number; file_name: string; storage_path: string; drive_url?: string | null }>>({})
  const [loadingDocs, setLoadingDocs] = useState(false)

  const loadUploadedDocs = useCallback(async (cardId: number) => {
    setLoadingDocs(true)
    try {
      const { data, error } = await supabase
        .from('bodyshop_repair_card_documents')
        .select('id, doc_key, file_name, storage_path, drive_url, created_at')
        .eq('repair_card_id', cardId)
      if (!error && data) {
        const map: Record<string, any> = {}
        data.forEach((r: any) => {
          if (r.doc_key) map[r.doc_key] = r
        })
        setUploadedDocsByKey(map)
      }
    } catch {
      // ignore
    } finally {
      setLoadingDocs(false)
    }
  }, [])

  function openDetail(card: RepairCard) {
    setSelectedCard(card)
    setActiveTab('overview')
    setPatch({})
    setQcOtherOpen(false)
    void loadUploadedDocs(card.id)
  }

  async function saveDocDecision(docKey: string, approved: boolean) {
    if (!selectedCard) return
    const cardId = selectedCard.id
    const currentRejected = Array.isArray(selectedCard.doc_rejected_keys)
      ? selectedCard.doc_rejected_keys.map(String)
      : []
    const nextRejected = approved
      ? currentRejected.filter((k) => k !== docKey)
      : [...new Set([...currentRejected, docKey])]

    const updatePayload = {
      [docKey]: approved,
      doc_rejected_keys: nextRejected,
    } as Partial<RepairCard>

    const prevSelected = selectedCard
    const prevCards = cards
    const merged = { ...selectedCard, ...updatePayload }

    await optimistic.run(`doc-${docKey}`, {
      apply: () => {
        setSelectedCard(merged)
        setCards((prev) => prev.map((c) => (c.id === merged.id ? merged : c)))
      },
      rollback: () => {
        setSelectedCard(prevSelected)
        setCards(prevCards)
      },
      execute: async () => {
        const { error } = await supabase
          .from('bodyshop_repair_cards')
          .update(updatePayload)
          .eq('id', cardId)
        if (error) throw error
      },
      onSuccess: () => showToast(approved ? 'Document Approved ✓' : 'Document Rejected ✕', 'success'),
    })
  }

  async function openUploadedDoc(docKey: string) {
    const doc = uploadedDocsByKey[docKey]
    if (!doc) return
    if (doc.drive_url) {
      const ok = await Linking.canOpenURL(doc.drive_url)
      if (ok) await Linking.openURL(doc.drive_url)
      return
    }
    if (doc.storage_path) {
      const { data } = await supabase.storage.from('autodoc').createSignedUrl(doc.storage_path, 3600)
      if (data?.signedUrl) {
        const ok = await Linking.canOpenURL(data.signedUrl)
        if (ok) await Linking.openURL(data.signedUrl)
      }
    }
  }

  function applyPatch(update: Partial<RepairCard>) {
    setPatch(prev => ({ ...prev, ...update }))
  }

  const effectiveCard = useMemo((): RepairCard | null => {
    if (!selectedCard) return null
    return { ...selectedCard, ...patch }
  }, [selectedCard, patch])

  const hasPendingChanges = Object.keys(patch).length > 0

  async function savePatch() {
    if (!selectedCard || !hasPendingChanges) return
    const blocked = new Set([
      'payment_status',
      'customer_diff_amount',
      'do_payment_status',
      'customer_payment_status',
      'customer_settlement_kind',
      'parts_entry_status',
      'billed_amount',
      'do_status',
      'do_amount',
    ])
    const nextPatch = Object.fromEntries(
      Object.entries(patch).filter(([key]) => !blocked.has(key)),
    ) as Partial<RepairCard>
    if (Object.keys(nextPatch).length === 0) {
      setPatch({})
      return
    }
    const prevSelected = selectedCard
    const prevCards = cards
    const prevPatch = patch
    const merged = { ...selectedCard, ...nextPatch }

    await optimistic.run('save-patch', {
      apply: () => {
        setSelectedCard(merged)
        setCards((prev) => prev.map((c) => (c.id === merged.id ? merged : c)))
        setPatch({})
      },
      rollback: () => {
        setSelectedCard(prevSelected)
        setCards(prevCards)
        setPatch(prevPatch)
      },
      execute: async () => {
        const { error } = await supabase.from('bodyshop_repair_cards').update(nextPatch).eq('id', selectedCard.id)
        if (error) throw error
      },
      onSuccess: () => showToast('Saved', 'success'),
    })
  }

  async function advanceStage(card: RepairCard) {
    if (card.overall_status !== 'active') return
    const nextStage = card.current_stage + 1
    if (nextStage > 18) return
    Alert.alert(
      'Advance Stage',
      `Move from Stage ${card.current_stage} (${STAGE_LABELS[card.current_stage] ?? ''}) → Stage ${nextStage} (${STAGE_LABELS[nextStage] ?? ''})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'default', onPress: () => {
          void (async () => {
            const update = { current_stage: nextStage, current_stage_name: STAGE_LABELS[nextStage] ?? null }
            const merged: RepairCard = { ...card, ...update }
            const prevSelected = selectedCard
            const prevCards = cards
            await optimistic.run(`stage-${card.id}`, {
              apply: () => {
                setSelectedCard(merged)
                setCards((prev) => prev.map((c) => (c.id === merged.id ? merged : c)))
                setPatch({})
              },
              rollback: () => {
                setSelectedCard(prevSelected)
                setCards(prevCards)
              },
              execute: async () => {
                const { error } = await supabase.from('bodyshop_repair_cards').update(update).eq('id', card.id)
                if (error) throw error
              },
              onSuccess: () => showToast(`Advanced to Stage ${nextStage}`, 'success'),
            })
          })()
        }},
      ]
    )
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const branches = useMemo(
    () => Array.from(new Set(cards.map((c) => bodyshopBranchLabel(c.branch)))).sort(),
    [cards],
  )

  const scopedCards = useMemo(() => {
    let list = [...cards]
    if (statusFilter !== 'all') list = list.filter(c => c.overall_status === statusFilter)
    if (branchFilter !== 'all') list = list.filter(c => matchesBodyshopBranchFilter(c.branch, branchFilter))
    if (listSearch.appliedNorm) {
      const q = listSearch.appliedNorm
      list = list.filter(c =>
        c.job_card_no.toLowerCase().includes(q) ||
        (c.reg_number ?? '').toLowerCase().includes(q) ||
        (c.customer_name ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [cards, statusFilter, branchFilter, listSearch.appliedNorm])

  const stageCounts = useMemo(
    () =>
      DISPLAY_STAGE_GROUPS.map(g => ({
        ...g,
        count: scopedCards.filter(c => g.stages.includes(c.current_stage)).length,
      })),
    [scopedCards],
  )

  const filtered = useMemo(() => {
    if (pipelineGroupFilter === 'all') return scopedCards
    const group = DISPLAY_STAGE_GROUPS.find(g => g.label === pipelineGroupFilter)
    if (!group) return scopedCards
    return scopedCards.filter(c => group.stages.includes(c.current_stage))
  }, [scopedCards, pipelineGroupFilter])

  const hasExtraFilters =
    pipelineGroupFilter !== 'all' || branchFilter !== 'all' || statusFilter !== 'active' || listSearch.hasApplied

  const clearAllFilters = useCallback(() => {
    setPipelineGroupFilter('all')
    setBranchFilter('all')
    setStatusFilter('active')
    listSearch.clear()
  }, [listSearch])

  const bodyshopEmpNames = useMemo(() => {
    const seen = new Set<string>()
    return employees
      .filter(e => String(e.department ?? '').toUpperCase().includes('BODY'))
      .map(e => e.employee_name)
      .filter(n => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
      .sort((a, b) => a.localeCompare(b))
  }, [employees])

  const filterHeader = useMemo((): ReactElement => (
    <View style={S.filtersBlock}>
      <Text style={S.filterSectionLabel}>Pipeline — tap stage group</Text>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        style={S.filterScrollRow}
        contentContainerStyle={S.filterScrollContent}
      >
        {stageCounts.map(g => {
          const active = pipelineGroupFilter === g.label
          return (
            <TouchableOpacity
              key={g.label}
              onPress={() => setPipelineGroupFilter(active ? 'all' : g.label)}
              style={[
                S.pipelineChip,
                { backgroundColor: g.bg, borderColor: g.color },
                active && S.pipelineChipActive,
              ]}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: g.color }}>{g.label}</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: g.color, marginTop: 2 }}>{g.count}</Text>
              {active ? <Text style={S.pipelineChipActiveHint}>Selected</Text> : null}
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <View style={[S.searchWrap, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
        <TextInput
          style={[S.searchInput, { flex: 1 }]}
          placeholder="JC / reg… tap Search when ready"
          placeholderTextColor="#a7a99f"
          value={listSearch.draft}
          onChangeText={listSearch.setDraft}
          returnKeyType="search"
          onSubmitEditing={listSearch.apply}
          clearButtonMode="while-editing"
        />
        <TouchableOpacity style={S.searchApplyBtn} onPress={listSearch.apply}>
          <Text style={S.searchApplyBtnText}>Search</Text>
        </TouchableOpacity>
      </View>
      {listSearch.hasApplied ? (
        <Text style={S.searchAppliedHint}>Matches for “{listSearch.applied}”</Text>
      ) : null}

      <Text style={S.filterSectionLabel}>Status</Text>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        style={S.filterScrollRow}
        contentContainerStyle={S.filterScrollContent}
      >
        {STATUS_FILTER.map(f => {
          const active = statusFilter === f.value
          const col =
            f.value === 'active' ? '#2a4cd0'
            : f.value === 'delivered' ? '#1c8f63'
            : f.value === 'cancelled' ? '#c33b53'
            : '#1a1b21'
          return (
            <TouchableOpacity
              key={f.value}
              onPress={() => setStatusFilter(f.value)}
              style={[S.chip, active && { backgroundColor: col, borderColor: col }]}
            >
              <Text style={[S.chipText, active && { color: '#fff' }]}>{f.label}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <Text style={S.filterSectionLabel}>Branch</Text>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        style={[S.filterScrollRow, S.filterScrollRowLast]}
        contentContainerStyle={S.filterScrollContent}
      >
        <TouchableOpacity
          onPress={() => setBranchFilter('all')}
          style={[S.chip, branchFilter === 'all' && { backgroundColor: '#41617f', borderColor: '#41617f' }]}
        >
          <Text style={[S.chipText, branchFilter === 'all' && { color: '#fff' }]}>All branches</Text>
        </TouchableOpacity>
        {branches.map(b => {
          const active = branchFilter === b
          return (
            <TouchableOpacity
              key={b}
              onPress={() => setBranchFilter(active ? 'all' : b)}
              style={[S.chip, active && { backgroundColor: '#41617f', borderColor: '#41617f' }]}
            >
              <Text style={[S.chipText, active && { color: '#fff' }]}>{b}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {hasExtraFilters ? (
        <TouchableOpacity onPress={clearAllFilters} style={S.clearFiltersBtn}>
          <Text style={S.clearFiltersBtnText}>Clear filters</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={S.listHint}>
        Showing {filtered.length} of {scopedCards.length}
        {pipelineGroupFilter !== 'all' ? ` · ${pipelineGroupFilter}` : ''}
        {statusFilter !== 'all' ? ` · ${statusFilter}` : ''}
        {branchFilter !== 'all' ? ` · ${branchFilter}` : ''}
      </Text>
    </View>
  ), [
    stageCounts,
    pipelineGroupFilter,
    listSearch.hasApplied,
    statusFilter,
    branchFilter,
    branches,
    filtered.length,
    scopedCards.length,
    hasExtraFilters,
    clearAllFilters,
  ])

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={S.root}>
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color="#2a4cd0" />
      </SafeAreaView>
    )
  }

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selectedCard && effectiveCard) {
    const card = effectiveCard
    const group = getDisplayGroup(card.current_stage)
    const jcKey = String(card.job_card_no ?? '').trim().toUpperCase()
    const floorRoles = floorAssignments[jcKey] ?? []
    const stageFlow = getEffectiveStageFlow(card)
    const ct: CustomerType = card.customer_type ?? 'individual'
    const showInsurance = ct !== 'cash' && ct !== 'foc'
    const mandatoryDocs = DOC_DEFS.filter(d => d.mandatoryFor.includes(ct))
    const optionalDocs  = DOC_DEFS.filter(d => !d.mandatoryFor.includes(ct))
    const mandatoryDone = mandatoryDocs.filter(d => Boolean(card[d.key])).length
    const qcCheckers = parseQcNames(card.qc_checked_by)
    const otherNorm = qcOtherSearch.trim().toLowerCase()
    const otherEmpNames = bodyshopEmpNames.filter(n => {
      if (qcCheckers.some(s => s.toLowerCase() === n.toLowerCase())) return false
      if (otherNorm && !n.toLowerCase().includes(otherNorm)) return false
      return true
    })

    return (
      <SafeAreaView style={S.root}>
        {optimistic.failure ? (
        <OptimisticActionErrorBar
          message={optimistic.failure.message}
          onRetry={() => void optimistic.retry()}
          onDismiss={optimistic.clearFailure}
        />
      ) : null}
      {toast && <View style={[S.toast, toast.type === 'error' && S.toastError]}><Text style={S.toastText}>{toast.type === 'error' ? '✗' : '✓'}  {toast.msg}</Text></View>}

        <View style={S.detailHeader}>
          <StaffInlineMenuButton />
          <TouchableOpacity onPress={() => { setSelectedCard(null); setPatch({}) }} style={S.backBtn}>
            <Text style={S.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={S.detailTitle} numberOfLines={1}>{card.job_card_no} — {card.reg_number ?? '—'}</Text>
            <Text style={S.detailSub} numberOfLines={1}>{[
              card.reg_number?.trim().toUpperCase() !== card.job_card_no?.trim().toUpperCase() ? card.reg_number : null,
              card.customer_name,
              card.branch,
            ].filter(Boolean).join(' · ')}</Text>
          </View>
          <View style={[S.stageBadge, { backgroundColor: group.bg }]}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: group.color }}>Stage {card.current_stage}</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e7e3d9', maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: 8, alignItems: 'center', gap: 4 }}>
          {(['overview','docs','survey','floor','qc','billing'] as RepairTab[]).map(tab => {
            const active = activeTab === tab
            const labels: Record<RepairTab, string> = { overview: 'Overview', docs: 'SA & Docs', survey: 'Survey', floor: 'Floor', qc: 'QC/RI', billing: 'Billing' }
            return (
              <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[S.tabBtn, active && S.tabBtnActive]}>
                <Text style={[S.tabBtnText, active && S.tabBtnTextActive]}>{labels[tab]}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {hasPendingChanges && (
          <View style={S.saveBar}>
            <Text style={{ fontSize: 12, color: '#1a1b21', flex: 1 }}>Unsaved changes</Text>
            <TouchableOpacity onPress={() => setPatch({})} style={{ marginRight: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#82858f' }}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={savePatch} disabled={saving} style={[S.saveBtnSmall, saving && { opacity: 0.5 }]}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Save</Text>}
            </TouchableOpacity>
          </View>
        )}

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 80 }}>

          {activeTab === 'overview' && (
            <>
              <View style={S.kvCard}>
                {[
                  ['SA',        card.sa_name ?? '—'],
                  ['Branch',    card.branch ?? '—'],
                  ['Customer',  card.customer_name ?? '—'],
                  ['Phone',     card.customer_phone ?? '—'],
                  ['Received',  fmtDate(card.received_at)],
                  ['Delivered', fmtDate(card.delivered_at)],
                  ['Stage',     `${card.current_stage} — ${STAGE_LABELS[card.current_stage] ?? '—'}`],
                  ['Status',    card.overall_status],
                ].map(([label, value]) => (
                  <View key={label} style={S.kvRow}>
                    <Text style={S.kvLabel}>{label}</Text>
                    <Text style={S.kvValue}>{value}</Text>
                  </View>
                ))}
              </View>

              {card.overall_status === 'active' && card.current_stage < 18 && (
                <TouchableOpacity style={[S.advanceBtn, saving && { opacity: 0.5 }]} disabled={saving} onPress={() => advanceStage(card)}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Advance → Stage {card.current_stage + 1}: {STAGE_LABELS[card.current_stage + 1] ?? ''}</Text>
                </TouchableOpacity>
              )}

              <Text style={S.sectionTitle}>Stage Pipeline</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {stageFlow.map(s => {
                  const isDone    = s < card.current_stage
                  const isCurrent = s === card.current_stage
                  const g2 = getDisplayGroup(s)
                  return (
                    <View key={s} style={[S.stageChip,
                      isDone    && { backgroundColor: '#e7e3d9', borderColor: '#d9d4c7' },
                      isCurrent && { backgroundColor: g2.bg, borderColor: g2.color },
                    ]}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: isDone ? '#82858f' : isCurrent ? g2.color : '#a7a99f' }}>
                        {s}. {STAGE_LABELS[s] ?? ''}
                      </Text>
                    </View>
                  )
                })}
              </View>
            </>
          )}

          {activeTab === 'docs' && (
            <>
              {/* Customer Type */}
              <Text style={S.sectionTitle}>Customer Type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {CUSTOMER_TYPES.map(ct2 => {
                  const active = ct === ct2.value
                  return (
                    <TouchableOpacity key={ct2.value} onPress={() => applyPatch({ customer_type: ct2.value })}>
                      <View style={[S.chip, active && S.chipActive]}>
                        <Text style={[S.chipText, active && S.chipTextActive]}>{ct2.label}</Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {/* Insurance Details — editable, hidden for cash/foc */}
              {showInsurance && (
                <>
                  <Text style={S.sectionTitle}>Insurance Details</Text>
                  <View style={S.formCard}>
                    <Text style={S.fieldLabel}>Policy No.</Text>
                    <TextInput style={S.input} placeholder="Policy number" placeholderTextColor="#a7a99f"
                      value={card.insurance_policy_no ?? ''} onChangeText={t => applyPatch({ insurance_policy_no: t || null })} />

                    <Text style={[S.fieldLabel, { marginTop: 10 }]}>Insurance Company</Text>
                    <TextInput style={S.input} placeholder="Company name" placeholderTextColor="#a7a99f"
                      value={card.insurance_company ?? ''} onChangeText={t => applyPatch({ insurance_company: t || null })} />

                    <Text style={[S.fieldLabel, { marginTop: 10 }]}>Insurance Type</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {['TMI', 'Non-TMI'].map(t => {
                        const active = card.insurance_type === t
                        return (
                          <TouchableOpacity key={t} style={{ flex: 1 }} onPress={() => applyPatch({ insurance_type: t as 'TMI' | 'Non-TMI' })}>
                            <View style={[S.segChip, active && { backgroundColor: '#e9f0fd', borderColor: '#2f63cf' }]}>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#2f63cf' : '#82858f' }}>{t}</Text>
                            </View>
                          </TouchableOpacity>
                        )
                      })}
                    </View>

                    <Text style={[S.fieldLabel, { marginTop: 10 }]}>Valid Until (YYYY-MM-DD)</Text>
                    <TextInput style={S.input} placeholder="2025-12-31" placeholderTextColor="#a7a99f"
                      value={card.insurance_valid_date ?? ''} onChangeText={t => applyPatch({ insurance_valid_date: t || null })} />
                  </View>
                </>
              )}

              {/* Mandatory Docs */}
              {mandatoryDocs.length > 0 && (
                <>
                  <Text style={[S.sectionTitle, { marginTop: 16 }]}>Mandatory Documents ({mandatoryDone}/{mandatoryDocs.length})</Text>
                  <View style={{ height: 6, backgroundColor: '#e7e3d9', borderRadius: 3, marginBottom: 10 }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: '#2a4cd0', width: `${mandatoryDocs.length ? (mandatoryDone / mandatoryDocs.length) * 100 : 0}%` }} />
                  </View>
                  <View style={S.formCard}>
                    {mandatoryDocs.map((doc, i) => {
                      const approved = Boolean(card[doc.key])
                      const rejectedKeys = Array.isArray(card.doc_rejected_keys) ? card.doc_rejected_keys.map(String) : []
                      const rejected = !approved && rejectedKeys.includes(String(doc.key))
                      const uploaded = uploadedDocsByKey[String(doc.key)]
                      return (
                        <View key={doc.key} style={[S.docRow, i < mandatoryDocs.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#f6f4ee' }, { paddingVertical: 10 }]}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={{ fontSize: 13, color: approved ? '#1a1b21' : '#475569', fontWeight: approved ? '700' : '500' }}>{doc.label}</Text>
                              {approved ? (
                                <View style={[S.statusPill, { backgroundColor: '#e4f4ec', borderColor: '#1c8f63' }]}>
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#1c8f63' }}>Approved ✓</Text>
                                </View>
                              ) : rejected ? (
                                <View style={[S.statusPill, { backgroundColor: '#fee2e2', borderColor: '#ef4444' }]}>
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#b91c1c' }}>Rejected ✕</Text>
                                </View>
                              ) : uploaded ? (
                                <View style={[S.statusPill, { backgroundColor: '#eff6ff', borderColor: '#3b82f6' }]}>
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#1d4ed8' }}>Uploaded 📄</Text>
                                </View>
                              ) : (
                                <View style={[S.statusPill, { backgroundColor: '#fef3c7', borderColor: '#f59e0b' }]}>
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#92400e' }}>Pending ⏳</Text>
                                </View>
                              )}
                            </View>
                            {uploaded?.file_name ? (
                              <Text style={{ fontSize: 11, color: '#64748b', marginTop: 3 }} numberOfLines={1}>
                                📎 {uploaded.file_name}
                              </Text>
                            ) : null}
                          </View>
                          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                            {uploaded ? (
                              <TouchableOpacity
                                onPress={() => void openUploadedDoc(String(doc.key))}
                                style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5 }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>👁️ View</Text>
                              </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity
                              onPress={() => void saveDocDecision(String(doc.key), true)}
                              style={{ backgroundColor: approved ? '#dcfce7' : '#f0fdf4', borderColor: '#86efac', borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5 }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803d' }}>{approved ? '✓ Approved' : '✓ Approve'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => void saveDocDecision(String(doc.key), false)}
                              style={{ backgroundColor: rejected ? '#fee2e2' : '#fef2f2', borderColor: '#fca5a5', borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5 }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#b91c1c' }}>{rejected ? '✕ Rejected' : '✕ Reject'}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                </>
              )}

              {/* Optional Docs */}
              {optionalDocs.length > 0 && (
                <>
                  <Text style={[S.sectionTitle, { marginTop: 16 }]}>Optional Documents</Text>
                  <View style={S.formCard}>
                    {optionalDocs.map((doc, i) => {
                      const approved = Boolean(card[doc.key])
                      const rejectedKeys = Array.isArray(card.doc_rejected_keys) ? card.doc_rejected_keys.map(String) : []
                      const rejected = !approved && rejectedKeys.includes(String(doc.key))
                      const uploaded = uploadedDocsByKey[String(doc.key)]
                      return (
                        <View key={doc.key} style={[S.docRow, i < optionalDocs.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#f6f4ee' }, { paddingVertical: 10 }]}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={{ fontSize: 13, color: approved ? '#1a1b21' : '#475569', fontWeight: approved ? '700' : '400' }}>{doc.label}</Text>
                              {approved ? (
                                <View style={[S.statusPill, { backgroundColor: '#e4f4ec', borderColor: '#1c8f63' }]}>
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#1c8f63' }}>Approved ✓</Text>
                                </View>
                              ) : rejected ? (
                                <View style={[S.statusPill, { backgroundColor: '#fee2e2', borderColor: '#ef4444' }]}>
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#b91c1c' }}>Rejected ✕</Text>
                                </View>
                              ) : uploaded ? (
                                <View style={[S.statusPill, { backgroundColor: '#eff6ff', borderColor: '#3b82f6' }]}>
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#1d4ed8' }}>Uploaded 📄</Text>
                                </View>
                              ) : (
                                <View style={[S.statusPill, { backgroundColor: '#f6f4ee', borderColor: '#d9d4c7' }]}>
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#a7a99f' }}>—</Text>
                                </View>
                              )}
                            </View>
                            {uploaded?.file_name ? (
                              <Text style={{ fontSize: 11, color: '#64748b', marginTop: 3 }} numberOfLines={1}>
                                📎 {uploaded.file_name}
                              </Text>
                            ) : null}
                          </View>
                          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                            {uploaded ? (
                              <TouchableOpacity
                                onPress={() => void openUploadedDoc(String(doc.key))}
                                style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5 }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>👁️ View</Text>
                              </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity
                              onPress={() => void saveDocDecision(String(doc.key), true)}
                              style={{ backgroundColor: approved ? '#dcfce7' : '#f0fdf4', borderColor: '#86efac', borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5 }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803d' }}>{approved ? '✓ Approved' : '✓ Approve'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => void saveDocDecision(String(doc.key), false)}
                              style={{ backgroundColor: rejected ? '#fee2e2' : '#fef2f2', borderColor: '#fca5a5', borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5 }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#b91c1c' }}>{rejected ? '✕ Rejected' : '✕ Reject'}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                </>
              )}
            </>
          )}

          {activeTab === 'survey' && (
            <>
              {/* Claim Intimation */}
              <Text style={S.sectionTitle}>Claim Intimation</Text>
              <View style={S.formCard}>
                <Text style={S.fieldLabel}>Claim Intimation No.</Text>
                <TextInput style={S.input} placeholder="Enter claim no." placeholderTextColor="#a7a99f"
                  value={card.claim_intimation_no ?? ''} onChangeText={t => applyPatch({ claim_intimation_no: t || null })} />
              </View>

              {/* Surveyor */}
              <Text style={[S.sectionTitle, { marginTop: 16 }]}>Surveyor</Text>
              <View style={S.formCard}>
                <Text style={S.fieldLabel}>Surveyor Name</Text>
                <TextInput style={S.input} placeholder="Surveyor full name" placeholderTextColor="#a7a99f"
                  value={card.surveyor_name ?? ''} onChangeText={t => applyPatch({ surveyor_name: t || null })} />

                <Text style={[S.fieldLabel, { marginTop: 10 }]}>Surveyor Contact</Text>
                <TextInput style={S.input} placeholder="Mobile number" placeholderTextColor="#a7a99f" keyboardType="phone-pad"
                  value={card.surveyor_contact ?? ''} onChangeText={t => applyPatch({ surveyor_contact: t || null })} />

                <Text style={[S.fieldLabel, { marginTop: 10 }]}>Survey Status</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {['pending', 'scheduled', 'done', 'hold'].map(s => {
                    const active = (card.survey_status ?? '') === s
                    return (
                      <TouchableOpacity key={s} onPress={() => applyPatch({ survey_status: s })}>
                        <View style={[S.chip, active && { backgroundColor: '#7048cf', borderColor: '#7048cf' }]}>
                          <Text style={[S.chipText, active && { color: '#fff' }]}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                        </View>
                      </TouchableOpacity>
                    )
                  })}
                </View>

                <Text style={[S.fieldLabel, { marginTop: 10 }]}>Survey Date (YYYY-MM-DD)</Text>
                <TextInput style={S.input} placeholder="2025-07-01" placeholderTextColor="#a7a99f"
                  value={card.survey_date ?? ''} onChangeText={t => applyPatch({ survey_date: t || null })} />
              </View>

              {/* Estimation */}
              <Text style={[S.sectionTitle, { marginTop: 16 }]}>Estimation</Text>
              <View style={S.formCard}>
                <Text style={S.fieldLabel}>Estimated Amount (₹)</Text>
                <TextInput style={S.input} placeholder="0" placeholderTextColor="#a7a99f" keyboardType="numeric"
                  value={card.estimated_amount != null ? String(card.estimated_amount) : ''}
                  onChangeText={t => applyPatch({ estimated_amount: t ? Number(t) : null })} />

                <Text style={[S.fieldLabel, { marginTop: 10 }]}>Customer Approved</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[{ v: true, label: 'Yes' }, { v: false, label: 'No' }].map(o => {
                    const active = card.customer_approved === o.v
                    return (
                      <TouchableOpacity key={o.label} style={{ flex: 1 }} onPress={() => applyPatch({ customer_approved: o.v })}>
                        <View style={[S.segChip, active && { backgroundColor: o.v ? '#e4f4ec' : '#fbe9ec', borderColor: o.v ? '#1c8f63' : '#c33b53' }]}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: active ? (o.v ? '#1c8f63' : '#c33b53') : '#82858f' }}>{o.label}</Text>
                        </View>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>

              {/* Approved Parts summary */}
              <Text style={[S.sectionTitle, { marginTop: 16 }]}>Approved Parts</Text>
              <View style={S.formCard}>
                <Text style={{ fontSize: 13, color: card.approved_parts ? '#1a1b21' : '#82858f' }}>
                  {card.approved_parts
                    ? `${parseApprovedPartsCount(card.approved_parts)} part${parseApprovedPartsCount(card.approved_parts) !== 1 ? 's' : ''} approved`
                    : 'No approved parts recorded yet'}
                </Text>
              </View>
            </>
          )}

          {activeTab === 'floor' && (
            <>
              <Text style={S.sectionTitle}>Floor Assignment (read-only)</Text>
              <Text style={{ fontSize: 12, color: '#82858f', marginBottom: 12 }}>Edit assignments in the Bodyshop Floor screen.</Text>
              {floorRoles.length === 0 ? (
                <Text style={{ fontSize: 13, color: '#82858f' }}>No floor assignments found.</Text>
              ) : floorRoles.map(r => {
                const ws = r.workStatus ?? ''
                const statusColor = ws === 'completed' ? '#1c8f63' : ws === 'hold' ? '#c9751b' : ws === 'work_inprocess' ? '#2f63cf' : '#82858f'
                const statusBg    = ws === 'completed' ? '#e4f4ec' : ws === 'hold' ? '#fbefdd' : ws === 'work_inprocess' ? '#e9f0fd' : '#f6f4ee'
                return (
                  <View key={r.role} style={S.floorRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#82858f', textTransform: 'uppercase', letterSpacing: 0.3 }}>{r.role}</Text>
                      <Text style={{ fontSize: 13, color: r.employeeName ? '#1a1b21' : '#a7a99f', fontWeight: r.employeeName ? '600' : '400', marginTop: 1 }}>{r.employeeName ?? 'Not assigned'}</Text>
                    </View>
                    {r.employeeName && (
                      <View style={[S.statusPill, { backgroundColor: statusBg, borderColor: statusColor }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor }}>
                          {ws === 'work_inprocess' ? 'In Process' : ws === 'completed' ? 'Completed' : ws === 'hold' ? 'Hold' : ws || 'Unassigned'}
                        </Text>
                      </View>
                    )}
                  </View>
                )
              })}
              <View style={[S.kvCard, { marginTop: 14 }]}>
                <View style={S.kvRow}>
                  <Text style={S.kvLabel}>Floor</Text>
                  <Text style={S.kvValue}>{card.bodyshop_floor ?? '—'}</Text>
                </View>
                {card.floor_hold_reason && (
                  <View style={S.kvRow}>
                    <Text style={S.kvLabel}>Hold Reason</Text>
                    <Text style={S.kvValue}>{card.floor_hold_reason}</Text>
                  </View>
                )}
              </View>
            </>
          )}

          {activeTab === 'qc' && (
            <>
              <Text style={S.sectionTitle}>Quality Check</Text>
              <Text style={S.fieldLabel}>QC Status</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {['pending','pass','fail'].map(o => {
                  const active = (card.qc_status ?? 'pending') === o
                  const col = o === 'pass' ? '#1c8f63' : o === 'fail' ? '#c33b53' : '#82858f'
                  return (
                    <TouchableOpacity key={o} style={{ flex: 1 }} onPress={() => applyPatch({ qc_status: o })}>
                      <View style={[S.statusChip, active && { backgroundColor: `${col}15`, borderColor: col }]}>
                        <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? col : '#82858f', textTransform: 'capitalize' }}>{o}</Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <Text style={S.fieldLabel}>Checked By</Text>
              {qcCheckers.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {qcCheckers.map(name => (
                    <TouchableOpacity key={name} style={S.checkerChip} onPress={() => {
                      applyPatch({ qc_checked_by: joinQcNames(qcCheckers.filter(n => n.toLowerCase() !== name.toLowerCase())) })
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>{name} ×</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={[S.fieldLabel, { marginTop: 4, marginBottom: 6 }]}>Bodyshop Employees</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {bodyshopEmpNames.slice(0, 20).map(name => {
                  const active = qcCheckers.some(s => s.toLowerCase() === name.toLowerCase())
                  return (
                    <TouchableOpacity key={name} onPress={() => {
                      const next = active ? qcCheckers.filter(s => s.toLowerCase() !== name.toLowerCase()) : [...qcCheckers, name]
                      applyPatch({ qc_checked_by: joinQcNames(next) })
                    }}>
                      <View style={[S.chip, active && S.chipActive]}>
                        <Text style={[S.chipText, active && S.chipTextActive]}>{name}</Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <TouchableOpacity onPress={() => setQcOtherOpen(prev => !prev)} style={[S.chip, { alignSelf: 'flex-start', marginBottom: 8 }]}>
                <Text style={S.chipText}>{qcOtherOpen ? 'Hide others' : 'Other Employees'}</Text>
              </TouchableOpacity>
              {qcOtherOpen && (
                <View style={{ marginBottom: 12 }}>
                  <TextInput style={S.searchInputSm} placeholder="Search..." placeholderTextColor="#a7a99f" value={qcOtherSearch} onChangeText={setQcOtherSearch} />
                  {otherEmpNames.slice(0, 30).map(name => {
                    const active = qcCheckers.some(s => s.toLowerCase() === name.toLowerCase())
                    return (
                      <TouchableOpacity key={name} onPress={() => {
                        const next = active ? qcCheckers.filter(s => s.toLowerCase() !== name.toLowerCase()) : [...qcCheckers, name]
                        applyPatch({ qc_checked_by: joinQcNames(next) })
                      }}>
                        <Text style={{ fontSize: 13, padding: 6, color: active ? '#2a4cd0' : '#1a1b21', fontWeight: active ? '700' : '400' }}>{name}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}

              {(card.qc_status ?? 'pending') === 'fail' && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={S.fieldLabel}>Fail Reason *</Text>
                  <TextInput style={S.remarkInput} multiline placeholder="Describe the fail reason..." placeholderTextColor="#a7a99f"
                    value={card.qc_fail_reason ?? ''} onChangeText={t => applyPatch({ qc_fail_reason: t })} />
                </View>
              )}

              <View style={S.kvCard}>
                {[
                  ['Checked At',    fmtTs(card.qc_checked_at)],
                  ['Passed By',     card.qc_passed_by ?? '—'],
                  ['Passed At',     fmtTs(card.qc_passed_at)],
                ].map(([label, value]) => (
                  <View key={label} style={S.kvRow}>
                    <Text style={S.kvLabel}>{label}</Text>
                    <Text style={S.kvValue}>{value}</Text>
                  </View>
                ))}
              </View>

              <Text style={[S.sectionTitle, { marginTop: 16 }]}>Re-Inspection</Text>
              <Text style={S.fieldLabel}>RI Status</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {['pending', 'completed'].map(o => {
                  const active = (card.reinspection_status ?? 'pending') === o
                  const col = o === 'completed' ? '#1c8f63' : '#82858f'
                  return (
                    <TouchableOpacity key={o} style={{ flex: 1 }} onPress={() => applyPatch({ reinspection_status: o })}>
                      <View style={[S.statusChip, active && { backgroundColor: `${col}15`, borderColor: col }]}>
                        <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? col : '#82858f', textTransform: 'capitalize' }}>{o}</Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <Text style={S.fieldLabel}>RI Done By</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {RI_DONE_BY_OPTIONS.map(opt => {
                  const active = normalizeRiDoneBy(card.reinspection_type) === opt.value
                  return (
                    <TouchableOpacity key={opt.value} style={{ flexGrow: 1, minWidth: '30%' }} onPress={() => applyPatch({
                      reinspection_type: opt.value,
                      reinspection_by: opt.value === 'other' ? (card.reinspection_by ?? '') : null,
                    })}>
                      <View style={[S.statusChip, active && { backgroundColor: '#e9effe', borderColor: '#2a4cd0' }]}>
                        <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? '#2a4cd0' : '#82858f' }}>{opt.label}</Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {normalizeRiDoneBy(card.reinspection_type) === 'other' && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={S.fieldLabel}>Other Name *</Text>
                  <TextInput style={S.input} placeholder="Enter name" placeholderTextColor="#a7a99f"
                    value={card.reinspection_by ?? ''} onChangeText={t => applyPatch({ reinspection_by: t || null })} />
                </View>
              )}

              <View style={S.kvCard}>
                <View style={S.kvRow}>
                  <Text style={S.kvLabel}>RI Done At</Text>
                  <Text style={S.kvValue}>{fmtTs(card.reinspection_at)}</Text>
                </View>
                {normalizeRiDoneBy(card.reinspection_type) && normalizeRiDoneBy(card.reinspection_type) !== 'other' && (
                  <View style={S.kvRow}>
                    <Text style={S.kvLabel}>Done By</Text>
                    <Text style={S.kvValue}>{labelForRiDoneBy(card.reinspection_type)}</Text>
                  </View>
                )}
              </View>
            </>
          )}

          {activeTab === 'billing' && (
            <>
              <BodyshopSettlementBilling
                card={card}
                styles={S}
                onToast={showToast}
                onCardChange={(next) => {
                  setSelectedCard(next)
                  setCards(prev => prev.map(c => c.id === next.id ? next : c))
                }}
              />

              {/* Delivery */}
              <Text style={[S.sectionTitle, { marginTop: 16 }]}>Delivery</Text>
              <View style={S.formCard}>
                <Text style={S.fieldLabel}>Delivery Status</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                  {['pending', 'ready', 'delivered'].map(s => {
                    const active = (card.delivery_status ?? '') === s
                    return (
                      <TouchableOpacity key={s} onPress={() => applyPatch({ delivery_status: s })}>
                        <View style={[S.chip, active && { backgroundColor: s === 'delivered' ? '#1c8f63' : '#2a4cd0', borderColor: s === 'delivered' ? '#1c8f63' : '#2a4cd0' }]}>
                          <Text style={[S.chipText, active && { color: '#fff' }]}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                        </View>
                      </TouchableOpacity>
                    )
                  })}
                </View>

                {card.delivered_at && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={S.fieldLabel}>Delivered At</Text>
                    <Text style={{ fontSize: 13, color: '#1a1b21', fontWeight: '600' }}>{fmtTs(card.delivered_at)}</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={S.root}>
      {optimistic.failure ? (
        <OptimisticActionErrorBar
          message={optimistic.failure.message}
          onRetry={() => void optimistic.retry()}
          onDismiss={optimistic.clearFailure}
        />
      ) : null}
      {toast && <View style={[S.toast, toast.type === 'error' && S.toastError]}><Text style={S.toastText}>{toast.type === 'error' ? '✗' : '✓'}  {toast.msg}</Text></View>}

      <StaffListLoadErrorBanner message={loadError ?? ''} onRetry={() => void loadAll(true)} />

      <StaffNavigationChrome
        title="Bodyshop Repair"
        subtitle={`${filtered.length} shown${pipelineGroupFilter !== 'all' ? ` · ${pipelineGroupFilter}` : ''}`}
        rightAction={<StaffRefreshButton onPress={() => loadAll(true)} />}
      />

      <FlatList
        style={S.listFlex}
        data={filtered}
        keyExtractor={item => String(item.id)}
        ListHeaderComponent={filterHeader}
        stickyHeaderIndices={undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} />}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 80, gap: 10 }}
        ListEmptyComponent={<View style={S.empty}><Text style={S.emptyIcon}>🔧</Text><Text style={S.emptyText}>No vehicles match these filters</Text></View>}
        renderItem={({ item: card }) => {
          const group = getDisplayGroup(card.current_stage)
          const statusColor = card.overall_status === 'active' ? '#2a4cd0' : card.overall_status === 'delivered' ? '#1c8f63' : '#c33b53'
          const statusBg    = card.overall_status === 'active' ? '#e9effe' : card.overall_status === 'delivered' ? '#e4f4ec' : '#fbe9ec'
          return (
            <TouchableOpacity style={S.card} onPress={() => openDetail(card)} activeOpacity={0.8}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <Text style={S.cardJc}>{card.job_card_no}</Text>
                <View style={[S.statusPill, { backgroundColor: statusBg, borderColor: statusColor }]}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor, textTransform: 'capitalize' }}>{card.overall_status}</Text>
                </View>
              </View>
              <Text style={S.cardReg}>{[
                card.reg_number?.trim().toUpperCase() !== card.job_card_no?.trim().toUpperCase() ? card.reg_number : null,
                card.customer_name,
                bodyshopBranchLabel(card.branch) !== 'Unknown' ? bodyshopBranchLabel(card.branch) : null,
              ].filter(Boolean).join(' · ')}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <View style={[S.stageBadge, { backgroundColor: group.bg }]}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: group.color }}>Stage {card.current_stage}: {STAGE_LABELS[card.current_stage] ?? ''}</Text>
                </View>
                <Text style={{ fontSize: 11, color: '#a7a99f' }}>{fmtDate(card.received_at)}</Text>
              </View>
              {card.sa_name && <Text style={{ fontSize: 11, color: '#82858f', marginTop: 4 }}>SA: {card.sa_name}</Text>}
            </TouchableOpacity>
          )
        }}
      />
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root:             { flex: 1, backgroundColor: '#f4f2ec' },
  toast:            { position: 'absolute', top: 60, left: 16, right: 16, zIndex: 999, backgroundColor: '#1c8f63', borderRadius: 10, padding: 12 },
  toastError:       { backgroundColor: '#c33b53' },
  toastText:        { color: '#fff', fontWeight: '700', fontSize: 13 },
  topBar:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14, paddingBottom: 8 },
  screenTitle:      { fontSize: 20, fontWeight: '800', color: '#1a1b21' },
  screenSubtitle:   { fontSize: 12.5, color: '#82858f', fontWeight: '500', marginTop: 2 },
  refreshBtn:       { padding: 8 },
  refreshBtnText:   { fontSize: 20, color: '#2a4cd0' },
  listFlex:         { flex: 1 },
  filtersBlock:     { paddingBottom: 4 },
  filterSectionLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#82858f',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 8,
    marginBottom: 6,
  },
  filterScrollRow:  { flexGrow: 0, flexShrink: 0, maxHeight: 88 },
  filterScrollRowLast: { marginBottom: 4 },
  filterScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 20,
    gap: 8,
    paddingVertical: 2,
  },
  searchWrap:       { marginTop: 4, marginBottom: 4 },
  pipelineChip:     { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center', minWidth: 78 },
  pipelineChipActive: { borderWidth: 2.5, transform: [{ scale: 1.02 }] },
  pipelineChipActiveHint: { fontSize: 8, fontWeight: '800', color: '#1a1b21', marginTop: 2, textTransform: 'uppercase' },
  clearFiltersBtn:  { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 6, paddingHorizontal: 10 },
  clearFiltersBtnText: { fontSize: 12, fontWeight: '700', color: '#2a4cd0' },
  listHint:         { fontSize: 11, color: '#82858f', marginTop: 8, marginBottom: 4 },
  searchInput:      { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e3d9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13.5, color: '#1a1b21' },
  searchApplyBtn:   { backgroundColor: '#1a1b21', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  searchApplyBtnText:{ color: '#fff', fontSize: 13, fontWeight: '800' },
  searchAppliedHint:{ fontSize: 11, color: '#82858f', marginBottom: 6, paddingHorizontal: 2 },
  searchInputSm:    { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e3d9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#1a1b21', marginBottom: 6 },
  chip:             { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, backgroundColor: '#fbfaf6', borderWidth: 1, borderColor: '#e7e3d9' },
  chipActive:       { backgroundColor: '#1a1b21', borderColor: '#1a1b21' },
  chipText:         { fontSize: 11.5, fontWeight: '700', color: '#4b4e59' },
  chipTextActive:   { color: '#fff' },
  card:             { backgroundColor: '#fff', borderRadius: 14, padding: 13, borderWidth: 1, borderColor: '#e7e3d9', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  cardJc:           { fontSize: 14.5, fontWeight: '700', color: '#1a1b21' },
  cardReg:          { fontSize: 12.5, color: '#4b4e59', fontWeight: '500', marginTop: 2 },
  stageBadge:       { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
  statusPill:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusChip:       { padding: 8, borderRadius: 8, alignItems: 'center', backgroundColor: '#f6f4ee', borderWidth: 1, borderColor: 'transparent' },
  empty:            { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyIcon:        { fontSize: 40 },
  emptyText:        { fontSize: 14, color: '#82858f' },
  detailHeader:     { backgroundColor: '#fff', padding: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e7e3d9', flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  backBtn:          { paddingRight: 4, paddingTop: 2 },
  backBtnText:      { fontSize: 16, fontWeight: '700', color: '#2a4cd0' },
  detailTitle:      { fontSize: 15.5, fontWeight: '800', color: '#1a1b21' },
  detailSub:        { fontSize: 12, color: '#4b4e59', marginTop: 2 },
  tabBtn:           { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:     { borderBottomColor: '#2a4cd0' },
  tabBtnText:       { fontSize: 12.5, fontWeight: '700', color: '#82858f' },
  tabBtnTextActive: { color: '#2a4cd0' },
  saveBar:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#e7e3d9' },
  saveBtnSmall:     { backgroundColor: '#2a4cd0', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  sectionTitle:     { fontSize: 13, fontWeight: '800', color: '#1a1b21', marginBottom: 8 },
  fieldLabel:       { fontSize: 10.5, fontWeight: '700', color: '#82858f', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  kvCard:           { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e7e3d9', padding: 12, marginBottom: 8 },
  kvRow:            { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  kvLabel:          { fontSize: 12, color: '#82858f', fontWeight: '600', flex: 1 },
  kvValue:          { fontSize: 12, color: '#1a1b21', fontWeight: '600', flex: 2, textAlign: 'right' },
  advanceBtn:       { backgroundColor: '#2a4cd0', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 16 },
  stageChip:        { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: '#f6f4ee', borderWidth: 1, borderColor: '#e7e3d9' },
  docRow:           { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f6f4ee' },
  checkbox:         { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#d9d4c7', backgroundColor: '#f6f4ee', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked:  { backgroundColor: '#2a4cd0', borderColor: '#2a4cd0' },
  floorRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#e7e3d9' },
  remarkInput:      { backgroundColor: '#f6f4ee', borderWidth: 1, borderColor: '#e7e3d9', borderRadius: 8, padding: 10, fontSize: 13, minHeight: 60, color: '#1a1b21' },
  checkerChip:      { backgroundColor: '#e9effe', borderWidth: 1, borderColor: '#b3c5fc', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  formCard:         { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e7e3d9', padding: 14, marginBottom: 8 },
  input:            { backgroundColor: '#f6f4ee', borderWidth: 1, borderColor: '#e7e3d9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#1a1b21' },
  segChip:          { padding: 9, borderRadius: 8, alignItems: 'center', backgroundColor: '#f6f4ee', borderWidth: 1, borderColor: '#e7e3d9' },
  loadMoreBtn: {
    alignSelf: 'center',
    marginVertical: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2a4cd0',
  },
  loadMoreBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
})
