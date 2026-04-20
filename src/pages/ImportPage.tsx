import { useCallback, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

interface ParsedRow {
  service_type: string
  chassis_number: string
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

function findHeader(headers: string[], target: string): string | undefined {
  return headers.find((h) => h.trim().toLowerCase() === target.toLowerCase())
}

function parseWorkbook(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          defval: '',
        })

        if (rows.length === 0) {
          reject(new Error('The file is empty.'))
          return
        }

        const headers = Object.keys(rows[0])
        const serviceTypeKey = findHeader(headers, 'Service Type')
        const chassisKey = findHeader(headers, 'Chassis Number')

        if (!serviceTypeKey)
          reject(new Error('Missing required column: "Service Type"'))
        else if (!chassisKey)
          reject(new Error('Missing required column: "Chassis Number"'))
        else
          resolve(
            rows.map((r) => ({
              service_type: String(r[serviceTypeKey] ?? '').trim(),
              chassis_number: String(r[chassisKey] ?? '').trim(),
            })),
          )
      } catch {
        reject(new Error('Failed to parse the file. Make sure it is a valid .xlsx or .csv file.'))
      }
    }
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsArrayBuffer(file)
  })
}

export default function ImportPage() {
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [insertedCount, setInsertedCount] = useState<number>(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setRows([])
    setParseError(null)
    setFileName(null)
    setUploadState('idle')
    setUploadError(null)
    setInsertedCount(0)
  }

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx' && ext !== 'csv') {
      setParseError('Only .xlsx and .csv files are accepted.')
      setRows([])
      setFileName(null)
      return
    }
    reset()
    setFileName(file.name)
    try {
      const parsed = await parseWorkbook(file)
      setRows(parsed)
    } catch (err) {
      setParseError((err as Error).message)
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const uploadToSupabase = async () => {
    if (rows.length === 0) return
    setUploadState('uploading')
    setUploadError(null)

    const CHUNK = 500
    let inserted = 0
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK)
        const { error } = await supabase
          .from('job_card_closed_data')
          .insert(chunk)
        if (error) throw new Error(error.message)
        inserted += chunk.length
      }
      setInsertedCount(inserted)
      setUploadState('success')
    } catch (err) {
      setUploadError((err as Error).message)
      setUploadState('error')
    }
  }

  const preview = rows.slice(0, 10)
  const hasData = rows.length > 0 && !parseError

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Import Job Card Data</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload an .xlsx or .csv file with <span className="font-medium">Service Type</span> and{' '}
            <span className="font-medium">Chassis Number</span> columns.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={[
            'relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-14 cursor-pointer transition-colors',
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/40',
          ].join(' ')}
        >
          <svg className="h-10 w-10 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-sm font-medium text-gray-700">
            {isDragging ? 'Drop it here' : 'Drag & drop your file, or click to browse'}
          </p>
          <p className="text-xs text-gray-400">.xlsx and .csv supported</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            className="sr-only"
            onChange={onInputChange}
          />
        </div>

        {/* Parse error */}
        {parseError && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <svg className="h-5 w-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span>{parseError}</span>
          </div>
        )}

        {/* File info + preview */}
        {hasData && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-gray-800">{fileName}</span>
                <span className="text-gray-400">·</span>
                <span>{rows.length.toLocaleString()} rows detected</span>
              </div>
              <button
                onClick={reset}
                className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
              >
                Clear
              </button>
            </div>

            {/* Preview table */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Service Type</th>
                    <th className="px-4 py-3">Chassis Number</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2.5 text-gray-700">{row.service_type || <span className="text-gray-300 italic">empty</span>}</td>
                      <td className="px-4 py-2.5 font-mono text-gray-700">{row.chassis_number || <span className="text-gray-300 italic">empty</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 10 && (
                <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
                  Showing 10 of {rows.length.toLocaleString()} rows
                </p>
              )}
            </div>

            {/* Upload button */}
            <div className="flex items-center gap-4">
              <button
                onClick={uploadToSupabase}
                disabled={uploadState === 'uploading' || uploadState === 'success'}
                className={[
                  'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                  uploadState === 'uploading'
                    ? 'cursor-not-allowed bg-blue-400 text-white'
                    : uploadState === 'success'
                    ? 'cursor-not-allowed bg-green-500 text-white'
                    : 'bg-blue-600 text-white hover:bg-blue-700',
                ].join(' ')}
              >
                {uploadState === 'uploading' && (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {uploadState === 'success' ? 'Uploaded!' : uploadState === 'uploading' ? 'Uploading…' : `Upload ${rows.length.toLocaleString()} rows to Supabase`}
              </button>

              {uploadState === 'success' && (
                <button
                  onClick={reset}
                  className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700"
                >
                  Import another file
                </button>
              )}
            </div>

            {/* Upload error */}
            {uploadState === 'error' && uploadError && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <svg className="h-5 w-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="font-medium">Upload failed</p>
                  <p className="mt-0.5 text-red-600">{uploadError}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Success toast */}
        {uploadState === 'success' && (
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <svg className="h-5 w-5 shrink-0 text-green-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Successfully inserted <span className="font-semibold">{insertedCount.toLocaleString()} rows</span> into{' '}
              <code className="rounded bg-green-100 px-1 font-mono text-xs">job_card_closed_data</code>.
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
