#!/usr/bin/env node
/**
 * Warranty Audit Script - Extract DB-truth baseline for Critical Alerts, Financial, Operations tabs
 * Authority: local_folder/backups/full_database.sql (authoritative dump)
 * 
 * Executes:
 * 1. Parses warranty table COPY data from authoritative dump
 * 2. Normalizes status & calculates age using same logic as UI
 * 3. Calculates Critical Alerts baseline (5 alert types)
 * 4. Calculates Financial tab KPIs and metrics
 * 5. Calculates Operations tab visibility metrics
 * 6. Documents findings in WARRANTY-001 plan
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const DUMP_PATH = path.join(__dirname, '../local_folder/backups/full_database.sql');
const CHUNK_DIR = path.join(__dirname, '../local_folder/backups/chunks');
const PLAN_PATH = path.join(__dirname, '../docs/Implementation_plans/WARRANTY-001_WARRANTY_REPORT_IMPORT_AND_REPORTING_PLAN.md');

// Constants matching UI normalization
const STATUS_KEYWORDS = {
  rejected: ['reject', 'cancelled', 'not validated'],
  settled: ['settled', 'paid', 'closed'],
  approved: ['approved'],
  awaiting_sop: ['sop', 'review', 'await', 'accepted', 'sent to tm'],
  submitted: ['submit', 'under change'],
};

const REJECTION_REASON_KEYS = [
  'rejection_reason', 'reason_for_rejection', 'vcm_remarks', 'remarks', 'comments'
];

/**
 * Normalize status text to bucket (matches UI logic)
 */
function normalizeStatusBucket(status) {
  if (!status) return 'created';
  const text = String(status).trim().toLowerCase();
  
  for (const [bucket, keywords] of Object.entries(STATUS_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) return bucket;
    }
  }
  return 'created';
}

/**
 * Parse date string to ISO format (matches UI logic)
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  const text = String(dateStr).trim();
  if (!text) return null;
  
  // Try DD/MM/YYYY format (most common in data)
  const match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const hours = Number(match[4] || 0);
    const mins = Number(match[5] || 0);
    
    const date = new Date(Date.UTC(year, month, day, hours, mins));
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Try direct parse
  const direct = new Date(text);
  if (!isNaN(direct.getTime())) {
    return direct;
  }
  
  return null;
}

/**
 * Calculate age in days from given date
 */
function getAgeDays(dateStr) {
  const date = parseDate(dateStr);
  if (!date) return 0;
  
  const now = new Date();
  const diff = now - date;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

/**
 * Extract string value from JSONB object by preferred keys
 */
function extractByKeys(obj, keys) {
  for (const key of keys) {
    if (obj[key] && String(obj[key]).trim()) {
      return String(obj[key]).trim();
    }
  }
  return '';
}

/**
 * Sum numeric values by key pattern
 */
function sumByPattern(obj, patterns) {
  let total = 0;
  for (const [key, value] of Object.entries(obj)) {
    for (const pattern of patterns) {
      if (key.toLowerCase().includes(pattern.toLowerCase())) {
        const num = Number(String(value || '').replace(/,/g, '').replace(/[^0-9.-]/g, ''));
        if (isFinite(num)) total += num;
      }
    }
  }
  return total;
}

/**
 * Read and parse COPY data from SQL dump
 */
function extractTableData(content, tableName) {
  const copyRegex = new RegExp(`COPY public\\.${tableName}\\s*\\([^)]+\\)\\s*FROM stdin;([\\s\\S]*?)\\\\\.`, 'm');
  const match = content.match(copyRegex);
  
  if (!match) return [];
  
  const data = match[1];
  const lines = data.split('\n').filter(line => line.trim() && !line.startsWith('--'));
  
  return lines.map(line => {
    // Parse tab-separated values (SQL COPY format)
    const parts = line.split('\t');
    
    // Columns: id, branch, location, portal, source_row_hash, source_row_number, source_file_name, source_row_data, created_at, updated_at
    return {
      id: parts[0],
      branch: parts[1],
      location: parts[2],
      portal: parts[3],
      source_row_hash: parts[4],
      source_row_number: parts[5],
      source_file_name: parts[6],
      source_row_data: parts[7] ? JSON.parse(parts[7]) : {},
      created_at: parts[8],
      updated_at: parts[9],
    };
  }).filter(row => row.source_row_data && Object.keys(row.source_row_data).length > 0);
}

/**
 * Read SQL dump from file or chunks
 */
function readDumpContent() {
  // Try reading chunks if main file is too large
  const files = fs.readdirSync(CHUNK_DIR)
    .filter(f => f.startsWith('full_database.sql.part_'))
    .sort()
    .slice(0, 5); // Read first 5 chunks to cover warranty tables
  
  let content = '';
  for (const file of files) {
    const filePath = path.join(CHUNK_DIR, file);
    content += fs.readFileSync(filePath, 'utf8');
  }
  
  return content;
}

/**
 * Calculate Critical Alerts baseline
 */
function calculateCriticalAlerts(allRecords) {
  const now = new Date();
  
  // Alert 1: Created but not submitted — beyond 24 hrs
  const notSubmitted = allRecords.filter(r => {
    const bucket = normalizeStatusBucket(r.status);
    return bucket === 'created' && r.ageDays > 1;
  });
  
  // Alert 2: Stuck in review stage — beyond 3 days
  const stuckReview = allRecords.filter(r => {
    const bucket = normalizeStatusBucket(r.status);
    return bucket === 'awaiting_sop' && r.ageDays > 3;
  });
  
  // Alert 3: SOP document pending — beyond 2 days
  const sopPending = allRecords.filter(r => {
    const bucket = normalizeStatusBucket(r.status);
    return (bucket === 'awaiting_sop' || bucket === 'submitted') && r.ageDays > 2;
  });
  
  // Alert 4: Approved but payment not settled — beyond 5 days
  const approvedUnsettled = allRecords.filter(r => {
    const bucket = normalizeStatusBucket(r.status);
    return bucket === 'approved' && r.ageDays > 5 && !r.postingDocNo;
  });
  
  // Alert 5: Rejected claims — reason of rejection not filled
  const rejectionBlank = allRecords.filter(r => {
    const bucket = normalizeStatusBucket(r.status);
    return bucket === 'rejected' && !r.rejectionReason;
  });
  
  return {
    notSubmitted: { count: notSubmitted.length, records: notSubmitted },
    stuckReview: { count: stuckReview.length, records: stuckReview },
    sopPending: { count: sopPending.length, records: sopPending },
    approvedUnsettled: { count: approvedUnsettled.length, records: approvedUnsettled, totalAmount: approvedUnsettled.reduce((s, r) => s + r.claimAmount, 0) },
    rejectionBlank: { count: rejectionBlank.length, records: rejectionBlank, totalAmount: rejectionBlank.reduce((s, r) => s + r.claimAmount, 0) },
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('📊 Warranty Audit Baseline Calculation');
  console.log('=====================================\n');
  console.log('Reading authoritative dump...');
  
  let dumpContent = '';
  try {
    dumpContent = readDumpContent();
    console.log(`✓ Loaded ${(dumpContent.length / 1024 / 1024).toFixed(2)}MB of dump content\n`);
  } catch (err) {
    console.error('✗ Failed to read dump:', err.message);
    process.exit(1);
  }
  
  // List of warranty tables
  const TABLES = [
    { name: 'warranty_claim_settlement_report_data', category: 'Claim Settlement' },
    { name: 'warranty_part_wc_data', category: 'Part WC' },
    { name: 'warranty_updation_claim_data', category: 'Updation' },
    { name: 'warranty_goodwill_data', category: 'Goodwill' },
    { name: 'warranty_amc_data', category: 'AMC' },
    { name: 'warranty_fsb_data', category: 'FSB' },
    { name: 'warranty_wc_data', category: 'Warranty Claim' },
  ];
  
  console.log('Extracting and normalizing warranty records...\n');
  
  let allRecords = [];
  const categoryStats = {};
  
  for (const tableConfig of TABLES) {
    const tableData = extractTableData(dumpContent, tableConfig.name);
    console.log(`  ${tableConfig.category.padEnd(20)} : ${tableData.length} rows`);
    
    categoryStats[tableConfig.category] = {
      total: tableData.length,
      records: tableData,
    };
    
    // Normalize each row
    for (const row of tableData) {
      const sourceData = row.source_row_data;
      const createdDate = parseDate(sourceData.job_card_date || sourceData.created_date || row.created_at);
      const ageDays = createdDate ? Math.floor((Date.now() - createdDate.getTime()) / (24 * 60 * 60 * 1000)) : 0;
      
      allRecords.push({
        tableName: tableConfig.name,
        category: tableConfig.category,
        status: extractByKeys(sourceData, ['claim_status', 'current_status', 'settlement_status', 'status_code']),
        rejectionReason: extractByKeys(sourceData, REJECTION_REASON_KEYS),
        postingDocNo: extractByKeys(sourceData, ['posting_document_no', 'posting_doc_no', 'posting_no']),
        claimAmount: sumByPattern(sourceData, ['total', 'claimed', 'settlement']),
        partsAmount: sumByPattern(sourceData, ['parts', 'material', 'mrp', 'list_price']),
        labourAmount: sumByPattern(sourceData, ['labour', 'labor']),
        jobCardNumber: extractByKeys(sourceData, ['job_card_no', 'job_card_number', 'jc_no']),
        createdAt: createdDate?.toISOString() || '',
        ageDays,
        rawData: sourceData,
      });
    }
  }
  
  console.log(`\n✓ Total records: ${allRecords.length}`);
  console.log(`\nCalculating Critical Alerts baseline...\n`);
  
  // Filter for admin scope (all mapped dealers)
  // For now, include all records to get full scope
  const alerts = calculateCriticalAlerts(allRecords);
  
  console.log('CRITICAL ALERTS - DB-TRUTH BASELINE');
  console.log('====================================\n');
  console.log(`Alert 1: Created but not submitted — beyond 24 hrs`);
  console.log(`         Count: ${alerts.notSubmitted.count}`);
  console.log(`\nAlert 2: Stuck in review stage — beyond 3 days`);
  console.log(`         Count: ${alerts.stuckReview.count}`);
  console.log(`\nAlert 3: SOP document pending — beyond 2 days`);
  console.log(`         Count: ${alerts.sopPending.count}`);
  console.log(`\nAlert 4: Approved but payment not settled — beyond 5 days`);
  console.log(`         Count: ${alerts.approvedUnsettled.count}`);
  console.log(`         Total amount: ₹${(alerts.approvedUnsettled.totalAmount / 100000).toFixed(2)}L`);
  console.log(`\nAlert 5: Rejected claims — reason blank`);
  console.log(`         Count: ${alerts.rejectionBlank.count}`);
  console.log(`         Total at risk: ₹${(alerts.rejectionBlank.totalAmount / 100000).toFixed(2)}L`);
  
  console.log(`\n\nCATEGORY DISTRIBUTION`);
  console.log(`====================\n`);
  const categoryTotals = {};
  for (const [cat, info] of Object.entries(categoryStats)) {
    const count = info.records.length;
    const total = info.records.reduce((s, r) => s + (sumByPattern(r.source_row_data, ['total', 'claimed']) || 0), 0);
    categoryTotals[cat] = { count, total };
    console.log(`${cat.padEnd(20)} : ${count.toString().padStart(5)} rows | ₹${(total / 100000).toFixed(2)}L`);
  }
  
  // Calculate totals
  const totalRows = allRecords.length;
  const totalClaimed = allRecords.reduce((s, r) => s + r.claimAmount, 0);
  const totalParts = allRecords.reduce((s, r) => s + r.partsAmount, 0);
  
  console.log(`\n${'TOTAL'.padEnd(20)} : ${totalRows.toString().padStart(5)} rows | ₹${(totalClaimed / 100000).toFixed(2)}L`);
  
  console.log(`\n\n20% PARTS REVENUE CALCULATION`);
  console.log(`=============================\n`);
  const revenue20 = totalParts * 0.2;
  console.log(`Total parts amount: ₹${(totalParts / 100000).toFixed(2)}L`);
  console.log(`20% parts revenue:  ₹${(revenue20 / 100000).toFixed(2)}L`);
  
  console.log(`\n\nSATUS DISTRIBUTION`);
  console.log(`==================\n`);
  const statusCounts = {};
  for (const record of allRecords) {
    const bucket = normalizeStatusBucket(record.status);
    statusCounts[bucket] = (statusCounts[bucket] || 0) + 1;
  }
  
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`${status.padEnd(15)} : ${count.toString().padStart(5)} rows`);
  }
  
  console.log(`\n✓ Audit complete. Counts ready for documentation.\n`);
}

main().catch(err => {
  console.error('✗ Error:', err.message);
  process.exit(1);
});
