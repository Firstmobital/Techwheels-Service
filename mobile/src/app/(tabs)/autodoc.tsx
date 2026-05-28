import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  listJobCardSummaries,
  type JobDashboardSummaryRow,
  type JobCardStatus,
  updateJobCardStatus,
} from '../../lib/api/jobCards'
import { supabase } from '../../lib/supabase'

type WorkflowStage =
  | 'active_intake'
  | 'documentation_pre_repair'
  | 'estimate'
  | 'pre_submit_pending'
  | 'pre_submit_done'
  | 'post_repair_ppt'
  | 'claim_submitted'

type DashboardCardFilter = 'active_vehicles' | WorkflowStage

const STAGE_FILTERS: Array<{ key: DashboardCardFilter; label: string }> = [
  { key: 'active_vehicles', label: 'Active Vehicles' },
  { key: 'active_intake', label: 'Active Intake' },
  { key: 'documentation_pre_repair', label: 'Pre-Repair' },
  { key: 'estimate', label: 'Estimate' },
  { key: 'pre_submit_pending', label: 'Pre Submit Pending' },
  { key: 'pre_submit_done', label: 'Pre Submit Done' },
  { key: 'post_repair_ppt', label: 'Post Repair PPT' },
  { key: 'claim_submitted', label: 'Claim Submitted' },
]

function canonicalizeEstimateAction(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return ''
  if (normalized === 'parts replacement' || normalized === 'part replacement') return 'replace'
  if (normalized === 'repair') return 'repaint'
  return normalized
}

function deriveWorkflowStage(
  row: JobDashboardSummaryRow,
  postRepairReadyJobIds: Set<string>,
  estimatePendingJobIds: Set<string>
): WorkflowStage {
  if (row.status === 'completed') return 'claim_submitted'
  if (postRepairReadyJobIds.has(row.job_card_id)) return 'post_repair_ppt'
  if (row.status === 'submitted') return 'pre_submit_done'
  if ((row.status === 'in_work' || row.status === 'approved') && estimatePendingJobIds.has(row.job_card_id)) {
    return 'estimate'
  }
  if (row.status === 'approved') return 'pre_submit_pending'
  if (row.status === 'in_work') return 'documentation_pre_repair'
  return 'active_intake'
}

function nextStatus(status: JobCardStatus): JobCardStatus | null {
  if (status === 'draft') return 'in_work'
  if (status === 'in_work') return 'approved'
  if (status === 'approved') return 'submitted'
  if (status === 'submitted') return 'completed'
  return null
}

function stageBadgeClass(stage: WorkflowStage): string {
  if (stage === 'claim_submitted') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (stage === 'post_repair_ppt') return 'bg-indigo-50 text-indigo-700 border-indigo-200'
  if (stage === 'pre_submit_done') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (stage === 'pre_submit_pending') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (stage === 'estimate') return 'bg-violet-50 text-violet-700 border-violet-200'
  if (stage === 'documentation_pre_repair') return 'bg-orange-50 text-orange-700 border-orange-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function stageLabel(stage: WorkflowStage): string {
  if (stage === 'claim_submitted') return 'Claim Submitted'
  if (stage === 'post_repair_ppt') return 'Post Repair PPT'
  if (stage === 'pre_submit_done') return 'Pre Submit Done'
  if (stage === 'pre_submit_pending') return 'Pre Submit Pending'
  if (stage === 'estimate') return 'Estimate'
  if (stage === 'documentation_pre_repair') return 'Documentation Pre-Repair'
  return 'Active Intake'
}

export default function AutoDocScreen() {
  const router = useRouter()
  const [jobCards, setJobCards] = useState<JobDashboardSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<DashboardCardFilter>('active_vehicles')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [postRepairReadyJobIds, setPostRepairReadyJobIds] = useState<Set<string>>(new Set())
  const [estimatePendingJobIds, setEstimatePendingJobIds] = useState<Set<string>>(new Set())

  const loadJobCards = useCallback(async () => {
    try {
      setError(null)
      const result = await listJobCardSummaries()
      if (result.error) {
        setError(result.error)
        return
      }
      setJobCards(result.data ?? [])
    } catch (err: any) {
      setError(err.message || 'Failed to load AutoDoc job cards')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadJobCards()
  }, [loadJobCards])

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
        supabase
          .from('panels')
          .select('id, job_card_id')
          .in('job_card_id', jobCardIds),
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
        const hasAllPanels = Array.from(selectedPanelsSet).every((panelId) => postRepairPanelsSet.has(panelId))
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

        const action = canonicalizeEstimateAction(String(row.action ?? ''))
        const defect = String(row.defect ?? '').trim()
        const partNumber = String(row.part_number ?? '').trim()
        const hasBaseRequiredFields = Boolean(action && defect)
        const needsPartNumber = action === 'replace'
        const hasPartNumber = !needsPartNumber || Boolean(partNumber)
        const isComplete = hasBaseRequiredFields && hasPartNumber
        if (!isComplete) continue

        const completedPanels = completedEstimatePanelsByJob.get(jobCardId) ?? new Set<string>()
        completedPanels.add(panelName)
        completedEstimatePanelsByJob.set(jobCardId, completedPanels)
      }

      const pendingSet = new Set<string>()
      for (const jobCardId of estimateCandidateJobCardIds) {
        const selectedPanelIds = selectedPanelIdsByJob.get(jobCardId) ?? new Set<string>()
        if (selectedPanelIds.size === 0) continue

        const preRepairPanelIds = preRepairPanelIdsByJob.get(jobCardId) ?? new Set<string>()
        const hasAllPreRepairPanels = Array.from(selectedPanelIds).every((panelId) => preRepairPanelIds.has(panelId))
        if (!hasAllPreRepairPanels) continue

        const selectedPanelNames = selectedPanelNamesByJob.get(jobCardId) ?? new Set<string>()
        if (selectedPanelNames.size === 0) continue

        const completedEstimatePanels = completedEstimatePanelsByJob.get(jobCardId) ?? new Set<string>()
        const hasCompleteEstimateForAllPanels = Array.from(selectedPanelNames).every((panelName) => completedEstimatePanels.has(panelName))

        if (!hasCompleteEstimateForAllPanels) {
          pendingSet.add(jobCardId)
        }
      }

      if (!cancelled) setEstimatePendingJobIds(pendingSet)
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

  const onQuickStatusAdvance = async (item: JobDashboardSummaryRow) => {
    if (!item.job_card_id) {
      Alert.alert('Action Unavailable', 'This job card is missing an identifier.')
      return
    }

    const currentStatus = (item.status ?? 'draft') as JobCardStatus
    const targetStatus = nextStatus(currentStatus)
    if (!targetStatus) {
      Alert.alert('No Further Action', 'This job card is already at the final stage.')
      return
    }

    setUpdatingId(item.job_card_id)
    try {
      const result = await updateJobCardStatus(item.job_card_id, targetStatus)
      if (result.error) {
        Alert.alert('Update Failed', result.error)
      } else {
        Alert.alert('Updated', `${item.jc_number ?? 'Job card'} moved to ${targetStatus}.`)
        loadJobCards()
      }
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Unknown error')
    } finally {
      setUpdatingId(null)
    }
  }

  const rowsWithStage = useMemo(
    () => jobCards.map((row) => ({ row, stage: deriveWorkflowStage(row, postRepairReadyJobIds, estimatePendingJobIds) })),
    [jobCards, postRepairReadyJobIds, estimatePendingJobIds]
  )

  const kpis = useMemo(() => {
    const count = (stage: WorkflowStage) => rowsWithStage.filter((entry) => entry.stage === stage).length
    return {
      totalToday: rowsWithStage.filter((entry) => {
        const dt = entry.row.complaint_date ? new Date(entry.row.complaint_date) : null
        if (!dt || Number.isNaN(dt.getTime())) return false
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return dt >= today
      }).length,
      activeIntake: count('active_intake'),
      documentationPreRepair: count('documentation_pre_repair'),
      estimate: count('estimate'),
      preSubmitPending: count('pre_submit_pending'),
      preSubmitDone: count('pre_submit_done'),
      postRepairPpt: count('post_repair_ppt'),
      claimSubmitted: count('claim_submitted'),
    }
  }, [rowsWithStage])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()

    return rowsWithStage.filter(({ row, stage }) => {
      if (stageFilter === 'active_vehicles') {
        if (stage === 'claim_submitted') return false
      } else if (stage !== stageFilter) {
        return false
      }

      if (!q) return true

      const jc = String(row.jc_number ?? '').toLowerCase()
      const reg = String(row.reg_number ?? '').toLowerCase()
      const model = String(row.model ?? '').toLowerCase()
      return jc.includes(q) || reg.includes(q) || model.includes(q)
    })
  }, [rowsWithStage, search, stageFilter])

  const renderKpiCard = (label: string, value: number, colorClass: string) => (
    <View className={`rounded-xl border px-3 py-2 mr-2 min-w-[120px] ${colorClass}`}>
      <Text className="text-xs font-semibold uppercase tracking-wide">{label}</Text>
      <Text className="text-2xl font-bold mt-1">{value}</Text>
    </View>
  )

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white border-b border-gray-200 px-4 pt-4 pb-3">
        <Text className="text-2xl font-bold text-gray-800 mb-1">AutoDoc</Text>
        <Text className="text-sm text-gray-600">Live job cards and status workflow</Text>

        <TouchableOpacity
          className="mt-3 rounded-lg border border-blue-300 bg-blue-50 py-2 items-center"
          onPress={() => Alert.alert('Create Job Card', 'New Job Card creation is available in web AutoDoc. Mobile creation is part of the next parity increment.')}
        >
          <Text className="text-blue-700 font-semibold">New Job Card</Text>
        </TouchableOpacity>

        <View className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <Text className="text-xs text-gray-500">Search by JC / Reg / Model</Text>
          <TouchableOpacity
            className="mt-1"
            onPress={() => {
              Alert.prompt?.(
                'Search AutoDoc',
                'Enter JC, registration, or model',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Apply', onPress: (value) => setSearch((value ?? '').trim()) },
                ],
                'plain-text',
                search
              )
            }}
          >
            <Text className="text-sm text-gray-800">{search || 'Tap to enter search term'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
          {renderKpiCard('Today', kpis.totalToday, 'bg-slate-50 border-slate-200 text-slate-700')}
          {renderKpiCard('Intake', kpis.activeIntake, 'bg-cyan-50 border-cyan-200 text-cyan-700')}
          {renderKpiCard('Pre-Repair', kpis.documentationPreRepair, 'bg-orange-50 border-orange-200 text-orange-700')}
          {renderKpiCard('Estimate', kpis.estimate, 'bg-violet-50 border-violet-200 text-violet-700')}
          {renderKpiCard('Pre Submit', kpis.preSubmitPending, 'bg-amber-50 border-amber-200 text-amber-700')}
          {renderKpiCard('Submitted', kpis.preSubmitDone, 'bg-emerald-50 border-emerald-200 text-emerald-700')}
          {renderKpiCard('Post PPT', kpis.postRepairPpt, 'bg-indigo-50 border-indigo-200 text-indigo-700')}
          {renderKpiCard('Claim', kpis.claimSubmitted, 'bg-blue-50 border-blue-200 text-blue-700')}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
          {STAGE_FILTERS.map((entry) => {
            const active = stageFilter === entry.key
            return (
              <TouchableOpacity
                key={entry.key}
                className={`mr-2 rounded-full border px-3 py-2 ${active ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                onPress={() => setStageFilter(entry.key)}
              >
                <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-700'}`}>{entry.label}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {loading && !refreshing ? (
        <View className="flex-1 items-center justify-center px-6">
          <ActivityIndicator size="large" color="#2563eb" />
          <Text className="text-sm text-gray-500 mt-3">Loading job cards...</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-lg font-semibold text-red-700 mb-1">Unable to load AutoDoc</Text>
          <Text className="text-sm text-red-600 text-center mb-4">{error}</Text>
          <TouchableOpacity
            className="bg-blue-600 rounded-lg px-4 py-3"
            onPress={onRefresh}
          >
            <Text className="text-white font-semibold">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={(item, index) => `${item.row.job_card_id ?? item.row.jc_number ?? 'job'}-${index}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          ListEmptyComponent={
            <View className="bg-white border border-gray-200 rounded-xl p-6 items-center mt-4">
              <Text className="text-base font-semibold text-gray-800">No job cards found</Text>
              <Text className="text-sm text-gray-500 text-center mt-1">
                No cards match this filter or your current access scope.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const { row, stage } = item
            const busy = updatingId === row.job_card_id
            const status = (row.status ?? 'draft') as JobCardStatus
            const targetStatus = nextStatus(status)
            return (
              <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-bold text-gray-900">
                      {row.jc_number ?? 'Unknown JC'}
                    </Text>
                    <Text className="text-sm text-gray-600 mt-1">
                      {row.reg_number ?? 'Unknown registration'}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-2">
                      Status: {row.status ?? 'draft'} | Panels: {row.panel_count ?? 0} | Photos: {row.photo_count ?? 0}
                    </Text>
                    <View className={`self-start mt-2 rounded-full border px-2 py-1 ${stageBadgeClass(stage)}`}>
                      <Text className="text-[11px] font-semibold">{stageLabel(stage)}</Text>
                    </View>
                  </View>

                  <View>
                    <TouchableOpacity
                      className="rounded-lg px-3 py-2 mb-2 bg-slate-200"
                      onPress={() => {
                        if (!row.job_card_id) {
                          Alert.alert('Action Unavailable', 'This job card is missing an identifier.')
                          return
                        }
                        router.push(`/job-cards/${row.job_card_id}`)
                      }}
                    >
                      <Text className="text-slate-700 text-xs font-semibold">Open</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className={`rounded-lg px-3 py-2 ${busy || !targetStatus ? 'bg-gray-300' : 'bg-blue-600'}`}
                      onPress={() => onQuickStatusAdvance(row)}
                      disabled={busy || !targetStatus}
                    >
                      <Text className="text-white text-xs font-semibold">
                        {busy ? 'Updating...' : targetStatus ? `Set ${targetStatus}` : 'Completed'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )
          }}
        />
      )}
    </View>
  )
}
