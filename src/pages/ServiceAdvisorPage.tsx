import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listServiceAdvisorEntries,
  listReceptionEntries,
  updateServiceAdvisorEntry,
  uploadServiceAdvisorEstimate,
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

export default function ServiceAdvisorPage() {
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const [rows, setRows] = useState<ReceptionEntryRow[]>([])
  const [allRows, setAllRows] = useState<ReceptionEntryRow[]>([])
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const [dirtyRowIds, setDirtyRowIds] = useState<Set<number>>(new Set())
  const [isAdmin, setIsAdmin] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState<string | 'all'>('all')
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [uploadingId, setUploadingId] = useState<number | null>(null)
  const [serviceTypeOptions, setServiceTypeOptions] = useState<string[]>(DEFAULT_SERVICE_TYPE_OPTIONS)

  const branchFilteredRows = useMemo(() => {
    if (selectedBranch === 'all') return rows
    return rows.filter(r => r.branch === selectedBranch)
  }, [rows, selectedBranch])

  const displayedRows = useMemo(() => {
    if (selectedCategory === 'all') return branchFilteredRows
    return branchFilteredRows.filter((row) => getCategoryForServiceType(row.service_type) === selectedCategory)
  }, [branchFilteredRows, selectedCategory])

  const availableBranches = useMemo(() => {
    const branches = new Set(allRows.map(r => r.branch).filter(Boolean) as string[])
    return Array.from(branches).sort()
  }, [allRows])

  const categoryCounts = useMemo(() => {
    const floor = branchFilteredRows.filter((row) => getCategoryForServiceType(row.service_type) === 'floor').length
    const other = branchFilteredRows.filter((row) => getCategoryForServiceType(row.service_type) === 'other').length
    const nullCount = branchFilteredRows.filter((row) => getCategoryForServiceType(row.service_type) === 'null').length
    return {
      all: branchFilteredRows.length,
      floor,
      other,
      null: nullCount,
    }
  }, [branchFilteredRows])

  const hasRows = useMemo(() => displayedRows.length > 0, [displayedRows.length])
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
    return rows[0]?.branch || 'Unknown'
  }, [rows, isAdmin, selectedBranch])
  const pendingEstimateCount = useMemo(
    () => displayedRows.filter(r => !r.estimate_storage_path).length,
    [displayedRows],
  )

  // Detect if user is admin by checking module permissions
  async function checkIfAdmin() {
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session.session?.user) {
        setIsAdmin(false)
        return false
      }

      // Check user_module_permissions for 'reception' module with can_delete
      const { data: perms } = await supabase
        .from('user_module_permissions')
        .select('can_modify, can_delete')
        .eq('user_id', session.session.user.id)
        .eq('module_id', 1) // Reception module ID
        .single()

      const nextIsAdmin = perms?.can_delete === true && perms?.can_modify === true
      setIsAdmin(nextIsAdmin)
      return nextIsAdmin
    } catch {
      setIsAdmin(false)
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
    } else {
      setRows(data)
      setAllRows(data)
    }

    const mappedDrafts: Record<number, RowDraft> = {}
    data.forEach((row) => {
      mappedDrafts[row.id] = {
        service_type: row.service_type,
        jc_number: row.jc_number ?? '',
        remark: row.remark ?? '',
      }
    })

    setServiceTypeOptions((prev) => mergeServiceTypes(prev, data.map((row) => row.service_type ?? '')))

    setDrafts(mappedDrafts)
    setDirtyRowIds(new Set())
    setLoading(false)
  }

  useEffect(() => {
    void loadRows()
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

    showToast('Estimate uploaded')
    await loadRows()
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
          {isAdmin ? 'All assigned vehicles' : 'My assigned vehicles'}
        </h1>
        <p>
          {isAdmin ? (
            <>
              Showing all service advisor entries across all advisors.
              {availableBranches.length > 0 && ` Use branch filter to manage your cases.`}
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

        {/* Branch Filter (Admin Only) */}
        {isAdmin && availableBranches.length > 0 && (
          <>
            <div className="toolbar toolbar--tight">
              <span className="toolbar__label">Filter by branch:</span>
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
          <div className="schip">
            <span className="ic"><Icon name="admin" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{displayedRows.length}</div>
              <div className="l">Assigned to me</div>
            </div>
          </div>

          <div className="schip">
            <span className="ic schip__ic--warn"><Icon name="doc" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{pendingEstimateCount}</div>
              <div className="l">Estimates pending</div>
            </div>
          </div>

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
              Assigned entries <span className="subcount">({displayedRows.length})</span>
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
              {isAdmin ? 'No rows found for this branch filter.' : 'No rows are assigned to your advisor account.'}
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
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((row) => {
                    const draft = drafts[row.id] ?? EMPTY_DRAFT
                    const isDirty = dirtyRowIds.has(row.id)
                    const toneColor = getSourceToneColor(row.source)

                    return (
                      <tr key={row.id}>
                        <td className="td-muted-nowrap">{formatDate(row.created_at)}</td>
                        <td>
                          <span className={`pill ${toneColor}`.trim()}>
                            {row.source}
                          </span>
                        </td>
                        <td className="mono strong">{row.reg_number}</td>
                        <td>{row.model || '-'}</td>
                        <td>
                          <select
                            value={draft.service_type}
                            onChange={(event) => patchDraft(row.id, { service_type: event.target.value })}
                            className="sel sel--service-type"
                          >
                            <option value="">Select service type</option>
                            {serviceTypeOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                            {!serviceTypeOptions.some((option) => option.toLowerCase() === draft.service_type.trim().toLowerCase()) && draft.service_type.trim() && (
                              <option value={draft.service_type}>{draft.service_type}</option>
                            )}
                          </select>
                        </td>
                        <td>
                          <input
                            value={draft.jc_number}
                            onChange={(event) =>
                              patchDraft(row.id, { jc_number: event.target.value.toUpperCase() })
                            }
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
                                {uploadingId === row.id ? 'Uploading...' : 'Upload file'}
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
