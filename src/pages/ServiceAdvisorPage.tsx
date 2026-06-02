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

const SERVICE_TYPE_OPTIONS = [
  'Running Repair',
  'First Free Service',
  'Second Free Service',
  'Third Free Service',
  'Paid Service',
]

const EMPTY_DRAFT: RowDraft = {
  service_type: '',
  jc_number: '',
  remark: '',
}

const SOURCE_TONE_MAP: Record<string, string> = {
  'Driver Pickup': 'blue',
  'Walk-in': 'green',
  'Self': 'gray',
  'RSA': 'blue',
  'PSF Backfill': 'gray',
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
}

function getSourceToneColor(source: string): string {
  return SOURCE_TONE_MAP[source] || 'gray'
}

export default function ServiceAdvisorPage() {
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const [rows, setRows] = useState<ReceptionEntryRow[]>([])
  const [allRows, setAllRows] = useState<ReceptionEntryRow[]>([])
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const [dirtyRowIds, setDirtyRowIds] = useState<Set<number>>(new Set())
  const [isAdmin, setIsAdmin] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState<string | 'all'>('all')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [uploadingId, setUploadingId] = useState<number | null>(null)

  const displayedRows = useMemo(() => {
    if (selectedBranch === 'all') return rows
    return rows.filter(r => r.branch === selectedBranch)
  }, [rows, selectedBranch])

  const availableBranches = useMemo(() => {
    const branches = new Set(allRows.map(r => r.branch).filter(Boolean) as string[])
    return Array.from(branches).sort()
  }, [allRows])

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
        return
      }

      // Check user_module_permissions for 'reception' module with can_delete
      const { data: perms } = await supabase
        .from('user_module_permissions')
        .select('can_modify, can_delete')
        .eq('user_id', session.session.user.id)
        .eq('module_id', 1) // Reception module ID
        .single()

      setIsAdmin(perms?.can_delete === true && perms?.can_modify === true)
    } catch {
      setIsAdmin(false)
    }
  }

  async function loadRows() {
    setLoading(true)
    setError(null)

    // Check if user is admin
    await checkIfAdmin()

    // Fetch appropriate data
    let res
    if (isAdmin) {
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
    if (isAdmin) {
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
    <div className="page min-h-screen bg-gray-50">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-gray-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">
          <Icon name="checksm" size={16} strokeWidth={2.4} />
          {toastMsg}
        </div>
      )}

      {/* Page Head */}
      <div className="px-6 py-8 md:px-8 md:py-10">
        <div className="flex items-center gap-3 mb-3">
          <Icon name="admin" size={16} strokeWidth={2} className="text-gray-600" />
          <p className="text-sm font-medium text-gray-600">Service Advisor</p>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {isAdmin ? 'All assigned vehicles' : 'My assigned vehicles'}
        </h1>
        <p className="text-base text-gray-600">
          {isAdmin ? (
            <>
              Showing all service advisor entries across all advisors.
              {availableBranches.length > 0 && ` Use branch filter to manage your cases.`}
            </>
          ) : (
            <>
              Showing only rows assigned to <span className="font-semibold text-gray-900">{advisorName}</span> ({advisorCode}). Edit service type, JC number, remark, and upload the estimate.
            </>
          )}
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Branch Filter (Admin Only) */}
        {isAdmin && availableBranches.length > 0 && (
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-gray-700">Filter by branch:</span>
            <button
              onClick={() => setSelectedBranch('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                selectedBranch === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All ({allRows.length})
            </button>
            {availableBranches.map((branch) => {
              const count = allRows.filter(r => r.branch === branch).length
              return (
                <button
                  key={branch}
                  onClick={() => setSelectedBranch(branch)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    selectedBranch === branch
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {branch} ({count})
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Summary Chips */}
      {hasRows && (
        <div className="px-6 md:px-8 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <Icon name="admin" size={18} strokeWidth={2} className="text-blue-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">{rows.length}</div>
              <div className="text-sm text-gray-600">Assigned to me</div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <Icon name="doc" size={18} strokeWidth={2} className="text-amber-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">{pendingEstimateCount}</div>
              <div className="text-sm text-gray-600">Estimates pending</div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <Icon name="building" size={18} strokeWidth={2} className="text-indigo-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">{advisorBranch}</div>
              <div className="text-sm text-gray-600">Branch</div>
            </div>
          </div>
        </div>
      )}

      {/* Assigned Entries Card */}
      <div className="px-6 md:px-8 pb-8">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Assigned entries <span className="text-gray-500 font-normal">({displayedRows.length})</span>
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {isAdmin ? 'Showing all intakes from filtered branch · edits save per row' : 'Each row is one intake assigned to you · edits save per row'}
            </p>
          </div>

          {loading ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">Loading assigned rows...</div>
          ) : !hasRows ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              {isAdmin ? 'No rows found for this branch filter.' : 'No rows are assigned to your advisor account.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Created</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Source</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Reg No</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Model</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Service Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">JC Number</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Owner</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Remark</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Estimate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayedRows.map((row) => {
                    const draft = drafts[row.id] ?? EMPTY_DRAFT
                    const isDirty = dirtyRowIds.has(row.id)
                    const toneColor = getSourceToneColor(row.source)

                    const toneClasses: Record<string, string> = {
                      blue: 'bg-blue-50 text-blue-700',
                      green: 'bg-green-50 text-green-700',
                      gray: 'bg-gray-100 text-gray-700',
                    }

                    return (
                      <tr key={row.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-xs">{formatDate(row.created_at)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${toneClasses[toneColor] || toneClasses.gray}`}>
                            {row.source}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-gray-900">{row.reg_number}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">{row.model || '-'}</td>
                        <td className="px-4 py-3">
                          <select
                            value={draft.service_type}
                            onChange={(event) => patchDraft(row.id, { service_type: event.target.value })}
                            className="block w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">Select service type</option>
                            {SERVICE_TYPE_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                            {!SERVICE_TYPE_OPTIONS.includes(draft.service_type) && draft.service_type.trim() && (
                              <option value={draft.service_type}>{draft.service_type}</option>
                            )}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={draft.jc_number}
                            onChange={(event) =>
                              patchDraft(row.id, { jc_number: event.target.value.toUpperCase() })
                            }
                            style={{ textTransform: 'uppercase' }}
                            placeholder="JC number"
                            className="block w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-mono text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 min-w-[140px]">
                          <div className="font-semibold text-gray-900">{row.owner_name || '-'}</div>
                          <div className="text-xs font-mono text-gray-600">{row.owner_phone || '-'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <textarea
                            value={draft.remark}
                            onChange={(event) => patchDraft(row.id, { remark: event.target.value })}
                            placeholder="Add remark…"
                            rows={1}
                            className="block w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 min-w-[200px]">
                          <div className="flex flex-col gap-1">
                            {row.estimate_storage_path ? (
                              <>
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
                                  <Icon name="checksm" size={13} strokeWidth={2.4} />
                                  {row.estimate_file_name || 'Estimate uploaded'}
                                </div>
                                <div className="flex gap-1">
                                  {row.estimate_drive_url && (
                                    <a
                                      href={row.estimate_drive_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                                    >
                                      View estimate
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => fileInputRefs.current[row.id]?.click()}
                                    disabled={uploadingId === row.id}
                                    className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
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
                                className="flex items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60 disabled:cursor-not-allowed"
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
                              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
