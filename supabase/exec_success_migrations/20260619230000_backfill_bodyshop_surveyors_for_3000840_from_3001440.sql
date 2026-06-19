BEGIN;

-- Data fix (not RBAC): SURVEY users mapped to dealer 3000840 see no surveyor rows
-- because current master data exists under dealer 3001440.
-- This backfill copies missing surveyors from 3001440 -> 3000840 idempotently.

INSERT INTO public.settings_bodyshop_surveyors (
  dealer_code,
  surveyor_name,
  surveyor_contact_number,
  surveyor_email,
  created_by
)
SELECT
  '3000840' AS dealer_code,
  s.surveyor_name,
  s.surveyor_contact_number,
  s.surveyor_email,
  COALESCE(auth.jwt() ->> 'email', auth.uid()::text, 'system') AS created_by
FROM public.settings_bodyshop_surveyors s
WHERE UPPER(BTRIM(COALESCE(s.dealer_code, ''))) = '3001440'
  AND NOT EXISTS (
    SELECT 1
    FROM public.settings_bodyshop_surveyors d
    WHERE UPPER(BTRIM(COALESCE(d.dealer_code, ''))) = '3000840'
      AND UPPER(BTRIM(COALESCE(d.surveyor_name, ''))) = UPPER(BTRIM(COALESCE(s.surveyor_name, '')))
      AND UPPER(BTRIM(COALESCE(d.surveyor_contact_number, ''))) = UPPER(BTRIM(COALESCE(s.surveyor_contact_number, '')))
  );

COMMIT;
