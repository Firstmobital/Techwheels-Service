# Visual Guide: Next-Day Upload Logic

## Problem Visualization

```
DAY 1: Initial Upload
┌─────────────────────────────────────┐
│ Excel File: vas_data.xlsx           │
├─────────────────────────────────────┤
│ JC#  | SR Type          | Amount    │
│ 101  | General Service  | 5000      │
│ 102  | Major Service    | 8000      │
│ 103  | AC Service       | 3000      │
└─────────────────────────────────────┘
          ↓ Upload
    ┌─────────────────┐
    │  app.vercel.app │
    │  Import Upload  │
    └─────────────────┘
          ↓
    Database (Supabase)
    ┌─────────────────────────────────────┐
    │ service_vas_jc_data                 │
    ├─────────────────────────────────────┤
    │ JC#  | SR Type      | Amount | Date │
    │ 101  | Gen Svc      | 5000   | 5/27 │
    │ 102  | Major Svc    | 8000   | 5/27 │
    │ 103  | AC Svc       | 3000   | 5/27 │
    └─────────────────────────────────────┘
            ✓ Success: 3 rows inserted


DAY 2: Re-upload with Updates (CURRENT PROBLEM)
┌─────────────────────────────────────┐
│ Excel File: vas_data.xlsx           │
├─────────────────────────────────────┤
│ JC#  | SR Type          | Amount    │
│ 101  | General Service  | 5500 ← UPDATED │
│ 102  | Major Service    | 8000      │
│ 103  | AC Service       | 3000      │
│ 104  | Inspection       | 2500 ← NEW     │
└─────────────────────────────────────┘
          ↓ Upload
    ┌──────────────────┐
    │  app.vercel.app  │
    │ INSERT command   │
    └──────────────────┘
          ↓
    ✗ ERROR: Duplicate Key!
    (JC 101, 102, 103 already exist)
    
    OR (if error handling loose)
    
    Database (Supabase) - NOW BROKEN
    ┌──────────────────────────────────────┐
    │ service_vas_jc_data                  │
    ├──────────────────────────────────────┤
    │ JC#  | SR Type      | Amount | Date  │
    │ 101  | Gen Svc      | 5000   | 5/27  │ ← Old
    │ 101  | Gen Svc      | 5500   | 5/27  │ ← New (DUPLICATE!)
    │ 102  | Major Svc    | 8000   | 5/27  │
    │ 103  | AC Svc       | 3000   | 5/27  │
    │ 104  | Inspection   | 2500   | 5/28  │
    └──────────────────────────────────────┘
    ✗ 5 rows (should be 4)
    ✗ JC 101 appears twice
    ✗ Reports will be wrong
```

---

## Solution: UPSERT with Natural Keys

```
DAY 1: Initial Upload (SAME AS BEFORE)
┌─────────────────────────────────────┐
│ Excel File: vas_data.xlsx           │
│ JC# 101, 102, 103                   │
└─────────────────────────────────────┘
          ↓
    ┌──────────────────┐
    │ UPSERT command   │ ← Different!
    │ Natural Key:     │
    │ (JC#, Branch,    │
    │  SR Type)        │
    └──────────────────┘
          ↓
    ┌─────────────────────────────────────┐
    │ service_vas_jc_data                 │
    ├─────────────────────────────────────┤
    │ JC#  | Branch | SR Type   | Amount  │
    │ 101  | Ajmer  | Gen Svc   | 5000    │
    │ 102  | Ajmer  | Major Svc | 8000    │
    │ 103  | Ajmer  | AC Svc    | 3000    │
    └─────────────────────────────────────┘
    ✓ Success: 3 rows


DAY 2: Re-upload with Updates (FIXED)
┌─────────────────────────────────────┐
│ Excel File: vas_data.xlsx           │
│ JC# 101 (5500), 102, 103, 104 (NEW) │
└─────────────────────────────────────┘
          ↓
    ┌──────────────────┐
    │ UPSERT command   │
    │ Check natural    │
    │ key exists?      │
    └──────────────────┘
          ↓
    ┌──────────────────────────────────┐
    │ For JC 101:                      │
    │ (JC=101, Branch=Ajmer, SR=GenSvc)│
    │ EXISTS? YES → UPDATE ✓           │
    │                                  │
    │ For JC 104:                      │
    │ (JC=104, Branch=Ajmer, SR=Insp)  │
    │ EXISTS? NO → INSERT ✓            │
    └──────────────────────────────────┘
          ↓
    ┌─────────────────────────────────────┐
    │ service_vas_jc_data                 │
    ├─────────────────────────────────────┤
    │ JC#  | Branch | SR Type   | Amount  │
    │ 101  | Ajmer  | Gen Svc   | 5500 ← UPDATED │
    │ 102  | Ajmer  | Major Svc | 8000    │
    │ 103  | Ajmer  | AC Svc    | 3000    │
    │ 104  | Ajmer  | Insp      | 2500 ← NEW     │
    └─────────────────────────────────────┘
    ✓ Success: 4 rows (correct!)
    ✓ JC 101 updated (not duplicated)
    ✓ JC 104 added
```

---

## How Natural Keys Work

```
Natural Key = The unique identifier for a record
Format: (field1, field2, field3, ...)

Example: VAS Table
┌────────────────────────────────────┐
│ Natural Key Components:            │
├────────────────────────────────────┤
│ 1. job_card_number (101)           │
│ 2. branch (Ajmer)                  │
│ 3. sr_type (General Service)       │
└────────────────────────────────────┘
    ↓ Combination is UNIQUE
(101, Ajmer, General Service)

This means:
✓ Same JC in DIFFERENT branch = Different record
✓ Same JC, Different SR type = Different record
✓ Same JC, SAME branch, SAME SR type = Same record


┌─────────────────────────────────────┐
│ Example: Multiple records OK        │
├─────────────────────────────────────┤
│ (101, Ajmer,   Gen Svc)  ← Record 1 │
│ (101, Sitapura Gen Svc)  ← Record 2 (different branch) │
│ (101, Ajmer,   Major Svc) ← Record 3 (different service) │
│ (102, Ajmer,   Gen Svc)  ← Record 4 (different JC) │
└─────────────────────────────────────┘
All are unique, no conflict!
```

---

## Date Fallback Logic

```
User uploads file with missing invoice_date
┌───────────────────────────────────┐
│ Excel Column: invoice_date        │
│ Value: [EMPTY]                    │
└───────────────────────────────────┘
          ↓ Check fallback chain
┌───────────────────────────────────┐
│ Fallback 1: closed_date_time?     │
│ Value: 2026-05-27                 │
│ Result: ✓ Use this!              │
└───────────────────────────────────┘

If closed_date_time also empty:
┌───────────────────────────────────┐
│ Fallback 2: created_date_time?    │
│ Value: 2026-05-26                 │
│ Result: ✓ Use this!              │
└───────────────────────────────────┘

If all above empty:
┌───────────────────────────────────┐
│ Final Fallback: Today's Date      │
│ Value: 2026-05-28                 │
│ Result: ✓ Use this!              │
└───────────────────────────────────┘

Without Date Fallback:
❌ Upload fails, user must edit file

With Date Fallback:
✓ Upload succeeds, date filled automatically
```

---

## Upsert Algorithm

```
UPSERT Process (Simplified)

Step 1: Check if record exists using natural key
┌─────────────────────────────────────┐
│ SELECT * FROM table                 │
│ WHERE natural_key = (values)        │
│                                     │
│ Example:                            │
│ WHERE job_card_number = 101         │
│   AND branch = 'Ajmer'              │
│   AND sr_type = 'Gen Svc'           │
└─────────────────────────────────────┘

Step 2a: Record FOUND → UPDATE
┌─────────────────────────────────────┐
│ UPDATE table                        │
│ SET amount = 5500                   │
│ WHERE natural_key = (values)        │
│                                     │
│ Old value: 5000 → New value: 5500   │
└─────────────────────────────────────┘

Step 2b: Record NOT FOUND → INSERT
┌─────────────────────────────────────┐
│ INSERT INTO table                   │
│ VALUES (101, Ajmer, Gen Svc, 5500)  │
│                                     │
│ New record created                  │
└─────────────────────────────────────┘

Result: Either way, no error, no duplicate!
```

---

## Flow Diagram: What Happens at Each Step

```
┌────────────────────────────────┐
│ User Uploads Excel File        │
└────────────────┬───────────────┘
                 │
                 ↓
        ┌────────────────────┐
        │ Step 1: Parse File │
        │ Extract rows       │
        │ Map columns        │
        └────────┬───────────┘
                 │
                 ↓
        ┌────────────────────┐
        │ Step 2: Validation │
        │ Check numeric vals │
        │ Check date format  │
        │ Check required cols│
        └────────┬───────────┘
                 │
                 ↓
        ┌────────────────────┐
        │ Step 3: Fallback   │
        │ Fill missing dates │
        │ from related fields│
        └────────┬───────────┘
                 │
                 ↓
        ┌────────────────────┐
        │ Step 4: Lookup     │
        │ Find employee code │
        │ (if applicable)    │
        └────────┬───────────┘
                 │
                 ↓
        ┌────────────────────┐
        │ Step 5: UPSERT     │
        │ Send to Supabase   │
        │ Update or Insert   │
        └────────┬───────────┘
                 │
                 ↓
        ┌────────────────────┐
        │ Result: Success ✓  │
        │ No duplicates      │
        │ Data updated       │
        └────────────────────┘
```

---

## Comparison Table

```
┌──────────────────┬─────────────────┬──────────────────┐
│ Feature          │ Current (INSERT)│ Fixed (UPSERT)   │
├──────────────────┼─────────────────┼──────────────────┤
│ Day 1 upload     │ ✓ Works         │ ✓ Works          │
│ Day 2 same data  │ ✗ Error         │ ✓ Updates        │
│ Day 2 new rows   │ ✗ Error         │ ✓ Inserts new    │
│ Duplicates       │ ✗ Possible      │ ✓ None           │
│ Data conflicts   │ ✗ Manual fix    │ ✓ Auto resolved  │
│ Date fallback    │ ✗ Fails         │ ✓ Works          │
│ Validation       │ ~ Basic         │ ✓ Comprehensive  │
│ Employee lookup  │ ~ VAS only      │ ✓ All tables     │
│ Next-day uploads │ ✗ Not supported │ ✓ Fully supported│
│ User experience  │ ✗ Confusing     │ ✓ Intuitive      │
└──────────────────┴─────────────────┴──────────────────┘
```

---

## Database Schema: Where Keys Go

```
Table: service_vas_jc_data

┌────────────────────────────────────┐
│ Column Name        │ Type   │ Key  │
├────────────────────────────────────┤
│ id                 │ UUID   │ PK   │
│ job_card_number    │ TEXT   │ UK* ← Part of upsert key
│ branch             │ TEXT   │ UK* ← Part of upsert key
│ sr_type            │ TEXT   │ UK* ← Part of upsert key
│ job_value          │ NUMERIC│      │
│ created_date_time  │ TIMESTAMP     │
│ jc_closed_date_time│ TIMESTAMP     │
│ employee_code      │ TEXT   │ FK   │
└────────────────────────────────────┘

UK* = Unique Constraint (enables UPSERT)
      Database must have this constraint defined for UPSERT to work


Constraint Definition (SQL):
CREATE UNIQUE INDEX idx_vas_natural_key ON service_vas_jc_data(
  job_card_number,
  branch,
  sr_type
)
```

---

## Summary

```
3 Key Changes:

1. HEADER MAPPING
   "JC #" → job_card_number
   "Job Value" → job_value
   Works with any Excel column names

2. DATE FALLBACK
   Missing invoice_date?
   → Try closed_date_time
   → Try created_date_time
   → Use today's date
   No more "field required" errors

3. UPSERT with NATURAL KEYS
   Same record?
   → UPDATE with new data
   Different record?
   → INSERT new row
   No duplicates ever!


Result:
✓ Day 1: Upload 10 rows
✓ Day 2: Upload same 10 rows + updates
✓ Day 2: Upload subset + new rows
All scenarios work perfectly!
```
