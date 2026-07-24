-- Rename disposition already_renewed_unknown → policy_done (UI: Policy Done)

UPDATE public.insurance_renewal_assignments
SET status = 'policy_done', updated_at = now()
WHERE status = 'already_renewed_unknown';
