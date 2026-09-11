import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import DateRangeFilter, { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import { Icon } from '../components/Icon'
import {
  dateRangeError,
  downloadBusyWorkbook,
  fetchBusyLabourRows,
  fetchBusyPartsLines,
  formatInr,
  loadBusyLabourSourceStatus,
  loadBusyPartsSourceStatus,
  parsePartsSpreadsheet,
  replaceBusyPartsSource,
  transformBusyAccounting,
  buildInvoiceVoucherWorkbook,
  buildPartyAccountWorkbook,
  type BusyPreviewRow,
} from '../lib/busy'
import type { BusyLabourSourceStatus } from '../lib/busy/labourSource'
import type { BusyPartsSourceStatus } from '../lib/busy/partsSource'
import type { BusyPartsLine, VehiclePortal } from '../lib/busy/types'

interface PartsSlotState {
  fileName: string | null
  rowCount: number
  error: string | null
  lines: BusyPartsLine[]
  persisted: boolean
  uploadedAt: string | null
  saving: boolean
}

const EMPTY_SLOT: PartsSlotState = {
  fileName: null,
  rowCount: 0,
  error: null,
  lines: [],
  persisted: false,
  uploadedAt: null,
  saving: false,
}

function statusTone(status: BusyPreviewRow['status']): { bg: string; color: string; label: string } {
  if (status === 'ready') return { bg: '#f0fdf4', color: '#15803d', label: 'Ready' }
  if (status === 'warning') return { bg: '#fffbeb', color: '#b45309', label: 'Warning' }
  if (status === 'excluded') return { bg: '#f8fafc', color: '#64748b', label: 'Excluded' }
  return { bg: '#fef2f2', color: '#b91c1c', label: 'Blocked' }
}

export default function BusyAccountingPage() {
  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange)
  const [labourStatus, setLabourStatus] = useState<BusyLabourSourceStatus | null>(null)
  const [partsStatus, setPartsStatus] = useState<BusyPartsSourceStatus | null>(null)
  const [labourLoading, setLabourLoading] = useState(false)
  const [processError, setProcessError] = useState<string | null>(null)
  const [pvParts, setPvParts] = useState<PartsSlotState>(EMPTY_SLOT)
  const [evParts, setEvParts] = useState<PartsSlotState>(EMPTY_SLOT)
  const [previewFilter, setPreviewFilter] = useState<'all' | 'ready' | 'blocked' | 'excluded'>('all')
  const pvInputRef = useRef<HTMLInputElement>(null)
  const evInputRef = useRef<HTMLInputElement>(null)

  const rangeIssue = dateRangeError(dateRange.from, dateRange.to)

  useEffect(() => {
    let active = true
    loadBusyLabourSourceStatus().then((status) => {
      if (active) setLabourStatus(status)
    })
    Promise.all([loadBusyPartsSourceStatus(), fetchBusyPartsLines().catch((error: unknown) => {
      throw error
    })]).then(([status, lines]) => {
      if (!active) return
      setPartsStatus(status)
      const pvLines = lines.filter((line) => line.portal === 'PV')
      const evLines = lines.filter((line) => line.portal === 'EV')
      setPvParts({
        fileName: status.pvFileName,
        rowCount: pvLines.length,
        error: status.error,
        lines: pvLines,
        persisted: pvLines.length > 0,
        uploadedAt: status.latestPvUploadedAt,
        saving: false,
      })
      setEvParts({
        fileName: status.evFileName,
        rowCount: evLines.length,
        error: status.error,
        lines: evLines,
        persisted: evLines.length > 0,
        uploadedAt: status.latestEvUploadedAt,
        saving: false,
      })
    }).catch((error: unknown) => {
      if (!active) return
      const message = error instanceof Error ? error.message : String(error)
      setPartsStatus({
        pvAvailable: false,
        evAvailable: false,
        pvCount: 0,
        evCount: 0,
        pvFileName: null,
        evFileName: null,
        latestPvUploadedAt: null,
        latestEvUploadedAt: null,
        error: message,
      })
    })
    return () => { active = false }
  }, [])

  const [labourRows, setLabourRows] = useState<Awaited<ReturnType<typeof fetchBusyLabourRows>>>([])

  useEffect(() => {
    if (rangeIssue) return

    let active = true
    // Existing pages load data in useEffect the same way (CRE Incentive, reports).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabourLoading(true)
    setProcessError(null)
    fetchBusyLabourRows(dateRange.from, dateRange.to)
      .then((rows) => {
        if (!active) return
        setLabourRows(rows)
      })
      .catch((error: unknown) => {
        if (!active) return
        setLabourRows([])
        setProcessError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (active) setLabourLoading(false)
      })

    return () => { active = false }
  }, [dateRange.from, dateRange.to, rangeIssue])

  const result = useMemo(() => {
    if (rangeIssue) return null
    return transformBusyAccounting({
      labourRows,
      partsLines: [...pvParts.lines, ...evParts.lines],
      fromDate: dateRange.from,
      toDate: dateRange.to,
    })
  }, [labourRows, pvParts.lines, evParts.lines, dateRange.from, dateRange.to, rangeIssue])

  const handlePartsFile = useCallback(async (file: File, portal: VehiclePortal) => {
    const setter = portal === 'PV' ? setPvParts : setEvParts
    setter({
      fileName: file.name,
      rowCount: 0,
      error: null,
      lines: [],
      persisted: false,
      uploadedAt: null,
      saving: true,
    })
    try {
      const parsed = await parsePartsSpreadsheet(file, portal)
      if (parsed.errors.length > 0) {
        setter({
          fileName: file.name,
          rowCount: 0,
          error: parsed.errors.join('; '),
          lines: [],
          persisted: false,
          uploadedAt: null,
          saving: false,
        })
        return
      }
      try {
        const replaced = await replaceBusyPartsSource(portal, file.name, parsed.lines)
        const persisted = await fetchBusyPartsLines()
        const portalLines = persisted.filter((line) => line.portal === portal)
        const status = await loadBusyPartsSourceStatus()
        setPartsStatus(status)
        setter({
          fileName: file.name,
          rowCount: portalLines.length,
          error: parsed.skippedIncomplete > 0
            ? `${parsed.skippedIncomplete} incomplete source rows skipped (Invoice_No / Invoice_Date / Job Card_No / Net_Amount required)`
            : null,
          lines: portalLines,
          persisted: true,
          uploadedAt: portal === 'PV' ? status.latestPvUploadedAt : status.latestEvUploadedAt,
          saving: false,
        })
        if (replaced.inserted !== portalLines.length) {
          setter((current) => ({
            ...current,
            error: [current.error, `Persisted ${replaced.inserted} rows; reloaded ${portalLines.length}`].filter(Boolean).join('; '),
          }))
        }
      } catch (persistError) {
        setter({
          fileName: file.name,
          rowCount: parsed.lines.length,
          error: `Parsed locally; persist failed: ${persistError instanceof Error ? persistError.message : String(persistError)}`,
          lines: parsed.lines,
          persisted: false,
          uploadedAt: null,
          saving: false,
        })
      }
    } catch (error) {
      setter({
        fileName: file.name,
        rowCount: 0,
        error: error instanceof Error ? error.message : String(error),
        lines: [],
        persisted: false,
        uploadedAt: null,
        saving: false,
      })
    }
  }, [])

  const filteredPreview = useMemo(() => {
    const rows = result?.preview ?? []
    if (previewFilter === 'all') return rows
    if (previewFilter === 'ready') return rows.filter((row) => row.status === 'ready' || row.status === 'warning')
    return rows.filter((row) => row.status === previewFilter)
  }, [result, previewFilter])

  const canExport = Boolean(result && result.summary.eligible > 0 && !rangeIssue)

  function exportParties() {
    if (!result || !canExport) return
    const workbook = buildPartyAccountWorkbook(result.partyRows)
    downloadBusyWorkbook(workbook, `BUSY_Party_Accounts_${dateRange.from}_to_${dateRange.to}.xlsx`)
  }

  function exportInvoices() {
    if (!result || !canExport) return
    const workbook = buildInvoiceVoucherWorkbook(result.invoiceRows)
    downloadBusyWorkbook(workbook, `BUSY_Invoice_Vouchers_${dateRange.from}_to_${dateRange.to}.xlsx`)
  }

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="greet">
            <Icon name="banknote" size={13} className="icon-align-text" />
            BUSY Accounting
          </p>
          <h1>BUSY</h1>
          <p>Create Party Accounts and Invoice Vouchers from DMS Labour Revenue plus PV/EV Parts files.</p>
        </div>
        <div className="toolbar toolbar--tight">
          <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />
        </div>
      </div>

      <div className="card mb-gap">
        <div className="card__head">
          <div>
            <h3>Date Range</h3>
            <div className="sub">Inclusive Labour invoice dates. Both exports use this range.</div>
          </div>
        </div>
        <div className="card__body" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end' }}>
          <label className="field field--no-gap" style={{ minWidth: 180 }}>
            <span className="label">From Date <span className="req">*</span></span>
            <input
              type="date"
              className="inp"
              value={dateRange.from}
              onChange={(e) => setDateRange((current) => ({ ...current, from: e.target.value }))}
            />
          </label>
          <label className="field field--no-gap" style={{ minWidth: 180 }}>
            <span className="label">To Date <span className="req">*</span></span>
            <input
              type="date"
              className="inp"
              value={dateRange.to}
              onChange={(e) => setDateRange((current) => ({ ...current, to: e.target.value }))}
            />
          </label>
          {rangeIssue && (
            <div className="toast error" style={{ margin: 0 }}>
              <Icon name="alert" size={14} />
              {rangeIssue}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="card__head">
            <div>
              <h3>Labour source</h3>
              <div className="sub">Existing PSF Revenue Report (DMS) import. No Labour re-upload.</div>
            </div>
          </div>
          <div className="card__body">
            <LabourPill label="PV Labour" available={labourStatus?.pvAvailable ?? false} count={labourStatus?.pvCount ?? 0} latest={labourStatus?.latestPvDate} />
            <LabourPill label="EV Labour" available={labourStatus?.evAvailable ?? false} count={labourStatus?.evCount ?? 0} latest={labourStatus?.latestEvDate} />
            {labourStatus?.error && <div className="toast error" style={{ marginTop: 10 }}>{labourStatus.error}</div>}
          </div>
        </div>

        <PartsUploadCard
          title="Parts - PV"
          description="Persisted for 5% / 18% GST amounts. Invoice_No and Invoice_Date are source evidence; Labour remains voucher truth."
          slot={pvParts}
          inputRef={pvInputRef}
          onPick={() => pvInputRef.current?.click()}
          onFile={(file) => void handlePartsFile(file, 'PV')}
        />
        <PartsUploadCard
          title="Parts - EV"
          description="Persisted for 5% / 18% GST amounts. Invoice_No and Invoice_Date are source evidence; Labour remains voucher truth."
          slot={evParts}
          inputRef={evInputRef}
          onPick={() => evInputRef.current?.click()}
          onFile={(file) => void handlePartsFile(file, 'EV')}
        />
      </div>

      {processError && (
        <div className="toast error" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={14} />
          {processError}
        </div>
      )}
      {partsStatus?.error && (
        <div className="toast error" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={14} />
          Parts persist: {partsStatus.error}
        </div>
      )}

      <div className="summary">
        <SummaryChip label="Eligible invoices" value={result?.summary.eligible ?? 0} color="#2563eb" bg="#eff6ff" />
        <SummaryChip label="PV invoices" value={result?.summary.pv ?? 0} color="#1d4ed8" bg="#eff6ff" />
        <SummaryChip label="EV invoices" value={result?.summary.ev ?? 0} color="#047857" bg="#ecfdf5" />
        <SummaryChip label="5% Parts Amount" value={formatInr(result?.summary.parts5 ?? 0)} color="#7c3aed" bg="#f5f3ff" />
        <SummaryChip label="18% Parts Amount" value={formatInr(result?.summary.parts18 ?? 0)} color="#6d28d9" bg="#f5f3ff" />
        <SummaryChip label="Labour Amount" value={formatInr(result?.summary.labour ?? 0)} color="#0f766e" bg="#f0fdfa" />
        <SummaryChip label="Distinct Parties" value={result?.summary.distinctParties ?? 0} color="#334155" bg="#f8fafc" />
        <SummaryChip label="Ready" value={result?.summary.ready ?? 0} color="#15803d" bg="#f0fdf4" />
        <SummaryChip label="Blocked / Exceptions" value={(result?.summary.blocked ?? 0) + (result?.summary.warnings ?? 0)} color="#b91c1c" bg="#fef2f2" />
      </div>

      <div className="card mb-gap">
        <div className="card__head">
          <div>
            <h3>Invoice preview</h3>
            <div className="sub">
              {labourLoading ? 'Loading Labour invoices…' : `${filteredPreview.length} rows`}
              {result && result.unmatchedParts.length > 0 ? ` · ${result.unmatchedParts.length} unmatched Parts lines (not exported)` : ''}
              {result && result.summary.excluded > 0 ? ` · ${result.summary.excluded} excluded by business rule` : ''}
            </div>
          </div>
          <div className="toolbar toolbar--tight">
            <select className="sel" value={previewFilter} onChange={(e) => setPreviewFilter(e.target.value as typeof previewFilter)}>
              <option value="all">All</option>
              <option value="ready">Ready / Warning</option>
              <option value="blocked">Blocked</option>
              <option value="excluded">Excluded</option>
            </select>
            <button type="button" className="btn btn--ghost btn--sm" disabled={!canExport} onClick={exportParties}>
              Export Party Accounts
            </button>
            <button type="button" className="btn btn--primary btn--sm" disabled={!canExport} onClick={exportInvoices}>
              Export Invoice Vouchers
            </button>
          </div>
        </div>
        <div className="card__body dense">
          {!canExport && result && result.summary.eligible === 0 && !labourLoading && (
            <div className="empty-state">No eligible invoices to export for this date range.</div>
          )}
          {filteredPreview.length === 0 && !labourLoading ? (
            <div className="empty-state">No invoices in this view.</div>
          ) : (
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Invoice Date</th>
                    <th>Invoice Number</th>
                    <th>PV/EV</th>
                    <th>Job Card</th>
                    <th>Classification</th>
                    <th>Branch</th>
                    <th>Party Name</th>
                    <th>Debtor Group</th>
                    <th>Parts 5%</th>
                    <th>Parts 18%</th>
                    <th>Labour</th>
                    <th>Total</th>
                    <th>Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPreview.map((row) => {
                    const tone = statusTone(row.status)
                    return (
                      <tr key={`${row.portal}-${row.invoiceNumber}-${row.jobCard}-${row.invoiceDate}`}>
                        <td>
                          <span style={{ background: tone.bg, color: tone.color, borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                            {tone.label}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{row.invoiceDate}</td>
                        <td><code style={{ fontSize: 11 }}>{row.invoiceNumber || '—'}</code></td>
                        <td>{row.portal || '—'}</td>
                        <td>{row.jobCard || '—'}</td>
                        <td>{row.classification || '—'}</td>
                        <td>{row.branch || '—'}</td>
                        <td>{row.partyName || '—'}</td>
                        <td style={{ fontSize: 12 }}>{row.debtorGroup || '—'}</td>
                        <td>{formatInr(row.parts5)}</td>
                        <td>{formatInr(row.parts18)}</td>
                        <td>{formatInr(row.labour)}</td>
                        <td style={{ fontWeight: 700 }}>{formatInr(row.total)}</td>
                        <td style={{ fontSize: 12, color: row.status === 'blocked' ? '#b91c1c' : '#64748b' }}>{row.issue || '—'}</td>
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

function SummaryChip({ label, value, color, bg }: { label: string; value: string | number; color: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 8, padding: '0.5rem 0.75rem', border: `1px solid ${color}22` }}>
      <div style={{ fontSize: '0.92rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{label}</div>
    </div>
  )
}

function LabourPill({ label, available, count, latest }: { label: string; available: boolean; count: number; latest: string | null | undefined }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{latest ? `Latest invoice ${latest}` : 'No invoice date yet'}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: available ? '#15803d' : '#b45309' }}>
          {available ? 'Available' : 'Not loaded'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{count.toLocaleString('en-IN')} rows</div>
      </div>
    </div>
  )
}

function PartsUploadCard({
  title,
  description,
  slot,
  inputRef,
  onPick,
  onFile,
}: {
  title: string
  description: string
  slot: PartsSlotState
  inputRef: RefObject<HTMLInputElement | null>
  onPick: () => void
  onFile: (file: File) => void
}) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="card__head">
        <div>
          <h3>{title}</h3>
          <div className="sub">{description}</div>
        </div>
      </div>
      <div className="card__body">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt"
          className="hidden"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
            e.currentTarget.value = ''
          }}
        />
        <div className="imp-drop" style={{ minHeight: 88 }} onClick={onPick}>
          <Icon name="upload" size={18} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{slot.fileName ?? 'Choose CSV / Excel'}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {slot.saving
                ? 'Saving Parts lines…'
                : slot.fileName
                  ? `${slot.rowCount.toLocaleString('en-IN')} Parts lines${slot.persisted ? ' persisted' : ''}`
                  : 'Drop or browse a Parts file. Re-upload replaces this source.'}
            </div>
          </div>
        </div>
        {slot.error && <div className="toast error" style={{ marginTop: 8 }}>{slot.error}</div>}
        {slot.persisted && slot.uploadedAt && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
            Last upload {new Date(slot.uploadedAt).toLocaleString('en-IN')}
          </div>
        )}
      </div>
    </div>
  )
}
