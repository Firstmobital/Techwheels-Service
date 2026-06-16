-- Purpose:
-- Ensure Bodyshop SA stage actions remain executable for users with RBAC view/modify rights
-- (Receiving, Docs, Estimate, Claim Intimation), while leaving delete behavior unchanged.
--
-- This migration is idempotent and re-creates only SELECT/INSERT/UPDATE policies
-- for the tables used by the SA intake/docs flows.

-- Keep RLS enabled on the primary tables used by SA stage actions.
alter table public.bodyshop_repair_cards enable row level security;
alter table public.bodyshop_intake_vehicle_photos enable row level security;
alter table public.bodyshop_repair_card_documents enable row level security;

-- -----------------------------------------------------------------------------
-- bodyshop_repair_cards (Receiving/Estimate/Claim field updates)
-- -----------------------------------------------------------------------------

drop policy if exists bodyshop_repair_cards_select_rbac_v1 on public.bodyshop_repair_cards;
create policy bodyshop_repair_cards_select_rbac_v2
on public.bodyshop_repair_cards
for select
to authenticated
using (
  public.is_admin()
  or (
    (
      public.has_module_view('service_advisor')
      or public.has_module_view('reception')
      or public.has_module_view('bodyshop_floor')
      or public.has_module_view('bodyshop_repair')
      or public.has_module_view('bodyshop_tracker')
    )
    and (
      (
        reception_entry_id is not null
        and exists (
          select 1
          from public.service_reception_entries sre
          where sre.id = reception_entry_id
            and public.dealer_code_in_scope(sre.dealer_code)
        )
      )
      or public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 1))
      or public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 2))
    )
  )
);

drop policy if exists bodyshop_repair_cards_insert_rbac_v1 on public.bodyshop_repair_cards;
create policy bodyshop_repair_cards_insert_rbac_v2
on public.bodyshop_repair_cards
for insert
to authenticated
with check (
  public.is_admin()
  or (
    (
      public.has_module_modify('service_advisor')
      or public.has_module_modify('reception')
      or public.has_module_modify('bodyshop_repair')
    )
    and (
      (
        reception_entry_id is not null
        and exists (
          select 1
          from public.service_reception_entries sre
          where sre.id = reception_entry_id
            and public.dealer_code_in_scope(sre.dealer_code)
        )
      )
      or public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 1))
      or public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 2))
    )
  )
);

drop policy if exists bodyshop_repair_cards_update_rbac_v1 on public.bodyshop_repair_cards;
create policy bodyshop_repair_cards_update_rbac_v2
on public.bodyshop_repair_cards
for update
to authenticated
using (
  public.is_admin()
  or (
    (
      public.has_module_modify('service_advisor')
      or public.has_module_modify('reception')
      or public.has_module_modify('bodyshop_repair')
    )
    and (
      (
        reception_entry_id is not null
        and exists (
          select 1
          from public.service_reception_entries sre
          where sre.id = reception_entry_id
            and public.dealer_code_in_scope(sre.dealer_code)
        )
      )
      or public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 1))
      or public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 2))
    )
  )
)
with check (
  public.is_admin()
  or (
    (
      public.has_module_modify('service_advisor')
      or public.has_module_modify('reception')
      or public.has_module_modify('bodyshop_repair')
    )
    and (
      (
        reception_entry_id is not null
        and exists (
          select 1
          from public.service_reception_entries sre
          where sre.id = reception_entry_id
            and public.dealer_code_in_scope(sre.dealer_code)
        )
      )
      or public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 1))
      or public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 2))
    )
  )
);

-- -----------------------------------------------------------------------------
-- bodyshop_intake_vehicle_photos (Receiving photo metadata insert/read/update)
-- -----------------------------------------------------------------------------

drop policy if exists bodyshop_intake_vehicle_photos_select_rbac_v2 on public.bodyshop_intake_vehicle_photos;
create policy bodyshop_intake_vehicle_photos_select_rbac_v3
on public.bodyshop_intake_vehicle_photos
for select
to authenticated
using (
  public.is_admin()
  or (
    (
      public.has_module_view('service_advisor')
      or public.has_module_view('reception')
      or public.has_module_view('bodyshop_floor')
      or public.has_module_view('bodyshop_repair')
      or public.has_module_view('bodyshop_tracker')
    )
    and public.dealer_code_in_scope(dealer_code)
  )
);

drop policy if exists bodyshop_intake_vehicle_photos_insert_rbac_v2 on public.bodyshop_intake_vehicle_photos;
create policy bodyshop_intake_vehicle_photos_insert_rbac_v3
on public.bodyshop_intake_vehicle_photos
for insert
to authenticated
with check (
  public.is_admin()
  or (
    (
      public.has_module_modify('service_advisor')
      or public.has_module_modify('reception')
      or public.has_module_modify('bodyshop_repair')
    )
    and public.dealer_code_in_scope(dealer_code)
  )
);

drop policy if exists bodyshop_intake_vehicle_photos_update_rbac_v2 on public.bodyshop_intake_vehicle_photos;
create policy bodyshop_intake_vehicle_photos_update_rbac_v3
on public.bodyshop_intake_vehicle_photos
for update
to authenticated
using (
  public.is_admin()
  or (
    (
      public.has_module_modify('service_advisor')
      or public.has_module_modify('reception')
      or public.has_module_modify('bodyshop_repair')
    )
    and public.dealer_code_in_scope(dealer_code)
  )
)
with check (
  public.is_admin()
  or (
    (
      public.has_module_modify('service_advisor')
      or public.has_module_modify('reception')
      or public.has_module_modify('bodyshop_repair')
    )
    and public.dealer_code_in_scope(dealer_code)
  )
);

-- -----------------------------------------------------------------------------
-- bodyshop_repair_card_documents (Docs/Estimate/Claim metadata upsert/read)
-- -----------------------------------------------------------------------------

drop policy if exists bodyshop_repair_card_documents_select_rbac_v2 on public.bodyshop_repair_card_documents;
create policy bodyshop_repair_card_documents_select_rbac_v3
on public.bodyshop_repair_card_documents
for select
to authenticated
using (
  public.is_admin()
  or (
    (
      public.has_module_view('service_advisor')
      or public.has_module_view('reception')
      or public.has_module_view('bodyshop_floor')
      or public.has_module_view('bodyshop_repair')
      or public.has_module_view('bodyshop_tracker')
    )
    and public.dealer_code_in_scope(dealer_code)
  )
);

drop policy if exists bodyshop_repair_card_documents_insert_rbac_v2 on public.bodyshop_repair_card_documents;
create policy bodyshop_repair_card_documents_insert_rbac_v3
on public.bodyshop_repair_card_documents
for insert
to authenticated
with check (
  public.is_admin()
  or (
    (
      public.has_module_modify('service_advisor')
      or public.has_module_modify('reception')
      or public.has_module_modify('bodyshop_repair')
    )
    and public.dealer_code_in_scope(dealer_code)
  )
);

drop policy if exists bodyshop_repair_card_documents_update_rbac_v2 on public.bodyshop_repair_card_documents;
create policy bodyshop_repair_card_documents_update_rbac_v3
on public.bodyshop_repair_card_documents
for update
to authenticated
using (
  public.is_admin()
  or (
    (
      public.has_module_modify('service_advisor')
      or public.has_module_modify('reception')
      or public.has_module_modify('bodyshop_repair')
    )
    and public.dealer_code_in_scope(dealer_code)
  )
)
with check (
  public.is_admin()
  or (
    (
      public.has_module_modify('service_advisor')
      or public.has_module_modify('reception')
      or public.has_module_modify('bodyshop_repair')
    )
    and public.dealer_code_in_scope(dealer_code)
  )
);

-- Intentionally do not touch DELETE policies in this hardening migration.
