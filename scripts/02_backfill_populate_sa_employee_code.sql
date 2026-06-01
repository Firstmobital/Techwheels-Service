-- Backfill Script: Populate sa_employee_code and sa_display_name for existing reception entries
-- Purpose: Match sa_name (CRM reference) to employee_code (SA_CODE); cache display name from user signup
-- Date: 2026-06-01
-- NOTE: This script MUST follow successful manual review of diagnostic report
--
-- Strategy:
-- - Identify which user (signup identity) is assigned to each reception entry
-- - Get their employee_code (SA_CODE from CRM via employee_master)
-- - Store employee_code in sa_employee_code (internal reference)
-- - Store user.full_name in sa_display_name (UI display)
-- - Keep sa_name as immutable audit field (CRM SA_NAME)

-- Step 1: Match reception entries to users (via name matching) and populate both fields
UPDATE public.service_reception_entries sre
SET 
  sa_employee_code = em.employee_code,
  sa_display_name = u.full_name,
  updated_at = now()
FROM public.user_employee_links uel
INNER JOIN public.users u ON uel.user_id = u.id
INNER JOIN public.employee_master em ON uel.employee_code = em.employee_code
WHERE uel.is_primary = true
  AND uel.is_active = true
  AND sre.sa_employee_code IS NULL
  AND LOWER(TRIM(sre.sa_name)) = LOWER(TRIM(em.employee_name));

-- Step 2: For any remaining unmatched entries, try direct user lookup by name similarity
-- (in case user_employee_links seeding didn't catch everyone)
UPDATE public.service_reception_entries sre
SET 
  sa_employee_code = em.employee_code,
  sa_display_name = u.full_name,
  updated_at = now()
FROM public.users u
INNER JOIN public.employee_master em 
  ON LOWER(TRIM(u.full_name)) = LOWER(TRIM(em.employee_name))
    OR LOWER(TRIM(SPLIT_PART(u.full_name, ' ', 1))) = LOWER(TRIM(SPLIT_PART(em.employee_name, ' ', 1)))
WHERE sre.sa_employee_code IS NULL 
  AND sre.sa_name IS NOT NULL
  AND LOWER(TRIM(sre.sa_name)) = LOWER(TRIM(em.employee_name));

-- Step 3: Log entries still unresolved (manual mapping required)
SELECT 
  sre.id as reception_id,
  sre.sa_name as crm_sa_name,
  sre.dealer_code,
  'UNRESOLVED_MANUAL_MAPPING_REQUIRED' as status,
  (SELECT STRING_AGG(em.employee_code || ' (' || em.employee_name || ')', ', ')
   FROM public.employee_master em
   WHERE em.role ILIKE '%sa%' OR em.role ILIKE '%service%advisor%'
   LIMIT 5) as potential_employees
FROM public.service_reception_entries sre
WHERE sre.sa_employee_code IS NULL AND sre.sa_name IS NOT NULL
ORDER BY sre.created_at DESC;

-- Step 4: Report backfill coverage
SELECT 
  'BACKFILL_SUMMARY' as metric,
  (SELECT COUNT(*) FROM public.service_reception_entries WHERE sa_employee_code IS NOT NULL)::text as successfully_populated,
  (SELECT COUNT(*) FROM public.service_reception_entries WHERE sa_employee_code IS NULL AND sa_name IS NOT NULL)::text as still_unresolved,
  (SELECT COUNT(*) FROM public.service_reception_entries WHERE sa_name IS NULL)::text as originally_null,
  (SELECT COUNT(*) FROM public.service_reception_entries WHERE sa_display_name IS NOT NULL)::text as display_names_populated;
