// EvBackOrderImportSection — self-contained upload section for the
// Sitapura EV Back Order & Dispatch sheet (Dealer Code 500A841 only).
//
// Reads columns by POSITION (not header name) to match the user spec:
//   A=Order No, B=Order Date, D=Dealer Code, E=Order Type, F=Order Qty,
//   G=Part No, I=Part Description, U=Invoice Date, V=Docket No,
//   AC=Order Status (Remark), AD=Delivery Date, AE=Status
//
// Only rows where Column D = "500A841" are imported.
// ZYSO → VOR, ZYOR → Normal.
// Writes to service_parts_order_data (portal=EV, branch=Sitapura).

import { useCallback, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Icon } from './Icon'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface SlotState {
  file: File | null
  rowCount: number | null
  filteredCount: number | null
  status: 'idle' | 'uploading' | 'success' | 'error'
  message: string | null
  uploadedSoFar: number | null
  fileSizeMB: string | null
}

const EMPTY_SLOT: SlotState = {
  file: null, rowCount: null, filteredCount: null, status: 'idle',
  message: null, uploadedSoFar: null, fileSizeMB: null,
}

// ─── Column positions (0-based index in the row array) ────────────────────────
// A=0, B=1, D=3, E=4, F=5, G=6, I=8, U=20, V=21, AC=28, AD=29, AE=30
const COL = {
  ORDER_NO: 0,       // A — EV Sales doc
  ORDER_DATE: 1,     // B — EV Order Date
  DEALER_CODE: 3,    // D — Ship to Party Code
  ORDER_TYPE: 4,     // E — Order Type
  ORDER_QTY: 5,      // F — Order Qty
  PART_NO: 6,        // G — Part no
  PART_DESC: 8,      // I — Material Description
  INVOICE_DATE: 20,  // U — PV TML Invoice Date
  DOCKET_NO: 21,     // V — docket no
  ORDER_STATUS: 28,  // AC — Remark
  DELIVERY_DATE: 29, // AD — Delivery Date
  STATUS: 30,        // AE — Status
} as const

const TARGET_DEALER_CODE = '500A841'
const TABLE_NAME = 'service_parts_order_data'
const PORTAL = 'EV'
const BRANCH = 'Sitapura'
const BATCH_SIZE = 200

// ─── Helpers ───────────────────────────────────────────────────────────────────
function parseExcelDate(value: unknown): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'number') {
    // Excel serial date
    const parsed = new Date(Math.round((value - 25569) * 86400 * 1000))
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }
  const raw = String(value).trim()
  if (!raw) return null
  const direct = new Date(raw)
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10)
  return null
}

function parseQty(value: unknown): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return value
  const cleaned = String(value).trim().replace(/[^0-9.-]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

function toStr(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s || null
}

function convertOrderType(ot: string | null): string | null {
  if (!ot) return null
  const upper = ot.toUpperCase()
  if (upper === 'ZYSO') return 'VOR'
  if (upper === 'ZYOR') return 'Normal'
  return ot
}

function buildSourceRowHash(
  orderNo: string,
  partNo: string,
  orderDate: string,
  qty: number,
  rowIndex: number,
): string {
  const raw = `${TABLE_NAME}|${BRANCH}|${PORTAL}|${orderNo}|${partNo}|${orderDate}|${qty}|${rowIndex}`
  return raw.replace(/\s+/g, ' ').trim()
}

// ─── Component ────────────────────────────────────────────────────────────────
export function EvBackOrderImportSection() {
  const [expanded, setExpanded] = useState(true)
  const [slot, setSlot] = useState<SlotState>({ ...EMPTY_SLOT })
  const fileRef = useRef<HTMLInputElement | null>(null)

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2)
    setSlot({
      ...EMPTY_SLOT,
      file,
      fileSizeMB,
      status: 'idle',
      message: null,
    })
  }, [])

  const handleUpload = useCallback(async () => {
    if (!slot.file) return
    setSlot((prev) => ({ ...prev, status: 'uploading', message: 'Reading file…', uploadedSoFar: 0 }))

    try {
      const buf = await slot.file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', raw: true, dense: true })
      const sheetName = wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]

      // Read as array-of-arrays (header: 1) so we can access by column position
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        defval: null,
        blankrows: false,
      })

      if (rows.length < 2) {
        throw new Error('No data rows found in the sheet.')
      }

      // Skip header row (row 0), process data rows
      const dataRows = rows.slice(1)
      const totalRows = dataRows.length

      // Filter for dealer code 500A841 and map to DB rows
      const insertRows: Record<string, unknown>[] = []
      let filteredOut = 0

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i]
        const dealerCode = toStr(row[COL.DEALER_CODE])

        // Only import 500A841
        if (dealerCode !== TARGET_DEALER_CODE) {
          filteredOut++
          continue
        }

        const orderNo = toStr(row[COL.ORDER_NO])
        const partNo = toStr(row[COL.PART_NO])
        const orderDate = parseExcelDate(row[COL.ORDER_DATE])
        const qty = parseQty(row[COL.ORDER_QTY])

        // Skip rows without a part number
        if (!partNo) continue

        const sourceRowHash = buildSourceRowHash(
          orderNo ?? '',
          partNo,
          orderDate ?? '',
          qty,
          i + 2,
        )

        const dbRow: Record<string, unknown> = {
          part_number: partNo.toUpperCase(),
          part_description: toStr(row[COL.PART_DESC]),
          order_date: orderDate,
          expected_date: parseExcelDate(row[COL.DELIVERY_DATE]),
          ordered_quantity: qty,
          received_quantity: 0,
          backorder_quantity: 0,
          status: toStr(row[COL.STATUS]),
          order_status: toStr(row[COL.ORDER_STATUS]),
          dealer_code: TARGET_DEALER_CODE,
          crm_order_number: orderNo,
          spares_order_type: convertOrderType(toStr(row[COL.ORDER_TYPE])),
          invoice_date: parseExcelDate(row[COL.INVOICE_DATE]),
          docket_number: toStr(row[COL.DOCKET_NO]),
          source_row_hash: sourceRowHash,
          branch: BRANCH,
          portal: PORTAL,
        }

        insertRows.push(dbRow)
      }

      if (insertRows.length === 0) {
        throw new Error(
          `No rows found with Dealer Code "${TARGET_DEALER_CODE}". ` +
          `${totalRows} rows scanned, ${filteredOut} filtered out (non-matching dealer).`
        )
      }

      setSlot((prev) => ({
        ...prev,
        status: 'uploading',
        message: `Uploading ${insertRows.length} rows (Sitapura EV / 500A841)…`,
        uploadedSoFar: 0,
      }))

      // Upsert to service_parts_order_data
      const onConflictCandidates = [
        'part_number,branch,portal,order_date,source_row_hash',
        'branch,portal,source_row_hash',
      ]

      let inserted = 0
      for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
        const batch = insertRows.slice(i, i + BATCH_SIZE)

        let batchHandled = false
        for (const onConflict of onConflictCandidates) {
          const { error: upsertError } = await supabase
            .from(TABLE_NAME)
            .upsert(batch, { onConflict })

          if (!upsertError) {
            batchHandled = true
            break
          }

          const msg = (upsertError.message ?? '').toLowerCase()
          if (msg.includes('no unique or exclusion constraint')) {
            continue
          }
          throw new Error(`Upsert failed at batch ${i}: ${upsertError.message}`)
        }

        if (!batchHandled) {
          const { error: insError } = await supabase.from(TABLE_NAME).insert(batch)
          if (insError) {
            throw new Error(`Insert failed at batch ${i}: ${insError.message}`)
          }
        }

        inserted += batch.length
        setSlot((prev) => ({
          ...prev,
          message: `Uploading… ${inserted.toLocaleString('en-IN')} / ${insertRows.length.toLocaleString('en-IN')} rows`,
          uploadedSoFar: inserted,
        }))
      }

      setSlot((prev) => ({
        ...prev,
        rowCount: totalRows,
        filteredCount: insertRows.length,
        status: 'success',
        message: `${insertRows.length} rows imported (Sitapura EV / Dealer ${TARGET_DEALER_CODE}). ${filteredOut} rows skipped (other dealers).`,
        uploadedSoFar: insertRows.length,
      }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[EvBackOrderUpload] Error:', msg)
      setSlot((prev) => ({ ...prev, status: 'error', message: msg }))
    }
  }, [slot.file])

  const handleReset = useCallback(() => {
    setSlot({ ...EMPTY_SLOT })
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  return (
    <section className="imp-group">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="imp-group__hd"
        aria-expanded={expanded}
      >
        <span className="imp-group__ic"><Icon name="grid" size={18} /></span>
        <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <span className="imp-group__title">
            Sitapura EV — Back Order & Dispatch <span className="imp-group__count">1</span>
          </span>
          <span className="imp-group__desc">
            Upload EV back order & dispatch Excel. Only Dealer Code 500A841 rows are imported.
          </span>
        </span>
        <Icon
          name="chevron"
          size={18}
          className="imp-group__chev"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {expanded && (
        <div className="imp-group__body">
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '16px',
              background: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span
                style={{
                  background: '#059669',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                }}
              >
                EV
              </span>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>
                EV Back Order & Dispatch — Sitapura (500A841)
              </h4>
            </div>
            <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
              Upload the EV Back Order & Dispatch Excel sheet. Only rows with Dealer Code{' '}
              <strong>500A841</strong> (Sitapura EV) will be imported. Order Type{' '}
              <code>ZYSO</code> → VOR, <code>ZYOR</code> → Normal. Data updates the{' '}
              <strong>Parts Stock Discipline</strong> report automatically.
            </p>

            {/* Column mapping table */}
            <details style={{ marginBottom: '12px' }}>
              <summary style={{ fontSize: '11px', color: '#9ca3af', cursor: 'pointer', fontWeight: 600 }}>
                Column Mapping (click to expand)
              </summary>
              <table
                style={{
                  fontSize: '11px',
                  marginTop: '8px',
                  borderCollapse: 'collapse',
                  width: '100%',
                }}
              >
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ padding: '4px 8px', border: '1px solid #e5e7eb', textAlign: 'left' }}>Excel Col</th>
                    <th style={{ padding: '4px 8px', border: '1px solid #e5e7eb', textAlign: 'left' }}>Sheet Header</th>
                    <th style={{ padding: '4px 8px', border: '1px solid #e5e7eb', textAlign: 'left' }}>Maps To</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>A</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>EV Sales doc</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>crm_order_number (Order No)</td></tr>
                  <tr><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>B</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>EV Order Date</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>order_date</td></tr>
                  <tr><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>D</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>Ship to Party Code</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb', fontWeight: 700 }}>dealer_code (filter: 500A841)</td></tr>
                  <tr><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>E</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>Order Type</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>spares_order_type (ZYSO→VOR, ZYOR→Normal)</td></tr>
                  <tr><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>F</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>Order Qty</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>ordered_quantity</td></tr>
                  <tr><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>G</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>Part no</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>part_number</td></tr>
                  <tr><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>I</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>Material Description</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>part_description</td></tr>
                  <tr><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>U</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>PV TML Invoice Date</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>invoice_date</td></tr>
                  <tr><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>V</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>docket no</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>docket_number</td></tr>
                  <tr><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>AC</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>Remark</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>order_status</td></tr>
                  <tr><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>AD</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>Delivery Date</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>expected_date</td></tr>
                  <tr><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>AE</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>Status</td><td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>status</td></tr>
                </tbody>
              </table>
            </details>

            {slot.fileSizeMB && (
              <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
                File size: {slot.fileSizeMB} MB
              </p>
            )}

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                ref={(el) => { fileRef.current = el }}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={slot.status === 'uploading'}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  background: '#f9fafb',
                  color: '#374151',
                  cursor: slot.status === 'uploading' ? 'not-allowed' : 'pointer',
                }}
              >
                Choose File
              </button>
              {slot.file && (
                <>
                  <span style={{ fontSize: '13px', color: '#374151', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {slot.file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleUpload()}
                    disabled={slot.status === 'uploading'}
                    style={{
                      padding: '8px 20px',
                      fontSize: '13px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      border: 'none',
                      background: slot.status === 'uploading' ? '#9ca3af' : '#059669',
                      color: '#fff',
                      cursor: slot.status === 'uploading' ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {slot.status === 'uploading' ? 'Uploading…' : 'Upload & Import'}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={slot.status === 'uploading'}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      background: '#fff',
                      color: '#6b7280',
                      cursor: 'pointer',
                    }}
                  >
                    Reset
                  </button>
                </>
              )}
            </div>

            {slot.message && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  background:
                    slot.status === 'success'
                      ? '#ecfdf5'
                      : slot.status === 'error'
                        ? '#fef2f2'
                        : '#f0f9ff',
                  border: `1px solid ${
                    slot.status === 'success'
                      ? '#a7f3d0'
                      : slot.status === 'error'
                        ? '#fecaca'
                        : '#bae6fd'
                  }`,
                  color:
                    slot.status === 'success'
                      ? '#065f46'
                      : slot.status === 'error'
                        ? '#991b1b'
                        : '#075985',
                }}
              >
                {slot.status === 'uploading' && (
                  <span style={{ display: 'inline-block', marginRight: '6px' }}>⏳</span>
                )}
                {slot.status === 'success' && (
                  <span style={{ display: 'inline-block', marginRight: '6px' }}>✅</span>
                )}
                {slot.status === 'error' && (
                  <span style={{ display: 'inline-block', marginRight: '6px' }}>❌</span>
                )}
                {slot.message}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
