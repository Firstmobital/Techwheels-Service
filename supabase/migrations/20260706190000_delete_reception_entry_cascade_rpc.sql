-- delete_reception_entry_cascade(p_id bigint) → jsonb
--
-- Safely deletes a service_reception_entries row and all its dependents
-- in the correct order, with a guard on bodyshop repair cards that have
-- real DMS work in progress.
--
-- Return value (jsonb):
--   {
--     "deleted_id": <bigint>,
--     "estimate_storage_path": <text|null>,     -- SA estimate file to remove from bucket
--     "invoice_storage_path":  <text|null>,     -- SA invoice file to remove from bucket
--     "intake_photo_paths":    <text[]>          -- bodyshop intake photos to remove from bucket
--   }
--
-- Block condition:
--   bodyshop_repair_cards row exists WHERE reception_entry_id = p_id
--   AND upper(btrim(job_card_no)) != upper(btrim(reg_number))
--   → real DMS job card assigned; deletion is not safe
--
-- Safe condition:
--   bodyshop_repair_cards row exists WHERE reception_entry_id = p_id
--   AND upper(btrim(job_card_no)) = upper(btrim(reg_number))
--   → card was created with reg_number as placeholder; no real work; delete it
--   (cascades to bodyshop_assignments, bodyshop_intake_vehicle_photos,
--    bodyshop_repair_card_documents, bodyshop_stage_worklist_projection)
--
-- Deletion order:
--   1. Collect bodyshop_intake_vehicle_photos storage paths (before cascade wipes rows)
--   2. DELETE bodyshop_repair_cards (if safe) → cascades 4 child tables
--   3. DELETE technician_assignments, job_card_support_assignments,
--              bodyshop_floor_support_assignments WHERE job_card_number = jc_number
--   4. DELETE service_reception_entries
--      → FK cascades: complaint_access_links (CASCADE), complaint_tickets (CASCADE),
--                     bodyshop_intake_vehicle_photos (CASCADE — already gone if repair card deleted),
--                     bodyshop_assignments (SET NULL — already gone if repair card deleted),
--                     bodyshop_repair_card_documents (SET NULL — already gone if repair card deleted)
--
-- All steps run inside a single transaction (plpgsql is transactional by default).

CREATE OR REPLACE FUNCTION public.delete_reception_entry_cascade(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_jc_number              text;
  v_reg_number             text;
  v_estimate_storage_path  text;
  v_invoice_storage_path   text;
  v_repair_card_id         integer;
  v_repair_card_job_card_no text;
  v_repair_card_reg_number  text;
  v_intake_photo_paths     text[];
BEGIN
  -- ── Step 1: Fetch the reception entry ────────────────────────────────────
  SELECT
    jc_number,
    reg_number,
    estimate_storage_path,
    invoice_storage_path
  INTO
    v_jc_number,
    v_reg_number,
    v_estimate_storage_path,
    v_invoice_storage_path
  FROM public.service_reception_entries
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reception entry % not found', p_id;
  END IF;

  -- ── Step 2: bodyshop_repair_cards guard ──────────────────────────────────
  SELECT id, job_card_no, reg_number
  INTO v_repair_card_id, v_repair_card_job_card_no, v_repair_card_reg_number
  FROM public.bodyshop_repair_cards
  WHERE reception_entry_id = p_id
  LIMIT 1;

  IF FOUND THEN
    -- Block if a real DMS job card number has been assigned
    -- (job_card_no ≠ reg_number means the SA entered an actual JC number)
    IF upper(btrim(v_repair_card_job_card_no)) IS DISTINCT FROM
       upper(btrim(COALESCE(v_repair_card_reg_number, '')))
       AND btrim(v_repair_card_job_card_no) <> ''
    THEN
      RAISE EXCEPTION
        'Cannot delete: bodyshop repair card has a DMS job card assigned (%). Complete or cancel the bodyshop repair before deleting this entry.',
        v_repair_card_job_card_no;
    END IF;

    -- Safe to delete — collect intake photo Storage paths before cascade wipes rows
    SELECT array_agg(storage_path)
    INTO v_intake_photo_paths
    FROM public.bodyshop_intake_vehicle_photos
    WHERE repair_card_id = v_repair_card_id;

    -- Delete repair card — cascades to:
    --   bodyshop_assignments, bodyshop_intake_vehicle_photos,
    --   bodyshop_repair_card_documents, bodyshop_stage_worklist_projection
    DELETE FROM public.bodyshop_repair_cards WHERE id = v_repair_card_id;
  END IF;

  -- ── Step 3: Delete loose jc_number references ────────────────────────────
  IF v_jc_number IS NOT NULL AND btrim(v_jc_number) <> '' THEN
    DELETE FROM public.technician_assignments
    WHERE job_card_number = v_jc_number;

    DELETE FROM public.job_card_support_assignments
    WHERE job_card_number = v_jc_number;

    DELETE FROM public.bodyshop_floor_support_assignments
    WHERE job_card_number = v_jc_number;
  END IF;

  -- ── Step 4: Delete the reception entry ───────────────────────────────────
  -- FK cascades handle remaining dependents:
  --   complaint_access_links  → ON DELETE CASCADE  (migration 20260706170000)
  --   complaint_tickets        → ON DELETE CASCADE  (migration 20260706170000)
  --   bodyshop_intake_vehicle_photos → ON DELETE CASCADE (already gone if repair card was deleted)
  --   bodyshop_assignments     → ON DELETE SET NULL (already gone if repair card was deleted)
  --   bodyshop_repair_card_documents → ON DELETE SET NULL (already gone if repair card deleted)
  DELETE FROM public.service_reception_entries WHERE id = p_id;

  -- ── Step 5: Return Storage paths for client-side bucket cleanup ──────────
  RETURN jsonb_build_object(
    'deleted_id',             p_id,
    'estimate_storage_path',  v_estimate_storage_path,
    'invoice_storage_path',   v_invoice_storage_path,
    'intake_photo_paths',     COALESCE(to_jsonb(v_intake_photo_paths), '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.delete_reception_entry_cascade(bigint) IS
  'Deletes a service_reception_entries row and all dependents in safe order. '
  'Blocks if a bodyshop repair card with a real DMS job card number exists. '
  'Returns storage paths for client-side bucket cleanup.';

-- Grant to authenticated only (anon must not be able to delete entries)
REVOKE ALL ON FUNCTION public.delete_reception_entry_cascade(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_reception_entry_cascade(bigint) TO authenticated;
