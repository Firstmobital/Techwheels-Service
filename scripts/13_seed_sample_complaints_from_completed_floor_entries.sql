-- ============================================================================
-- SAMPLE COMPLAINT SEED (MANUAL RUN)
-- Source scope: service_reception_entries linked to technician_assignments(work_status='completed')
-- Purpose: create a few complaint records so /complaints and /c/:token UI are not blank
-- Authority: local_folder/backups/full_database.sql (via chunks mirror)
-- ============================================================================
-- Notes:
-- 1) This script is idempotent for tickets by reception_entry_id (UNIQUE constraint).
-- 2) It does NOT delete or modify existing complaint data.
-- 3) Run manually in Supabase SQL Editor when you want sample rows.

BEGIN;

CREATE TEMP TABLE seeded_complaint_links (
  complaint_id bigint,
  reception_entry_id bigint,
  dealer_code text,
  token text
) ON COMMIT DROP;

WITH completed_entries AS (
  SELECT
    sre.id AS reception_entry_id,
    sre.dealer_code,
    sre.reg_number,
    sre.model,
    sre.jc_number,
    sre.service_type,
    sre.branch,
    sre.owner_name,
    sre.owner_phone
  FROM public.service_reception_entries sre
  JOIN public.technician_assignments ta
    ON ta.job_card_number = sre.jc_number
  WHERE lower(btrim(ta.work_status)) = 'completed'
),
seed_candidates AS (
  SELECT ce.*
  FROM completed_entries ce
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.complaint_tickets ct
    WHERE ct.reception_entry_id = ce.reception_entry_id
  )
  ORDER BY ce.reception_entry_id DESC
  LIMIT 8
),
inserted_tickets AS (
  INSERT INTO public.complaint_tickets (
    dealer_code,
    reception_entry_id,
    reg_number,
    model,
    jc_number,
    service_type,
    branch,
    customer_name,
    customer_phone,
    category,
    title,
    description,
    severity_self,
    priority,
    status,
    channel
  )
  SELECT
    sc.dealer_code,
    sc.reception_entry_id,
    sc.reg_number,
    sc.model,
    sc.jc_number,
    sc.service_type,
    sc.branch,
    COALESCE(NULLIF(btrim(sc.owner_name), ''), 'Customer'),
    sc.owner_phone,
    'service_quality',
    'Post-service feedback issue (' || COALESCE(sc.jc_number, 'NO-JC') || ')',
    'Sample complaint seeded for UI verification from completed floor-incharge entry.',
    'medium',
    'medium',
    'new',
    'web_link'
  FROM seed_candidates sc
  ON CONFLICT (reception_entry_id) DO NOTHING
  RETURNING id, dealer_code, reception_entry_id, customer_name
),
inserted_links AS (
  INSERT INTO public.complaint_access_links (
    dealer_code,
    reception_entry_id,
    token,
    status,
    complaint_id,
    consumed_at,
    view_count
  )
  SELECT
    it.dealer_code,
    it.reception_entry_id,
    substring(md5(random()::text || clock_timestamp()::text || it.reception_entry_id::text) FROM 1 FOR 24),
    'consumed',
    it.id,
    now(),
    0
  FROM inserted_tickets it
  ON CONFLICT (reception_entry_id) DO UPDATE
  SET
    complaint_id = EXCLUDED.complaint_id,
    status = 'consumed',
    consumed_at = COALESCE(public.complaint_access_links.consumed_at, EXCLUDED.consumed_at)
  RETURNING complaint_id, reception_entry_id, dealer_code, token
),
persisted_links AS (
  INSERT INTO seeded_complaint_links (
    complaint_id,
    reception_entry_id,
    dealer_code,
    token
  )
  SELECT
    il.complaint_id,
    il.reception_entry_id,
    il.dealer_code,
    il.token
  FROM inserted_links il
  RETURNING complaint_id
),
inserted_messages AS (
  INSERT INTO public.complaint_messages (
    dealer_code,
    complaint_id,
    author_type,
    author_name,
    body,
    is_internal
  )
  SELECT
    it.dealer_code,
    it.id,
    'customer',
    it.customer_name,
    'This is a sample complaint message seeded for UI testing.',
    false
  FROM inserted_tickets it
  RETURNING complaint_id
),
inserted_activity AS (
  INSERT INTO public.complaint_activity (
    dealer_code,
    complaint_id,
    event_type,
    actor_type,
    actor_name,
    note
  )
  SELECT
    it.dealer_code,
    it.id,
    'raised',
    'customer',
    it.customer_name,
    'Seeded sample complaint from completed floor-incharge entry'
  FROM inserted_tickets it
  RETURNING complaint_id
)
SELECT
  (SELECT COUNT(*) FROM seed_candidates) AS candidate_rows,
  (SELECT COUNT(*) FROM inserted_tickets) AS tickets_inserted,
  (SELECT COUNT(*) FROM persisted_links) AS links_upserted,
  (SELECT COUNT(*) FROM inserted_messages) AS messages_inserted,
  (SELECT COUNT(*) FROM inserted_activity) AS activity_inserted;

-- Quick link output for testing /c/:token
SELECT
  il.reception_entry_id,
  il.complaint_id,
  il.token,
  'https://tw.care/c/' || il.token AS customer_url
FROM seeded_complaint_links il
ORDER BY il.reception_entry_id DESC;

COMMIT;
