-- Floor UI inserts a new assignment when the existing shell has no people yet
-- (role map has no row id). That hits uq_bodyshop_assignments_active_job_card.
-- Retire the previous active row and copy its filled columns onto the insert.

CREATE OR REPLACE FUNCTION public.bodyshop_assignments_merge_active_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  old public.bodyshop_assignments%ROWTYPE;
BEGIN
  IF coalesce(NEW.is_active, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO old
  FROM public.bodyshop_assignments
  WHERE is_active = true
    AND upper(btrim(job_card_number)) = upper(btrim(coalesce(NEW.job_card_number, '')))
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.bodyshop_assignments
  SET is_active = false
  WHERE id = old.id;

  NEW.repair_card_id := COALESCE(NEW.repair_card_id, old.repair_card_id);
  NEW.reception_entry_id := COALESCE(NEW.reception_entry_id, old.reception_entry_id);
  NEW.dealer_code := COALESCE(NULLIF(btrim(NEW.dealer_code), ''), old.dealer_code);
  NEW.bs_floor_completed_at := COALESCE(NEW.bs_floor_completed_at, old.bs_floor_completed_at);
  NEW.bs_floor_completed_by := COALESCE(NEW.bs_floor_completed_by, old.bs_floor_completed_by);

  NEW.dentor_employee_code := COALESCE(NEW.dentor_employee_code, old.dentor_employee_code);
  NEW.dentor_employee_name := COALESCE(NEW.dentor_employee_name, old.dentor_employee_name);
  NEW.dentor_work_status := COALESCE(NEW.dentor_work_status, old.dentor_work_status);
  NEW.dentor_in_ts := COALESCE(NEW.dentor_in_ts, old.dentor_in_ts);
  NEW.dentor_remark := COALESCE(NEW.dentor_remark, old.dentor_remark);
  NEW.dentor_out_ts := COALESCE(NEW.dentor_out_ts, old.dentor_out_ts);
  NEW.dentor_completed_by := COALESCE(NEW.dentor_completed_by, old.dentor_completed_by);

  NEW.painter_employee_code := COALESCE(NEW.painter_employee_code, old.painter_employee_code);
  NEW.painter_employee_name := COALESCE(NEW.painter_employee_name, old.painter_employee_name);
  NEW.painter_work_status := COALESCE(NEW.painter_work_status, old.painter_work_status);
  NEW.painter_in_ts := COALESCE(NEW.painter_in_ts, old.painter_in_ts);
  NEW.painter_remark := COALESCE(NEW.painter_remark, old.painter_remark);
  NEW.painter_out_ts := COALESCE(NEW.painter_out_ts, old.painter_out_ts);
  NEW.painter_completed_by := COALESCE(NEW.painter_completed_by, old.painter_completed_by);

  NEW.technician_employee_code := COALESCE(NEW.technician_employee_code, old.technician_employee_code);
  NEW.technician_employee_name := COALESCE(NEW.technician_employee_name, old.technician_employee_name);
  NEW.technician_work_status := COALESCE(NEW.technician_work_status, old.technician_work_status);
  NEW.technician_in_ts := COALESCE(NEW.technician_in_ts, old.technician_in_ts);
  NEW.technician_remark := COALESCE(NEW.technician_remark, old.technician_remark);
  NEW.technician_out_ts := COALESCE(NEW.technician_out_ts, old.technician_out_ts);
  NEW.technician_completed_by := COALESCE(NEW.technician_completed_by, old.technician_completed_by);

  NEW.supervisor_employee_code := COALESCE(NEW.supervisor_employee_code, old.supervisor_employee_code);
  NEW.supervisor_employee_name := COALESCE(NEW.supervisor_employee_name, old.supervisor_employee_name);
  NEW.supervisor_work_status := COALESCE(NEW.supervisor_work_status, old.supervisor_work_status);
  NEW.supervisor_in_ts := COALESCE(NEW.supervisor_in_ts, old.supervisor_in_ts);
  NEW.supervisor_remark := COALESCE(NEW.supervisor_remark, old.supervisor_remark);
  NEW.supervisor_out_ts := COALESCE(NEW.supervisor_out_ts, old.supervisor_out_ts);
  NEW.supervisor_completed_by := COALESCE(NEW.supervisor_completed_by, old.supervisor_completed_by);

  NEW.dentor_helper_employee_code := COALESCE(NEW.dentor_helper_employee_code, old.dentor_helper_employee_code);
  NEW.dentor_helper_employee_name := COALESCE(NEW.dentor_helper_employee_name, old.dentor_helper_employee_name);
  NEW.dentor_helper_work_status := COALESCE(NEW.dentor_helper_work_status, old.dentor_helper_work_status);
  NEW.dentor_helper_in_ts := COALESCE(NEW.dentor_helper_in_ts, old.dentor_helper_in_ts);
  NEW.dentor_helper_remark := COALESCE(NEW.dentor_helper_remark, old.dentor_helper_remark);
  NEW.dentor_helper_out_ts := COALESCE(NEW.dentor_helper_out_ts, old.dentor_helper_out_ts);
  NEW.dentor_helper_completed_by := COALESCE(NEW.dentor_helper_completed_by, old.dentor_helper_completed_by);

  NEW.painter_helper_employee_code := COALESCE(NEW.painter_helper_employee_code, old.painter_helper_employee_code);
  NEW.painter_helper_employee_name := COALESCE(NEW.painter_helper_employee_name, old.painter_helper_employee_name);
  NEW.painter_helper_work_status := COALESCE(NEW.painter_helper_work_status, old.painter_helper_work_status);
  NEW.painter_helper_in_ts := COALESCE(NEW.painter_helper_in_ts, old.painter_helper_in_ts);
  NEW.painter_helper_remark := COALESCE(NEW.painter_helper_remark, old.painter_helper_remark);
  NEW.painter_helper_out_ts := COALESCE(NEW.painter_helper_out_ts, old.painter_helper_out_ts);
  NEW.painter_helper_completed_by := COALESCE(NEW.painter_helper_completed_by, old.painter_helper_completed_by);

  NEW.rubbing_employee_code := COALESCE(NEW.rubbing_employee_code, old.rubbing_employee_code);
  NEW.rubbing_employee_name := COALESCE(NEW.rubbing_employee_name, old.rubbing_employee_name);
  NEW.rubbing_work_status := COALESCE(NEW.rubbing_work_status, old.rubbing_work_status);
  NEW.rubbing_in_ts := COALESCE(NEW.rubbing_in_ts, old.rubbing_in_ts);
  NEW.rubbing_remark := COALESCE(NEW.rubbing_remark, old.rubbing_remark);
  NEW.rubbing_out_ts := COALESCE(NEW.rubbing_out_ts, old.rubbing_out_ts);
  NEW.rubbing_completed_by := COALESCE(NEW.rubbing_completed_by, old.rubbing_completed_by);

  NEW.edp_employee_code := COALESCE(NEW.edp_employee_code, old.edp_employee_code);
  NEW.edp_employee_name := COALESCE(NEW.edp_employee_name, old.edp_employee_name);
  NEW.edp_work_status := COALESCE(NEW.edp_work_status, old.edp_work_status);
  NEW.edp_in_ts := COALESCE(NEW.edp_in_ts, old.edp_in_ts);
  NEW.edp_remark := COALESCE(NEW.edp_remark, old.edp_remark);
  NEW.edp_out_ts := COALESCE(NEW.edp_out_ts, old.edp_out_ts);
  NEW.edp_completed_by := COALESCE(NEW.edp_completed_by, old.edp_completed_by);

  NEW.parts_incharge_employee_code := COALESCE(NEW.parts_incharge_employee_code, old.parts_incharge_employee_code);
  NEW.parts_incharge_employee_name := COALESCE(NEW.parts_incharge_employee_name, old.parts_incharge_employee_name);
  NEW.parts_incharge_work_status := COALESCE(NEW.parts_incharge_work_status, old.parts_incharge_work_status);
  NEW.parts_incharge_in_ts := COALESCE(NEW.parts_incharge_in_ts, old.parts_incharge_in_ts);
  NEW.parts_incharge_remark := COALESCE(NEW.parts_incharge_remark, old.parts_incharge_remark);
  NEW.parts_incharge_out_ts := COALESCE(NEW.parts_incharge_out_ts, old.parts_incharge_out_ts);
  NEW.parts_incharge_completed_by := COALESCE(NEW.parts_incharge_completed_by, old.parts_incharge_completed_by);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bodyshop_assignments_merge_active_insert ON public.bodyshop_assignments;
CREATE TRIGGER trg_bodyshop_assignments_merge_active_insert
  BEFORE INSERT ON public.bodyshop_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.bodyshop_assignments_merge_active_insert();