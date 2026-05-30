import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getServiceAdvisorEstimateSignedUrl,
  listServiceAdvisorEntries,
  updateServiceAdvisorEntry,
  uploadServiceAdvisorEstimate,
  type ReceptionEntryRow,
} from '../lib/api'

type RowDraft = {
  service_type: string
  jc_number: string
  remark: string
}

const EMPTY_DRAFT: RowDraft = {
  service_type: '',
  jc_number: '',
  remark: '',
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function ServiceAdvisorPage() {
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const [rows, setRows] = useState<ReceptionEntryRow[]>([])
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const [estimateUrls, setEstimateUrls] = useState<Record<number, string>>({})

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [uploadingId, setUploadingId] = useState<number | null>(null)

  const hasRows = useMemo(() => rows.length > 0, [rows.length])

  async function hydrateSignedUrls(entries: ReceptionEntryRow[]) {
    const next: Record<number, string> = {}

    await Promise.all(
      entries.map(async (row) => {
        if (!row.estimate_storage_path) return
        const res = await getServiceAdvisorEstimateSignedUrl(row.estimate_storage_path)
        if (!res.error && res.data) {
          next[row.id] = res.data
        }
      }),
    )

    setEstimateUrls(next)
  }

  async function loadRows() {
    setLoading(true)
    setError(null)

    const res = await listServiceAdvisorEntries()
    if (res.error) {
      setRows([])
      setDrafts({})
      setLoading(false)
      setError(res.error)
      return
    }

    const data = res.data ?? []
    setRows(data)

    const mappedDrafts: Record<number, RowDraft> = {}
    data.forEach((row) => {
      mappedDrafts[row.id] = {
        service_type: row.service_type,
        jc_number: row.jc_number ?? '',
        remark: row.remark ?? '',
      }
    })
    setDrafts(mappedDrafts)

    await hydrateSignedUrls(data)
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
  }

  async function saveRow(id: number) {
    const draft = drafts[id]
    if (!draft) return

    setSavingId(id)
    setError(null)
    setNotice(null)

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

    setNotice('Entry updated successfully')
    await loadRows()
  }

  async function handleEstimateUpload(id: number, file: File) {
    setUploadingId(id)
    setError(null)
    setNotice(null)

    const res = await uploadServiceAdvisorEstimate(id, file)
    setUploadingId(null)

    if (res.error) {
      setError(res.error)
      return
    }

    setNotice('Estimate uploaded successfully')
    await loadRows()
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6 space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Service Advisor</h1>
        <p className="mt-1 text-sm text-gray-500">
          Shows only rows assigned to the logged-in service advisor. You can edit Service Type, Job Card Number, Remark, and Estimate.
        </p>

        {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {notice && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
          Assigned Entries ({rows.length})
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-500">Loading assigned rows...</div>
        ) : !hasRows ? (
          <div className="p-4 text-sm text-gray-500">No rows are assigned to your advisor account.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Created At</th>
                  <th className="px-3 py-2 text-left">Reg No</th>
                  <th className="px-3 py-2 text-left">Model</th>
                  <th className="px-3 py-2 text-left">Owner</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Service Type</th>
                  <th className="px-3 py-2 text-left">Job Card Number</th>
                  <th className="px-3 py-2 text-left">Remark</th>
                  <th className="px-3 py-2 text-left">Estimate</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {rows.map((row) => {
                  const draft = drafts[row.id] ?? EMPTY_DRAFT
                  return (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(row.created_at)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{row.reg_number}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.model ?? '-'}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <div>{row.owner_name ?? '-'}</div>
                        <div className="text-xs text-gray-500">{row.owner_phone ?? '-'}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{row.source}</td>
                      <td className="px-3 py-2">
                        <input
                          value={draft.service_type}
                          onChange={(event) => patchDraft(row.id, { service_type: event.target.value })}
                          className="w-44 rounded-md border border-gray-300 px-2 py-1 outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={draft.jc_number}
                          onChange={(event) =>
                            patchDraft(row.id, { jc_number: event.target.value.toUpperCase() })
                          }
                          style={{ textTransform: 'uppercase' }}
                          className="w-44 rounded-md border border-gray-300 px-2 py-1 outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <textarea
                          value={draft.remark}
                          onChange={(event) => patchDraft(row.id, { remark: event.target.value })}
                          rows={2}
                          className="w-52 rounded-md border border-gray-300 px-2 py-1 outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
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
                        <div className="flex flex-col items-start gap-1">
                          <button
                            type="button"
                            onClick={() => fileInputRefs.current[row.id]?.click()}
                            disabled={uploadingId === row.id}
                            className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {uploadingId === row.id ? 'Uploading...' : row.estimate_storage_path ? 'Replace File' : 'Upload File'}
                          </button>
                          {row.estimate_file_name && (
                            <span className="max-w-40 truncate text-xs text-gray-600" title={row.estimate_file_name}>
                              {row.estimate_file_name}
                            </span>
                          )}
                          {estimateUrls[row.id] && (
                            <a
                              href={estimateUrls[row.id]}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium text-blue-700 hover:underline"
                            >
                              View Estimate
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void saveRow(row.id)}
                          disabled={savingId === row.id}
                          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingId === row.id ? 'Saving...' : 'Save'}
                        </button>
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
  )
}
