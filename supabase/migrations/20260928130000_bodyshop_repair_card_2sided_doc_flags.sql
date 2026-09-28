-- Approval flags for two-sided customer documents (RC/DL/Aadhaar back) + T/P affidavit.

begin;

alter table public.bodyshop_repair_cards
  add column if not exists doc_rc_back boolean not null default false,
  add column if not exists doc_dl_back boolean not null default false,
  add column if not exists doc_aadhaar_back boolean not null default false,
  add column if not exists doc_tp_affidavit boolean not null default false;

commit;
