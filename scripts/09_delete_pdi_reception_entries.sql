-- Keep only reception rows whose latest service_invoice_order_data status is
-- Open / In Process, and delete the rest (manual run only).
--
-- Run this in Supabase SQL Editor.
-- Matching key: jc_number (case/space-insensitive).
-- Latest invoice/order status per JC is chosen by timestamp and id.

BEGIN;

WITH latest_status AS (
	SELECT
		upper(btrim(o.job_card_number)) AS jc_norm,
		upper(btrim(coalesce(o.status, ''))) AS status_norm,
		row_number() OVER (
			PARTITION BY upper(btrim(o.job_card_number))
			ORDER BY coalesce(o.created_date_time, o.updated_at, o.created_at) DESC NULLS LAST,
							 o.id DESC
		) AS rn
	FROM public.service_invoice_order_data o
	WHERE coalesce(nullif(btrim(o.job_card_number), ''), '') <> ''
),
keep_jc AS (
	SELECT jc_norm
	FROM latest_status
	WHERE rn = 1
		AND status_norm IN ('OPEN', 'IN PROCESS', 'INPROCESS', 'IN_PROGRESS')
),
to_delete AS (
	SELECT r.id
	FROM public.service_reception_entries r
	WHERE coalesce(nullif(btrim(r.jc_number), ''), '') = ''
		OR upper(btrim(r.jc_number)) NOT IN (SELECT jc_norm FROM keep_jc)
		OR upper(btrim(coalesce(r.service_type, ''))) = 'ACCIDENT'
)
SELECT count(*) AS rows_marked_for_delete
FROM to_delete;

WITH latest_status AS (
	SELECT
		upper(btrim(o.job_card_number)) AS jc_norm,
		upper(btrim(coalesce(o.status, ''))) AS status_norm,
		row_number() OVER (
			PARTITION BY upper(btrim(o.job_card_number))
			ORDER BY coalesce(o.created_date_time, o.updated_at, o.created_at) DESC NULLS LAST,
							 o.id DESC
		) AS rn
	FROM public.service_invoice_order_data o
	WHERE coalesce(nullif(btrim(o.job_card_number), ''), '') <> ''
),
keep_jc AS (
	SELECT jc_norm
	FROM latest_status
	WHERE rn = 1
		AND status_norm IN ('OPEN', 'IN PROCESS', 'INPROCESS', 'IN_PROGRESS')
)
DELETE FROM public.service_reception_entries r
WHERE coalesce(nullif(btrim(r.jc_number), ''), '') = ''
	OR upper(btrim(r.jc_number)) NOT IN (SELECT jc_norm FROM keep_jc)
	OR upper(btrim(coalesce(r.service_type, ''))) = 'ACCIDENT';

WITH latest_status AS (
	SELECT
		upper(btrim(o.job_card_number)) AS jc_norm,
		upper(btrim(coalesce(o.status, ''))) AS status_norm,
		row_number() OVER (
			PARTITION BY upper(btrim(o.job_card_number))
			ORDER BY coalesce(o.created_date_time, o.updated_at, o.created_at) DESC NULLS LAST,
							 o.id DESC
		) AS rn
	FROM public.service_invoice_order_data o
	WHERE coalesce(nullif(btrim(o.job_card_number), ''), '') <> ''
),
keep_jc AS (
	SELECT jc_norm
	FROM latest_status
	WHERE rn = 1
		AND status_norm IN ('OPEN', 'IN PROCESS', 'INPROCESS', 'IN_PROGRESS')
)
SELECT
	count(*) FILTER (
		WHERE coalesce(nullif(btrim(r.jc_number), ''), '') <> ''
			AND upper(btrim(r.jc_number)) IN (SELECT jc_norm FROM keep_jc)
	) AS reception_rows_kept,
	count(*) FILTER (
		WHERE coalesce(nullif(btrim(r.jc_number), ''), '') = ''
			OR upper(btrim(r.jc_number)) NOT IN (SELECT jc_norm FROM keep_jc)
			OR upper(btrim(coalesce(r.service_type, ''))) = 'ACCIDENT'
	) AS reception_rows_still_not_allowed
FROM public.service_reception_entries r;

COMMIT;
