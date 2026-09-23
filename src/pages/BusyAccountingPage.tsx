import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import DateRangeFilter, {
  currentMonthRange,
  getRange,
  inferPresetFromRange,
  type DateRange,
  type DateRangePreset,
} from '../components/DateRangeFilter'
import { Icon } from '../components/Icon'
import {
  dateRangeError,
  downloadBusyWorkbook,
  evaluateBusyVoucherSourceAvailability,
  fetchBusyLabourRows,
  fetchBusyPartsLines,
  formatInr,
  loadBusyLabourSourceStatus,
  loadBusyPartsSourceStatus,
  parsePartsSpreadsheet,
  importBusyPartsSource,
  formatBusyPartsImportSummary,
  transformBusyAccounting,
  buildInvoiceVoucherWorkbook,
  buildPartyAccountWorkbook,
  fetchBusyInsuranceMaster,
  insertBusyInsuranceMaster,
  updateBusyInsuranceMaster,
  isBusyAdmin,
  masterRowsForTransform,
  BUSY_INSURANCE_MASTER,
  fetchBusyPartsAccountMaster,
  insertBusyPartsAccountMaster,
  updateBusyPartsAccountMaster,
  partsAccountRowsForTransform,
  type BusyPreviewRow,
  type BusyInsuranceStoredRow,
  type BusyPartsAccountStoredRow,
} from '../lib/busy'
import type { BusyLabourSourceStatus } from '../lib/busy/labourSource'
import type { BusyPartsSourceStatus } from '../lib/busy/partsSource'
import type { BusyPartsLine, VehiclePortal } from '../lib/busy/types'

interface PartsSlotState {
  fileName: string | null
  rowCount: number
  error: string | null
  summary: string | null
  lines: BusyPartsLine[]
  persisted: boolean
  uploadedAt: string | null
  saving: boolean
}

const EMPTY_SLOT: PartsSlotState = {
  fileName: null,
  rowCount: 0,
  error: null,
  summary: null,
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
  const [period, setPeriod] = useState<DateRangePreset>('this-month')
  const [customRange, setCustomRange] = useState<DateRange>(currentMonthRange)
  const [labourStatus, setLabourStatus] = useState<BusyLabourSourceStatus | null>(null)
  const [partsStatus, setPartsStatus] = useState<BusyPartsSourceStatus | null>(null)
  const [labourLoading, setLabourLoading] = useState(true)
  const [partsLoading, setPartsLoading] = useState(true)
  const [labourResolvedRange, setLabourResolvedRange] = useState<string | null>(null)
  const [processError, setProcessError] = useState<string | null>(null)
  const [voucherHandlerWarning, setVoucherHandlerWarning] = useState<string | null>(null)
  const [pvParts, setPvParts] = useState<PartsSlotState>(EMPTY_SLOT)
  const [evParts, setEvParts] = useState<PartsSlotState>(EMPTY_SLOT)
  const [previewFilter, setPreviewFilter] = useState<'all' | 'ready' | 'blocked' | 'excluded'>('all')
  const [isAdmin, setIsAdmin] = useState(false)
  const [insuranceStored, setInsuranceStored] = useState<BusyInsuranceStoredRow[]>([])
  const [insuranceLoadError, setInsuranceLoadError] = useState<string | null>(null)
  const [insuranceLoading, setInsuranceLoading] = useState(true)
  const [partsAccountStored, setPartsAccountStored] = useState<BusyPartsAccountStoredRow[]>([])
  const [partsAccountLoadError, setPartsAccountLoadError] = useState<string | null>(null)
  const [partsAccountLoading, setPartsAccountLoading] = useState(true)
  const pvInputRef = useRef<HTMLInputElement>(null)
  const evInputRef = useRef<HTMLInputElement>(null)

  const { from: fromDate, to: toDate } = useMemo(
    () => getRange(period, customRange),
    [period, customRange],
  )
  const rangeIssue = dateRangeError(fromDate, toDate)

  const handlePeriodRangeChange = useCallback((range: DateRange) => {
    const nextPeriod = inferPresetFromRange(range)
    if (nextPeriod === 'all') return
    setPeriod(nextPeriod)
    if (nextPeriod === 'custom') setCustomRange(range)
  }, [])

  useEffect(() => {
    setVoucherHandlerWarning(null)
  }, [fromDate, toDate])

  const reloadPartsAccountMaster = useCallback(async () => {
    setPartsAccountLoading(true)
    try {
      const rows = await fetchBusyPartsAccountMaster()
      setPartsAccountStored(rows)
      setPartsAccountLoadError(null)
    } catch (error) {
      setPartsAccountStored([])
      setPartsAccountLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      setPartsAccountLoading(false)
    }
  }, [])

  const reloadInsuranceMaster = useCallback(async () => {
    setInsuranceLoading(true)
    try {
      const rows = await fetchBusyInsuranceMaster()
      setInsuranceStored(rows)
      setInsuranceLoadError(null)
    } catch (error) {
      setInsuranceStored([])
      setInsuranceLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      setInsuranceLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    isBusyAdmin().then((admin) => {
      if (active) setIsAdmin(admin)
    })
    reloadInsuranceMaster()
    reloadPartsAccountMaster()
    return () => { active = false }
  }, [reloadInsuranceMaster, reloadPartsAccountMaster])

  useEffect(() => {
    let active = true
    loadBusyLabourSourceStatus().then((status) => {
      if (active) setLabourStatus(status)
    })
    setPartsLoading(true)
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
        summary: null,
        lines: pvLines,
        persisted: pvLines.length > 0,
        uploadedAt: status.latestPvUploadedAt,
        saving: false,
      })
      setEvParts({
        fileName: status.evFileName,
        rowCount: evLines.length,
        error: status.error,
        summary: null,
        lines: evLines,
        persisted: evLines.length > 0,
        uploadedAt: status.latestEvUploadedAt,
        saving: false,
      })
    }).catch((error: unknown) => {
      if (!active) return
      const message = error instanceof Error ? error.message : String(error)
      setPvParts(EMPTY_SLOT)
      setEvParts(EMPTY_SLOT)
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
    }).finally(() => {
      if (active) setPartsLoading(false)
    })
    return () => { active = false }
  }, [])

  const [labourRows, setLabourRows] = useState<Awaited<ReturnType<typeof fetchBusyLabourRows>>>([])

  useEffect(() => {
    if (rangeIssue) return

    let active = true
    // Existing pages load data in useEffect the same way (CRE Incentive, reports).
    setLabourLoading(true)
    setProcessError(null)
    fetchBusyLabourRows(fromDate, toDate)
      .then((rows) => {
        if (!active) return
        setLabourRows(rows)
        setLabourResolvedRange(`${fromDate}:${toDate}`)
      })
      .catch((error: unknown) => {
        if (!active) return
        setLabourRows([])
        setLabourResolvedRange(`${fromDate}:${toDate}`)
        setProcessError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (active) setLabourLoading(false)
      })

    return () => { active = false }
  }, [fromDate, toDate, rangeIssue])

  const partsLines = useMemo(
    () => [...pvParts.lines, ...evParts.lines],
    [pvParts.lines, evParts.lines],
  )

  const insuranceMaster = useMemo(
    () => masterRowsForTransform(insuranceStored),
    [insuranceStored],
  )

  const partsAccountMaster = useMemo(
    () => partsAccountRowsForTransform(partsAccountStored),
    [partsAccountStored],
  )

  const result = useMemo(() => {
    if (rangeIssue) return null
    return transformBusyAccounting({
      labourRows,
      partsLines,
      fromDate,
      toDate,
      insuranceMaster,
      partsAccountMaster,
    })
  }, [labourRows, partsLines, fromDate, toDate, rangeIssue, insuranceMaster, partsAccountMaster])

  const handlePartsFile = useCallback(async (file: File, portal: VehiclePortal) => {
    const setter = portal === 'PV' ? setPvParts : setEvParts
    setter((current) => ({
      ...current,
      fileName: file.name,
      error: null,
      summary: null,
      saving: true,
    }))
    try {
      const parsed = await parsePartsSpreadsheet(file, portal)
      if (parsed.errors.length > 0) {
        setter((current) => ({
          ...current,
          fileName: file.name,
          error: parsed.errors.join('; '),
          summary: null,
          saving: false,
        }))
        return
      }
      try {
        const imported = await importBusyPartsSource(portal, file.name, parsed.lines)
        const persisted = await fetchBusyPartsLines()
        const portalLines = persisted.filter((line) => line.portal === portal)
        const status = await loadBusyPartsSourceStatus()
        setPartsStatus(status)
        const incomplete = parsed.skippedIncomplete > 0
          ? `${parsed.skippedIncomplete} incomplete source rows skipped (Invoice_No / Invoice_Date / Job Card_No / Net_Amount required)`
          : null
        setter({
          fileName: file.name,
          rowCount: portalLines.length,
          error: incomplete,
          summary: formatBusyPartsImportSummary(imported),
          lines: portalLines,
          persisted: true,
          uploadedAt: portal === 'PV' ? status.latestPvUploadedAt : status.latestEvUploadedAt,
          saving: false,
        })
      } catch (persistError) {
        setter((current) => ({
          ...current,
          fileName: file.name,
          error: `Parsed locally; persist failed: ${persistError instanceof Error ? persistError.message : String(persistError)}`,
          summary: null,
          saving: false,
        }))
      }
    } catch (error) {
      setter((current) => ({
        ...current,
        fileName: file.name,
        error: error instanceof Error ? error.message : String(error),
        summary: null,
        saving: false,
      }))
    }
  }, [])

  const filteredPreview = useMemo(() => {
    const rows = result?.preview ?? []
    if (previewFilter === 'all') return rows
    if (previewFilter === 'ready') return rows.filter((row) => row.status === 'ready' || row.status === 'warning')
    return rows.filter((row) => row.status === previewFilter)
  }, [result, previewFilter])

  const sourceAvailability = useMemo(() => {
    if (rangeIssue) return null
    return evaluateBusyVoucherSourceAvailability({
      labourRows,
      partsLines,
      fromDate,
      toDate,
    })
  }, [labourRows, partsLines, fromDate, toDate, rangeIssue])

  const sourcesPending = Boolean(
    !rangeIssue && (labourLoading || partsLoading || labourResolvedRange !== `${fromDate}:${toDate}`),
  )

  const canExportParties = Boolean(result && result.summary.eligible > 0 && !rangeIssue)
  const canExportInvoices = Boolean(
    canExportParties
    && !sourcesPending
    && sourceAvailability?.sourcesComplete,
  )
  const voucherSourceWarning = voucherHandlerWarning
    ?? (!sourcesPending && sourceAvailability && !sourceAvailability.sourcesComplete
      ? sourceAvailability.warning
      : null)

  function exportParties() {
    if (!result || !canExportParties) return
    const workbook = buildPartyAccountWorkbook(result.partyRows)
    downloadBusyWorkbook(workbook, `BUSY_Party_Accounts_${fromDate}_to_${toDate}.xlsx`)
  }

  function exportInvoices() {
    if (sourcesPending) return
    const availability = evaluateBusyVoucherSourceAvailability({
      labourRows,
      partsLines,
      fromDate,
      toDate,
    })
    if (!availability.sourcesComplete) {
      setVoucherHandlerWarning(availability.warning)
      return
    }
    if (!result || result.summary.eligible === 0 || rangeIssue) return
    const workbook = buildInvoiceVoucherWorkbook(result.invoiceRows)
    downloadBusyWorkbook(workbook, `BUSY_Invoice_Vouchers_${fromDate}_to_${toDate}.xlsx`)
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
          <DateRangeFilter range={{ from: fromDate, to: toDate }} onChange={handlePeriodRangeChange} label="Period:" />
        </div>
      </div>

      {rangeIssue && (
        <div className="toast error" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={14} />
          {rangeIssue}
        </div>
      )}

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
          description="Persisted for 5% / 18% GST amounts. Invoice_No and Invoice_Date are source evidence. Labour remains voucher identity unless Account_Name maps to a dealer code with no Labour row."
          slot={pvParts}
          inputRef={pvInputRef}
          onPick={() => pvInputRef.current?.click()}
          onFile={(file) => void handlePartsFile(file, 'PV')}
        />
        <PartsUploadCard
          title="Parts - EV"
          description="Persisted for 5% / 18% GST amounts. Invoice_No and Invoice_Date are source evidence. Labour remains voucher identity unless Account_Name maps to a dealer code with no Labour row."
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

      {partsAccountLoadError && !isAdmin && (
        <div className="toast error" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={14} />
          Parts dealer accounts: {partsAccountLoadError}
        </div>
      )}

      {isAdmin && (
        <BusyInsuranceMasterCard
          rows={insuranceStored}
          loading={insuranceLoading}
          loadError={insuranceLoadError}
          usingFallback={insuranceStored.length === 0}
          fallbackCount={BUSY_INSURANCE_MASTER.length}
          onReload={() => void reloadInsuranceMaster()}
        />
      )}

      {isAdmin && (
        <BusyPartsAccountMasterCard
          rows={partsAccountStored}
          loading={partsAccountLoading}
          loadError={partsAccountLoadError}
          onReload={() => void reloadPartsAccountMaster()}
        />
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
        <SummaryChip label="Unmapped Bodyshop" value={result?.summary.unmappedBodyshop ?? 0} color="#b45309" bg="#fffbeb" />
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
            <button type="button" className="btn btn--ghost btn--sm" disabled={!canExportParties} onClick={exportParties}>
              Export Party Accounts
            </button>
            <button type="button" className="btn btn--primary btn--sm" disabled={!canExportInvoices} onClick={exportInvoices}>
              Export Invoice Vouchers
            </button>
          </div>
        </div>
        <div className="card__body dense">
          {voucherSourceWarning && (
            <div className="alert alert--err" style={{ marginBottom: 12 }}>
              <Icon name="alert" size={14} />
              {voucherSourceWarning}
            </div>
          )}
          {!canExportParties && result && result.summary.eligible === 0 && !labourLoading && (
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
                    <th>Group</th>
                    <th>GSTIN</th>
                    <th>Parts 5%</th>
                    <th>Parts 18%</th>
                    <th>Labour</th>
                    <th>Round Off</th>
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
                        <td style={{ fontSize: 12 }}>{row.gstin || '—'}</td>
                        <td>{formatInr(row.parts5)}</td>
                        <td>{formatInr(row.parts18)}</td>
                        <td>{formatInr(row.labour)}</td>
                        <td>{formatInr(row.roundOff)}</td>
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
                  : 'Drop or browse a Parts file. New invoices are appended; already uploaded invoices are skipped.'}
            </div>
          </div>
        </div>
        {slot.error && <div className="toast error" style={{ marginTop: 8 }}>{slot.error}</div>}
        {slot.summary && (
          <div className="toast" style={{ marginTop: 8, whiteSpace: 'pre-line' }}>{slot.summary}</div>
        )}
        {slot.persisted && slot.uploadedAt && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
            Last upload {new Date(slot.uploadedAt).toLocaleString('en-IN')}
          </div>
        )}
      </div>
    </div>
  )
}

function emptyPartsAccountDraft() {
  return { code: '', partyName: '', gstin: '', busyGroup: '' }
}

function BusyPartsAccountMasterCard({
  rows,
  loading,
  loadError,
  onReload,
}: {
  rows: BusyPartsAccountStoredRow[]
  loading: boolean
  loadError: string | null
  onReload: () => void
}) {
  const [draft, setDraft] = useState(emptyPartsAccountDraft)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState(emptyPartsAccountDraft)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function handleInsert() {
    setSaving(true)
    setFormError(null)
    try {
      await insertBusyPartsAccountMaster(draft)
      setDraft(emptyPartsAccountDraft())
      onReload()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(id: number) {
    setSaving(true)
    setFormError(null)
    try {
      await updateBusyPartsAccountMaster(id, editDraft)
      setEditingId(null)
      onReload()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  function startEdit(row: BusyPartsAccountStoredRow) {
    setEditingId(row.id)
    setEditDraft({ code: row.code, partyName: row.partyName, gstin: row.gstin, busyGroup: row.busyGroup })
    setFormError(null)
  }

  function toggleOpen() {
    setOpen((current) => {
      if (current) {
        setEditingId(null)
        setFormError(null)
      }
      return !current
    })
  }

  return (
    <div className="card mb-gap">
      <div className="card__head">
        <div>
          <h3>Parts dealer accounts</h3>
          <div className="sub">
            Admin insert or update. The code is the leading token of Parts Account_Name. It sets Party Name, GSTIN, and Group only when that invoice has no Labour row.
            {loading ? ' Loading…' : ` ${rows.length} mapping${rows.length === 1 ? '' : 's'}.`}
          </div>
        </div>
        <div className="toolbar toolbar--tight">
          <button type="button" className="btn btn--ghost btn--sm" onClick={toggleOpen}>
            {open ? 'Hide accounts' : 'Show accounts'}
          </button>
        </div>
      </div>
      {open && (
      <div className="card__body dense">
        {loadError && (
          <div className="toast error" style={{ marginBottom: 12 }}>
            <Icon name="alert" size={14} />
            {loadError}
          </div>
        )}
        {formError && (
          <div className="toast error" style={{ marginBottom: 12 }}>
            <Icon name="alert" size={14} />
            {formError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 0.7fr) minmax(180px, 1.6fr) minmax(150px, 1fr) minmax(160px, 1.2fr) auto', gap: 8, marginBottom: 12, alignItems: 'end' }}>
          <label>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Code</div>
            <input className="inp" value={draft.code} onChange={(e) => setDraft((current) => ({ ...current, code: e.target.value }))} placeholder="3004370" />
          </label>
          <label>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Party Name</div>
            <input className="inp" value={draft.partyName} onChange={(e) => setDraft((current) => ({ ...current, partyName: e.target.value }))} placeholder="BUSY party name" />
          </label>
          <label>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>GSTIN</div>
            <input className="inp" value={draft.gstin} onChange={(e) => setDraft((current) => ({ ...current, gstin: e.target.value }))} placeholder="22AAAAA0000A1Z5" />
          </label>
          <label>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Group of Account</div>
            <input className="inp" value={draft.busyGroup} onChange={(e) => setDraft((current) => ({ ...current, busyGroup: e.target.value }))} placeholder="BUSY group spelling" />
          </label>
          <button type="button" className="btn btn--primary btn--sm" disabled={saving || Boolean(loadError)} onClick={() => void handleInsert()}>
            {saving && editingId == null ? 'Saving…' : 'Add account'}
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">No persisted Parts dealer accounts.</div>
        ) : (
          <div className="tbl-wrap scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Party Name</th>
                  <th>GSTIN</th>
                  <th>Group of Account</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const editing = editingId === row.id
                  return (
                    <tr key={row.id}>
                      <td>
                        {editing ? (
                          <input className="inp" value={editDraft.code} onChange={(e) => setEditDraft((current) => ({ ...current, code: e.target.value }))} />
                        ) : (
                          <code style={{ fontSize: 11 }}>{row.code}</code>
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <input className="inp" value={editDraft.partyName} onChange={(e) => setEditDraft((current) => ({ ...current, partyName: e.target.value }))} />
                        ) : row.partyName}
                      </td>
                      <td>
                        {editing ? (
                          <input className="inp" value={editDraft.gstin} onChange={(e) => setEditDraft((current) => ({ ...current, gstin: e.target.value }))} />
                        ) : (
                          <code style={{ fontSize: 11 }}>{row.gstin}</code>
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <input className="inp" value={editDraft.busyGroup} onChange={(e) => setEditDraft((current) => ({ ...current, busyGroup: e.target.value }))} />
                        ) : row.busyGroup}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {editing ? (
                          <>
                            <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={() => void handleUpdate(row.id)}>
                              Save
                            </button>
                            {' '}
                            <button type="button" className="btn btn--ghost btn--sm" disabled={saving} onClick={() => setEditingId(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" className="btn btn--ghost btn--sm" disabled={saving} onClick={() => startEdit(row)}>
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  )
}

function emptyInsuranceDraft() {
  return { companyName: '', gstin: '', busyGroup: '' }
}

function BusyInsuranceMasterCard({
  rows,
  loading,
  loadError,
  usingFallback,
  fallbackCount,
  onReload,
}: {
  rows: BusyInsuranceStoredRow[]
  loading: boolean
  loadError: string | null
  usingFallback: boolean
  fallbackCount: number
  onReload: () => void
}) {
  const [draft, setDraft] = useState(emptyInsuranceDraft)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState(emptyInsuranceDraft)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function handleInsert() {
    setSaving(true)
    setFormError(null)
    try {
      await insertBusyInsuranceMaster(draft)
      setDraft(emptyInsuranceDraft())
      onReload()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(id: number) {
    setSaving(true)
    setFormError(null)
    try {
      await updateBusyInsuranceMaster(id, editDraft)
      setEditingId(null)
      onReload()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  function startEdit(row: BusyInsuranceStoredRow) {
    setEditingId(row.id)
    setEditDraft({ companyName: row.companyName, gstin: row.gstin, busyGroup: row.busyGroup })
    setFormError(null)
  }

  function toggleOpen() {
    setOpen((current) => {
      if (current) {
        setEditingId(null)
        setFormError(null)
      }
      return !current
    })
  }

  return (
    <div className="card mb-gap">
      <div className="card__head">
        <div>
          <h3>Bodyshop Group of Account</h3>
          <div className="sub">
            Admin insert or update. Insurance company before C/O maps to BUSY Group and GSTIN.
            {loading ? ' Loading…' : ` ${rows.length} mapping${rows.length === 1 ? '' : 's'}.`}
          </div>
        </div>
        <div className="toolbar toolbar--tight">
          <button type="button" className="btn btn--ghost btn--sm" onClick={toggleOpen}>
            {open ? 'Hide groups' : 'Show groups'}
          </button>
        </div>
      </div>
      {open && (
      <div className="card__body dense">
        {loadError && (
          <div className="toast error" style={{ marginBottom: 12 }}>
            <Icon name="alert" size={14} />
            {loadError}. Preview is using the {fallbackCount}-row seed until this table is applied.
          </div>
        )}
        {!loadError && usingFallback && !loading && (
          <div className="toast" style={{ marginBottom: 12 }}>
            No persisted mappings yet. Preview is using the {fallbackCount}-row seed.
          </div>
        )}
        {formError && (
          <div className="toast error" style={{ marginBottom: 12 }}>
            <Icon name="alert" size={14} />
            {formError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) minmax(160px, 1fr) minmax(180px, 1.4fr) auto', gap: 8, marginBottom: 12, alignItems: 'end' }}>
          <label>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Insurance company</div>
            <input className="inp" value={draft.companyName} onChange={(e) => setDraft((current) => ({ ...current, companyName: e.target.value }))} placeholder="Name before C/O" />
          </label>
          <label>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>GSTIN</div>
            <input className="inp" value={draft.gstin} onChange={(e) => setDraft((current) => ({ ...current, gstin: e.target.value }))} placeholder="22AAAAA0000A1Z5" />
          </label>
          <label>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Group of Account</div>
            <input className="inp" value={draft.busyGroup} onChange={(e) => setDraft((current) => ({ ...current, busyGroup: e.target.value }))} placeholder="BUSY group spelling" />
          </label>
          <button type="button" className="btn btn--primary btn--sm" disabled={saving || Boolean(loadError)} onClick={() => void handleInsert()}>
            {saving && editingId == null ? 'Saving…' : 'Add group'}
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">No persisted Group of Account mappings.</div>
        ) : (
          <div className="tbl-wrap scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Insurance company</th>
                  <th>GSTIN</th>
                  <th>Group of Account</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const editing = editingId === row.id
                  return (
                    <tr key={row.id}>
                      <td>
                        {editing ? (
                          <input className="inp" value={editDraft.companyName} onChange={(e) => setEditDraft((current) => ({ ...current, companyName: e.target.value }))} />
                        ) : row.companyName}
                      </td>
                      <td>
                        {editing ? (
                          <input className="inp" value={editDraft.gstin} onChange={(e) => setEditDraft((current) => ({ ...current, gstin: e.target.value }))} />
                        ) : (
                          <code style={{ fontSize: 11 }}>{row.gstin}</code>
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <input className="inp" value={editDraft.busyGroup} onChange={(e) => setEditDraft((current) => ({ ...current, busyGroup: e.target.value }))} />
                        ) : row.busyGroup}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {editing ? (
                          <>
                            <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={() => void handleUpdate(row.id)}>
                              Save
                            </button>
                            {' '}
                            <button type="button" className="btn btn--ghost btn--sm" disabled={saving} onClick={() => setEditingId(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" className="btn btn--ghost btn--sm" disabled={saving} onClick={() => startEdit(row)}>
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
