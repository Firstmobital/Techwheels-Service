import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://tnakgaoqyumgfxklkujl.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('Error: SUPABASE_KEY or SUPABASE_ANON_KEY environment variable required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const STATUS_KEYWORDS = {
  rejected: ['reject', 'cancelled', 'not validated'],
  settled: ['settled', 'paid', 'closed'],
  approved: ['approved'],
  awaiting_sop: ['sop', 'review', 'await', 'accepted', 'sent to tm'],
  submitted: ['submit', 'under change'],
};

/**
 * Normalize status text to bucket
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
 * Parse date string to Date object
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  const text = String(dateStr).trim();
  if (!text) return null;
  
  // Try DD/MM/YYYY format
  const match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const hours = Number(match[4] || 0);
    const mins = Number(match[5] || 0);
    
    const date = new Date(Date.UTC(year, month, day, hours, mins));
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try direct parse
  const direct = new Date(text);
  if (!isNaN(direct.getTime())) return direct;
  
  return null;
}

/**
 * Extract string value from JSONB object
 */
function extractByKeys(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
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
  if (!obj || typeof obj !== 'object') return 0;
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
 * Fetch all rows from a warranty table
 */
async function fetchTableData(tableName, category) {
  let allData = [];
  let from = 0;
  const pageSize = 1000;
  
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(tableName)
      .select('id, branch, location, portal, source_file_name, source_row_data, created_at')
      .order('id', { ascending: true })
      .range(from, to);
    
    if (error) {
      console.error(`Error fetching ${tableName}:`, error.message);
      throw error;
    }
    
    allData = allData.concat(data || []);
    
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  
  return { tableName, category, data: allData };
}

/**
 * Normalize warranty record
 */
function normalizeRecord(row, category, tableName) {
  const source = row.source_row_data || {};
  const createdDate = parseDate(source.job_card_date || source.created_date || row.created_at);
  const ageDays = createdDate ? Math.floor((Date.now() - createdDate.getTime()) / (24 * 60 * 60 * 1000)) : 0;
  
  return {
    category,
    tableName,
    status: extractByKeys(source, ['claim_status', 'current_status', 'settlement_status', 'status_code']),
    rejectionReason: extractByKeys(source, ['rejection_reason', 'reason_for_rejection', 'vcm_remarks', 'remarks']),
    postingDocNo: extractByKeys(source, ['posting_document_no', 'posting_doc_no', 'posting_no']),
    claimAmount: sumByPattern(source, ['total', 'claimed', 'settlement']),
    partsAmount: sumByPattern(source, ['parts', 'material', 'mrp', 'list_price']),
    labourAmount: sumByPattern(source, ['labour', 'labor']),
    jobCardNumber: extractByKeys(source, ['job_card_no', 'job_card_number', 'jc_no']),
    createdAt: createdDate?.toISOString() || '',
    ageDays,
  };
}

/**
 * Calculate Critical Alerts baseline
 */
function calculateCriticalAlerts(allRecords) {
  const notSubmitted = allRecords.filter(r => {
    const bucket = normalizeStatusBucket(r.status);
    return bucket === 'created' && r.ageDays > 1;
  });
  
  const stuckReview = allRecords.filter(r => {
    const bucket = normalizeStatusBucket(r.status);
    return bucket === 'awaiting_sop' && r.ageDays > 3;
  });
  
  const sopPending = allRecords.filter(r => {
    const bucket = normalizeStatusBucket(r.status);
    return (bucket === 'awaiting_sop' || bucket === 'submitted') && r.ageDays > 2;
  });
  
  const approvedUnsettled = allRecords.filter(r => {
    const bucket = normalizeStatusBucket(r.status);
    return bucket === 'approved' && r.ageDays > 5 && !r.postingDocNo;
  });
  
  const rejectionBlank = allRecords.filter(r => {
    const bucket = normalizeStatusBucket(r.status);
    return bucket === 'rejected' && !r.rejectionReason;
  });
  
  return {
    notSubmitted: { count: notSubmitted.length },
    stuckReview: { count: stuckReview.length },
    sopPending: { count: sopPending.length },
    approvedUnsettled: {
      count: approvedUnsettled.length,
      totalAmount: approvedUnsettled.reduce((s, r) => s + r.claimAmount, 0),
    },
    rejectionBlank: {
      count: rejectionBlank.length,
      totalAmount: rejectionBlank.reduce((s, r) => s + r.claimAmount, 0),
    },
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('📊 Warranty DB-Truth Audit');
  console.log('==========================\n');
  
  const TABLES = [
    { name: 'warranty_claim_settlement_report_data', category: 'Claim Settlement' },
    { name: 'warranty_part_wc_data', category: 'Part WC' },
    { name: 'warranty_updation_claim_data', category: 'Updation' },
    { name: 'warranty_goodwill_data', category: 'Goodwill' },
    { name: 'warranty_amc_data', category: 'AMC' },
    { name: 'warranty_fsb_data', category: 'FSB' },
    { name: 'warranty_wc_data', category: 'Warranty Claim' },
  ];
  
  console.log('Fetching warranty records...\n');
  
  let allRecords = [];
  const categoryStats = {};
  
  for (const table of TABLES) {
    try {
      const result = await fetchTableData(table.name, table.category);
      const count = result.data.length;
      console.log(`  ${table.category.padEnd(20)} : ${count} rows`);
      
      categoryStats[table.category] = count;
      
      for (const row of result.data) {
        const normalized = normalizeRecord(row, table.category, table.name);
        allRecords.push(normalized);
      }
    } catch (err) {
      console.error(`  ✗ ${table.category} : Error - ${err.message}`);
    }
  }
  
  console.log(`\n✓ Total records loaded: ${allRecords.length}\n`);
  
  if (allRecords.length === 0) {
    console.error('No records found. Check database connection.');
    process.exit(1);
  }
  
  // Calculate baselines
  const alerts = calculateCriticalAlerts(allRecords);
  
  const totalClaimed = allRecords.reduce((s, r) => s + r.claimAmount, 0);
  const totalParts = allRecords.reduce((s, r) => s + r.partsAmount, 0);
  const revenue20 = totalParts * 0.2;
  
  // Status distribution
  const statusCounts = {};
  for (const record of allRecords) {
    const bucket = normalizeStatusBucket(record.status);
    statusCounts[bucket] = (statusCounts[bucket] || 0) + 1;
  }
  
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
  
  console.log(`\n\nFINANCIAL METRICS`);
  console.log(`==================\n`);
  console.log(`Total claimed amount: ₹${(totalClaimed / 100000).toFixed(2)}L`);
  console.log(`Total parts amount:   ₹${(totalParts / 100000).toFixed(2)}L`);
  console.log(`20% parts revenue:    ₹${(revenue20 / 100000).toFixed(2)}L`);
  
  console.log(`\n\nSTATUS DISTRIBUTION`);
  console.log(`====================\n`);
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`${status.padEnd(15)} : ${count.toString().padStart(5)} rows`);
  }
  
  console.log(`\n\nCATEGORY BREAKDOWN`);
  console.log(`==================\n`);
  for (const [cat, count] of Object.entries(categoryStats)) {
    console.log(`${cat.padEnd(20)} : ${count.toString().padStart(5)} rows`);
  }
  
  console.log(`\n✓ Audit complete.\n`);
  
  // Output JSON for easy parsing
  console.log('JSON OUTPUT:');
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    totalRecords: allRecords.length,
    criticalAlerts: alerts,
    financial: {
      totalClaimed,
      totalParts,
      revenue20,
    },
    statusDistribution: statusCounts,
    categoryBreakdown: categoryStats,
  }, null, 2));
}

main().catch(err => {
  console.error('✗ Error:', err.message);
  process.exit(1);
});
