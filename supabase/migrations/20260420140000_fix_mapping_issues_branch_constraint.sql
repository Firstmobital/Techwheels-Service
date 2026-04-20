begin;

-- Remove hardcoded branch CHECK constraints to allow dynamic locations from employee_master

-- 1) job_card_closed_data
alter table if exists public.job_card_closed_data
  drop constraint if exists job_card_closed_data_branch_check;

-- 2) service_invoice_data
alter table if exists public.service_invoice_data
  drop constraint if exists service_invoice_data_branch_check;

-- 3) service_vas_jc_data
alter table if exists public.service_vas_jc_data
  drop constraint if exists service_vas_jc_data_branch_check;

-- 4) import_employee_mapping_issues
alter table if exists public.import_employee_mapping_issues
  drop constraint if exists import_employee_mapping_issues_branch_check;

commit;
