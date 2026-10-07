-- Users mapped with is_active=true but is_primary=false (e.g. RAVI NAYAK / 3000840_599) were invisible to Floor Work login resolver.

UPDATE public.user_employee_links uel
SET is_primary = true,
    updated_at = now()
WHERE uel.is_active = true
  AND NOT uel.is_primary
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_employee_links u2
    WHERE u2.user_id = uel.user_id
      AND u2.is_active = true
      AND u2.is_primary = true
  );
