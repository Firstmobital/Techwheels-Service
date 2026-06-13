-- Bodyshop Floor Support Assignments Table
-- Isolated table for Bodyshop Floor module support person assignments
-- Mirrors job_card_support_assignments design but scoped to bodyshop workflow
-- Purpose: Allow multiple support people (any role) per job card in Bodyshop Floor UI
-- Support staff can be assigned for any of the 5 roles: DENTOR, PAINTER, TECHNICIAN, ELECTRICIAN, DET

create table if not exists public.bodyshop_floor_support_assignments (
  id bigint primary key generated always as identity,
  job_card_number text not null,
  support_role text not null,
  employee_code text not null,
  employee_name text not null,
  assigned_at timestamp with time zone default now() not null,
  assigned_by text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,

  constraint bodyshop_floor_support_assignments_support_role_check
    check (upper(btrim(support_role)) = any (array['DENTOR'::text, 'PAINTER'::text, 'TECHNICIAN'::text, 'ELECTRICIAN'::text, 'DET'::text])),

  constraint bodyshop_floor_support_assignments_jc_valid
    check (job_card_number is not null and btrim(job_card_number) != ''),

  constraint bodyshop_floor_support_assignments_emp_valid
    check (employee_code is not null and btrim(employee_code) != '')
);

-- Indexes
create index if not exists idx_bodyshop_floor_support_assignments_jc 
  on public.bodyshop_floor_support_assignments(job_card_number);

create index if not exists idx_bodyshop_floor_support_assignments_role 
  on public.bodyshop_floor_support_assignments(support_role);

create index if not exists idx_bodyshop_floor_support_assignments_active 
  on public.bodyshop_floor_support_assignments(is_active)
  where is_active = true;

-- RLS enable
alter table public.bodyshop_floor_support_assignments enable row level security;

-- RLS policies - same access model as bodyshop_assignments
-- Allow service advisor / bodyshop staff to view and manage
create policy "bodyshop_floor_support_read_policy"
  on public.bodyshop_floor_support_assignments for select
  using (true);

create policy "bodyshop_floor_support_insert_policy"
  on public.bodyshop_floor_support_assignments for insert
  with check (true);

create policy "bodyshop_floor_support_update_policy"
  on public.bodyshop_floor_support_assignments for update
  using (true)
  with check (true);

create policy "bodyshop_floor_support_delete_policy"
  on public.bodyshop_floor_support_assignments for delete
  using (true);

-- Trigger for updated_at auto-update
create trigger bodyshop_floor_support_assignments_set_updated_at
  before update on public.bodyshop_floor_support_assignments
  for each row
  execute function public.set_updated_at();

-- Comments
comment on table public.bodyshop_floor_support_assignments is 
  'Stores multiple active support-person assignments per job card for bodyshop floor workflow. Support staff can be assigned for any of the 5 roles (DENTOR, PAINTER, TECHNICIAN, ELECTRICIAN, DET). Isolated from job_card_support_assignments (Floor Incharge module).';

comment on column public.bodyshop_floor_support_assignments.support_role is 
  'Support role: Any of the 5 roles (DENTOR, PAINTER, TECHNICIAN, ELECTRICIAN, DET). Support staff can be assigned for any role. Locked by CHECK constraint.';

comment on column public.bodyshop_floor_support_assignments.assigned_by is 
  'User code of person who assigned this support person.';

-- Grants
grant select, insert, update, delete on public.bodyshop_floor_support_assignments to authenticated;
grant select, insert, update, delete on public.bodyshop_floor_support_assignments to service_role;
