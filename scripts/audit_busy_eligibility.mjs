#!/usr/bin/env node
/**
 * Read-only BUSY eligibility audit. Does not change application code.
 * Run: node --experimental-strip-types scripts/audit_busy_eligibility.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseSpreadsheetBuffer } from '../src/lib/busy/partsParser.ts'
import { transformBusyAccounting } from '../src/lib/busy/transform.ts'
import { invoiceMatchesPortalSeries, normalizeInvoiceNumber, normalizePortal, isCancelledInvoiceStatus } from '../src/lib/busy/eligibility.ts'
import { resolveBusyBranch } from '../src/lib/busy/branch.ts'
import { classifyBusyInvoice, resolvePartyName } from '../src/lib/busy/partyName.ts'
import { isDateInInclusiveRange, isIsoDate } from '../src/lib/busy/dates.ts'
import { mapPartsRows } from '../src/lib/busy/partsParser.ts'
import { mapPsfRevenueDmsHeaders, buildPsfRevenueDmsInsertRow } from '../src/lib/psfRevenueDmsColumnMapper.ts'

function loadEnvLocal() {
  const path = new URL('../.env.local', import.meta.url)
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvLocal()

const FROM = process.env.BUSY_AUDIT_FROM || '2026-09-01'
const TO = process.env.BUSY_AUDIT_TO || '2026-09-30'

function labourDateIso(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { iso: value.toISOString().slice(0, 10), via: 'Date.toISOString', shiftedRisk: true }
  }
  const raw = String(value ?? '').trim()
  if (!raw) return { iso: null, via: 'empty', shiftedRisk: false }
  if (isIsoDate(raw.slice(0, 10))) return { iso: raw.slice(0, 10), via: 'iso-string', shiftedRisk: false }
  return { iso: null, via: 'unparsed', shiftedRisk: false, raw }
}

function classifyOutcome(labour, previewRow, inFetchRange) {
  const invoice = normalizeInvoiceNumber(labour.invoice_number)
  const portal = normalizePortal(labour.portal)
  const dateInfo = labourDateIso(labour.invoice_date)
  const seriesOk = Boolean(
    invoice &&
    ((invoice.toUpperCase().startsWith('IMBTAI') && portal === 'PV') ||
      (invoice.toUpperCase().startsWith('EMBTAI') && portal === 'EV')),
  )
  const validSeriesRegardlessOfPortal = invoice.toUpperCase().startsWith('IMBTAI') || invoice.toUpperCase().startsWith('EMBTAI')

  if (previewRow?.status === 'ready' || previewRow?.status === 'warning') {
    return { category: 'ELIGIBLE', stage: 'exportable', reason: previewRow.issue || 'ready/warning', condition: 'exportable = ready|warning' }
  }
  if (previewRow?.status === 'blocked') {
    const issue = previewRow.issue || ''
    if (issue.includes('Duplicate Labour invoice number')) {
      return { category: 'EXCLUDED_DUPLICATE', stage: 'duplicate-pass', reason: issue, condition: 'invoiceNumberOwners unique owners > 1 → status blocked' }
    }
    if (issue.includes('Bodyshop') || issue.includes('Missing ')) {
      return { category: 'BLOCKED_PARTY_GENERATION', stage: 'partyName', reason: issue, condition: 'resolvePartyName().issue → blocked' }
    }
    if (issue.includes('unsupported GST') || issue.includes('GST')) {
      return { category: 'OTHER', stage: 'parts-gst-validation', reason: issue, condition: 'aggregateParts().gstIssue → blocked', note: 'Matched Parts GST blocks Labour; missing Parts does not' }
    }
    return { category: 'BLOCKED_MISSING_REQUIRED_LABOUR_DATA', stage: 'labour-guards', reason: issue, condition: 'blockedPreview in transformBusyAccounting' }
  }
  if (previewRow?.status === 'excluded') {
    if (previewRow.exclusionKind === 'series') {
      return { category: 'EXCLUDED_WRONG_SERIES', stage: 'invoiceMatchesPortalSeries', reason: previewRow.issue, condition: '!invoiceMatchesPortalSeries(invoiceNumber, portal)' }
    }
    if (previewRow.exclusionKind === 'date') {
      return { category: 'EXCLUDED_OUTSIDE_DATE_RANGE', stage: 'isDateInInclusiveRange', reason: previewRow.issue, condition: '!isDateInInclusiveRange(invoiceDate, from, to)' }
    }
    if (previewRow.exclusionKind === 'cancelled') {
      return { category: 'OTHER', stage: 'isCancelledInvoiceStatus', reason: previewRow.issue, condition: 'invoice_status contains "cancel"' }
    }
    return { category: 'OTHER', stage: 'excludedPreview', reason: previewRow.issue, condition: previewRow.exclusionKind }
  }
  if (!inFetchRange) {
    if (!dateInfo.iso) return { category: 'EXCLUDED_INVALID_DATE', stage: 'sql-or-parse', reason: 'invoice_date missing/unparsed so row never fetched or failed labourDateIso', condition: 'fetchBusyLabourRows gte/lte or labourDateIso null' }
    if (!isDateInInclusiveRange(dateInfo.iso, FROM, TO)) {
      return { category: 'EXCLUDED_OUTSIDE_DATE_RANGE', stage: 'fetchBusyLabourRows SQL', reason: `stored invoice_date ${dateInfo.iso} outside ${FROM}..${TO}`, condition: '.gte(invoice_date, from).lte(invoice_date, to)' }
    }
  }
  if (validSeriesRegardlessOfPortal && portal && !seriesOk) {
    return { category: 'EXCLUDED_WRONG_SERIES', stage: 'portal-vs-prefix', reason: `${portal} + ${invoice}`, condition: 'invoiceMatchesPortalSeries' }
  }
  return { category: 'OTHER', stage: 'not-in-preview', reason: 'Row did not appear in transform preview', condition: 'unknown' }
}

function crmCorrectDate(raw) {
  const value = String(raw ?? '').trim()
  const m = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function fetchAllLabour(supabase) {
  const rows = []
  let from = 0
  const page = 1000
  while (true) {
    const { data, error } = await supabase
      .from('psf_revenue_dms')
      .select('id, invoice_number, invoice_date, account, first_name, last_name, job_card_number, vehicle_registration_number, sr_type, sr_assigned_to, final_labour_amount, invoice_status, portal')
      .order('invoice_date', { ascending: true })
      .order('invoice_number', { ascending: true })
      .range(from, from + page - 1)
    if (error) throw error
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < page) break
    from += page
  }
  return rows
}

async function fetchParts(supabase) {
  const rows = []
  let from = 0
  const page = 1000
  while (true) {
    const { data, error } = await supabase
      .from('busy_parts')
      .select('source_type, job_card_no, invoice_no, invoice_date, gst_rate, net_amount, source_row_key, source_file_name')
      .range(from, from + page - 1)
    if (error) return { error: error.message, rows: [] }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < page) break
    from += page
  }
  return { error: null, rows }
}

function partsFromFiles() {
  const files = [
    { path: '/Users/apple/Downloads/Parts - PV.csv', portal: 'PV' },
    { path: '/Users/apple/Downloads/Parts - EV.csv', portal: 'EV' },
  ]
  const lines = []
  for (const file of files) {
    if (!existsSync(file.path)) continue
    const mapped = mapPartsRows(parseSpreadsheetBuffer(readFileSync(file.path), file.path), file.portal, file.path)
    lines.push(...mapped.lines)
  }
  return lines
}

function labourFromCrmFiles() {
  const files = [
    { path: '/Users/apple/Downloads/Labour - PV.csv', portal: 'PV' },
    { path: '/Users/apple/Downloads/Labour - EV.csv', portal: 'EV' },
  ]
  const importParsed = []
  const crmParsed = []
  for (const file of files) {
    if (!existsSync(file.path)) continue
    const rows = parseSpreadsheetBuffer(readFileSync(file.path), file.path)
    const headers = Object.keys(rows[0] ?? {})
    const mapping = mapPsfRevenueDmsHeaders(headers)
    rows.forEach((excelRow, idx) => {
      const built = buildPsfRevenueDmsInsertRow(excelRow, 'Sitapura', mapping, idx + 2)
      if (!built.row) return
      const invoice = normalizeInvoiceNumber(built.row.invoice_number)
      importParsed.push({
        ...built.row,
        portal: file.portal,
        _crmDate: crmCorrectDate(excelRow['Invoice Date'] ?? excelRow['Invoice Date']),
        _rawDate: excelRow['Invoice Date'],
        _file: file.path,
      })
      crmParsed.push({
        ...built.row,
        portal: file.portal,
        invoice_date: crmCorrectDate(excelRow['Invoice Date']) || built.row.invoice_date,
        _rawDate: excelRow['Invoice Date'],
      })
    })
  }
  return { importParsed, crmParsed }
}

function summarize(rows, partsLines, label) {
  const inRangeFetch = rows.filter((row) => {
    const iso = labourDateIso(row.invoice_date).iso
    return iso && isDateInInclusiveRange(iso, FROM, TO)
  })
  const result = transformBusyAccounting({
    labourRows: inRangeFetch,
    partsLines,
    fromDate: FROM,
    toDate: TO,
  })
  const previewByInvoice = new Map()
  for (const row of result.preview) {
    const key = `${String(row.invoiceNumber).toUpperCase()}::${row.jobCard}::${row.invoiceDate}`
    previewByInvoice.set(key, row)
  }

  const counts = {
    ELIGIBLE: 0,
    EXCLUDED_WRONG_SERIES: 0,
    EXCLUDED_OUTSIDE_DATE_RANGE: 0,
    EXCLUDED_INVALID_DATE: 0,
    EXCLUDED_DUPLICATE: 0,
    BLOCKED_MISSING_REQUIRED_LABOUR_DATA: 0,
    BLOCKED_PARTY_GENERATION: 0,
    OTHER: 0,
    INCORRECTLY_EXCLUDED_MISSING_PARTS: 0,
    INCORRECTLY_EXCLUDED_ZERO_AMOUNT: 0,
  }

  const classified = []
  for (const labour of rows) {
    const invoice = normalizeInvoiceNumber(labour.invoice_number)
    const dateInfo = labourDateIso(labour.invoice_date)
    const inFetch = Boolean(dateInfo.iso && isDateInInclusiveRange(dateInfo.iso, FROM, TO))
    const preview = previewByInvoice.get(`${invoice.toUpperCase()}::${String(labour.job_card_number ?? '').trim()}::${dateInfo.iso ?? ''}`)
      || result.preview.find((row) => row.invoiceNumber.toUpperCase() === invoice.toUpperCase() && row.jobCard === String(labour.job_card_number ?? '').trim())
    const outcome = classifyOutcome(labour, preview, inFetch)
    counts[outcome.category] += 1
    classified.push({ labour, preview, dateInfo, inFetch, outcome })
  }

  const validSeries = classified.filter((row) => {
    const inv = normalizeInvoiceNumber(row.labour.invoice_number).toUpperCase()
    return inv.startsWith('IMBTAI') || inv.startsWith('EMBTAI')
  })

  const validSeriesInRangeByPrefix = validSeries.filter((row) => {
    const crmOrStored = row.dateInfo.iso
    return crmOrStored && isDateInInclusiveRange(crmOrStored, FROM, TO)
  })

  const excludedValidSeries = validSeriesInRangeByPrefix.filter((row) => row.outcome.category !== 'ELIGIBLE')

  const imbtaiExcluded = excludedValidSeries.filter((row) => normalizeInvoiceNumber(row.labour.invoice_number).toUpperCase().startsWith('IMBTAI'))
  const embtaiExcluded = excludedValidSeries.filter((row) => normalizeInvoiceNumber(row.labour.invoice_number).toUpperCase().startsWith('EMBTAI'))

  const portalMismatch = validSeries.filter((row) => {
    const inv = normalizeInvoiceNumber(row.labour.invoice_number).toUpperCase()
    const portal = normalizePortal(row.labour.portal)
    if (inv.startsWith('IMBTAI') && portal === 'EV') return true
    if (inv.startsWith('EMBTAI') && portal === 'PV') return true
    return false
  })

  const rangeRows = rows.filter((row) => {
    const iso = labourDateIso(row.invoice_date).iso
    return iso && isDateInInclusiveRange(iso, FROM, TO)
  })
  const pvInRange = rangeRows.filter((row) => normalizePortal(row.portal) === 'PV')
  const evInRange = rangeRows.filter((row) => normalizePortal(row.portal) === 'EV')
  const pvImbtai = pvInRange.filter((row) => normalizeInvoiceNumber(row.invoice_number).toUpperCase().startsWith('IMBTAI'))
  const evEmbtai = evInRange.filter((row) => normalizeInvoiceNumber(row.invoice_number).toUpperCase().startsWith('EMBTAI'))
  const anyImbtaiInRange = rangeRows.filter((row) => normalizeInvoiceNumber(row.invoice_number).toUpperCase().startsWith('IMBTAI'))
  const anyEmbtaiInRange = rangeRows.filter((row) => normalizeInvoiceNumber(row.invoice_number).toUpperCase().startsWith('EMBTAI'))

  return {
    label,
    counts,
    resultSummary: result.summary,
    range: { from: FROM, to: TO },
    totalLabour: rows.length,
    totalInRange: rangeRows.length,
    pvInRange: pvInRange.length,
    evInRange: evInRange.length,
    pvImbtai: pvImbtai.length,
    evEmbtai: evEmbtai.length,
    anyImbtaiInRange: anyImbtaiInRange.length,
    anyEmbtaiInRange: anyEmbtaiInRange.length,
    expectedSeriesEligible: anyImbtaiInRange.length + anyEmbtaiInRange.length,
    actualEligible: result.summary.eligible,
    difference: (anyImbtaiInRange.length + anyEmbtaiInRange.length) - result.summary.eligible,
    portalMismatch: portalMismatch.map(toDiag),
    cancelledInRange: rangeRows.filter((row) => isCancelledInvoiceStatus(row.invoice_status)).length,
    imbtaiExcluded: imbtaiExcluded.map(toDiag),
    embtaiExcluded: embtaiExcluded.map(toDiag),
    dateParseSamples: rangeRows.slice(0, 3).map((row) => ({
      invoice: row.invoice_number,
      raw: row.invoice_date,
      parsed: labourDateIso(row.invoice_date),
      type: typeof row.invoice_date,
    })),
  }
}

function toDiag(row) {
  const labour = row.labour
  const invoice = normalizeInvoiceNumber(labour.invoice_number)
  const portal = normalizePortal(labour.portal)
  const job = String(labour.job_card_number ?? '').trim()
  const partsFound = Boolean(row.preview && (row.preview.parts5 > 0 || row.preview.parts18 > 0 || row.preview.hasParts5Line))
  return {
    invoice_number: invoice,
    invoice_date: labourDateIso(labour.invoice_date).iso,
    raw_invoice_date: labour.invoice_date,
    portal: portal ?? String(labour.portal ?? ''),
    job_card: job,
    sr_assigned_to: labour.sr_assigned_to ?? '',
    labour_amount: labour.final_labour_amount ?? 0,
    parts_found: partsFound ? 'yes' : 'no',
    preview_status: row.preview?.status ?? 'not-in-preview',
    exclusion_stage: row.outcome.stage,
    exclusion_reason: row.outcome.reason,
    code_condition: row.outcome.condition,
    category: row.outcome.category,
    prefix: invoice.toUpperCase().startsWith('IMBTAI') ? 'IMBTAI' : invoice.toUpperCase().startsWith('EMBTAI') ? 'EMBTAI' : 'OTHER',
    prefix_vs_portal: invoice.toUpperCase().startsWith('IMBTAI') && portal === 'EV'
      ? 'IMBTAI_CLASSIFIED_EV'
      : invoice.toUpperCase().startsWith('EMBTAI') && portal === 'PV'
        ? 'EMBTAI_CLASSIFIED_PV'
        : 'aligned_or_unknown',
  }
}

const report = {
  generated_at: new Date().toISOString(),
  range: { from: FROM, to: TO },
  db: null,
  crm_files_import_dates: null,
  crm_files_correct_dates: null,
  import_date_shift_examples: [],
}

try {
  const url = process.env.VITE_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('missing supabase env')
  const supabase = createClient(url, key)
  const labour = await fetchAllLabour(supabase)
  const parts = await fetchParts(supabase)
  const partLines = parts.error
    ? partsFromFiles()
    : parts.rows.map((row) => ({
      portal: row.source_type === 'EV' ? 'EV' : 'PV',
      jobCardNumber: row.job_card_no,
      invoiceNumber: row.invoice_no,
      invoiceDate: String(row.invoice_date).slice(0, 10),
      netAmount: Number(row.net_amount),
      taxAmount: null,
      gstRate: row.gst_rate === 5 || row.gst_rate === 18 ? row.gst_rate : null,
      gstRateRaw: row.gst_rate,
      gstIssue: row.gst_rate === 5 || row.gst_rate === 18 ? null : (row.gst_rate == null ? 'no gst' : `unsupported ${row.gst_rate}`),
      sourceRowNumber: 0,
      sourceRowKey: row.source_row_key,
      sourceFileName: row.source_file_name ?? '',
    }))
  report.db = {
    labour_rows: labour.length,
    parts_error: parts.error,
    parts_rows: parts.rows.length,
    ...summarize(labour, partLines, 'persisted psf_revenue_dms'),
  }
} catch (error) {
  report.db = { error: error instanceof Error ? error.message : String(error) }
}

const crm = labourFromCrmFiles()
if (crm.importParsed.length) {
  const dateShifts = crm.importParsed
    .map((row) => ({
      invoice: row.invoice_number,
      raw: row._rawDate,
      importStored: row.invoice_date,
      crmCorrect: row._crmDate,
    }))
    .filter((row) => row.importStored && row.crmCorrect && String(row.importStored).slice(0, 10) !== row.crmCorrect)
  report.import_date_shift_examples = dateShifts.slice(0, 20)
  report.import_date_shift_count = dateShifts.length
  report.crm_files_import_dates = summarize(crm.importParsed, partsFromFiles(), 'CRM files + Import parseDateValue')
  report.crm_files_correct_dates = summarize(crm.crmParsed, partsFromFiles(), 'CRM files + DD/MM calendar date')
}

const outPath = new URL('../docs/Implementation_plans/webversion/categories/operations/evidence/BUSY-001_ELIGIBILITY_AUDIT_2026-09-12.json', import.meta.url)
writeFileSync(outPath, JSON.stringify(report, null, 2))
console.log(JSON.stringify({
  range: report.range,
  db_error: report.db?.error ?? null,
  db_eligible: report.db?.actualEligible ?? null,
  db_expected: report.db?.expectedSeriesEligible ?? null,
  db_difference: report.db?.difference ?? null,
  db_counts: report.db?.counts ?? null,
  db_imbtai_excluded: report.db?.imbtaiExcluded?.length ?? null,
  db_embtai_excluded: report.db?.embtaiExcluded?.length ?? null,
  portal_mismatch: report.db?.portalMismatch?.length ?? null,
  import_date_shift_count: report.import_date_shift_count ?? 0,
  crm_import_eligible: report.crm_files_import_dates?.actualEligible ?? null,
  crm_correct_eligible: report.crm_files_correct_dates?.actualEligible ?? null,
  out: outPath.pathname,
}, null, 2))
