-- Migration: Backfill service seed fields for existing booking-sync inserted rows
-- Why:
--   Historical rows inserted before the service-seed mapping change have
--   updated_by_sale=true but last_service_type/last_service_date as NULL.
-- Scope:
--   One-time corrective backfill for target rows inserted by booking sync.

begin;

update public.all_service_data t
set
  last_service_type = case
    when nullif(btrim(t.last_service_type), '') is null then 'New'
    else t.last_service_type
  end,
  last_service_date = coalesce(
    t.last_service_date,
    case
      when t.vehicle_sale_date is null then null
      else (t.vehicle_sale_date::timestamp at time zone 'Asia/Kolkata')
    end
  ),
  last_updated_at = now()
where t.updated_by_sale = true
  and (
    nullif(btrim(t.last_service_type), '') is null
    or t.last_service_date is null
  );

commit;
