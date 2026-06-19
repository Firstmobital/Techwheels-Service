-- Read-only checks to confirm why Gautam sees 0 rows while admin sees cards.

-- 1) Does current user have dealer scope?
select
  public.my_dealer_code() as my_dealer_code,
  public.my_effective_dealer_codes() as my_effective_dealer_codes;

-- 2) Does current user have bodyshop-relevant SA mapping?
select
  s.employee_code,
  s.department,
  s.role,
  s.location,
  s.fuel_type
from public.get_my_bodyshop_employee_scope() s
order by s.employee_code;

-- 3) Does current user map directly to Gautam code?
select public.user_has_employee_code('GJ1_3000840') as has_gautam_employee_code;

-- 4) Are Gautam cards present in bodyshop_repair_cards?
select
  id,
  reception_entry_id,
  job_card_no,
  sa_employee_code,
  sa_name,
  current_stage,
  overall_status,
  created_at
from public.bodyshop_repair_cards
where sa_employee_code = 'GJ1_3000840'
order by created_at desc;

-- 5) Module permissions for current user.
select
  p.module_name,
  p.can_view,
  p.can_modify,
  p.can_delete
from public.get_all_my_permissions() p
where p.module_name in ('service_advisor', 'reception', 'bodyshop_repair', 'bodyshop_floor', 'bodyshop_tracker')
order by p.module_name;
