# VAS Revenue Report Deduplication Fix

**Date:** 29 May 2026  
**Issue:** VAS Revenue Report was counting duplicate job cards  
**Solution:** Deduplicate job cards, count each unique job card only once

## Problem
The VAS Revenue Report was counting multiple VAS services on the same job card as separate jobs. For example:
- Job Card #001 with 3 VAS services (Engine Coating + AC Disinfection + Service Plus) = 3 jobs in report ❌
- Should be = 1 unique job ✅

## Root Cause
In `src/lib/reportQueries.ts`:
- `getVasRevenueReport()` was incrementing `jobCount` for every row in `service_vas_jc_data`
- `getVasRevenueData()` was not deduplicating at all
- Multiple VAS services per job card got counted as multiple jobs

## Solution Implemented

### 1. **getVasRevenueReport()** (Line 1853)
Changed from counting all rows to tracking unique job cards per service type:
```typescript
// BEFORE: jobCount incremented for every row
totalJobs += 1  // ❌ Wrong

// AFTER: Track unique job cards using Set
const globalUniqueJobCards = new Set<string>()
uniqueJobCards: Set<string>  // In grouped map

// For each row, add job card to set:
globalUniqueJobCards.add(jobCardNumber)
existing.uniqueJobCards.add(jobCardNumber)

// Final count is set size:
const totalJobs = globalUniqueJobCards.size  // ✅ Unique count
```

### 2. **getVasRevenueData()** (Line 1937)
Deduplicate by job card and merge revenues:
```typescript
// Build map keyed by normalized job card number
const deduplicatedMap = new Map<string, VasRevenueDataRow>()

for (const row of mappedRows) {
  const jcKey = row.jobCardNumber.toLowerCase().trim()
  
  // Accumulate revenue for same job card
  const existing = deduplicatedMap.get(jcKey)
  if (existing) {
    existing.netPrice += row.netPrice  // ✅ Merge revenue
  } else {
    deduplicatedMap.set(jcKey, { ...row })
  }
}

// Return only unique job cards
const uniqueJobCards = Array.from(deduplicatedMap.values())
return { jobCount: uniqueJobCards.length, rows: uniqueJobCards }
```

## Impact
- **Total VAS Count** now shows unique job cards, not duplicate services
- **Avg Revenue / Job** is now accurate (total revenue ÷ unique jobs)
- **Job-based reports** are no longer inflated by multiple VAS services

## Files Modified
- `src/lib/reportQueries.ts`
  - Lines 1853-1920: `getVasRevenueReport()` deduplication
  - Lines 1937-2000: `getVasRevenueData()` deduplication

## Testing
1. Upload VAS file with jobs having multiple services per card
2. View VAS Revenue Report
3. Verify "Total VAS Count" = number of **unique job cards**, not service count
4. Verify "Avg Revenue / Job" calculation matches (Total Revenue ÷ Unique Jobs)

## Example
| Job Card | Services | Before | After |
|----------|----------|--------|-------|
| JC-001 | Engine Coating + AC Disin | 2 jobs | 1 job ✅ |
| JC-002 | Service Plus | 1 job | 1 job |
| JC-003 | 3 VAS services | 3 jobs | 1 job ✅ |
| **Total** | | **6 jobs** | **3 jobs ✅** |
