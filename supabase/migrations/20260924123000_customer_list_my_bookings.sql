-- Migration: 20260924123000_customer_list_my_bookings.sql
-- Description: Adds customer_list_my_bookings RPC to allow customer sessions (anon role)
--              to securely fetch their service bookings and live status (including Cancelled / Confirmed).

create or replace function public.customer_list_my_bookings(p_session_token text, p_reg_number text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to public, extensions
as $$
declare
  v_sess record;
  v_reg text;
  v_regs text[];
  v_rows jsonb := '[]'::jsonb;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);
  if p_reg_number is not null and btrim(p_reg_number) <> '' then
    v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  end if;

  select coalesce(jsonb_agg(item order by (item->>'created_at') desc), '[]'::jsonb)
  into v_rows
  from (
    -- 1. Direct rows from public.service_bookings (primary source of truth)
    select jsonb_build_object(
      'id', s.id,
      'lead_number', coalesce(s.lead_number, 'SB-' || s.id::text),
      'booking_date', s.booking_date,
      'appointment_date', s.appointment_date,
      'booking_time', s.booking_time,
      'booking_source', coalesce(s.booking_source, 'Customer App'),
      'reg_number', s.reg_number,
      'model', s.model,
      'variant', s.variant,
      'customer_name', s.customer_name,
      'customer_phone', s.customer_phone,
      'service_type', s.service_type,
      'complaint_description', s.complaint_description,
      'pickup_required', coalesce(s.pickup_required, false),
      'pickup_address', s.pickup_address,
      'branch', s.branch,
      'status', coalesce(s.status, 'New'),
      'status_reason', s.status_reason,
      'assigned_sa_name', s.assigned_sa_name,
      'created_at', coalesce(s.created_at::text, now()::text)
    ) as item
    from public.service_bookings s
    where (
      public.customer_norm_reg(s.reg_number) = any(v_regs)
      or public.customer_last10_digits(s.customer_phone) = v_sess.phone
      or (v_reg is not null and public.customer_norm_reg(s.reg_number) = v_reg)
    )

    union all

    -- 2. Fallback items from post_feedback_bot_data that are NOT yet in service_bookings
    select jsonb_build_object(
      'id', b.id,
      'lead_number', 'SB-' || b.id::text,
      'booking_date', coalesce(left(b.complaint_date_time, 10), left(b.created_at::text, 10), to_char(now(), 'YYYY-MM-DD')),
      'appointment_date', substring(b.feedback_text from 'Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})'),
      'booking_time', substring(b.feedback_text from 'Slot:\s*([^\n\r]+)'),
      'booking_source', 'Customer App',
      'reg_number', b.vehicle_registration_number,
      'model', b.model,
      'variant', null,
      'customer_name', b.customer_name,
      'customer_phone', b.mobile_number,
      'service_type', coalesce(substring(b.feedback_text from 'Type:\s*([^\n\r]+)'), b.service_type, 'Running Repairs'),
      'complaint_description', substring(b.feedback_text from 'Complaints:\s*([\s\S]+)'),
      'pickup_required', coalesce(b.feedback_text ~* 'Pickup:\s*yes', false),
      'pickup_address', substring(b.feedback_text from 'Pickup:\s*Yes\s*\(([^)]+)\)'),
      'branch', coalesce(substring(b.feedback_text from 'Branch:\s*([^\n\r]+)'), b.branch, 'Sitapura'),
      'status', coalesce(b.robot_status, 'New'),
      'status_reason', null,
      'assigned_sa_name', b.service_advisor_name,
      'created_at', coalesce(b.complaint_date_time, b.created_at::text, now()::text)
    ) as item
    from public.post_feedback_bot_data b
    where b.mode in ('customer_portal_concern', 'customer_booking_portal')
      and b.feedback_text ilike '%SERVICE BOOKING REQUEST%'
      and (
        public.customer_norm_reg(b.vehicle_registration_number) = any(v_regs)
        or public.customer_last10_digits(b.mobile_number) = v_sess.phone
        or (v_reg is not null and public.customer_norm_reg(b.vehicle_registration_number) = v_reg)
      )
      -- Exclude bot rows that have already been created / synced to service_bookings
      and not exists (
        select 1
        from public.service_bookings sb
        where public.customer_norm_reg(sb.reg_number) = public.customer_norm_reg(b.vehicle_registration_number)
          and (
            sb.lead_number = 'SB-' || b.id::text
            or sb.lead_number ilike '%APP-' || b.id::text || '%'
            or (
              sb.appointment_date is not null
              and sb.appointment_date = substring(b.feedback_text from 'Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})')
            )
          )
      )
  ) sub;

  return v_rows;
end;
$$;

revoke all on function public.customer_list_my_bookings(text, text) from public;
grant execute on function public.customer_list_my_bookings(text, text) to anon;
grant execute on function public.customer_list_my_bookings(text, text) to authenticated;
grant execute on function public.customer_list_my_bookings(text, text) to service_role;
