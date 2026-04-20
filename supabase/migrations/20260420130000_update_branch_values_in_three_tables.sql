begin;

-- 1) job_card_closed_data
alter table if exists public.job_card_closed_data
  drop constraint if exists job_card_closed_data_branch_check;

update public.job_card_closed_data
set branch = case branch
  when 'AJ' then 'Ajmer Road'
  when 'JG PV' then 'Sitapura PV'
  when 'JG EV' then 'Sitapura EV'
  else branch
end
where branch in ('AJ', 'JG PV', 'JG EV');

alter table public.job_card_closed_data
  add constraint job_card_closed_data_branch_check
  check (branch in ('Ajmer Road', 'Sitapura PV', 'Sitapura EV'));

-- 2) service_invoice_data
alter table if exists public.service_invoice_data
  drop constraint if exists service_invoice_data_branch_check;

update public.service_invoice_data
set branch = case branch
  when 'AJ' then 'Ajmer Road'
  when 'JG PV' then 'Sitapura PV'
  when 'JG EV' then 'Sitapura EV'
  else branch
end
where branch in ('AJ', 'JG PV', 'JG EV');

alter table public.service_invoice_data
  add constraint service_invoice_data_branch_check
  check (branch in ('Ajmer Road', 'Sitapura PV', 'Sitapura EV'));

-- 3) service_vas_jc_data
alter table if exists public.service_vas_jc_data
  drop constraint if exists service_vas_jc_data_branch_check;

update public.service_vas_jc_data
set branch = case branch
  when 'AJ' then 'Ajmer Road'
  when 'JG PV' then 'Sitapura PV'
  when 'JG EV' then 'Sitapura EV'
  else branch
end
where branch in ('AJ', 'JG PV', 'JG EV');

alter table public.service_vas_jc_data
  add constraint service_vas_jc_data_branch_check
  check (branch in ('Ajmer Road', 'Sitapura PV', 'Sitapura EV'));

commit;
