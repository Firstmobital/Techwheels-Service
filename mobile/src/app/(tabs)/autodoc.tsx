/**
 * Body & Paint Dashboard (BP-01)
 * 
 * Redesigned to match reference artboard `bp` from design-refactor-bundle.
 * Maintains all existing data layer, filtering, and navigation logic.
 * Visual-only refactor using new token palette, fonts, and Icon wrapper.
 * 
 * Reference: local_folder/Reference/MobileAppRedesignReference/.../design-refactor-bundle/reference-design/Techwheels Service Screens.html#bp
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  listJobCardSummaries,
  type JobDashboardSummaryRow,
  type JobCardStatus,
} from '../../lib/api/jobCards'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon, PrimaryButton } from '../../components/ui'
import { StatusPill } from '../../components/ui/StatusPill'
import { Pipeline } from '../../components/ui/Pipeline'

type WorkflowStage =
  | 'active_intake'
  | 'documentation_pre_repair'
  | 'estimate'
  | 'pre_submit_pending'
  | 'pre_submit_done'
  | 'post_repair_ppt'
  | 'claim_submitted'

type DashboardCardFilter = 'active_vehicles' | 'today' | 'completed' | WorkflowStage

function isTodayComplaintDate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const today = new Date().toISOString().split('T')[0]
  return dateStr === today
}

function deriveWorkflowStage(
  row: JobDashboardSummaryRow,
  postRepairReadyJobIds: Set<string>,
  estimatePendingJobIds: Set<string>,
  preSubmitReadyJobIds: Set<string>
): WorkflowStage {
  const jobCardId = row.job_card_id ?? ''
  if (row.status === 'completed') return 'claim_submitted'
  if (jobCardId && postRepairReadyJobIds.has(jobCardId)) return 'post_repair_ppt'
  if (row.status === 'submitted') return 'pre_submit_done'
  if ((row.status === 'in_work' || row.status === 'approved') && jobCardId && preSubmitReadyJobIds.has(jobCardId)) {
    return 'pre_submit_pending'
  }
  if ((row.status === 'in_work' || row.status === 'approved') && jobCardId && estimatePendingJobIds.has(jobCardId)) {
    return 'estimate'
  }
  if (row.status === 'approved') return 'pre_submit_pending'
  if (row.status === 'in_work') return 'documentation_pre_repair'
  return 'active_intake'
}

function stageLabel(stage: WorkflowStage): string {
  if (stage === 'claim_submitted') return 'Claim Submitted'
  if (stage === 'post_repair_ppt') return 'Post Repair PPT'
  if (stage === 'pre_submit_done') return 'Submitted'
  if (stage === 'pre_submit_pending') return 'Pre-Submit'
  if (stage === 'estimate') return 'Estimate'
  if (stage === 'documentation_pre_repair') return 'Documentation'
  return 'Intake'
}

function primaryActionLabel(stage: WorkflowStage): string {
  if (stage === 'claim_submitted') return 'View'
  if (stage === 'post_repair_ppt') return 'Submit'
  if (stage === 'pre_submit_done' || stage === 'pre_submit_pending') return 'Submit'
  if (stage === 'estimate') return 'Estimate'
  if (stage === 'documentation_pre_repair') return 'Repair'
  return 'Continue'
}

function formatINR(amount: number | null | undefined): string {
  if (!amount) return '₹0'
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

// Stage filter config for the horizontal strip
interface StageFilterConfig {
  key: DashboardCardFilter
  label: string
  stripColor: string
}

const STAGE_FILTERS: StageFilterConfig[] = [
  { key: 'documentation_pre_repair', label: 'Documentation', stripColor: '#ca771f' },
  { key: 'estimate', label: 'Estimate', stripColor: '#6f49cb' },
  { key: 'pre_submit_pending', label: 'Pre-Submit', stripColor: '#ca771f' },
  { key: 'post_repair_ppt', label: 'Post-Repair', stripColor: '#2f63cf' },
  { key: 'active_intake', label: 'Intake', stripColor: '#82858f' },
]

// Color dots for vehicle colors
const COLOUR_DOTS: Record<string, string> = {
  'Pristine White': '#f5f5f5',
  'Cosmic Gold': '#c9a24a',
  'Daytona Grey': '#6c6f76',
  'Pure Grey': '#9b9ea4',
  'Flame Red': '#c0392b',
  'Atlas Black': '#22232a',
}

function statusDotColor(status: JobCardStatus | null | undefined): string {
  if (status === 'in_work') return '#cc3a2e'
  if (status === 'approved') return '#1a1b21'
  if (status === 'submitted') return '#9aa0ac'
  if (status === 'completed') return '#8f96a3'
  return '#cfc9bd'
}

export default function AutoDocScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { session, loading: authLoading } = useAuth()
  const [jobCards, setJobCards] = useState<JobDashboardSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<DashboardCardFilter>('active_vehicles')
  const [error, setError] = useState<string | null>(null)
  const [postRepairReadyJobIds, setPostRepairReadyJobIds] = useState<Set<string>>(new Set())
  const [estimatePendingJobIds, setEstimatePendingJobIds] = useState<Set<string>>(new Set())
  const [preSubmitReadyJobIds, setPreSubmitReadyJobIds] = useState<Set<string>>(new Set())

  const loadJobCards = useCallback(async () => {
    try {
      const sessionRes = await supabase.auth.getSession()
      const activeSession = session ?? sessionRes.data.session
      if (!activeSession) {
        setJobCards([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      setError(null)

      const result = await listJobCardSummaries()
      if (result.error) {
        setError(result.error)
        return
      }

      const rows = result.data ?? []
      if (rows.length > 0) {
        setJobCards(rows)
        return
      }

      // Hard fallback
      const directRes = await supabase
        .from('job_cards')
        .select('id, jc_number, reg_number, complaint_date, status, km_reading')
        .order('created_at', { ascending: false })
        .limit(200)

      if (directRes.error) {
        setJobCards([])
        return
      }

      const fallbackRows: JobDashboardSummaryRow[] = (directRes.data ?? []).map((row) => ({
        job_card_id: row.id,
        jc_number: row.jc_number,
        reg_number: row.reg_number,
        model: null,
        vehicle_year: null,
        colour: null,
        complaint_date: row.complaint_date,
        status: (row.status as JobCardStatus) ?? 'draft',
        warranty_age_days: null,
        tml_share_percent: null,
        total_estimate_amount: 0,
        panel_count: 0,
        photo_count: 0,
        has_ppt_pre: false,
        has_ppt_post: false,
        owner_name: null,
        km_reading: row.km_reading,
        panel_names: [],
      }))

      setJobCards(fallbackRows)
    } catch (err: any) {
      const msg = String(err?.message ?? 'Failed to load Body & Paint')
      if (/refresh token|invalid refresh token|auth/i.test(msg)) {
        setError('Session expired. Please sign in again.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [session])

  useEffect(() => {
    if (authLoading) return
    setLoading(true)
    void loadJobCards()
  }, [authLoading, loadJobCards])

  useFocusEffect(
    useCallback(() => {
      if (authLoading) return
      void loadJobCards()
    }, [authLoading, loadJobCards])
  )

  useEffect(() => {
    let cancelled = false

    async function computePostRepairReadiness() {
      const jobCardIds = jobCards
        .map((row) => row.job_card_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)

      if (jobCardIds.length === 0) {
        if (!cancelled) setPostRepairReadyJobIds(new Set())
        return
      }

      const [panelsRes, photosRes] = await Promise.all([
        supabase.from('panels').select('id, job_card_id').in('job_card_id', jobCardIds),
        supabase
          .from('panel_photos')
          .select('job_card_id, panel_id')
          .in('job_card_id', jobCardIds)
          .eq('repair_stage', 'post-repair'),
      ])

      if (cancelled || panelsRes.error || photosRes.error) {
        if (!cancelled) setPostRepairReadyJobIds(new Set())
        return
      }

      const selectedPanelIdsByJob = new Map<string, Set<string>>()
      for (const panel of panelsRes.data ?? []) {
        if (!panel.job_card_id || !panel.id) continue
        const existing = selectedPanelIdsByJob.get(panel.job_card_id) ?? new Set<string>()
        existing.add(panel.id)
        selectedPanelIdsByJob.set(panel.job_card_id, existing)
      }

      const postRepairPanelIdsByJob = new Map<string, Set<string>>()
      for (const photo of photosRes.data ?? []) {
        if (!photo.job_card_id || !photo.panel_id) continue
        const existing = postRepairPanelIdsByJob.get(photo.job_card_id) ?? new Set<string>()
        existing.add(photo.panel_id)
        postRepairPanelIdsByJob.set(photo.job_card_id, existing)
      }

      const readySet = new Set<string>()
      for (const [jobCardId, selectedPanelsSet] of selectedPanelIdsByJob.entries()) {
        if (selectedPanelsSet.size === 0) continue
        const postRepairPanelsSet = postRepairPanelIdsByJob.get(jobCardId) ?? new Set<string>()
        const hasAllPanels = Array.from(selectedPanelsSet).every((panelId) =>
          postRepairPanelsSet.has(panelId)
        )
        if (hasAllPanels) readySet.add(jobCardId)
      }

      if (!cancelled) setPostRepairReadyJobIds(readySet)
    }

    void computePostRepairReadiness()
    return () => {
      cancelled = true
    }
  }, [jobCards])

  useEffect(() => {
    let cancelled = false

    async function computeEstimatePendingJobs() {
      const estimateCandidateJobCardIds = jobCards
        .filter((row) => row.status === 'in_work' || row.status === 'approved')
        .map((row) => row.job_card_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)

      if (estimateCandidateJobCardIds.length === 0) {
        if (!cancelled) setEstimatePendingJobIds(new Set())
        if (!cancelled) setPreSubmitReadyJobIds(new Set())
        return
      }

      const [panelsRes, preRepairPhotosRes, estimateRowsRes] = await Promise.all([
        supabase
          .from('panels')
          .select('id, job_card_id, panel_name')
          .in('job_card_id', estimateCandidateJobCardIds),
        supabase
          .from('panel_photos')
          .select('job_card_id, panel_id')
          .in('job_card_id', estimateCandidateJobCardIds)
          .eq('repair_stage', 'pre-repair'),
        supabase
          .from('estimate_rows')
          .select('job_card_id, panel_name, action, defect, part_number')
          .in('job_card_id', estimateCandidateJobCardIds),
      ])

      if (cancelled || panelsRes.error || preRepairPhotosRes.error || estimateRowsRes.error) {
        if (!cancelled) setEstimatePendingJobIds(new Set())
        if (!cancelled) setPreSubmitReadyJobIds(new Set())
        return
      }

      const selectedPanelIdsByJob = new Map<string, Set<string>>()
      const selectedPanelNamesByJob = new Map<string, Set<string>>()

      for (const panel of panelsRes.data ?? []) {
        if (!panel.job_card_id || !panel.id) continue
        const panelIds = selectedPanelIdsByJob.get(panel.job_card_id) ?? new Set<string>()
        panelIds.add(panel.id)
        selectedPanelIdsByJob.set(panel.job_card_id, panelIds)

        const panelName = panel.panel_name?.trim().toLowerCase()
        if (!panelName) continue
        const panelNames = selectedPanelNamesByJob.get(panel.job_card_id) ?? new Set<string>()
        panelNames.add(panelName)
        selectedPanelNamesByJob.set(panel.job_card_id, panelNames)
      }

      const preRepairPanelIdsByJob = new Map<string, Set<string>>()
      for (const photo of preRepairPhotosRes.data ?? []) {
        if (!photo.job_card_id || !photo.panel_id) continue
        const panelIds = preRepairPanelIdsByJob.get(photo.job_card_id) ?? new Set<string>()
        panelIds.add(photo.panel_id)
        preRepairPanelIdsByJob.set(photo.job_card_id, panelIds)
      }

      const completedEstimatePanelsByJob = new Map<string, Set<string>>()
      for (const row of estimateRowsRes.data ?? []) {
        const jobCardId = row.job_card_id
        const panelName = row.panel_name?.trim().toLowerCase()
        if (!jobCardId || !panelName) continue

        const action = String(row.action ?? '').trim().toLowerCase()
        const defect = String(row.defect ?? '').trim()
        const partNumber = String(row.part_number ?? '').trim()
        const hasBaseRequiredFields = Boolean(action && defect)
        const needsPartNumber = action === 'replace' || action === 'parts replacement' || action === 'part replacement'
        const hasPartNumber = !needsPartNumber || Boolean(partNumber)
        const isComplete = hasBaseRequiredFields && hasPartNumber
        if (!isComplete) continue

        const completedPanels = completedEstimatePanelsByJob.get(jobCardId) ?? new Set<string>()
        completedPanels.add(panelName)
        completedEstimatePanelsByJob.set(jobCardId, completedPanels)
      }

      const pendingSet = new Set<string>()
      const preSubmitReadySet = new Set<string>()
      for (const jobCardId of estimateCandidateJobCardIds) {
        const selectedPanelIds = selectedPanelIdsByJob.get(jobCardId) ?? new Set<string>()
        if (selectedPanelIds.size === 0) continue

        const preRepairPanelIds = preRepairPanelIdsByJob.get(jobCardId) ?? new Set<string>()
        const hasAllPreRepairPanels = Array.from(selectedPanelIds).every((panelId) => preRepairPanelIds.has(panelId))
        if (!hasAllPreRepairPanels) continue

        pendingSet.add(jobCardId)

        const selectedPanelNames = selectedPanelNamesByJob.get(jobCardId) ?? new Set<string>()
        if (selectedPanelNames.size === 0) continue

        const completedEstimatePanels = completedEstimatePanelsByJob.get(jobCardId) ?? new Set<string>()
        const hasCompleteEstimateForAllPanels = Array.from(selectedPanelNames).every((panelName) => completedEstimatePanels.has(panelName))

        if (hasCompleteEstimateForAllPanels) {
          preSubmitReadySet.add(jobCardId)
        }
      }

      if (!cancelled) setEstimatePendingJobIds(pendingSet)
      if (!cancelled) setPreSubmitReadyJobIds(preSubmitReadySet)
    }

    void computeEstimatePendingJobs()
    return () => {
      cancelled = true
    }
  }, [jobCards])

  const onRefresh = () => {
    setRefreshing(true)
    loadJobCards()
  }

  const openStageForRow = (row: JobDashboardSummaryRow, stage: WorkflowStage) => {
    if (!row.job_card_id) {
      Alert.alert('Action Unavailable', 'This job card is missing an identifier.')
      return
    }

    const baseParams = {
      id: row.job_card_id,
      jcNumber: row.jc_number ?? '',
      regNumber: row.reg_number ?? '',
    }

    if (stage === 'claim_submitted' || stage === 'post_repair_ppt' || stage === 'pre_submit_done' || stage === 'pre_submit_pending') {
      router.push({ pathname: '/job-cards/[id]/submit', params: baseParams })
      return
    }

    if (stage === 'estimate') {
      router.push({ pathname: '/job-cards/[id]/estimate', params: baseParams })
      return
    }

    if (stage === 'documentation_pre_repair') {
      router.push({ pathname: '/job-cards/[id]/damage', params: baseParams })
      return
    }

    router.push({ pathname: '/job-cards/[id]/jobcard', params: baseParams })
  }

  const rowsWithStage = useMemo(
    () => jobCards.map((row) => ({ row, stage: deriveWorkflowStage(row, postRepairReadyJobIds, estimatePendingJobIds, preSubmitReadyJobIds) })),
    [jobCards, postRepairReadyJobIds, estimatePendingJobIds, preSubmitReadyJobIds]
  )

  const stageCounts = useMemo(() => {
    const counts: Record<WorkflowStage | 'today', number> = {
      active_intake: 0,
      documentation_pre_repair: 0,
      estimate: 0,
      pre_submit_pending: 0,
      pre_submit_done: 0,
      post_repair_ppt: 0,
      claim_submitted: 0,
      today: 0,
    }

    for (const { row, stage } of rowsWithStage) {
      counts[stage]++
      if (isTodayComplaintDate(row.complaint_date)) counts.today++
    }

    return counts
  }, [rowsWithStage])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()

    return rowsWithStage.filter(({ row, stage }) => {
      if (stageFilter === 'today') {
        if (!isTodayComplaintDate(row.complaint_date)) return false
      } else if (stageFilter === 'completed') {
        if (stage !== 'claim_submitted') return false
      } else if (stageFilter === 'active_vehicles') {
        if (stage === 'claim_submitted') return false
      } else if (stage !== stageFilter) {
        return false
      }

      if (!q) return true

      const jc = String(row.jc_number ?? '').toLowerCase()
      const reg = String(row.reg_number ?? '').toLowerCase()
      const model = String(row.model ?? '').toLowerCase()
      const owner = String(row.owner_name ?? '').toLowerCase()

      return jc.includes(q) || reg.includes(q) || model.includes(q) || owner.includes(q)
    })
  }, [rowsWithStage, search, stageFilter])

  return (
    <View style={{ flex: 1, backgroundColor: '#f4f2ec' }}>
      {loading && !refreshing ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <ActivityIndicator size="large" color="#2a4cd0" />
          <Text style={{ fontSize: 14, color: '#a7a99f', marginTop: 12 }}>Loading job cards...</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#c33b53', marginBottom: 4 }}>Unable to load</Text>
          <Text style={{ fontSize: 14, color: '#c33b53', textAlign: 'center', marginBottom: 16 }}>{error}</Text>
          <View style={{ width: 140 }}>
            <PrimaryButton title="Retry" onPress={onRefresh} />
          </View>
        </View>
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={(item, index) => `${item.row.job_card_id ?? item.row.jc_number ?? 'job'}-${index}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListHeaderComponent={
            <>
              {/* Header */}
              <View
                style={{
                  paddingTop: Math.max(insets.top + 6, 16),
                  paddingBottom: 10,
                  paddingHorizontal: 16,
                  backgroundColor: '#ffffff',
                  borderBottomWidth: 1,
                  borderBottomColor: '#e7e3d9',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <TouchableOpacity
                      style={{ width: 38, height: 38, borderRadius: 999, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d9d4c7', justifyContent: 'center', alignItems: 'center' }}
                      onPress={() => router.push('/(tabs)/home')}
                    >
                      <Icon name="chevron-left" size={20} color="#1a1b21" strokeWidth={2} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.09, textTransform: 'uppercase', color: '#2a4cd0', marginBottom: 2 }}>Module</Text>
                      <Text style={{ fontSize: 18, fontWeight: '600', color: '#1a1b21' }}>Body & Paint</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d9d4c7', justifyContent: 'center', alignItems: 'center' }}
                      onPress={() => router.push('/(tabs)/alerts')}
                    >
                      <Icon name="bell" size={18} color="#1a1b21" strokeWidth={1.5} />
                    </TouchableOpacity>
                    <View
                      style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: '#f4f2ec', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#d9d4c7' }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#2a4cd0' }}>V</Text>
                    </View>
                  </View>
                </View>

                {/* Search */}
                <View style={{ position: 'relative' }}>
                  <View style={{ position: 'absolute', left: 13, top: '50%', zIndex: 10, transform: [{ translateY: -8.5 }] }}>
                    <Icon name="search" size={17} color="#82858f" strokeWidth={1.5} />
                  </View>
                  <TextInput
                    style={{
                      fontSize: 14.5,
                      color: '#1a1b21',
                      backgroundColor: '#f6f4ee',
                      borderWidth: 1,
                      borderColor: '#d9d4c7',
                      borderRadius: 10,
                      paddingVertical: 12,
                      paddingHorizontal: 38,
                      fontFamily: 'Plus Jakarta Sans',
                    }}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search JC, reg, model or owner"
                    placeholderTextColor="#a7a99f"
                  />
                </View>
              </View>

              {/* Segmented Control */}
              <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    backgroundColor: '#f6f4ee',
                    borderWidth: 1,
                    borderColor: '#e7e3d9',
                    borderRadius: 999,
                    padding: 3,
                    gap: 3,
                  }}
                >
                  {[
                    { key: 'active_vehicles' as DashboardCardFilter, label: `Active · ${rowsWithStage.filter((entry) => entry.stage !== 'claim_submitted').length}` },
                    { key: 'today' as DashboardCardFilter, label: `Today · ${stageCounts.today}` },
                    { key: 'completed' as DashboardCardFilter, label: `Done · ${stageCounts.claim_submitted}` },
                  ].map((seg) => (
                    <TouchableOpacity
                      key={seg.key}
                      style={{
                        flex: 1,
                        paddingVertical: 9,
                        paddingHorizontal: 8,
                        borderRadius: 999,
                        backgroundColor: stageFilter === seg.key ? '#ffffff' : 'transparent',
                        borderWidth: stageFilter === seg.key ? 0 : 0,
                        shadowOpacity: stageFilter === seg.key ? 0.07 : 0,
                      }}
                      onPress={() => setStageFilter(seg.key)}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: stageFilter === seg.key ? '#1a1b21' : '#82858f', textAlign: 'center', fontFamily: 'Plus Jakarta Sans' }}>
                        {seg.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Stage Filter Strip */}
              <View style={{ marginVertical: 0, paddingHorizontal: 0 }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 10 }}
                  scrollEventThrottle={16}
                >
                  {STAGE_FILTERS.map((filter) => {
                    const isActive = stageFilter === filter.key
                    const count = stageCounts[filter.key as keyof typeof stageCounts] || 0
                    return (
                      <TouchableOpacity
                        key={filter.key}
                        style={{
                          width: 116,
                          paddingHorizontal: 13,
                          paddingTop: 12,
                          paddingBottom: 11,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: isActive ? '#2a4cd0' : '#e7e3d9',
                          backgroundColor: '#ffffff',
                          gap: 0,
                        }}
                        onPress={() => setStageFilter(isActive ? 'active_vehicles' : filter.key)}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <View
                            style={{
                              width: 36,
                              height: 8,
                              borderRadius: 999,
                              backgroundColor: filter.stripColor,
                            }}
                          />
                          <Icon name="chevron-right" size={15} color="#a7a99f" strokeWidth={1.5} />
                        </View>
                        <Text style={{ fontSize: 24, fontWeight: '700', color: '#1a1b21', fontFamily: 'Space Grotesk' }}>{count}</Text>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#7d8090', marginTop: 1, fontFamily: 'Plus Jakarta Sans' }}>{filter.label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              </View>

              {/* List Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginVertical: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.09, textTransform: 'uppercase', color: '#82858f' }}>
                  {filteredRows.length} Job Card{filteredRows.length === 1 ? '' : 's'}
                </Text>
                {stageFilter !== 'active_vehicles' && stageFilter !== 'today' && stageFilter !== 'completed' && (
                  <TouchableOpacity onPress={() => setStageFilter('active_vehicles')}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Icon name="x" size={13} color="#2a4cd0" strokeWidth={2.5} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#2a4cd0', fontFamily: 'Plus Jakarta Sans' }}>Clear filter</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              {/* Empty State */}
              {filteredRows.length === 0 && (
                <View style={{ paddingHorizontal: 16, paddingVertical: 32, alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#1a1b21', marginBottom: 8 }}>No job cards match</Text>
                  <Text style={{ fontSize: 14, color: '#82858f', textAlign: 'center' }}>Try a different filter or search term.</Text>
                </View>
              )}
            </>
          }
          renderItem={({ item }) => {
            const { row, stage } = item
            const modelLabel = row.model?.trim() ? row.model : 'Model'
            const yearLabel = row.vehicle_year ? String(row.vehicle_year) : ''
            const vehicleColorDot = COLOUR_DOTS[row.colour ?? ''] || '#d9d4c7'
            const cardStatusDot = statusDotColor(row.status)
            const hasEstimate = (row.total_estimate_amount ?? 0) > 0

            return (
              <TouchableOpacity
                style={{
                  marginHorizontal: 16,
                  marginVertical: 6,
                  backgroundColor: '#ffffff',
                  borderWidth: 1,
                  borderColor: '#e7e3d9',
                  borderRadius: 16,
                  padding: 15,
                  overflow: 'hidden',
                }}
                onPress={() => openStageForRow(row, stage)}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <Text style={{ fontSize: 14.5, fontWeight: '700', color: '#1a1b21', fontFamily: 'JetBrains Mono', flex: 1 }}>
                    {row.jc_number ?? 'Unknown JC'}
                  </Text>
                  <StatusPill status={row.status} size="sm" />
                </View>

                {/* Reg, Model, Color */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#4b4e59', fontFamily: 'JetBrains Mono' }}>
                    {row.reg_number ?? 'Unknown reg'}
                  </Text>
                  <Text style={{ fontSize: 12.5, color: '#a7a99f' }}>·</Text>
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#4b4e59' }}>
                    {modelLabel} {yearLabel}
                  </Text>
                  <View
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: 5.5,
                      backgroundColor: vehicleColorDot,
                      borderWidth: 1,
                      borderColor: '#d9d4c7',
                    }}
                  />
                  <View
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: 7.5,
                      backgroundColor: cardStatusDot,
                      borderWidth: 1,
                      borderColor: '#d9d4c7',
                      marginLeft: 'auto',
                    }}
                  />
                </View>

                {/* Pipeline */}
                <View style={{ marginTop: 6, marginBottom: 8 }}>
                  <Pipeline stage={stage} compact />
                </View>

                {/* Divider */}
                <View style={{ height: 1, backgroundColor: '#e7e3d9', marginVertical: 13 }} />

                {/* Bottom Row: Icons and CTA */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <View style={{ flexDirection: 'row', gap: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Icon name="grid" size={14} color="#82858f" strokeWidth={1.5} />
                      <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#4b4e59', fontFamily: 'Plus Jakarta Sans' }}>
                        {row.panel_count ?? 0}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Icon name="camera" size={14} color="#82858f" strokeWidth={1.5} />
                      <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#4b4e59', fontFamily: 'Plus Jakarta Sans' }}>
                        {row.photo_count ?? 0}
                      </Text>
                    </View>
                    {hasEstimate && (
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#4b4e59', fontFamily: 'JetBrains Mono' }}>
                        {formatINR(row.total_estimate_amount)}
                      </Text>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#2a4cd0', fontFamily: 'Plus Jakarta Sans' }}>
                      {primaryActionLabel(stage)}
                    </Text>
                    <Icon name="arrow-right" size={15} color="#2a4cd0" strokeWidth={2} />
                  </View>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}

      {/* FAB Button */}
      {!loading && !error && (
        <TouchableOpacity
          style={{
            position: 'absolute',
            right: 18,
            bottom: 22,
            height: 52,
            paddingHorizontal: 20,
            borderRadius: 999,
            backgroundColor: '#2a4cd0',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 9,
            shadowColor: '#2a4cd0',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
            elevation: 12,
          }}
          onPress={() => router.push('/job-cards/create')}
        >
          <Icon name="plus" size={20} color="#ffffff" strokeWidth={2.5} />
          <Text style={{ fontSize: 14.5, fontWeight: '700', color: '#ffffff', fontFamily: 'Plus Jakarta Sans' }}>New Job Card</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}
