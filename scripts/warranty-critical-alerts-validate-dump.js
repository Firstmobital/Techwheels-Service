#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CHUNK_DIR = path.join(__dirname, '../local_folder/backups/chunks')

const WARRANTY_TABLES = [
  'warranty_claim_settlement_report_data',
  'warranty_part_wc_data',
  'warranty_updation_claim_data',
  'warranty_goodwill_data',
  'warranty_amc_data',
  'warranty_fsb_data',
  'warranty_wc_data',
]

const STATUS_KEYS = ['claim_status', 'current_status', 'settlement_status', 'approval_status', 'stage', 'status']
const REJECTION_REASON_KEYS = ['rejection_reason', 'reason_for_rejection', 'vcm_remarks', 'remarks', 'comments']
const POSTING_DOC_KEYS = ['posting_document_no', 'posting_document_number', 'posting_doc_no', 'posting_no', 'posting_document']
const AGE_DATE_KEYS = [
  'job_card_date',
  'jc_date',
  'job_date',
  'original_claim_submitted_date',
  'goodwill_request_date',
  'created_date',
  'date_created',
  'cmpl_report_date',
  'compl_report_date',
  'service_date',
  'invc_date_yyyy_mm_dd',
  'posting_date_yyyy_mm_dd',
  'pcr_created_date',
  'pcr_creation_date',
  'pcr_raising_date',
  'veh_repair_date',
  'repair_date',
]

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeStatusBucket(status) {
  const text = normalizeText(status)
  if (text.includes('reject') || text.includes('cancelled') || text.includes('not validated')) return 'rejected'
  if (text.includes('settled') || text.includes('paid') || text.includes('closed')) return 'settled'
  if (text.includes('approved')) return 'approved'
  if (text.includes('sop') || text.includes('review') || text.includes('await') || text.includes('accepted') || text.includes('sent to tm')) return 'awaiting_sop'
  if (text.includes('submit') || text.includes('under change')) return 'submitted'
  return 'created'
}

function parsePotentialDate(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  if (text === '0000-00-00' || text.startsWith('0000-00-00')) return null

  const numericDate = Number(text)
  if (Number.isFinite(numericDate) && numericDate > 30000 && numericDate < 80000) {
    const epoch = new Date(Date.UTC(1899, 11, 30)).getTime()
    const date = new Date(epoch + numericDate * 24 * 60 * 60 * 1000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  const yyyymmdd = text.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (yyyymmdd) {
    const year = Number(yyyymmdd[1])
    const month = Number(yyyymmdd[2]) - 1
    const day = Number(yyyymmdd[3])
    const parsed = new Date(Date.UTC(year, month, day))
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  const ddmmyyyyWithTime = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i)
  if (ddmmyyyyWithTime) {
    const day = Number(ddmmyyyyWithTime[1])
    const month = Number(ddmmyyyyWithTime[2]) - 1
    const year = Number(ddmmyyyyWithTime[3].length === 2 ? `20${ddmmyyyyWithTime[3]}` : ddmmyyyyWithTime[3])

    let hours = Number(ddmmyyyyWithTime[4] ?? '0')
    const minutes = Number(ddmmyyyyWithTime[5] ?? '0')
    const seconds = Number(ddmmyyyyWithTime[6] ?? '0')
    const ampm = String(ddmmyyyyWithTime[7] ?? '').toUpperCase()

    if (ampm === 'AM' && hours === 12) hours = 0
    else if (ampm === 'PM' && hours < 12) hours += 12

    const parsed = new Date(Date.UTC(year, month, day, hours, minutes, seconds))
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  const direct = new Date(text)
  if (!Number.isNaN(direct.getTime())) return direct.toISOString()

  return null
}

function extractByPreferredKeys(row, keys) {
  const entries = Object.entries(row)

  for (const key of keys) {
    const needle = key.toLowerCase()

    const exactInsensitive = entries.find(([candidate]) => candidate.toLowerCase() === needle)
    if (exactInsensitive && exactInsensitive[1] != null && String(exactInsensitive[1]).trim() !== '') {
      return String(exactInsensitive[1]).trim()
    }

    const partialInsensitive = entries.find(([candidate]) => candidate.toLowerCase().includes(needle))
    if (partialInsensitive && partialInsensitive[1] != null && String(partialInsensitive[1]).trim() !== '') {
      return String(partialInsensitive[1]).trim()
    }
  }
  return ''
}

function extractStatusValue(row) {
  for (const key of STATUS_KEYS) {
    const exact = row[key]
    if (exact != null && String(exact).trim() !== '') return String(exact).trim()
  }

  const normalizedKeyMap = new Map()
  for (const key of Object.keys(row)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!normalizedKeyMap.has(normalizedKey)) normalizedKeyMap.set(normalizedKey, key)
  }

  const normalizedStatusKeys = ['claimstatus', 'currentstatus', 'settlementstatus', 'approvalstatus', 'stage', 'status']
  for (const normalizedCandidate of normalizedStatusKeys) {
    const matchedKey = normalizedKeyMap.get(normalizedCandidate)
    if (!matchedKey) continue
    const value = row[matchedKey]
    if (value != null && String(value).trim() !== '') return String(value).trim()
  }

  return ''
}

function extractFirstParsableDateByPreferredKeys(row, keys) {
  const entries = Object.entries(row)

  for (const key of keys) {
    const needle = key.toLowerCase()

    const exactInsensitive = entries.find(([candidate]) => candidate.toLowerCase() === needle)
    if (exactInsensitive && exactInsensitive[1] != null) {
      const parsed = parsePotentialDate(String(exactInsensitive[1]))
      if (parsed) return parsed
    }

    const partialInsensitive = entries.find(([candidate]) => candidate.toLowerCase().includes(needle))
    if (partialInsensitive && partialInsensitive[1] != null) {
      const parsed = parsePotentialDate(String(partialInsensitive[1]))
      if (parsed) return parsed
    }
  }

  return null
}

function inferPortal(record) {
  const portal = String(record.portal ?? '').trim().toUpperCase()
  if (portal === 'PV' || portal === 'EV') return portal

  const branchText = normalizeText(record.branch)
  return branchText.includes('ev') ? 'EV' : 'PV'
}

function inferLocation(record) {
  const locationText = normalizeText(record.location)
  if (locationText.includes('ajmer')) return 'Ajmer Road'
  if (locationText.includes('sitapura')) return 'Sitapura'

  const branchText = normalizeText(record.branch)
  if (branchText.includes('ajmer')) return 'Ajmer Road'
  if (branchText.includes('sitapura')) return 'Sitapura'
  return ''
}

function parseCopyLine(line) {
  const firstSeven = []
  let cursor = 0

  for (let i = 0; i < 7; i += 1) {
    const tabIdx = line.indexOf('\t', cursor)
    if (tabIdx === -1) return null
    firstSeven.push(line.slice(cursor, tabIdx))
    cursor = tabIdx + 1
  }

  const tail = line.slice(cursor)
  const lastTab = tail.lastIndexOf('\t')
  if (lastTab === -1) return null
  const updatedAt = tail.slice(lastTab + 1)

  const headTail = tail.slice(0, lastTab)
  const secondLastTab = headTail.lastIndexOf('\t')
  if (secondLastTab === -1) return null

  const createdAt = headTail.slice(secondLastTab + 1)
  const jsonRaw = headTail.slice(0, secondLastTab)

  let sourceRowData
  try {
    sourceRowData = JSON.parse(jsonRaw)
  } catch {
    return null
  }

  return {
    id: firstSeven[0],
    branch: firstSeven[1],
    location: firstSeven[2],
    portal: firstSeven[3],
    source_row_hash: firstSeven[4],
    source_row_number: firstSeven[5],
    source_file_name: firstSeven[6],
    source_row_data: sourceRowData,
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

function extractTableRowsFromContent(content, tableName) {
  const marker = `COPY public.${tableName} (`
  const markerIdx = content.indexOf(marker)
  if (markerIdx === -1) return []

  const fromStdinIdx = content.indexOf('FROM stdin;', markerIdx)
  if (fromStdinIdx === -1) return []

  const dataStart = fromStdinIdx + 'FROM stdin;'.length
  const dataEnd = content.indexOf('\n\\.\n', dataStart)
  if (dataEnd === -1) return []

  const block = content.slice(dataStart, dataEnd)
  const lines = block.split('\n').filter((line) => line.trim().length > 0)

  const rows = []
  for (const line of lines) {
    const parsed = parseCopyLine(line)
    if (parsed) rows.push(parsed)
  }
  return rows
}

function computeAlerts(rows) {
  const notSubmitted = rows.filter((record) => {
    const bucket = normalizeStatusBucket(record.status)
    return bucket === 'created' && record.ageDays > 1
  }).length

  const stuckReview = rows.filter((record) => {
    const bucket = normalizeStatusBucket(record.status)
    return bucket === 'awaiting_sop' && record.ageDays > 3
  }).length

  const sopPending = rows.filter((record) => {
    const bucket = normalizeStatusBucket(record.status)
    return (bucket === 'awaiting_sop' || bucket === 'submitted') && record.ageDays > 2
  }).length

  const approvedUnsettled = rows.filter((record) => {
    const bucket = normalizeStatusBucket(record.status)
    return bucket === 'approved' && record.ageDays > 5 && String(record.postingDocNo || '').trim() === ''
  }).length

  const rejectionBlank = rows.filter((record) => {
    const bucket = normalizeStatusBucket(record.status)
    return bucket === 'rejected' && String(record.rejectionReason || '').trim() === ''
  }).length

  return {
    notSubmitted,
    stuckReview,
    sopPending,
    approvedUnsettled,
    rejectionBlank,
    total: notSubmitted + stuckReview + sopPending + approvedUnsettled + rejectionBlank,
  }
}

function loadDumpContent() {
  const chunkFiles = fs
    .readdirSync(CHUNK_DIR)
    .filter((name) => name.startsWith('full_database.sql.part_'))
    .sort()

  if (chunkFiles.length === 0) {
    throw new Error(`No dump chunks found in ${CHUNK_DIR}`)
  }

  let content = ''
  for (const fileName of chunkFiles) {
    content += fs.readFileSync(path.join(CHUNK_DIR, fileName), 'utf8')
  }
  return content
}

function main() {
  const nowMs = Date.now()
  const content = loadDumpContent()

  const normalized = []
  let parsedRows = 0

  for (const tableName of WARRANTY_TABLES) {
    const rows = extractTableRowsFromContent(content, tableName)
    parsedRows += rows.length

    for (const row of rows) {
      const source = row.source_row_data || {}
      const status = extractStatusValue(source)
      const rejectionReason = extractByPreferredKeys(source, REJECTION_REASON_KEYS)
      const postingDocNo = extractByPreferredKeys(source, POSTING_DOC_KEYS)
      const parsedAgeSourceDate = extractFirstParsableDateByPreferredKeys(source, AGE_DATE_KEYS)

      let ageDays = 0
      if (parsedAgeSourceDate) {
        const ageSourceMs = new Date(parsedAgeSourceDate).getTime()
        if (Number.isFinite(ageSourceMs)) {
          ageDays = Math.max(0, Math.floor((nowMs - ageSourceMs) / (1000 * 60 * 60 * 24)))
        }
      }

      normalized.push({
        status,
        rejectionReason,
        postingDocNo,
        ageDays,
        location: inferLocation(row),
        portal: inferPortal(row),
      })
    }
  }

  const sitapuraPv = normalized.filter((r) => r.location === 'Sitapura' && r.portal === 'PV')
  const sitapuraEv = normalized.filter((r) => r.location === 'Sitapura' && r.portal === 'EV')
  const ajmerPv = normalized.filter((r) => r.location === 'Ajmer Road' && r.portal === 'PV')

  const result = {
    generatedAt: new Date().toISOString(),
    parsedRows,
    countsByScope: {
      allRecords: computeAlerts(normalized),
      sitapuraPV_3000840_like: computeAlerts(sitapuraPv),
      sitapuraEV_500A840_like: computeAlerts(sitapuraEv),
      sitapuraCombined_PV_EV: computeAlerts([...sitapuraPv, ...sitapuraEv]),
      ajmerRoadPV_3001440_like: computeAlerts(ajmerPv),
    },
  }

  console.log(JSON.stringify(result, null, 2))
}

main()
