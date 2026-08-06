# RECEPTION-002 Revisit Detection — Evidence

Date: 2026-08-06  
Plan: `RECEPTION-002_REVISIT_DETECTION_PLAN_2026-08-06.md`

## Deployment

- Migration `20260806150000_reception_revisit_detection.sql` executed in Supabase SQL editor
- Frontend changes deployed with next app release (local build verified)

## Verification SQL (smoke test)

```sql
-- Should return is_revisit=false for unknown reg
SELECT public.get_reception_revisit_context('TESTREG000');

-- Confirm columns exist
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'service_reception_entries'
  AND column_name IN ('is_revisit', 'prior_reception_entry_id', 'suggested_technician_code', 'suggested_technician_name');
```

## Manual QA checklist

| # | Scenario | Expected | Result | Tester | Date |
|---|----------|----------|--------|--------|------|
| 1 | Second intake within 30d after floor SR + JC visit | Revisit badge, SA prefilled | Pending | | |
| 2 | Prior visit was Accident only | No revisit | Pending | | |
| 3 | Prior visit has no JC# | No revisit | Pending | | |
| 4 | FI loads revisit row with prior technician | Auto-assign when rules pass | Pending | | |
| 5 | Badge on Reception / SA / FI / Technician / Dashboard | Visible | Pending | | |
| 6 | Mobile reception + FI | Same as web | Pending | | |

## Notes

- Revisit is persisted at INSERT/UPDATE OF reg_number via DB trigger (client cannot spoof `is_revisit=false`)
- Technician default runs on Floor Incharge page load when suggested tech passes fuel/location eligibility
