-- P1-10: Target highest-delta query family on service_reception_entries.
-- Adds dealer-scope + stable ordering index for list endpoints that sort by
-- created_at DESC, id DESC under authenticated (RLS dealer scope).

create index if not exists idx_sre_dealer_created_at_id_desc
on public.service_reception_entries
using btree (dealer_code, created_at desc, id desc)
include (
  reg_number,
  model,
  service_type,
  sa_employee_code,
  jc_number,
  owner_name,
  owner_phone,
  branch,
  location,
  portal,
  branch_label,
  source,
  updated_at
)
where dealer_code is not null;
