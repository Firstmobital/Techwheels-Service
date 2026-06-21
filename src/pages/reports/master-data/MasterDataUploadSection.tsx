// ── Upload section component for MasterDataNullCountsReport ──────────────────
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'

const DB_COLUMNS = [
  'chassis_no','vehicle_registration_number','first_name','last_name','contact_phones',
  'model','product_line','vehicle_sale_date','vehicle_age_in_years',
  'scheduled_next_service_date','scheduled_next_service_kms','last_service_date',
  'last_service_type','last_service_customer_mobile_no','last_service_dealer',
  'last_service_km','extended_warranty_dealer','extended_warranty_policy_no',
  'extended_warranty_product','extended_warranty_service_product_period',
  'extended_warranty_order_no','extended_warranty_order_status',
  'extended_warranty_start_date','extended_warranty_end_date','extended_warranty_end_kms',
  'extended_warranty_final_price_without_tax','extended_warranty_final_price',
  'ex_showroom_price','idv','last_insurance_expiry_date',
  'last_insurance_comapny','last_insurance_policy_number',
] as const
type DbColumn = typeof DB_COLUMNS[number]

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function autoMapColumn(fileCol: string): DbColumn | null {
  const n = normalize(fileCol)
  for (const db of DB_COLUMNS) { if (normalize(db) === n) return db }
  const syn: Record<string, DbColumn> = {
    chassis:'chassis_no', chassisnumber:'chassis_no', vin:'chassis_no',
    registration:'vehicle_registration_number', regno:'vehicle_registration_number', reg:'vehicle_registration_number',
    registrationno:'vehicle_registration_number', registrationnumber:'vehicle_registration_number',
    firstname:'first_name', fname:'first_name', lastname:'last_name', lname:'last_name',
    ownername:'first_name', owner:'first_name',
    phone:'contact_phones', mobile:'contact_phones', contact:'contact_phones',
    mobileno:'contact_phones', mob:'contact_phones', cell:'contact_phones',
    productline:'product_line', saledate:'vehicle_sale_date', vehiclesaledate:'vehicle_sale_date',
    purchasedate:'vehicle_sale_date', purchase:'vehicle_sale_date',
    age:'vehicle_age_in_years', vehicleage:'vehicle_age_in_years',
    nextservicedate:'scheduled_next_service_date', nextservicekms:'scheduled_next_service_kms',
    lastservicedate:'last_service_date', lastservicetype:'last_service_type',
    lastservicemobile:'last_service_customer_mobile_no', lastservicedealer:'last_service_dealer',
    lastservicekm:'last_service_km', ewdealer:'extended_warranty_dealer',
    ewpolicyno:'extended_warranty_policy_no', ewproduct:'extended_warranty_product',
    ewperiod:'extended_warranty_service_product_period', eworderno:'extended_warranty_order_no',
    eworderstatus:'extended_warranty_order_status', ewstartdate:'extended_warranty_start_date',
    ewenddate:'extended_warranty_end_date', ewendkms:'extended_warranty_end_kms',
    ewpricewt:'extended_warranty_final_price_without_tax', ewprice:'extended_warranty_final_price',
    exshowroom:'ex_showroom_price',
    registrationdate:'last_insurance_expiry_date',
    modelname:'model', makername:'model',
    insuranceexpiry:'last_insurance_expiry_date',
    insurancecompany:'last_insurance_comapny', insurancepolicyno:'last_insurance_policy_number',
  }
  if (syn[n]) return syn[n]
  for (const db of DB_COLUMNS) { const dn = normalize(db); if (n.includes(dn) || dn.includes(n)) return db }
  return null
}

interface ParsedFile { headers: string[]; rows: Record<string, unknown>[] }

async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv' || ext === 'txt') {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(file, {
        header: true, skipEmptyLines: true,
        complete: (r) => resolve({ headers: r.meta.fields ?? [], rows: r.data as Record<string, unknown>[] }),
        error: (e) => reject(e),
      })
    })
  }
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })
  const headers = json.length > 0 ? Object.keys(json[0]) : []
  return { headers, rows: json }
}

export function MasterDataUploadSection({ onUploadComplete }: { onUploadComplete: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [fileName, setFileName] = useState('')
  const [columnMapping, setColumnMapping] = useState<Record<string, DbColumn | ''>>({})
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<{ inserted: number; skipped: number; duplicates: number; errors: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setError(null); setResult(null); setLoading(true); setProgress('Parsing file…')
    try {
      const data = await parseFile(file)
      if (data.rows.length === 0) { setError('File has no data rows.'); setLoading(false); return }
      const mapping: Record<string, DbColumn | ''> = {}
      for (const h of data.headers) { mapping[h] = autoMapColumn(h) ?? '' }
      setParsed(data); setFileName(file.name); setColumnMapping(mapping); setLoading(false); setProgress('')
    } catch (err) { setError(`Failed to parse: ${(err as Error).message}`); setLoading(false) }
  }

  const hasChassisMapped = Object.values(columnMapping).includes('chassis_no' as DbColumn)
  const hasRegMapped = Object.values(columnMapping).includes('vehicle_registration_number' as DbColumn)
  const hasKeyMapped = hasChassisMapped || hasRegMapped

  async function doUpload() {
    if (!parsed) return
    if (!hasKeyMapped) { setError('You must map at least "chassis_no" OR "vehicle_registration_number" before uploading.'); return }
    setLoading(true); setError(null); setResult(null)

    const dbRows: Record<string, unknown>[] = parsed.rows.map((row) => {
      const obj: Record<string, unknown> = {}
      for (const [fileCol, dbCol] of Object.entries(columnMapping)) {
        if (dbCol) {
          let val = row[fileCol]
          if (val === '' || val === undefined || val === null) obj[dbCol] = null
          else if (typeof val === 'number') obj[dbCol] = String(val)
          else obj[dbCol] = String(val).trim()
        }
      }
      // chassis_no is NOT NULL in the DB — if missing but reg exists, use a sentinel
      const ch = obj.chassis_no ? String(obj.chassis_no).trim() : ''
      const reg = obj.vehicle_registration_number ? String(obj.vehicle_registration_number).trim() : ''
      if (!ch && reg) {
        obj.chassis_no = `REGNO:${reg}`
      }
      return obj
    })

    // A row is valid if it has at least chassis_no OR vehicle_registration_number
    const validRows = dbRows.filter((r) => {
      const ch = r.chassis_no ? String(r.chassis_no).trim() : ''
      const reg = r.vehicle_registration_number ? String(r.vehicle_registration_number).trim() : ''
      return ch.length > 0 || reg.length > 0
    })
    const skippedNull = dbRows.length - validRows.length
    if (validRows.length === 0) { setError('No rows with a valid chassis_no or vehicle_registration_number.'); setLoading(false); return }

    setProgress(`Fetching existing records for dedup… (${validRows.length} rows)`)
    // Only fetch chassis for rows that have one
    const uploadChassis = [...new Set(
      validRows.map((r) => r.chassis_no ? String(r.chassis_no).trim() : null).filter((v): v is string => !!v && v.length > 0)
    )]
    // Only fetch reg for rows that have one
    const uploadRegs = [...new Set(
      validRows.map((r) => r.vehicle_registration_number ? String(r.vehicle_registration_number).trim() : null).filter((v): v is string => !!v && v.length > 0)
    )]

    const existingChassis = new Set<string>()
    for (let i = 0; i < uploadChassis.length; i += 1000) {
      const batch = uploadChassis.slice(i, i + 1000)
      const { data, error: e } = await supabase.from('all_service_data').select('chassis_no').in('chassis_no', batch)
      if (e) { setError(`Dedup check failed: ${e.message}`); setLoading(false); return }
      for (const r of (data ?? [])) if (r.chassis_no) existingChassis.add(String(r.chassis_no).trim())
    }

    const existingRegs = new Set<string>()
    if (uploadRegs.length > 0) {
      for (let i = 0; i < uploadRegs.length; i += 1000) {
        const batch = uploadRegs.slice(i, i + 1000)
        const { data, error: e } = await supabase.from('all_service_data').select('vehicle_registration_number').in('vehicle_registration_number', batch)
        if (e) { setError(`Reg dedup failed: ${e.message}`); setLoading(false); return }
        for (const r of (data ?? [])) if (r.vehicle_registration_number) existingRegs.add(String(r.vehicle_registration_number).trim())
      }
    }

    const newRows: Record<string, unknown>[] = []
    let dupCount = 0
    for (const r of validRows) {
      const ch = r.chassis_no ? String(r.chassis_no).trim() : ''
      const reg = r.vehicle_registration_number ? String(r.vehicle_registration_number).trim() : ''
      // Skip if chassis exists in DB (only check if row has chassis)
      if (ch && existingChassis.has(ch)) { dupCount++; continue }
      // Skip if reg exists in DB (only check if row has reg)
      if (reg && existingRegs.has(reg)) { dupCount++; continue }
      // Skip internal duplicates within same upload
      if (ch && existingChassis.has(ch)) { dupCount++; continue }
      if (reg && existingRegs.has(reg)) { dupCount++; continue }
      newRows.push(r)
      if (ch) existingChassis.add(ch)
      if (reg) existingRegs.add(reg)
    }

    if (newRows.length === 0) {
      setResult({ inserted: 0, skipped: skippedNull, duplicates: dupCount, errors: [] })
      setProgress(''); setLoading(false); onUploadComplete(); return
    }

    setProgress(`Inserting 0/${newRows.length}…`)
    let inserted = 0; const errors: string[] = []; const BATCH = 500
    for (let i = 0; i < newRows.length; i += BATCH) {
      const batch = newRows.slice(i, i + BATCH)
      const { error: ie } = await supabase.from('all_service_data').insert(batch)
      if (ie) errors.push(`Batch ${Math.floor(i/BATCH)+1}: ${ie.message}`)
      else inserted += batch.length
      setProgress(`Inserting ${Math.min(i+BATCH, newRows.length)}/${newRows.length}…`)
    }

    setResult({ inserted, skipped: skippedNull, duplicates: dupCount, errors })
    setProgress(''); setLoading(false); onUploadComplete()
  }

  function reset() {
    setParsed(null); setFileName(''); setColumnMapping({}); setResult(null); setError(null); setProgress('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Upload Data to all_service_data</h3>
          <p className="mt-1 text-sm text-gray-500">Upload Excel/CSV. Duplicates on chassis_no & vehicle_registration_number are skipped automatically.</p>
        </div>
        {parsed && !loading && <button onClick={reset} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Reset</button>}
      </div>

      {!parsed && (
        <div className="mt-4">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" onChange={(e) => void handleFileSelect(e)} className="hidden" id="master-data-upload" />
          <label htmlFor="master-data-upload" className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Choose File
          </label>
          <span className="ml-3 text-sm text-gray-400">.xlsx, .xls, .csv</span>
        </div>
      )}

      {loading && (
        <div className="mt-4 flex items-center gap-3 text-sm text-blue-600">
          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          {progress || 'Processing…'}
        </div>
      )}

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {parsed && !loading && !result && (
        <div className="mt-4">
          <div className="mb-3 flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-700">{fileName}</span>
            <span className="text-gray-400">·</span><span className="text-gray-500">{parsed.rows.length.toLocaleString('en-IN')} rows</span>
            <span className="text-gray-400">·</span><span className="text-gray-500">{parsed.headers.length} columns</span>
          </div>
          {!hasKeyMapped && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">⚠️ You must map at least <strong>chassis_no</strong> OR <strong>vehicle_registration_number</strong> before uploading.</div>
          )}
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Column Mapping (auto-detected — adjust if needed)</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {parsed.headers.map((fc) => {
              const m = columnMapping[fc] ?? ''
              return (
                <div key={fc} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                  <span className="flex-1 truncate text-xs text-gray-600" title={fc}>{fc}</span>
                  <span className="text-gray-300">→</span>
                  <select value={m} onChange={(e) => setColumnMapping((p) => ({ ...p, [fc]: e.target.value as DbColumn | '' }))}
                    className={`flex-1 rounded border px-2 py-1 text-xs ${m === 'chassis_no' || m === 'vehicle_registration_number' ? 'border-blue-400 bg-blue-50 font-medium text-blue-700' : m ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 text-gray-400'}`}>
                    <option value="">— skip —</option>
                    {DB_COLUMNS.map((db) => <option key={db} value={db}>{db}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={() => void doUpload()} disabled={!hasKeyMapped}
              className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300">
              Upload {parsed.rows.length.toLocaleString('en-IN')} rows
            </button>
            <span className="text-xs text-gray-400">Duplicates on chassis_no OR vehicle_registration_number will be skipped. At least one must be mapped.</span>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-green-600">Inserted</p>
              <p className="mt-1 text-2xl font-semibold text-green-900">{result.inserted.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-orange-600">Duplicates Skipped</p>
              <p className="mt-1 text-2xl font-semibold text-orange-900">{result.duplicates.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-600">No Key Skipped</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{result.skipped.toLocaleString('en-IN')}</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p className="font-medium">{result.errors.length} batch error(s):</p>
              <ul className="mt-1 list-inside list-disc">{result.errors.slice(0, 5).map((e, i) => <li key={i} className="text-xs">{e}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
