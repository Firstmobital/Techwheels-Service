import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkBook } from 'xlsx'
import { Icon } from './Icon'
import { supabase } from '../lib/supabase'
import {
  getSpreadsheetSheetRows,
  parseSpreadsheetUploadFile,
} from '../lib/parseSpreadsheetUploadFile'
import {
  buildVehicleUpdationRows,
  formatVehicleUpdationParseErrors,
  mapVehicleUpdationHeaders,
  validatePortalFuelTypes,
  type VehicleUpdationPortal,
} from '../lib/vehicleUpdationColumnMapper'
import {
  buildVehicleUpdationClaimedRows,
  formatVehicleUpdationClaimedParseErrors,
  mapVehicleUpdationClaimedHeaders,
  validateClaimedPortalProductLines,
} from '../lib/vehicleUpdationClaimedColumnMapper'

type UploadKind = 'pending' | 'claimed'

interface UploadSlot {
  key: string
  label: string
  portal: VehicleUpdationPortal
  uploadKind: UploadKind
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
  workbook: WorkBook
  sheetNames: string[]
  selectedSheet: string
}

const PENDING_SLOTS: UploadSlot[] = [
  { key: 'VU_EV', label: 'Portal EV', portal: 'EV', uploadKind: 'pending', btnColor: '#059669', badge: 'EV' },
  { key: 'VU_PV', label: 'Portal PV', portal: 'PV', uploadKind: 'pending', btnColor: '#2563eb', badge: 'PV' },
]

const CLAIMED_SLOTS: UploadSlot[] = [
  { key: 'VUC_EV', label: 'Portal EV', portal: 'EV', uploadKind: 'claimed', btnColor: '#0f766e', badge: 'EV' },
  { key: 'VUC_PV', label: 'Portal PV', portal: 'PV', uploadKind: 'claimed', btnColor: '#1d4ed8', badge: 'PV' },
]

const ALL_SLOTS = [...PENDING_SLOTS, ...CLAIMED_SLOTS]

async function readUploadWorkbook(file: File): Promise<{ workbook: WorkBook; sheetNames: string[] }> {
  const parsed = await parseSpreadsheetUploadFile(file)
  return parsed
}

function getSheetRows(workbook: WorkBook, sheetName: string): Record<string, unknown>[] {
  return getSpreadsheetSheetRows(workbook, sheetName)
}

interface MiniCardProps {
  slot: UploadSlot
  lastUpload: LastUpload | null
  msg: SlotMsg | null
  uploading: boolean
  pending: PendingWorkbook | null
  uploadLabel: string
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
  uploadLabel,
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
        {uploading ? 'Uploading…' : uploadLabel}
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
      .select('portal,upload_kind,file_name,sheet_name,uploaded_at,row_count,skipped_blank_rows')
      .order('uploaded_at', { ascending: false })

    if (error) {
      console.warn('vehicle_updation_uploads load failed:', error.message)
      return
    }

    const map: Record<string, LastUpload | null> = {}
    for (const slot of ALL_SLOTS) {
      const found = (data ?? []).find((row) => {
        const kind = String((row as { upload_kind?: string | null }).upload_kind ?? 'pending')
        return row.portal === slot.portal && kind === slot.uploadKind
      })
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

  const uploadPendingSheet = useCallback(async (
    slot: UploadSlot,
    file: File,
    workbook: WorkBook,
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
          text: `Replacing ${slot.portal} pending data (${built.rows.length.toLocaleString('en-IN')} rows)…`,
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
          text: `✅ ${insertedCount.toLocaleString('en-IN')} pending rows imported for ${slot.portal} (cleared ${deletedCount.toLocaleString('en-IN')} old rows${built.skippedBlankRows > 0 ? ` · ${built.skippedBlankRows} blank chassis skipped` : ''})`,
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

  const uploadClaimedSheet = useCallback(async (
    slot: UploadSlot,
    file: File,
    workbook: WorkBook,
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
      const headerResult = mapVehicleUpdationClaimedHeaders(headers)
      if ('errors' in headerResult) {
        throw new Error(formatVehicleUpdationClaimedParseErrors(headerResult.errors))
      }

      const built = buildVehicleUpdationClaimedRows(rawRows, {
        fileName: file.name,
        headers,
        mapping: headerResult.mapping,
      })
      if (built.errors.length > 0) {
        throw new Error(formatVehicleUpdationClaimedParseErrors(built.errors))
      }

      const portalError = validateClaimedPortalProductLines(
        slot.portal,
        built.rows,
        headerResult.mapping,
        rawRows,
      )
      if (portalError) throw new Error(portalError)

      const uploadSessionId = crypto.randomUUID()
      const { data: { user } } = await supabase.auth.getUser()

      setMsgs((prev) => ({
        ...prev,
        [slot.key]: {
          type: 'progress',
          text: `Applying ${built.rows.length.toLocaleString('en-IN')} claimed chassis for ${slot.portal}…`,
        },
      }))

      const { data, error } = await supabase.rpc('apply_vehicle_updation_claimed_portal', {
        p_portal: slot.portal,
        p_upload_session_id: uploadSessionId,
        p_file_name: file.name,
        p_sheet_name: sheetName,
        p_uploaded_by_email: user?.email ?? null,
        p_skipped_blank_rows: built.skippedBlankRows + built.skippedNonUpdationRows,
        p_rows: built.rows,
      })
      if (error) throw new Error(error.message)

      const submittedCount = Number((data as { submitted_count?: number })?.submitted_count ?? built.rows.length)
      const removedCount = Number((data as { removed_count?: number })?.removed_count ?? 0)
      const notFoundCount = Number((data as { not_found_count?: number })?.not_found_count ?? 0)

      const skippedParts = [
        built.skippedBlankRows > 0 ? `${built.skippedBlankRows} blank chassis skipped` : '',
        built.skippedNonUpdationRows > 0 ? `${built.skippedNonUpdationRows} non-updation rows skipped` : '',
        notFoundCount > 0 ? `${notFoundCount} chassis not in pending list` : '',
      ].filter(Boolean)

      setMsgs((prev) => ({
        ...prev,
        [slot.key]: {
          type: 'success',
          text: `✅ Removed ${removedCount.toLocaleString('en-IN')} pending row(s) for ${submittedCount.toLocaleString('en-IN')} claimed chassis (${slot.portal})${skippedParts.length > 0 ? ` · ${skippedParts.join(' · ')}` : ''}`,
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

  const uploadSheet = useCallback(async (
    slot: UploadSlot,
    file: File,
    workbook: WorkBook,
    sheetName: string,
  ) => {
    if (slot.uploadKind === 'claimed') {
      await uploadClaimedSheet(slot, file, workbook, sheetName)
      return
    }
    await uploadPendingSheet(slot, file, workbook, sheetName)
  }, [uploadClaimedSheet, uploadPendingSheet])

  const handleFile = useCallback(async (file: File, slot: UploadSlot) => {
    try {
      const { workbook, sheetNames } = await readUploadWorkbook(file)
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

  const renderSlotGrid = (slots: UploadSlot[], uploadLabel: (slot: UploadSlot) => string) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {slots.map((slot) => (
        <MiniUploadCard
          key={slot.key}
          slot={slot}
          lastUpload={lastUploads[slot.key] ?? null}
          msg={msgs[slot.key] ?? null}
          uploading={!!uploading[slot.key]}
          pending={pendingBySlot[slot.key] ?? null}
          uploadLabel={uploadLabel(slot)}
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
  )

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
            <span className="imp-group__count">{ALL_SLOTS.length}</span>
          </span>
          <span className="imp-group__desc">
            Pending campaign lists and claimed removals — separate EV / PV uploads for each workflow.
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
        <div className="imp-group__body space-y-5">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                Pending Updation
              </span>
              <span className="text-sm font-semibold text-gray-800">Upload full pending campaign sheet</span>
            </div>
            <div className="note note--info mb-3 text-sm">
              Re-uploading <b>Portal EV</b> or <b>Portal PV</b> replaces all pending rows for that portal only.
              These vehicles show the <b>Updation Available</b> tag at reception.
            </div>
            {renderSlotGrid(PENDING_SLOTS, (slot) => `Upload Pending ${slot.label}`)}
          </div>

          <div className="border-t border-gray-200 pt-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-800">
                Updation Claimed
              </span>
              <span className="text-sm font-semibold text-gray-800">Remove completed / claimed vehicles</span>
            </div>
            <div className="note note--info mb-3 text-sm">
              Upload the Tata Motors <b>claimed updation</b> export (Chassis No column).
              Matching chassis are removed from the pending list and the <b>Updation Available</b> tag clears automatically.
            </div>
            {renderSlotGrid(CLAIMED_SLOTS, (slot) => `Upload Claimed ${slot.label}`)}
          </div>
        </div>
      )}
    </section>
  )
}
