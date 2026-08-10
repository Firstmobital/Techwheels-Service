// BackOrderImportSection — self-contained upload section for
//   1. VOR BO REPORT (Sheet 1) — parts NOT available with Tata Motors
//   2. AVL WITH CP STOCK (Sheet 2) — parts available with Co-Dealers
// Supports .xlsx, .xls, AND .csv files.
// Column mapping matches actual column names from the AVL WITH CP STOCK export.

import { useCallback, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Icon } from './Icon'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
type SlotKey = 'vor_bo_report' | 'avl_cp_stock'
interface SlotState {
  file: File | null
  rowCount: number | null
  status: 'idle' | 'uploading' | 'success' | 'error'
  message: string | null
  sheetName: string | null
  availableSheets: string[]
  fileSizeMB: string | null
  uploadedSoFar: number | null
}

const EMPTY_SLOT: SlotState = {
  file: null, rowCount: null, status: 'idle', message: null,
  sheetName: null, availableSheets: [], fileSizeMB: null, uploadedSoFar: null
}

// ─── Column mapping helpers ───────────────────────────────────────────────────
function gs(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    for (const col of Object.keys(raw)) {
      if (col.trim().toLowerCase() === k.trim().toLowerCase()) {
        const v = raw[col]
        if (v != null && String(v).trim() !== '') return String(v).trim()
      }
    }
  }
  return ''
}

function gn(raw: Record<string, unknown>, ...keys: string[]): number | null {
  const s = gs(raw, ...keys)
  if (!s) return null
  const n = parseFloat(s.replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? null : n
}

// ─── Smart sheet selection for XLSX ───────────────────────────────────────────
function pickSheet(wb: XLSX.WorkBook, key: SlotKey): string {
  const names = wb.SheetNames.map(n => n.toLowerCase().trim())
  const actualNames = wb.SheetNames

  if (key === 'vor_bo_report') {
    for (let i = 0; i < names.length; i++) {
      if (names[i].includes('vor') || names[i].includes('bo report') || names[i].includes('sheet1') || names[i] === 'sheet 1') {
        return actualNames[i]
      }
    }
    return actualNames[0]
  }
  for (let i = 0; i < names.length; i++) {
    if (names[i].includes('avl') || names[i].includes('cp') || names[i].includes('stock') || names[i].includes('sheet2') || names[i] === 'sheet 2') {
      return actualNames[i]
    }
  }
  if (actualNames.length >= 2) return actualNames[1]
  return actualNames[0]
}

// ─── Read rows from file (xlsx or csv) ────────────────────────────────────────
async function readRows(file: File, key: SlotKey): Promise<{ rows: Record<string, unknown>[]; sheetName: string }> {
  const buf = await file.arrayBuffer()
  const fileName = file.name.toLowerCase()

  if (fileName.endsWith('.csv')) {
    // CSV: XLSX can parse CSV too
    const wb = XLSX.read(buf, { type: 'array', raw: false })
    const sheetName = wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    return { rows, sheetName }
  }

  // XLSX/XLS
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = pickSheet(wb, key)
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  return { rows, sheetName }
}

// ─── VOR BO REPORT row mapper ─────────────────────────────────────────────────
function mapVorRow(raw: Record<string, unknown>, sessionId: string) {
  return {
    upload_session_id: sessionId,
    part_number: gs(raw, 'Part No', 'Part Number', 'Part No.', 'Part #', 'Material', 'Material No', 'Material Number', 'Material No.', 'Part'),
    part_description: gs(raw, 'Part Description', 'Description', 'Material Description', 'Part Desc', 'Material Description (Material)', 'Material Desc', 'PARTNAME', 'Part Name'),
    bo_quantity: gn(raw, 'BO Qty', 'BO Quantity', 'Back Order Qty', 'Back Order Quantity', 'Quantity', 'Qty', 'Required Qty', 'Required Quantity', 'Order Qty', 'Pending Qty'),
    source_row_data: raw as unknown,
  }
}

// ─── AVL WITH CP STOCK row mapper — matches actual CSV columns ─────────────────
function mapCpRow(raw: Record<string, unknown>, sessionId: string) {
  return {
    upload_session_id: sessionId,
    // Actual column names from AVLWITHCPSTOCK.csv:
    part_number: gs(raw, 'Part', 'Part No', 'Part Number', 'Part No.', 'Part #', 'Material', 'Material No', 'Material Number'),
    part_description: gs(raw, 'PARTNAME', 'Part Name', 'Part Description', 'Description', 'Material Description', 'Part Desc'),
    co_dealer_name: gs(raw, 'CP_NAME', 'Co-Dealer Name', 'Dealer Name', 'Co Dealer Name', 'Vendor Name', 'Supplier Name', 'CP Name', 'Co-Dealer', 'Dealer'),
    dealer_code: gs(raw, 'SP', 'Dealer Code', 'Co-Dealer Code', 'CP Code', 'Vendor Code', 'Supplier Code', 'Code', 'Dealer No', 'Dealer No.'),
    available_qty: gn(raw, 'STOCK', 'Stock', 'Available Qty', 'Available Quantity', 'Stock Qty', 'Stock Quantity', 'Qty', 'Quantity', 'CP Qty', 'CP Stock', 'Available Stock'),
    on_order: gn(raw, 'ONORDER', 'On Order', 'OnOrder', 'On-Order'),
    price: gn(raw, 'PRICE', 'Price', 'Part Price'),
    region_name: gs(raw, 'REGIONNAME', 'Region Name', 'Region', 'REGION'),
    state: gs(raw, 'STATE', 'State'),
    city: gs(raw, 'CITY', 'City'),
    cp_type: gs(raw, 'CP_TYPE', 'CP Type', 'Cp Type'),
    cp_type1: gs(raw, 'CP_TYPE1', 'CP Type1', 'Cp Type1'),
    division: gs(raw, 'DIVISION', 'Division'),
    cell_phone: gs(raw, 'CELL', 'Cell', 'Phone', 'Mobile', 'Contact No', 'Contact Number'),
    contact_name: gs(raw, 'CONTACT_NAME', 'Contact Name', 'Contact Person'),
    email: gs(raw, 'E_MAIL', 'Email', 'E-Mail', 'E Mail'),
    source_row_data: raw as unknown,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export function BackOrderImportSection() {
  const [expanded, setExpanded] = useState(true)
  const [slots, setSlots] = useState<Record<SlotKey, SlotState>>({
    vor_bo_report: { ...EMPTY_SLOT },
    avl_cp_stock: { ...EMPTY_SLOT },
  })
  const fileRefs = useRef<Record<SlotKey, HTMLInputElement | null>>({
    vor_bo_report: null,
    avl_cp_stock: null,
  })

  const handleFile = useCallback(async (key: SlotKey, file: File | null) => {
    if (!file) return
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2)
    try {
      const { rows, sheetName } = await readRows(file, key)
      void rows
      setSlots(prev => ({
        ...prev,
        [key]: {
          file, rowCount: null, status: 'idle', message: null,
          sheetName, availableSheets: file.name.toLowerCase().endsWith('.csv') ? [sheetName] : [],
          fileSizeMB, uploadedSoFar: null
        }
      }))
    } catch {
      setSlots(prev => ({
        ...prev,
        [key]: { file, rowCount: null, status: 'idle', message: null, sheetName: null, availableSheets: [], fileSizeMB, uploadedSoFar: null }
      }))
    }
  }, [])

  const handleUpload = useCallback(async (key: SlotKey) => {
    const slot = slots[key]
    if (!slot.file) return
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], status: 'uploading', message: 'Reading file…', uploadedSoFar: 0 } }))

    try {
      const { rows, sheetName } = await readRows(slot.file, key)
      if (rows.length === 0) throw new Error('No data rows found in: ' + sheetName)

      const sessionId = 'bo_' + key + '_' + Date.now()
      const tableName = key === 'vor_bo_report' ? 'back_order_vor_data' : 'back_order_cp_stock_data'
      const mapper = key === 'vor_bo_report' ? mapVorRow : mapCpRow

      // Delete existing rows (replace mode)
      const { error: delErr } = await supabase.from(tableName).delete().neq('id', -1)
      if (delErr) throw new Error('Failed to clear existing data: ' + delErr.message)

      // Insert in small batches (50) to stay under Supabase API 1MB limit
      const BATCH = 50
      let inserted = 0
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map((r) => mapper(r, sessionId))
        const { error: insErr } = await supabase.from(tableName).insert(batch)
        if (insErr) throw new Error('Insert failed at row ' + i + ': ' + insErr.message)
        inserted += batch.length
        setSlots(prev => ({
          ...prev,
          [key]: { ...prev[key], message: 'Uploading… ' + inserted.toLocaleString('en-IN') + ' / ' + rows.length.toLocaleString('en-IN') + ' rows', uploadedSoFar: inserted }
        }))
      }

      setSlots(prev => ({
        ...prev,
        [key]: {
          ...prev[key], file: slot.file, rowCount: rows.length, status: 'success',
          message: rows.length + ' rows uploaded from: ' + sheetName,
          sheetName, fileSizeMB: prev[key].fileSizeMB, uploadedSoFar: rows.length
        }
      }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[BackOrderUpload] Error:', msg)
      setSlots(prev => ({ ...prev, [key]: { ...prev[key], status: 'error', message: msg } }))
    }
  }, [slots])

  const handleReset = useCallback((key: SlotKey) => {
    setSlots(prev => ({ ...prev, [key]: { ...EMPTY_SLOT } }))
    if (fileRefs.current[key]) fileRefs.current[key]!.value = ''
  }, [])

  const SLOT_CONFIG: { key: SlotKey; title: string; desc: string; badge: string; color: string }[] = [
    { key: 'vor_bo_report', title: 'VOR BO REPORT', desc: 'Parts NOT available with Tata Motors (Back Order data). Upload Sheet 1.', badge: 'Sheet 1', color: '#dc2626' },
    { key: 'avl_cp_stock', title: 'AVL WITH CP STOCK', desc: 'Parts available with Co-Dealers. Upload CSV or Excel (Sheet 2).', badge: 'Sheet 2', color: '#2563eb' },
  ]

  return (
    <section className="imp-group">
      <button type="button" onClick={() => setExpanded(e => !e)} className="imp-group__hd" aria-expanded={expanded}>
        <span className="imp-group__ic"><Icon name="grid" size={18} /></span>
        <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <span className="imp-group__title">Back Order Data <span className="imp-group__count">2</span></span>
          <span className="imp-group__desc">Upload VOR Back Order & Co-Dealer stock data for Parts No. search.</span>
        </span>
        <Icon name="chevron" size={18} className="imp-group__chev" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
      </button>

      {expanded && (
        <div className="imp-group__body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {SLOT_CONFIG.map(cfg => {
            const slot = slots[cfg.key]
            return (
              <div key={cfg.key} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ background: cfg.color, color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>{cfg.badge}</span>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>{cfg.title}</h4>
                </div>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>{cfg.desc}</p>

                {slot.fileSizeMB && (
                  <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
                    File size: {slot.fileSizeMB} MB{slot.sheetName ? ' • Sheet: ' + slot.sheetName : ''}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    ref={el => { fileRefs.current[cfg.key] = el }}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => void handleFile(cfg.key, e.target.files?.[0] ?? null)}
                    style={{ display: 'none' }}
                  />
                  <button type="button" onClick={() => fileRefs.current[cfg.key]?.click()}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    Choose File
                  </button>
                  {slot.file && (
                    <span className="text-xs text-gray-600" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {slot.file.name}
                    </span>
                  )}
                  {slot.file && slot.status !== 'uploading' && (
                    <button type="button" onClick={() => void handleUpload(cfg.key)}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                      Upload
                    </button>
                  )}
                  {slot.status === 'uploading' && <span className="text-xs text-blue-600">{slot.message}</span>}
                  {slot.status === 'success' && <span className="text-xs font-medium text-green-600">{slot.message}</span>}
                  {slot.status === 'error' && <span className="text-xs font-medium text-red-600" style={{ maxWidth: '300px' }}>{slot.message}</span>}
                  {slot.file && slot.status !== 'uploading' && (
                    <button type="button" onClick={() => handleReset(cfg.key)}
                      className="rounded-md bg-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-300">
                      Clear
                    </button>
                  )}
                </div>

                {slot.rowCount != null && slot.status === 'success' && (
                  <p className="mt-2 text-[11px] text-gray-400">{slot.rowCount.toLocaleString('en-IN')} rows stored. Previous data replaced.</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
