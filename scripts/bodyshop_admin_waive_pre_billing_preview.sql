-- Preview cards eligible for bodyshop_admin_waive_pre_billing_stages (read-only).
-- Billed + active + stages 1–14 still pending in projection + not yet waived.

SELECT
  c.id,
  c.job_card_no,
  c.reg_number,
  c.received_at::date,
  c.current_stage,
  c.billed_amount,
  c.pre_billing_stages_waived_at,
  array_agg(p.stage_no ORDER BY p.stage_no) FILTER (WHERE p.is_pending AND p.stage_no BETWEEN 1 AND 14) AS pending_1_14
FROM public.bodyshop_repair_cards c
JOIN public.bodyshop_stage_worklist_projection p ON p.repair_card_id = c.id
WHERE c.overall_status = 'active'
  AND public.bodyshop_billing_recorded_for_waiver(c.billed_amount, c.parts_entry_status)
  AND c.pre_billing_stages_waived_at IS NULL
GROUP BY c.id
HAVING count(*) FILTER (WHERE p.is_pending AND p.stage_no BETWEEN 1 AND 14) > 0
ORDER BY c.received_at DESC NULLS LAST, c.id;