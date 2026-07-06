import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createPartsRequest,
  listMyPartsRequests,
  markAllPartsRequestsSeen,
  markPartsRequestSeen,
  updateMyPartsRequestFields,
  PARTS_STATUS_COLOR,
  type PartsRequestRow,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'

type Draft = {
  registration_number: string
  parts_required: string
  parts_description: string
  advisor_remarks: string
  entry_date: string
  parts_number: string
}

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

const EMPTY_DRAFT: Draft = {
  registration_number: '',
  parts_required: '',
  parts_description: '',
  advisor_remarks: '',
  entry_date: todayIST(),
  parts_number: '',
}

function StatusBadge({ status }: { status: PartsRequestRow['parts_status'] }) {
  const c = PARTS_STATUS_COLOR[status] ?? PARTS_STATUS_COLOR.Pending
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  )
}

const LOW_STOCK_THRESHOLD = 5

function QtyBadge({ qty }: { qty: number | null }) {
  if (qty == null) {
    return <span className="text-xs font-medium text-gray-400">Not Available</span>
  }
  if (qty <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
        0 <span className="text-red-500">· Out of Stock</span>
      </span>
    )
  }
  if (qty < LOW_STOCK_THRESHOLD) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
        {qty} <span className="text-amber-600">· Low Stock</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
      {qty} <span className="text-emerald-600">· Available</span>
    </span>
  )
}

const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'text-xs font-semibold text-gray-600'

export default function PartsRequirementSection() {
  const [rows, setRows] = useState<PartsRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listMyPartsRequests()
    if (res.error) {
      setError(res.error)
    } else {
      setError(null)
      setRows(res.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Realtime: refresh whenever any of my own parts_requests rows change (SPM update, or
  // auto-match from a Parts Order Sheet / Stock Snapshot import — status, order date, and
  // Parts Qty all flow through this same channel). RLS already scopes this to my own rows.
  useEffect(() => {
    const channel = supabase
      .channel('parts_requests_advisor_own')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts_requests' }, () => {
        void load()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const unseenCount = useMemo(() => rows.filter((r) => !r.advisor_seen).length, [rows])

  const openCreateForm = () => {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setShowForm(true)
  }

  const openEditForm = (row: PartsRequestRow) => {
    setEditingId(row.id)
    setDraft({
      registration_number: row.registration_number,
      parts_required: row.parts_required,
      parts_description: row.parts_description ?? '',
      advisor_remarks: row.advisor_remarks ?? '',
      entry_date: row.entry_date,
      parts_number: row.parts_number ?? '',
    })
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!draft.registration_number.trim() || !draft.parts_required.trim()) {
      setError('Registration number and Parts Required are mandatory')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      registrationNumber: draft.registration_number.trim().toUpperCase(),
      partsRequired: draft.parts_required.trim(),
      partsDescription: draft.parts_description.trim() || null,
      advisorRemarks: draft.advisor_remarks.trim() || null,
      entryDate: draft.entry_date || null,
      partsNumber: draft.parts_number.trim() || null,
    }
    const res = editingId
      ? await updateMyPartsRequestFields({ id: editingId, ...payload })
      : await createPartsRequest(payload)

    setSaving(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setToast(editingId ? 'Request updated' : 'Parts request submitted')
    setShowForm(false)
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    void load()
  }

  const handleExpand = async (row: PartsRequestRow) => {
    const next = expandedId === row.id ? null : row.id
    setExpandedId(next)
    if (next && !row.advisor_seen) {
      await markPartsRequestSeen(row.id)
      void load()
    }
  }

  const handleMarkAllSeen = async () => {
    await markAllPartsRequestsSeen()
    void load()
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className="sa-toast">
          <Icon name="checksm" size={16} strokeWidth={2.4} />
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900">My Parts Requests</h2>
          {unseenCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAllSeen()}
              title="Click to mark all as seen"
              className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-red-600"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" />
              {unseenCount} update{unseenCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Icon name="plus" size={15} strokeWidth={2.2} />
          New Parts Requirement
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-gray-900">{editingId ? 'Edit Parts Requirement' : 'New Parts Requirement'}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className={labelCls}>
              Entry Date
              <input
                type="date"
                value={draft.entry_date}
                onChange={(e) => setDraft((d) => ({ ...d, entry_date: e.target.value }))}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              Registration Number *
              <input
                type="text"
                value={draft.registration_number}
                onChange={(e) => setDraft((d) => ({ ...d, registration_number: e.target.value.toUpperCase() }))}
                placeholder="e.g. RJ14AB1234"
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              Parts Required *
              <input
                type="text"
                value={draft.parts_required}
                onChange={(e) => setDraft((d) => ({ ...d, parts_required: e.target.value }))}
                placeholder="e.g. Front Bumper, Headlamp LH"
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              Parts No <span className="font-normal normal-case text-gray-400">(optional)</span>
              <input
                type="text"
                value={draft.parts_number}
                onChange={(e) => setDraft((d) => ({ ...d, parts_number: e.target.value.toUpperCase() }))}
                placeholder="Enter if already known"
                className={inputCls}
              />
            </label>
            <label className={`${labelCls} sm:col-span-2 lg:col-span-3`}>
              Parts Description
              <textarea
                value={draft.parts_description}
                onChange={(e) => setDraft((d) => ({ ...d, parts_description: e.target.value }))}
                rows={2}
                placeholder="Additional details about the part(s) needed — used to auto-match available stock"
                className={`${inputCls} font-sans`}
              />
            </label>
            <label className={`${labelCls} sm:col-span-2 lg:col-span-3`}>
              Remarks
              <textarea
                value={draft.advisor_remarks}
                onChange={(e) => setDraft((d) => ({ ...d, advisor_remarks: e.target.value }))}
                rows={2}
                placeholder="Any notes for Parts SPM"
                className={`${inputCls} font-sans`}
              />
            </label>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Parts Qty is calculated automatically from current stock once you submit — no need to enter it.
            If you already know the Parts No, enter it above for faster stock matching; otherwise leave it
            blank and Parts SPM will fill it in.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Submit Request'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); setError(null) }}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            No parts requests yet. Click "New Parts Requirement" to raise one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Entry Date</th>
                  <th className="px-4 py-3">Reg. Number</th>
                  <th className="px-4 py-3">Parts Required</th>
                  <th className="px-4 py-3">Parts Qty</th>
                  <th className="px-4 py-3">Parts Number</th>
                  <th className="px-4 py-3">Order Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">SPM Remarks</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <>
                    <tr
                      key={row.id}
                      onClick={() => void handleExpand(row)}
                      className={`cursor-pointer border-b border-gray-100 transition hover:bg-gray-50 ${!row.advisor_seen ? 'bg-orange-50/60' : ''}`}
                    >
                      <td className="px-4 py-2.5 text-gray-700">{row.entry_date}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-900">{row.registration_number}</td>
                      <td className="px-4 py-2.5 text-gray-700">{row.parts_required}</td>
                      <td className="px-4 py-2.5"><QtyBadge qty={row.parts_qty} /></td>
                      <td className={`px-4 py-2.5 ${row.parts_number ? 'text-gray-700' : 'text-gray-400'}`}>{row.parts_number || '—'}</td>
                      <td className={`px-4 py-2.5 ${row.parts_order_date ? 'text-gray-700' : 'text-gray-400'}`}>{row.parts_order_date || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={row.parts_status} />
                          {!row.advisor_seen && <span className="inline-block h-2 w-2 rounded-full bg-red-500" />}
                        </div>
                      </td>
                      <td className={`max-w-[220px] truncate px-4 py-2.5 ${row.spm_remarks ? 'text-gray-700' : 'text-gray-400'}`}>
                        {row.spm_remarks || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.parts_status === 'Pending' && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEditForm(row) }}
                            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === row.id && (
                      <tr key={`${row.id}-detail`} className="border-b border-gray-100 bg-gray-50/70">
                        <td colSpan={9} className="px-6 py-3 text-xs text-gray-600">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <div><span className="font-semibold text-gray-800">Parts Description:</span> {row.parts_description || '—'}</div>
                            <div><span className="font-semibold text-gray-800">My Remarks:</span> {row.advisor_remarks || '—'}</div>
                            <div><span className="font-semibold text-gray-800">Vehicle Type:</span> {row.vehicle_type || '—'}</div>
                            <div><span className="font-semibold text-gray-800">Last Update:</span> {new Date(row.status_updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
                            {row.auto_match_note && (
                              <div className="sm:col-span-2 lg:col-span-4">
                                <span className="font-semibold text-gray-800">Auto-match info:</span> {row.auto_match_note}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
