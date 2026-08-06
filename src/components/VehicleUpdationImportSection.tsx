import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Icon } from './Icon'
import { supabase } from '../lib/supabase'
import {
  buildVehicleUpdationRows,
  formatVehicleUpdationParseErrors,
  mapVehicleUpdationHeaders,
  validatePortalFuelTypes,
  type VehicleUpdationPortal,
} from '../lib/vehicleUpdationColumnMapper'

interface UploadSlot {
  key: string
  label: string
  portal: VehicleUpdationPortal
  btnColor: string
  badge: string
}

interface LastUpload {
  file_name: string | null
  sheet_name: string | null
  uploaded_at: string
  row_count: number
  skipped_blank_rows: number
}

type SlotMsg = { type: 'progress' | 'success' | 'error'; text: string }

interface PendingWorkbook {
  file: File
  workbook: XLSX.WorkBook
  sheetNames: string[]
  selectedSheet: string
}

const VU_SLOTS: UploadSlot[] = [
  { key: 'VU_EV', label: 'Portal EV', portal: 'EV', btnColor: '#059669', badge: 'EV' },
  { key: 'VU_PV', label: 'Portal PV', portal: 'PV', btnColor: '#2563eb', badge: 'PV' },
]

async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  const ab = await file.arrayBuffer()
  return XLSX.read(ab, { type: 'array', cellDates: true })
}

function getSheetRowCount(workbook: XLSX.WorkBook, sheetName: string): number {
  const ws = workbook.Sheets[sheetName]
  if (!ws) return 0
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  return rows.length
}

function getWorkbookSheetNames(workbook: XLSX.WorkBook): string[] {
  return workbook.SheetNames.filter((name) => getSheetRowCount(workbook, name) > 0)
}

function getSheetRows(workbook: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const ws = workbook.Sheets[sheetName]
  if (!ws) return []
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
}

interface MiniCardProps {
  slot: UploadSlot
  lastUpload: LastUpload | null
  msg: SlotMsg | null
  uploading: boolean
  pending: PendingWorkbook | null
  onFile: (file: File) => void
  onSheetChange: (sheetName: string) => void
  onConfirmPending: () => void
  onCancelPending: () => void
}

function MiniUploadCard({
  slot,
  lastUpload,
  msg,
  uploading,
  pending,
  onFile,
  onSheetChange,
  onConfirmPending,
  onCancelPending,
}: MiniCardProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return (
    <div
      className={`relative rounded-xl border-2 p-4 transition-all ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
            style={{ backgroundColor: slot.btnColor }}
          >
            {slot.badge}
          </span>
          <span className="text-sm font-semibold text-gray-800">{slot.label}</span>
        </div>
        {lastUpload && (
          <span className="text-[10px] text-gray-400">
            {new Date(lastUpload.uploaded_at).toLocaleDateString('en-IN', {
              day: '2-digit', month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata',
            })}
            {' '}
            {new Date(lastUpload.uploaded_at).toLocaleTimeString('en-IN', {
              hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
            })}
          </span>
        )}
      </div>

      {lastUpload ? (
        <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <p className="truncate font-medium text-gray-700" title={lastUpload.file_name ?? ''}>
            {lastUpload.file_name ?? 'Unknown file'}
            {lastUpload.sheet_name ? ` · ${lastUpload.sheet_name}` : ''}
          </p>
          <p className="mt-0.5 text-gray-500">
            {lastUpload.row_count.toLocaleString('en-IN')} rows
            {lastUpload.skipped_blank_rows > 0
              ? ` · ${lastUpload.skipped_blank_rows.toLocaleString('en-IN')} blank chassis skipped`
              : ''}
          </p>
        </div>
      ) : (
        <div className="mb-3 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-center text-xs text-gray-400">
          No uploads yet
        </div>
      )}

      {pending && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="mb-2 font-medium">Multiple sheets found — choose one:</p>
          <select
            className="mb-2 w-full rounded border border-amber-200 bg-white px-2 py-1 text-xs"
            value={pending.selectedSheet}
            onChange={(event) => onSheetChange(event.target.value)}
          >
            {pending.sheetNames.map((sheetName) => (
              <option key={sheetName} value={sheetName}>{sheetName}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded bg-amber-700 px-2 py-1 text-[11px] font-semibold text-white"
              onClick={onConfirmPending}
              disabled={uploading}
            >
              Import selected sheet
            </button>
            <button
              type="button"
              className="rounded border border-amber-300 px-2 py-1 text-[11px] text-amber-800"
              onClick={onCancelPending}
              disabled={uploading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,.txt"
        className="hidden"
        id={`vu-file-${slot.key}`}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          event.target.value = ''
        }}
      />
      <label
        htmlFor={`vu-file-${slot.key}`}
        className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${uploading ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'}`}
        style={{ backgroundColor: slot.btnColor }}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {uploading ? 'Uploading…' : `Upload ${slot.label}`}
      </label>

      {dragging && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-blue-100/80 text-sm font-semibold text-blue-700">
          Drop file here
        </div>
      )}

      {msg && (
        <div className={`mt-2 rounded-lg px-3 py-2 text-xs font-medium ${
          msg.type === 'error'
            ? 'bg-red-50 text-red-700'
            : msg.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-blue-50 text-blue-700'
        }`}>
          {msg.text}
        </div>
      )}
    </div>
  )
}

export function VehicleUpdationImportSection() {
  const [expanded, setExpanded] = useState(false)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [msgs, setMsgs] = useState<Record<string, SlotMsg | null>>({})
  const [lastUploads, setLastUploads] = useState<Record<string, LastUpload | null>>({})
  const [pendingBySlot, setPendingBySlot] = useState<Record<string, PendingWorkbook | null>>({})

  const loadLastUploads = useCallback(async () => {
    const { data, error } = await supabase
      .from('vehicle_updation_uploads')
      .select('portal,file_name,sheet_name,uploaded_at,row_count,skipped_blank_rows')
      .order('uploaded_at', { ascending: false })

    if (error) {
      console.warn('vehicle_updation_uploads load failed:', error.message)
      return
    }

    const map: Record<string, LastUpload | null> = {}
    for (const slot of VU_SLOTS) {
      const found = (data ?? []).find((row) => row.portal === slot.portal)
      map[slot.key] = found
        ? {
          file_name: found.file_name,
          sheet_name: found.sheet_name,
          uploaded_at: found.uploaded_at,
          row_count: found.row_count,
          skipped_blank_rows: found.skipped_blank_rows,
        }
        : null
    }
    setLastUploads(map)
  }, [])

  useEffect(() => { void loadLastUploads() }, [loadLastUploads])

  const uploadSheet = useCallback(async (
    slot: UploadSlot,
    file: File,
    workbook: XLSX.WorkBook,
    sheetName: string,
  ) => {
    setUploading((prev) => ({ ...prev, [slot.key]: true }))
    setMsgs((prev) => ({ ...prev, [slot.key]: { type: 'progress', text: `Parsing ${file.name}…` } }))

    try {
      if (!file.name.match(/\.(xlsx|xls|csv|txt)$/i)) {
        throw new Error('Please upload an Excel or CSV file.')
      }

      const rawRows = getSheetRows(workbook, sheetName)
      if (rawRows.length === 0) {
        throw new Error(`Sheet "${sheetName}" has no data rows.`)
      }

      const headers = Object.keys(rawRows[0] ?? {})
      const headerResult = mapVehicleUpdationHeaders(headers)
      if ('errors' in headerResult) {
        throw new Error(formatVehicleUpdationParseErrors(headerResult.errors))
      }

      const built = buildVehicleUpdationRows(rawRows, {
        fileName: file.name,
        headers,
        mapping: headerResult.mapping,
      })
      if (built.errors.length > 0) {
        throw new Error(formatVehicleUpdationParseErrors(built.errors))
      }

      const portalError = validatePortalFuelTypes(slot.portal, built.rows)
      if (portalError) throw new Error(portalError)

      const uploadSessionId = crypto.randomUUID()
      const { data: { user } } = await supabase.auth.getUser()

      setMsgs((prev) => ({
        ...prev,
        [slot.key]: {
          type: 'progress',
          text: `Replacing ${slot.portal} data (${built.rows.length.toLocaleString('en-IN')} rows)…`,
        },
      }))

      const { data, error } = await supabase.rpc('replace_vehicle_updation_portal', {
        p_portal: slot.portal,
        p_upload_session_id: uploadSessionId,
        p_file_name: file.name,
        p_sheet_name: sheetName,
        p_uploaded_by_email: user?.email ?? null,
        p_skipped_blank_rows: built.skippedBlankRows,
        p_rows: built.rows,
      })
      if (error) throw new Error(error.message)

      const deletedCount = Number((data as { deleted_count?: number })?.deleted_count ?? 0)
      const insertedCount = Number((data as { inserted_count?: number })?.inserted_count ?? built.rows.length)

      setMsgs((prev) => ({
        ...prev,
        [slot.key]: {
          type: 'success',
          text: `✅ ${insertedCount.toLocaleString('en-IN')} rows imported for ${slot.portal} (cleared ${deletedCount.toLocaleString('en-IN')} old rows${built.skippedBlankRows > 0 ? ` · ${built.skippedBlankRows} blank chassis skipped` : ''})`,
        },
      }))
      setTimeout(() => setMsgs((prev) => ({ ...prev, [slot.key]: null })), 8000)
      await loadLastUploads()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setMsgs((prev) => ({ ...prev, [slot.key]: { type: 'error', text: `❌ ${message}` } }))
    } finally {
      setUploading((prev) => ({ ...prev, [slot.key]: false }))
      setPendingBySlot((prev) => ({ ...prev, [slot.key]: null }))
    }
  }, [loadLastUploads])

  const handleFile = useCallback(async (file: File, slot: UploadSlot) => {
    try {
      const workbook = await readWorkbook(file)
      const sheetNames = getWorkbookSheetNames(workbook)
      if (sheetNames.length === 0) {
        throw new Error('No data sheets found in file.')
      }

      if (sheetNames.length === 1) {
        await uploadSheet(slot, file, workbook, sheetNames[0])
        return
      }

      setPendingBySlot((prev) => ({
        ...prev,
        [slot.key]: {
          file,
          workbook,
          sheetNames,
          selectedSheet: sheetNames.includes('Sheet1') ? 'Sheet1' : sheetNames[0],
        },
      }))
      setMsgs((prev) => ({
        ...prev,
        [slot.key]: { type: 'progress', text: `${sheetNames.length} sheets found — pick one to import.` },
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setMsgs((prev) => ({ ...prev, [slot.key]: { type: 'error', text: `❌ ${message}` } }))
    }
  }, [uploadSheet])

  const anyUploading = Object.values(uploading).some(Boolean)

  return (
    <section className="imp-group">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="imp-group__hd"
        aria-expanded={expanded}
      >
        <span className="imp-group__ic"><Icon name="shield" size={18} /></span>
        <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <span className="imp-group__title">
            Vehicle Updation
            <span className="imp-group__count">{VU_SLOTS.length}</span>
          </span>
          <span className="imp-group__desc">
            Pending Tata Motors updation campaign lists — one file per portal. Re-upload replaces all rows for that portal only.
          </span>
        </span>
        {anyUploading && (
          <span className="mr-2 text-xs font-medium text-blue-600">Uploading…</span>
        )}
        <Icon
          name="chevron"
          size={18}
          className="imp-group__chev"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {expanded && (
        <div className="imp-group__body">
          <div className="note note--info mb-gap text-sm">
            Uploading <b>Portal EV</b> clears only EV rows. <b>Portal PV</b> data is untouched (and vice versa).
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {VU_SLOTS.map((slot) => (
              <MiniUploadCard
                key={slot.key}
                slot={slot}
                lastUpload={lastUploads[slot.key] ?? null}
                msg={msgs[slot.key] ?? null}
                uploading={!!uploading[slot.key]}
                pending={pendingBySlot[slot.key] ?? null}
                onFile={(file) => void handleFile(file, slot)}
                onSheetChange={(sheetName) => {
                  setPendingBySlot((prev) => {
                    const pending = prev[slot.key]
                    if (!pending) return prev
                    return {
                      ...prev,
                      [slot.key]: { ...pending, selectedSheet: sheetName },
                    }
                  })
                }}
                onConfirmPending={() => {
                  const pending = pendingBySlot[slot.key]
                  if (pending) {
                    void uploadSheet(slot, pending.file, pending.workbook, pending.selectedSheet)
                  }
                }}
                onCancelPending={() => {
                  setPendingBySlot((prev) => ({ ...prev, [slot.key]: null }))
                  setMsgs((prev) => ({ ...prev, [slot.key]: null }))
                }}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
