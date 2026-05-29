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
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  listJobCardSummaries,
  type JobDashboardSummaryRow,
  type JobCardStatus,
} from '../../lib/api/jobCards'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

type WorkflowStage =
  | 'active_intake'
  | 'documentation_pre_repair'
  | 'estimate'
  | 'pre_submit_pending'
  | 'pre_submit_done'
  | 'post_repair_ppt'
  | 'claim_submitted'

type DashboardCardFilter = 'active_vehicles' | 'today' | WorkflowStage

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

function formatStatusLabel(status: string | null | undefined): string {
  const value = String(status ?? '').trim().toLowerCase()
  if (!value) return 'Draft'
  return value.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function statusPillClass(status: string | null | undefined): string {
  const value = String(status ?? '').trim().toLowerCase()
  if (value === 'in_work') return 'bg-amber-100 text-amber-700'
  if (value === 'approved') return 'bg-violet-100 text-violet-700'
  if (value === 'submitted') return 'bg-emerald-100 text-emerald-700'
  if (value === 'completed') return 'bg-blue-100 text-blue-700'
  return 'bg-slate-100 text-slate-700'
}

function isTodayComplaintDate(value: string | null | undefined): boolean {
  if (!value) return false
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return dt >= today
}

export default function AutoDocScreen() {
  const router = useRouter()
  const { session, loading: authLoading } = useAuth()
  const [jobCards, setJobCards] = useState<JobDashboardSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [stageFilter, setStageFilter] = useState<DashboardCardFilter>('active_vehicles')
  const [error, setError] = useState<string | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string>('')
  const [sessionDealerCode, setSessionDealerCode] = useState<string>('')
  const [rlsDealerCode, setRlsDealerCode] = useState<string>('')
  const [jobCardSummaryCount, setJobCardSummaryCount] = useState<number | null>(null)
  const [jobCardsCount, setJobCardsCount] = useState<number | null>(null)
  const [sampleRowsHint, setSampleRowsHint] = useState<string>('')
  const [postRepairReadyJobIds, setPostRepairReadyJobIds] = useState<Set<string>>(new Set())
  const [estimatePendingJobIds, setEstimatePendingJobIds] = useState<Set<string>>(new Set())

  const loadJobCards = useCallback(async () => {
    const sessionRes = await supabase.auth.getSession()
    const activeSession = session ?? sessionRes.data.session
    if (!activeSession) {
      setJobCards([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    try {
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

      // Hard fallback: if summary path returns empty, read directly from job_cards in current RLS scope.
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
      setError(err.message || 'Failed to load AutoDoc job cards')
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

  useEffect(() => {
    let mounted = true

    async function loadSessionMetadata() {
      const [{ data }, dealerRes, summaryCountRes, jobCardsCountRes, sampleRowsRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc('my_dealer_code'),
        supabase.from('job_card_summary').select('job_card_id', { head: true, count: 'exact' }),
        supabase.from('job_cards').select('id', { head: true, count: 'exact' }),
        supabase.from('job_cards').select('jc_number, status').order('created_at', { ascending: false }).limit(3),
      ])

      if (!mounted) return
      const email = data.user?.email ?? ''
      const dealerCode = String(data.user?.user_metadata?.dealer_code ?? '').trim()
      setSessionEmail(email)
      setSessionDealerCode(dealerCode)
      setRlsDealerCode(String(dealerRes.data ?? '').trim())
      setJobCardSummaryCount(summaryCountRes.count ?? null)
      setJobCardsCount(jobCardsCountRes.count ?? null)

      const sampleRows = (sampleRowsRes.data ?? [])
        .map((row) => `${row.jc_number ?? 'unknown'}:${row.status ?? 'unknown'}`)
        .join(', ')
      setSampleRowsHint(sampleRows)
    }

    if (!authLoading) {
      void loadSessionMetadata()
    }

    return () => {
      mounted = false
    }
  }, [authLoading, session?.user?.id])

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

  const primaryActionLabel = (stage: WorkflowStage): string => {
    if (stage === 'claim_submitted') return 'View Claim'
    if (stage === 'post_repair_ppt') return 'Open Submit'
    if (stage === 'pre_submit_done' || stage === 'pre_submit_pending') return 'Open Submit'
    if (stage === 'estimate') return 'Complete Estimate'
    if (stage === 'documentation_pre_repair') return 'Under Repair'
    return 'Continue Job Card'
  }

  const openStageForRow = (row: JobDashboardSummaryRow, stage: WorkflowStage) => {
    if (!row.job_card_id) {
      Alert.alert('Action Unavailable', 'This job card is missing an identifier.')
      return
    }

    if (stage === 'claim_submitted' || stage === 'post_repair_ppt' || stage === 'pre_submit_done' || stage === 'pre_submit_pending') {
      router.push(`/job-cards/${row.job_card_id}/submit`)
      return
    }

    if (stage === 'estimate') {
      router.push(`/job-cards/${row.job_card_id}/estimate`)
      return
    }

    if (stage === 'documentation_pre_repair') {
      router.push(`/job-cards/${row.job_card_id}/damage`)
      return
    }

    router.push(`/job-cards/${row.job_card_id}/jobcard`)
  }

  const rowsWithStage = useMemo(
    () => jobCards.map((row) => ({ row, stage: deriveWorkflowStage(row, postRepairReadyJobIds, estimatePendingJobIds) })),
    [jobCards, postRepairReadyJobIds, estimatePendingJobIds]
  )

  const kpis = useMemo(() => {
    const count = (stage: WorkflowStage) => rowsWithStage.filter((entry) => entry.stage === stage).length
    return {
      totalToday: rowsWithStage.filter((entry) => isTodayComplaintDate(entry.row.complaint_date)).length,
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
      if (stageFilter === 'today') {
        if (!isTodayComplaintDate(row.complaint_date)) return false
      } else if (stageFilter === 'active_vehicles') {
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

  const statusCards: Array<{
    key: DashboardCardFilter
    label: string
    value: number
    accentClass: string
  }> = [
    { key: 'today', label: "Today's Cars", value: kpis.totalToday, accentClass: 'bg-blue-500' },
    { key: 'active_intake', label: 'Active Intake', value: kpis.activeIntake, accentClass: 'bg-emerald-500' },
    { key: 'documentation_pre_repair', label: 'Documentation Pre-Repair', value: kpis.documentationPreRepair, accentClass: 'bg-violet-500' },
    { key: 'estimate', label: 'Estimate', value: kpis.estimate, accentClass: 'bg-indigo-500' },
    { key: 'pre_submit_pending', label: 'Pre-submit Pending', value: kpis.preSubmitPending, accentClass: 'bg-amber-600' },
    { key: 'pre_submit_done', label: 'Pre-submit Done', value: kpis.preSubmitDone, accentClass: 'bg-emerald-400' },
    { key: 'post_repair_ppt', label: 'Post Repair PPT', value: kpis.postRepairPpt, accentClass: 'bg-blue-400' },
    { key: 'claim_submitted', label: 'Claim Submitted', value: kpis.claimSubmitted, accentClass: 'bg-rose-500' },
  ]

  return (
    <View className="flex-1 bg-white">
      {loading && !refreshing ? (
        <View className="flex-1 items-center justify-center px-6">
          <ActivityIndicator size="large" color="#2563eb" />
          <Text className="text-sm text-gray-500 mt-3">Loading job cards...</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-lg font-semibold text-red-700 mb-1">Unable to load AutoDoc</Text>
          <Text className="text-sm text-red-600 text-center mb-4">{error}</Text>
          <TouchableOpacity className="bg-blue-600 rounded-lg px-4 py-3" onPress={onRefresh}>
            <Text className="text-white font-semibold">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={(item, index) => `${item.row.job_card_id ?? item.row.jc_number ?? 'job'}-${index}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16 }}
          ListHeaderComponent={
            <>
              <View className="mt-1 flex-row">
                <TouchableOpacity
                  className="flex-1 mr-1.5 rounded-xl border border-gray-400 bg-white py-2 items-center"
                  onPress={() => router.push('/job-cards/create')}
                >
                  <Text className="text-[16px] text-gray-800">☐ Job card</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className="flex-1 ml-1.5 rounded-xl border border-gray-400 bg-white py-2 items-center"
                  onPress={() => setShowSearch((prev) => !prev)}
                >
                  <Text className="text-[16px] text-gray-800">☐ Search</Text>
                </TouchableOpacity>
              </View>

              {showSearch ? (
                <View className="mt-2 rounded-xl border border-gray-300 bg-white px-3 py-2">
                  <TextInput
                    className="text-sm text-gray-800"
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search by JC / Reg / Model"
                    placeholderTextColor="#6b7280"
                  />
                </View>
              ) : null}

              <View className="mt-3 flex-row flex-wrap -mx-1">
                {statusCards.map((entry) => {
                  const active = stageFilter === entry.key
                  return (
                    <TouchableOpacity
                      key={entry.key}
                      className="w-1/2 px-1 mb-2"
                      onPress={() => setStageFilter(entry.key)}
                    >
                      <View className={`relative rounded-xl border border-gray-300 bg-[#f2f2ee] px-3 py-2.5 min-h-[78px] ${active ? 'border-blue-500' : ''}`}>
                        <View className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${entry.accentClass}`} />
                        <Text className="text-[11px] text-gray-700 pr-2">{entry.label}</Text>
                        <Text className="text-[22px] leading-[24px] font-semibold text-gray-900 mt-1">{entry.value}</Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <Text className="text-[16px] uppercase tracking-[0.8px] text-gray-600 mt-1 mb-2">Job Cards List</Text>

              {jobCards.length === 0 && !error ? (
                <Text className="mb-2 text-[10px] text-gray-500">
                  Connected to live DB. No job cards visible for scope{sessionEmail ? ` (${sessionEmail}` : ''}{sessionDealerCode ? ` | jwt dealer ${sessionDealerCode}` : ' | jwt dealer missing'}{rlsDealerCode ? ` | rls dealer ${rlsDealerCode}` : ' | rls dealer missing'}{sessionEmail ? ')' : ''}. Counts: summary={jobCardSummaryCount ?? 'n/a'}, job_cards={jobCardsCount ?? 'n/a'}, loaded={jobCards.length}, filtered={filteredRows.length}.{sampleRowsHint ? ` Sample: ${sampleRowsHint}.` : ''}
                </Text>
              ) : null}
            </>
          }
          ListEmptyComponent={
            <View className="bg-white border border-gray-300 rounded-xl px-4 py-5 items-center">
              <Text className="text-base font-semibold text-gray-800">No job cards found</Text>
              {jobCards.length > 0 ? (
                <TouchableOpacity
                  className="mt-3 rounded-lg border border-gray-400 bg-white px-4 py-2"
                  onPress={() => {
                    setSearch('')
                    setStageFilter('active_vehicles')
                  }}
                >
                  <Text className="text-gray-700 font-semibold">Reset Filters</Text>
                </TouchableOpacity>
              ) : (
                <Text className="text-sm text-gray-500 text-center mt-1">
                  No cards match this filter or your current access scope.
                </Text>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const { row, stage } = item
            const modelLabel = row.model?.trim() ? row.model : 'Model'
            return (
              <View className="rounded-2xl border border-gray-300 bg-white px-3 py-3 mb-3">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-[20px] leading-[24px] font-bold text-gray-900">{row.jc_number ?? 'Unknown JC'}</Text>
                    <Text className="text-[15px] leading-[20px] text-gray-700 mt-0.5">
                      {row.reg_number ?? 'Unknown registration'} · {modelLabel}
                    </Text>
                  </View>

                  <View className={`rounded-full px-2.5 py-1 ${statusPillClass(row.status)}`}>
                    <Text className="text-xs font-semibold">{formatStatusLabel(row.status)}</Text>
                  </View>
                </View>

                <View className="mt-2 border-t border-gray-300 pt-2 flex-row items-center">
                  <Text className="text-sm text-gray-700 mr-4">☐ {row.panel_count ?? 0} panels</Text>
                  <Text className="text-sm text-gray-700">☐ {row.photo_count ?? 0} photos</Text>
                </View>

                <View className="mt-2 flex-row items-end justify-between">
                  <TouchableOpacity
                    className={`rounded-full border px-3 py-1 ${stageBadgeClass(stage)}`}
                    onPress={() => {
                      openStageForRow(row, stage)
                    }}
                  >
                    <Text className="text-xs font-semibold">{stageLabel(stage)}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    className="rounded-xl border border-gray-400 bg-white px-6 py-2 items-center"
                    onPress={() => {
                      openStageForRow(row, stage)
                    }}
                  >
                    <Text className="text-[18px] leading-[20px] font-semibold text-gray-900">Open</Text>
                    <Text className="text-xs text-gray-800 mt-0.5">{primaryActionLabel(stage)} →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          }}
        />
      )}
    </View>
  )
}
