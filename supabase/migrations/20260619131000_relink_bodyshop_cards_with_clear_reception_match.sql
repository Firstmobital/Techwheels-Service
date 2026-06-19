-- One-time data remediation: relink historical bodyshop cards that have NULL reception_entry_id.
-- Safety rules:
-- 1) Match by normalized reg_number + location + portal + branch_label.
-- 2) For JC-style bodyshop job_card_no (JC-...), require exact jc_number match too.
-- 3) Only relink cards that have exactly one eligible reception candidate.
-- 4) Skip reception rows already linked by another bodyshop card.

BEGIN;

WITH candidate_pairs AS (
  SELECT
    brc.id AS brc_id,
    sre.id AS sre_id
  FROM public.bodyshop_repair_cards brc
  JOIN public.service_reception_entries sre
    ON upper(trim(coalesce(sre.reg_number, ''))) = upper(trim(coalesce(brc.reg_number, '')))
   AND upper(trim(coalesce(sre.location, ''))) = upper(trim(coalesce(brc.location, '')))
   AND upper(trim(coalesce(sre.portal, ''))) = upper(trim(coalesce(brc.portal, '')))
   AND upper(trim(coalesce(sre.branch_label, ''))) = upper(trim(coalesce(brc.branch_label, '')))
   AND (
     CASE
       WHEN upper(trim(coalesce(brc.job_card_no, ''))) LIKE 'JC-%'
         THEN upper(trim(coalesce(sre.jc_number, ''))) = upper(trim(coalesce(brc.job_card_no, '')))
       ELSE TRUE
     END
   )
  WHERE brc.reception_entry_id IS NULL
    AND lower(trim(coalesce(sre.service_type, ''))) = 'accident'
    AND NOT EXISTS (
      SELECT 1
      FROM public.bodyshop_repair_cards x
      WHERE x.reception_entry_id = sre.id
        AND x.id <> brc.id
    )
),
clear_pairs AS (
  SELECT cp.brc_id, min(cp.sre_id) AS sre_id
  FROM candidate_pairs cp
  GROUP BY cp.brc_id
  HAVING count(*) = 1
),
updated AS (
  UPDATE public.bodyshop_repair_cards brc
  SET reception_entry_id = cp.sre_id,
      updated_at = now()
  FROM clear_pairs cp
  WHERE brc.id = cp.brc_id
  RETURNING brc.id, brc.job_card_no, brc.reg_number, cp.sre_id AS relinked_reception_entry_id
)
SELECT * FROM updated ORDER BY id;

COMMIT;
