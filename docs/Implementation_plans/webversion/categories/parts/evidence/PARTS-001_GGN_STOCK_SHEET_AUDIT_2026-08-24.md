# PARTS-001 GGN Stock Sheet Audit — 2026-08-24

**Source file (not in repo):** `/Users/vkbin/Downloads/Stock Report 24.08.2026.xlsb`  
**Plan:** `docs/Implementation_plans/webversion/categories/parts/active/PARTS-001_SERVICE_ADVISOR_PARTS_ORDER_DATE_AND_GGN_STOCK_PLAN_2026-08-24.md`  
**Status:** Sample-file audit only. Additional user inputs still expected.

## File facts

| Field | Value |
|-------|-------|
| Format | Excel Binary Workbook (`.xlsb`) |
| Size | 2,457,622 bytes |
| Sheets | `Stock Report 24.08.2026`, `Summary` |
| Data sheet range | `A1:P33874` |
| Data rows | 33,873 (plus header) |
| Unique Material (part numbers) | 33,873 — **no duplicates in this sample** |
| Plant (`Plnt`) | `4770` only |
| Storage location (`SLoc`) | `0001` only |

## Header row (authoritative for v1 mapping)

| Col | Header | Role |
|-----|--------|------|
| A | Material | **Primary match key** (part number) |
| B | Plnt | Plant code (`4770` in sample) |
| C | Material Description | Optional description |
| D | SLoc | Storage location |
| E | ABC | Classification |
| F | Bin | Bin |
| G | Unrestricted | Qty (not used for display) |
| H | NDP | Price |
| I | Total Ndp | Value |
| J | Cost | Cost |
| K | Total Cost | Value |
| L | Lot Size | Planning |
| M | Safety Stock | Planning |
| N | Float Qty | Qty |
| O | Actual Qty | Qty |
| P | **Free Stock** | **Stock result source** |

## Column P (`Free Stock`) distribution in this sample

| Condition | Row count |
|-----------|-----------|
| `Free Stock > 0` | 21,211 |
| `Free Stock = 0` | 10,179 |
| `Free Stock < 0` | 2,483 |
| Null / non-numeric | 0 |

Display mapping (locked 2026-08-24 from mockup):

- `Free Stock > 0` → **Available** (21,211 rows in this sample)
- `Free Stock <= 0` (zero or negative) → **Not Available** (12,662 rows in this sample)
- No uploaded sheet, or Material not found → **No Data**

## Parser note

SheetJS `xlsx@0.18.5` (already in the web app) reads this `.xlsb` successfully. Current Import page `accept` is `.xlsx,.xls,.csv` only — GGN upload must add `.xlsb`.
