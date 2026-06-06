import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listServiceAdvisorEntries,
  listReceptionEntries,
  updateServiceAdvisorEntry,
  uploadServiceAdvisorEstimate,
  markServiceAdvisorInvoiceDone,
  getDealerScopeContext,
  type ReceptionEntryRow,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'

type RowDraft = {
  service_type: string
  jc_number: string
  remark: string
}

const DEFAULT_SERVICE_TYPE_OPTIONS = [
  'Running Repairs',
  'First Free Service',
  'Second Free Service',
  'Third Free Service',
  'Paid Service',
  'Accident',
  'PDI',
  'Campaign',
  'E Breakdown',
  'Updation',
]

const FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES = new Set([
  'running repairs',
  'first free service',
  'second free service',
  'third free service',
  'paid service',
  'updation',
])

type CategoryFilter = 'all' | 'floor' | 'other' | 'null'
type SummaryCardFilter = 'all' | 'job_card_pending' | 'sr_type_pending' | 'estimate_pending' | 'invoice_pending' | 'floor_hold' | 'completed'

const EMPTY_DRAFT: RowDraft = {
  service_type: '',
  jc_number: '',
  remark: '',
}

const SOURCE_TONE_MAP: Record<string, string> = {
  'Driver Pickup': 'b',
  'Walk-in': 'g',
  'Self': 'w',
  'RSA': 'b',
  'PSF Backfill': '',
}

const UNKNOWN_FUEL_TYPE = 'Unknown'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
}

function getSourceToneColor(source: string): string {
  return SOURCE_TONE_MAP[source] || ''
}

function normalizeServiceType(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function getFuelTypeLabel(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return trimmed || UNKNOWN_FUEL_TYPE
}

function getAdvisorFilterKey(row: ReceptionEntryRow): string {
  const code = String(row.sa_employee_code ?? '').trim().toUpperCase()
  if (code) return `code:${code}`

  const displayName = String(row.sa_display_name ?? row.sa_name ?? '').trim()
  if (displayName) return `name:${displayName.toLowerCase()}`

  return 'unknown'
}

function getAdvisorFilterLabel(row: ReceptionEntryRow): string {
  const displayName = String(row.sa_display_name ?? row.sa_name ?? '').trim()
  const code = String(row.sa_employee_code ?? '').trim().toUpperCase()

  if (displayName && code) return `${displayName} (${code})`
  if (displayName) return displayName
  if (code) return code
  return 'Unknown advisor'
}

function mergeServiceTypes(...groups: Array<string[]>): string[] {
  const defaults = DEFAULT_SERVICE_TYPE_OPTIONS.map(normalizeServiceType)
  const seen = new Set(defaults.map((value) => value.toLowerCase()))
  const extras: string[] = []

  groups.forEach((group) => {
    group.forEach((raw) => {
      const value = normalizeServiceType(String(raw ?? ''))
      if (!value) return
      const key = value.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      extras.push(value)
    })
  })

  extras.sort((a, b) => a.localeCompare(b))
  return [...defaults, ...extras]
}

function getCategoryForServiceType(serviceType: string | null | undefined): Exclude<CategoryFilter, 'all'> {
  const normalized = normalizeServiceType(String(serviceType ?? '')).toLowerCase()
  if (!normalized) return 'null'
  if (FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES.has(normalized)) return 'floor'
  return 'other'
}

function isJobCardPending(jcNumber: string | null | undefined): boolean {
  return !String(jcNumber ?? '').trim()
}

function isServiceTypeMissing(serviceType: string | null | undefined): boolean {
  return !String(serviceType ?? '').trim()
}

function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return null
}

function getServiceTypeForMessage(rowServiceType: string | null | undefined, draftServiceType: string | null | undefined): string {
  const draftValue = String(draftServiceType ?? '').trim()
  if (draftValue) return draftValue
  const rowValue = String(rowServiceType ?? '').trim()
  return rowValue || 'Service'
}

function buildServiceCompleteMessage(regNumber: string, serviceType: string): string {
  return `Your vehicle ${regNumber} with ${serviceType} is complete. Please come and collect.`
}

const TEMP_LOGIN_USER_PHONE = '911234567678'
const TEMP_ROLE_CONTACT_PHONE = '911234345656'
const DEFAULT_GROUP_NAME_PREFIX = 'Service Delivery'

export default function ServiceAdvisorPage() {
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const waGroupNamePrefix = DEFAULT_GROUP_NAME_PREFIX

  const [rows, setRows] = useState<ReceptionEntryRow[]>([])
  const [allRows, setAllRows] = useState<ReceptionEntryRow[]>([])
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const [dirtyRowIds, setDirtyRowIds] = useState<Set<number>>(new Set())
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState<string | 'all'>('all')
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all')
  const [selectedSummaryCard, setSelectedSummaryCard] = useState<SummaryCardFilter>('all')
  const [selectedFuelType, setSelectedFuelType] = useState<string | 'all'>('all')
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all')
  const [hasMultipleDealers, setHasMultipleDealers] = useState(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [uploadingId, setUploadingId] = useState<number | null>(null)
  const [uploadingInvoiceId, setUploadingInvoiceId] = useState<number | null>(null)
  const [serviceTypeOptions, setServiceTypeOptions] = useState<string[]>(DEFAULT_SERVICE_TYPE_OPTIONS)
  const [fuelTypeOptions, setFuelTypeOptions] = useState<string[]>([])
  const [completedJobCardNumbers, setCompletedJobCardNumbers] = useState<Set<string>>(new Set())
  const [holdJobCardNumbers, setHoldJobCardNumbers] = useState<Set<string>>(new Set())

  const branchFilteredRows = useMemo(() => {
    if (selectedBranch === 'all') return rows
    return rows.filter(r => r.branch === selectedBranch)
  }, [rows, selectedBranch])

  const fuelTypeFilteredRows = useMemo(() => {
    if (selectedFuelType === 'all') return branchFilteredRows
    return branchFilteredRows.filter((row) => {
      return getFuelTypeLabel(row.fuel_type) === selectedFuelType
    })
  }, [branchFilteredRows, selectedFuelType])

  const categoryFilteredRows = useMemo(() => {
    if (selectedCategory === 'all') return fuelTypeFilteredRows
    return fuelTypeFilteredRows.filter((row) => getCategoryForServiceType(row.service_type) === selectedCategory)
  }, [fuelTypeFilteredRows, selectedCategory])

  const advisorOptions = useMemo(() => {
    const optionMap = new Map<string, { label: string; count: number }>()

    categoryFilteredRows.forEach((row) => {
      const key = getAdvisorFilterKey(row)
      const existing = optionMap.get(key)

      if (existing) {
        existing.count += 1
      } else {
        optionMap.set(key, {
          label: getAdvisorFilterLabel(row),
          count: 1,
        })
      }
    })

    return Array.from(optionMap.entries())
      .map(([value, meta]) => ({ value, label: meta.label, count: meta.count }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [categoryFilteredRows])

  const displayedRows = useMemo(() => {
    if (selectedAdvisor === 'all') return categoryFilteredRows
    return categoryFilteredRows.filter((row) => getAdvisorFilterKey(row) === selectedAdvisor)
  }, [categoryFilteredRows, selectedAdvisor])

  const isWorkCompleted = (row: ReceptionEntryRow): boolean => {
    const jcNumber = String(row.jc_number ?? '').trim().toUpperCase()
    return Boolean(jcNumber) && completedJobCardNumbers.has(jcNumber)
  }

  const isWorkHold = (row: ReceptionEntryRow): boolean => {
    const jcNumber = String(row.jc_number ?? '').trim().toUpperCase()
    return Boolean(jcNumber) && holdJobCardNumbers.has(jcNumber)
  }

  const cardFilteredRows = useMemo(() => {
    if (selectedSummaryCard === 'all') return displayedRows
    if (selectedSummaryCard === 'job_card_pending') {
      return displayedRows.filter((row) => isJobCardPending(row.jc_number))
    }
    if (selectedSummaryCard === 'sr_type_pending') {
      return displayedRows.filter((row) => isServiceTypeMissing(row.service_type))
    }
    if (selectedSummaryCard === 'estimate_pending') {
      return displayedRows.filter((row) => !row.estimate_storage_path)
    }
    if (selectedSummaryCard === 'floor_hold') {
      return displayedRows.filter((row) => isWorkHold(row))
    }
    if (selectedSummaryCard === 'completed') {
      return displayedRows.filter((row) => isWorkCompleted(row) && Boolean(row.invoice_done_at))
    }
    return displayedRows.filter((row) => isWorkCompleted(row) && !row.invoice_done_at)
  }, [displayedRows, selectedSummaryCard, completedJobCardNumbers, holdJobCardNumbers])

  const availableBranches = useMemo(() => {
    const branches = new Set(allRows.map(r => r.branch).filter(Boolean) as string[])
    return Array.from(branches).sort()
  }, [allRows])

  const categoryCounts = useMemo(() => {
    const floor = fuelTypeFilteredRows.filter((row) => getCategoryForServiceType(row.service_type) === 'floor').length
    const other = fuelTypeFilteredRows.filter((row) => getCategoryForServiceType(row.service_type) === 'other').length
    const nullCount = fuelTypeFilteredRows.filter((row) => getCategoryForServiceType(row.service_type) === 'null').length
    return {
      all: fuelTypeFilteredRows.length,
      floor,
      other,
      null: nullCount,
    }
  }, [fuelTypeFilteredRows])

  const hasRows = useMemo(() => cardFilteredRows.length > 0, [cardFilteredRows.length])

  useEffect(() => {
    if (selectedAdvisor === 'all') return
    if (advisorOptions.some((option) => option.value === selectedAdvisor)) return
    setSelectedAdvisor('all')
  }, [advisorOptions, selectedAdvisor])

  const advisorName = useMemo(() => {
    if (isAdmin) return 'All Service Advisors'
    return rows[0]?.sa_display_name || rows[0]?.sa_name || 'Unknown'
  }, [rows, isAdmin])
  const advisorCode = useMemo(() => {
    if (isAdmin) return ''
    return rows[0]?.sa_employee_code || ''
  }, [rows, isAdmin])
  const advisorBranch = useMemo(() => {
    if (isAdmin && selectedBranch !== 'all') return selectedBranch
    if (isAdmin) return 'All branches'
    
    const uniqueBranches = Array.from(
      new Set(
        rows
          .map((row) => String(row.branch ?? '').trim())
          .filter(Boolean),
      ),
    )
    
    if (uniqueBranches.length === 0) return 'Unknown'
    if (uniqueBranches.length === 1) return uniqueBranches[0]
    return 'Multiple branches'
  }, [rows, isAdmin, selectedBranch])
  const pendingEstimateCount = useMemo(
    () => displayedRows.filter(r => !r.estimate_storage_path).length,
    [displayedRows],
  )
  const pendingJobCardCount = useMemo(
    () => displayedRows.filter((r) => isJobCardPending(r.jc_number)).length,
    [displayedRows],
  )
  const pendingServiceTypeCount = useMemo(
    () => displayedRows.filter((r) => isServiceTypeMissing(r.service_type)).length,
    [displayedRows],
  )
  const pendingInvoiceCount = useMemo(
    () => displayedRows.filter((r) => isWorkCompleted(r) && !r.invoice_done_at).length,
    [displayedRows, completedJobCardNumbers],
  )
  const floorHoldCount = useMemo(
    () => displayedRows.filter((r) => isWorkHold(r)).length,
    [displayedRows, holdJobCardNumbers],
  )
  const completedCount = useMemo(
    () => displayedRows.filter((r) => isWorkCompleted(r) && Boolean(r.invoice_done_at)).length,
    [displayedRows, completedJobCardNumbers],
  )

  // Detect admin/super_admin and get dealer scope
  async function checkIfAdmin() {
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session.session?.user) {
        setIsAdmin(false)
        setIsSuperAdmin(false)
        setHasMultipleDealers(false)
        return false
      }

      const { data: profile } = await supabase
        .from('users')
        .select('role, is_active')
        .eq('id', session.session.user.id)
        .maybeSingle()

      const role = String((profile as { role?: string | null } | null)?.role ?? '').trim().toLowerCase()
      const isActive = (profile as { is_active?: boolean | null } | null)?.is_active === true
      const nextIsAdmin = role === 'admin' && isActive
      const nextIsSuperAdmin = role === 'super_admin' && isActive
      
      setIsAdmin(nextIsAdmin)
      setIsSuperAdmin(nextIsSuperAdmin)

      // Get dealer scope context
      const scopeRes = await getDealerScopeContext()
      if (scopeRes.data) {
        setHasMultipleDealers((scopeRes.data.dealerCodes ?? []).length > 1)
      }

      return nextIsAdmin || nextIsSuperAdmin
    } catch {
      setIsAdmin(false)
      setIsSuperAdmin(false)
      setHasMultipleDealers(false)
      return false
    }
  }

  async function loadRows() {
    setLoading(true)
    setError(null)

    // Check if user is admin
    const nextIsAdmin = await checkIfAdmin()

    // Fetch appropriate data
    let res
    if (nextIsAdmin) {
      res = await listReceptionEntries() // Admin: see all reception entries
    } else {
      res = await listServiceAdvisorEntries() // SA: see only assigned rows
    }

    if (res.error) {
      setRows([])
      setAllRows([])
      setDrafts({})
      setDirtyRowIds(new Set())
      setLoading(false)
      setError(res.error)
      return
    }

    const data = res.data ?? []
    if (nextIsAdmin) {
      setAllRows(data)
      setRows(data)
      setSelectedBranch('all')
      setSelectedAdvisor('all')
    } else {
      setRows(data)
      setAllRows(data)
      setSelectedAdvisor('all')
    }

    const mappedDrafts: Record<number, RowDraft> = {}
    data.forEach((row) => {
      mappedDrafts[row.id] = {
        service_type: typeof row.service_type === 'string' ? row.service_type : '',
        jc_number: row.jc_number ?? '',
        remark: row.remark ?? '',
      }
    })

    setServiceTypeOptions((prev) => mergeServiceTypes(prev, data.map((row) => row.service_type ?? '')))

    // Extract and set fuel type options
    const fuelTypes = Array.from(
      new Set(
        data
          .map((row) => getFuelTypeLabel(row.fuel_type)),
      ),
    ).sort()
    setFuelTypeOptions(fuelTypes)

    setDrafts(mappedDrafts)
    setDirtyRowIds(new Set())
    setLoading(false)
  }

  useEffect(() => {
    void loadRows()
  }, [])

  // Subscribe to real-time updates for completed/hold job cards
  useEffect(() => {
    // Fetch existing completed and hold job cards
    const fetchAssignmentStatusJobCards = async () => {
      try {
        const res = await supabase
          .from('technician_assignments')
          .select('job_card_number, work_status')
          .in('work_status', ['completed', 'hold'])

        if (!res.error && res.data) {
          const completed = new Set<string>()
          const hold = new Set<string>()
          res.data.forEach((row: Record<string, unknown>) => {
            const jobCardNum = String(row.job_card_number ?? '').trim().toUpperCase()
            const status = String(row.work_status ?? '').trim().toLowerCase()
            if (jobCardNum) {
              if (status === 'completed') completed.add(jobCardNum)
              if (status === 'hold') hold.add(jobCardNum)
            }
          })
          setCompletedJobCardNumbers(completed)
          setHoldJobCardNumbers(hold)
          console.log('Loaded completed job cards:', Array.from(completed))
          console.log('Loaded hold job cards:', Array.from(hold))
        }
      } catch (err) {
        console.error('Failed to fetch assignment status job cards:', err)
      }
    }

    void fetchAssignmentStatusJobCards()

    // Subscribe to real-time updates
    const channel = supabase
      .channel('technician-assignments-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'technician_assignments',
          filter: 'work_status=eq.completed',
        },
        (payload) => {
          const updated = payload.new as { job_card_number?: string } | null
          if (updated?.job_card_number) {
            const normalized = String(updated.job_card_number).trim().toUpperCase()
            setCompletedJobCardNumbers((prev) => {
              const next = new Set([...prev, normalized])
              console.log('Realtime update - completed job:', normalized)
              return next
            })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'technician_assignments',
          filter: 'work_status=eq.hold',
        },
        (payload) => {
          const updated = payload.new as { job_card_number?: string } | null
          if (updated?.job_card_number) {
            const normalized = String(updated.job_card_number).trim().toUpperCase()
            setHoldJobCardNumbers((prev) => {
              const next = new Set([...prev, normalized])
              console.log('Realtime update - hold job:', normalized)
              return next
            })
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  function patchDraft(id: number, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? EMPTY_DRAFT),
        ...patch,
      },
    }))
    setDirtyRowIds((prev) => new Set([...prev, id]))
  }

  function showToast(msg: string) {
    setToastMsg(msg)
    const timeout = setTimeout(() => setToastMsg(null), 2200)
    return () => clearTimeout(timeout)
  }

  async function saveRow(id: number) {
    const draft = drafts[id]
    if (!draft) return

    setSavingId(id)
    setError(null)

    const res = await updateServiceAdvisorEntry(id, {
      service_type: draft.service_type,
      jc_number: draft.jc_number,
      remark: draft.remark,
    })

    setSavingId(null)

    if (res.error) {
      setError(res.error)
      return
    }

    setDirtyRowIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    showToast(`Saved ${rows.find((r) => r.id === id)?.reg_number || 'entry'}`)
    await loadRows()
  }

  async function handleEstimateUpload(id: number, file: File) {
    setUploadingId(id)
    setError(null)

    const res = await uploadServiceAdvisorEstimate(id, file)
    setUploadingId(null)

    if (res.error) {
      setError(res.error)
      return
    }

    // Clear the completed notification for this job card once estimate is uploaded
    const uploadedRow = rows.find(r => r.id === id)
    if (uploadedRow?.jc_number) {
      setCompletedJobCardNumbers((prev) => {
        const next = new Set(prev)
        next.delete((uploadedRow.jc_number ?? '').toUpperCase())
        return next
      })
    }

    showToast('Estimate uploaded')
    await loadRows()
  }

  async function handleInvoiceDone(id: number) {
    setUploadingInvoiceId(id)
    setError(null)

    const res = await markServiceAdvisorInvoiceDone(id)
    setUploadingInvoiceId(null)

    if (res.error) {
      setError(res.error)
      return
    }

    showToast('Invoice marked as done')
    await loadRows()
  }

  async function handleCreateGroup(row: ReceptionEntryRow) {
    const draft = drafts[row.id] ?? EMPTY_DRAFT
    const ownerPhone = normalizeWhatsAppPhone(row.owner_phone)
    const loginUserPhone = normalizeWhatsAppPhone(TEMP_LOGIN_USER_PHONE)
    const roleContactPhone = normalizeWhatsAppPhone(TEMP_ROLE_CONTACT_PHONE)

    const memberNumbers = Array.from(
      new Set([ownerPhone, loginUserPhone, roleContactPhone].filter(Boolean) as string[]),
    )

    if (memberNumbers.length === 0) {
      setError('Create Group needs at least one valid phone number (owner/SA/super admin).')
      return
    }

    const regNo = String(row.reg_number ?? '').trim().toUpperCase() || 'REG-NO'
    const serviceType = getServiceTypeForMessage(row.service_type, draft.service_type)
    const message = buildServiceCompleteMessage(regNo, serviceType)
    const groupName = `${waGroupNamePrefix} ${regNo}`.trim()

    const checklist = [
      `Group Name: ${groupName}`,
      `Add Members: ${memberNumbers.map((phone) => `+${phone}`).join(', ')}`,
      `Message: ${message}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(checklist)
      showToast('Group details copied. Complete group creation in WhatsApp.')
    } catch {
      showToast('WhatsApp opened. Use manual copy for group details.')
    }

    const isMobileDevice = /android|iphone|ipad|ipod/i.test(navigator.userAgent)
    const waUrl = isMobileDevice
      ? `https://wa.me/?text=${encodeURIComponent(message)}`
      : 'https://web.whatsapp.com/'

    window.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div>
      {/* Toast Notification */}
      {toastMsg && (
        <div className="sa-toast">
          <Icon name="checksm" size={16} strokeWidth={2.4} />
          {toastMsg}
        </div>
      )}

      {/* Page Head */}
      <div className="pagehead">
        <div>
          <p className="greet"><Icon name="admin" size={13} strokeWidth={2} className="icon-inline-shift" />Service Advisor</p>
        <h1>
          {isAdmin ? 'All assigned vehicles' : 
            (rows.length > 0 && advisorCode && rows.some(row => row.sa_employee_code !== advisorCode)) ? 
            'All dealer vehicles' : 
            'My assigned vehicles'}
        </h1>
        <p>
          {isAdmin ? (
            <>
              Showing all service advisor entries across all advisors.
              {availableBranches.length > 0 && ` Use branch filter to manage your cases.`}
            </>
          ) : (rows.length > 0 && advisorCode && rows.some(row => row.sa_employee_code !== advisorCode)) ? (
            <>
              Showing all service advisor entries for your dealer. Manage and track all assigned cases.
              {availableBranches.length > 0 && ` Use branch filter to refine your view.`}
            </>
          ) : (
            <>
              Showing only rows assigned to <b className="text-ink-2">{advisorName}</b> ({advisorCode}). Edit service type, JC number, remark, and upload the estimate.
            </>
          )}
        </p>
        </div>

        {error && (
          <div className="alert alert--error mt-12">
            {error}
          </div>
        )}

        {/* Branch & Fuel Type Filters (Admin or Multi-Dealer Users) */}
        {(isAdmin || hasMultipleDealers) && !isSuperAdmin && availableBranches.length > 0 && (
          <>
            <div className="toolbar toolbar--tight">
              <span className="toolbar__label">Filter by location:</span>
              <button
                type="button"
                onClick={() => setSelectedBranch('all')}
                className={`btn btn--sm ${
                  selectedBranch === 'all'
                    ? 'btn--primary'
                    : 'btn--ghost'
                }`}
              >
                All ({allRows.length})
              </button>
              {availableBranches.map((branch) => {
                const count = allRows.filter(r => r.branch === branch).length
                return (
                  <button
                    key={branch}
                    type="button"
                    onClick={() => setSelectedBranch(branch)}
                    className={`btn btn--sm ${
                      selectedBranch === branch
                        ? 'btn--primary'
                        : 'btn--ghost'
                    }`}
                  >
                    {branch} ({count})
                  </button>
                )
              })}
            </div>

            {advisorOptions.length > 0 && (
              <div className="toolbar toolbar--tight">
                <span className="toolbar__label">Filter by advisor:</span>
                <select
                  value={selectedAdvisor}
                  onChange={(event) => setSelectedAdvisor(event.target.value)}
                  className="sel sel--advisor-filter"
                  aria-label="Filter by advisor"
                >
                  <option value="all">All ({categoryFilteredRows.length})</option>
                  {advisorOptions.map((advisor) => (
                    <option key={advisor.value} value={advisor.value}>
                      {advisor.label} ({advisor.count})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {fuelTypeOptions.length > 0 && (
              <div className="toolbar toolbar--tight">
                <span className="toolbar__label">Filter by fuel type:</span>
                <button
                  type="button"
                  onClick={() => setSelectedFuelType('all')}
                  className={`btn btn--sm ${
                    selectedFuelType === 'all'
                      ? 'btn--primary'
                      : 'btn--ghost'
                  }`}
                >
                  All ({branchFilteredRows.length})
                </button>
                {fuelTypeOptions.map((fuelType) => {
                  const count = branchFilteredRows.filter((row) => getFuelTypeLabel(row.fuel_type) === fuelType).length
                  return (
                    <button
                      key={fuelType}
                      type="button"
                      onClick={() => setSelectedFuelType(fuelType)}
                      className={`btn btn--sm ${
                        selectedFuelType === fuelType
                          ? 'btn--primary'
                          : 'btn--ghost'
                      }`}
                    >
                      {fuelType} ({count})
                    </button>
                  )
                })}
              </div>
            )}

            <div className="toolbar toolbar--tight">
              <span className="toolbar__label">Filter by category:</span>
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`btn btn--sm ${
                  selectedCategory === 'all'
                    ? 'btn--primary'
                    : 'btn--ghost'
                }`}
              >
                All ({categoryCounts.all})
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory('floor')}
                className={`btn btn--sm ${
                  selectedCategory === 'floor'
                    ? 'btn--primary'
                    : 'btn--ghost'
                }`}
              >
                Floor ({categoryCounts.floor})
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory('other')}
                className={`btn btn--sm ${
                  selectedCategory === 'other'
                    ? 'btn--primary'
                    : 'btn--ghost'
                }`}
              >
                Other ({categoryCounts.other})
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory('null')}
                className={`btn btn--sm ${
                  selectedCategory === 'null'
                    ? 'btn--primary'
                    : 'btn--ghost'
                }`}
              >
                Null ({categoryCounts.null})
              </button>
            </div>
          </>
        )}
      </div>

      {/* Summary Chips */}
      {hasRows && (
        <div className="summary">
          <button
            type="button"
            onClick={() => setSelectedSummaryCard('all')}
            disabled={displayedRows.length === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'all' ? 'schip--active' : ''}`}
          >
            <span className="ic"><Icon name="admin" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{displayedRows.length}</div>
              <div className="l">{isAdmin ? 'Filtered entries' : 'Assigned'}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSummaryCard('sr_type_pending')}
            disabled={pendingServiceTypeCount === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'sr_type_pending' ? 'schip--active' : ''}`}
          >
            <span className="ic schip__ic--warn"><Icon name="doc" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{pendingServiceTypeCount}</div>
              <div className="l">SR Type</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSummaryCard('job_card_pending')}
            disabled={pendingJobCardCount === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'job_card_pending' ? 'schip--active' : ''}`}
          >
            <span className="ic schip__ic--warn"><Icon name="doc" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{pendingJobCardCount}</div>
              <div className="l">Job Card</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSummaryCard('estimate_pending')}
            disabled={pendingEstimateCount === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'estimate_pending' ? 'schip--active' : ''}`}
          >
            <span className="ic schip__ic--warn"><Icon name="doc" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{pendingEstimateCount}</div>
              <div className="l">Estimate</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSummaryCard('invoice_pending')}
            disabled={pendingInvoiceCount === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'invoice_pending' ? 'schip--active' : ''}`}
          >
            <span className="ic schip__ic--warn"><Icon name="doc" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{pendingInvoiceCount}</div>
              <div className="l">Invoice</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSummaryCard('floor_hold')}
            disabled={floorHoldCount === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'floor_hold' ? 'schip--active' : ''}`}
          >
            <span className="ic schip__ic--warn"><Icon name="clock" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{floorHoldCount}</div>
              <div className="l">Floor Hold</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSummaryCard('completed')}
            disabled={completedCount === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'completed' ? 'schip--active' : ''}`}
          >
            <span className="ic"><Icon name="checksm" size={16} strokeWidth={2.4} /></span>
            <div>
              <div className="n">{completedCount}</div>
              <div className="l">Completed</div>
            </div>
          </button>

          <div className="schip">
            <span className="ic"><Icon name="building" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{advisorBranch}</div>
              <div className="l">Branch</div>
            </div>
          </div>
        </div>
      )}

      {/* Assigned Entries Card */}
      <div className="card">
        <div className="card__head">
          <div>
            <h3>
              Assigned entries <span className="subcount">({cardFilteredRows.length})</span>
            </h3>
            <div className="sub">
              {isAdmin ? 'Showing all intakes from filtered branch · edits save per row' : 'Each row is one intake assigned to you · edits save per row'}
            </div>
          </div>
        </div>

        <div className="card__body card__body--table-tight">
          {loading ? (
            <div className="empty-state">Loading assigned rows...</div>
          ) : !hasRows ? (
            <div className="empty-state">
              {selectedSummaryCard !== 'all'
                ? 'No rows found for the selected summary card.'
                : isAdmin
                  ? 'No rows found for the selected branch/advisor filters.'
                  : 'No rows are assigned to your advisor account.'}
            </div>
          ) : (
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Source</th>
                    <th>Reg No</th>
                    <th>Model</th>
                    <th>Service Type</th>
                    <th>JC Number</th>
                    <th>Owner</th>
                    <th>Remark</th>
                    <th>Estimate</th>
                    <th>Invoice</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cardFilteredRows.map((row) => {
                    const draft = drafts[row.id] ?? EMPTY_DRAFT
                    const draftServiceType = String(draft.service_type ?? '')
                    const normalizedDraftServiceType = draftServiceType.trim().toLowerCase()
                    const isDirty = dirtyRowIds.has(row.id)
                    const toneColor = getSourceToneColor(row.source)
                    const isCompleted = completedJobCardNumbers.has((row.jc_number ?? '').toUpperCase())

                    return (
                      <tr key={row.id} className={isCompleted ? 'row--completed' : ''}>
                        <td className="td-muted-nowrap">{formatDate(row.created_at)}</td>
                        <td>
                          <span className={`pill ${toneColor}`.trim()}>
                            {row.source}
                          </span>
                        </td>
                        <td className="mono strong">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {row.reg_number}
                          </div>
                        </td>
                        <td>{row.model || '-'}</td>
                        <td>
                          <select
                            value={draftServiceType}
                            onChange={(event) => patchDraft(row.id, { service_type: event.target.value })}
                            className="sel sel--service-type"
                          >
                            <option value="">Select service type</option>
                            {serviceTypeOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                            {!serviceTypeOptions.some((option) => option.toLowerCase() === normalizedDraftServiceType) && normalizedDraftServiceType && (
                              <option value={draftServiceType}>{draftServiceType}</option>
                            )}
                          </select>
                        </td>
                        <td>
                          <input
                            value={draft.jc_number}
                            onChange={(event) =>
                              patchDraft(row.id, { jc_number: event.target.value.toUpperCase() })
                            }
                            maxLength={25}
                            placeholder="JC number"
                            className="inp mono inp--jc"
                          />
                        </td>
                        <td className="td-owner">
                          <div className="strong owner-name">{row.owner_name || '-'}</div>
                          <div className="mono owner-phone">{row.owner_phone || '-'}</div>
                        </td>
                        <td>
                          <textarea
                            value={draft.remark}
                            onChange={(event) => patchDraft(row.id, { remark: event.target.value })}
                            placeholder="Add remark…"
                            rows={1}
                            className="inp inp--remark"
                          />
                        </td>
                        <td className="td-estimate">
                          <div className="estimate-col">
                            {row.estimate_storage_path ? (
                              <>
                                <span className="estimate-status">
                                  <Icon name="checksm" size={13} strokeWidth={2.4} />
                                  {row.estimate_file_name || 'Estimate uploaded'}
                                </span>
                                <div className="estimate-actions">
                                  {row.estimate_drive_url && (
                                    <a
                                      href={row.estimate_drive_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="linkbtn linkbtn--sm"
                                    >
                                      View estimate
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => fileInputRefs.current[row.id]?.click()}
                                    disabled={uploadingId === row.id}
                                    className="tbtn tbtn--compact"
                                  >
                                    Replace
                                  </button>
                                </div>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => fileInputRefs.current[row.id]?.click()}
                                disabled={uploadingId === row.id}
                                className="tbtn tbtn--accent"
                              >
                                <Icon name="upload" size={13} strokeWidth={2} />
                                {uploadingId === row.id ? 'Uploading...' : 'Upload'}
                              </button>
                            )}
                            <input
                              ref={(el) => {
                                fileInputRefs.current[row.id] = el
                              }}
                              type="file"
                              className="hidden"
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (!file) return
                                void handleEstimateUpload(row.id, file)
                                event.target.value = ''
                              }}
                            />
                          </div>
                        </td>
                        <td className="td-invoice">
                          <div className="invoice-col">
                            {row.invoice_done_at ? (
                              <span className="invoice-status">
                                <Icon name="checksm" size={13} strokeWidth={2.4} />
                                Done
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleInvoiceDone(row.id)}
                                disabled={uploadingInvoiceId === row.id}
                                className="tbtn tbtn--accent"
                              >
                                {uploadingInvoiceId === row.id ? 'Marking...' : 'Mark Done'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="td-save">
                          <div className="tactions tactions--stack">
                            <button
                              type="button"
                              onClick={() => void saveRow(row.id)}
                              disabled={savingId === row.id || !isDirty}
                              className={[
                                'btn btn--primary btn--sm',
                                !isDirty && savingId !== row.id ? 'btn--dim' : '',
                              ].join(' ').trim()}
                            >
                              {savingId === row.id ? 'Saving...' : isDirty ? 'Save' : 'Saved'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCreateGroup(row)}
                              className="tbtn tbtn--compact"
                            >
                              Create Group
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
