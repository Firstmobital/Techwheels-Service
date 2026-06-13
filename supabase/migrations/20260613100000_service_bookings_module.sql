-- ═══════════════════════════════════════════════════════════════════════════
-- Service Bookings Module  (module_id: 21)
-- Sources: Telecalling, WhatsApp, Walk-in, Self, Driver Pickup, Referral
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- ── 1. Main bookings table ─────────────────────────────────────────────────
create table if not exists public.service_bookings (
  id                  bigserial primary key,

  -- Lead / Source
  booking_source      text not null default 'Telecalling',   -- Telecalling | WhatsApp | Walk-in | Self | Driver Pickup | Referral
  lead_number         text,                                   -- auto-generated: BKG-YYYYMMDD-####
  booking_date        date not null default current_date,
  booking_time        time,                                   -- preferred appointment time
  appointment_date    date,                                   -- actual scheduled appointment

  -- Vehicle
  reg_number          text not null,
  model               text,
  variant             text,
  fuel_type           text,                                   -- Petrol | Diesel | CNG | EV
  mfg_year            int,
  km_reading          int,

  -- Customer
  customer_name       text not null,
  customer_phone      text not null,
  alt_phone           text,
  customer_email      text,
  customer_address    text,

  -- Service Details
  service_type        text,                                   -- Paid Service | First Free | Second Free | Running Repairs | etc.
  complaint_description text,                                 -- customer complaints / concerns
  special_requests    text,                                   -- pickup/drop, specific parts, etc.
  pickup_required     boolean default false,
  drop_required       boolean default false,
  pickup_address      text,

  -- Assignment
  branch              text,
  assigned_sa         text,                                   -- SA employee code / name
  assigned_sa_name    text,

  -- Status lifecycle
  status              text not null default 'New',            -- New | Confirmed | Rescheduled | Arrived | In-Progress | Completed | Cancelled | No-Show
  status_reason       text,                                   -- reason for cancel / reschedule
  rescheduled_date    date,

  -- Telecalling specific
  caller_name         text,                                   -- who made the call
  call_attempt        int default 1,                          -- 1st / 2nd / 3rd call
  call_outcome        text,                                   -- Connected | Not Reachable | Callback | Declined

  -- WhatsApp specific
  wa_conversation_id  text,                                   -- WhatsApp thread reference
  wa_opt_in           boolean default false,                  -- customer opted-in for WA updates

  -- Conversion tracking
  jc_number           text,                                   -- JC number once converted to actual service
  converted_at        timestamptz,                            -- when booking became a job card

  -- Audit
  created_by          uuid references auth.users(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ── 2. Follow-up / activity log ────────────────────────────────────────────
create table if not exists public.service_booking_followups (
  id              bigserial primary key,
  booking_id      bigint not null references public.service_bookings(id) on delete cascade,
  follow_up_date  timestamptz default now(),
  channel         text,   -- Call | WhatsApp | Email | In-Person
  note            text,
  outcome         text,   -- Confirmed | Rescheduled | Declined | No-Response | Callback
  next_follow_up  date,
  done_by         text,   -- staff name
  created_at      timestamptz default now()
);

-- ── 3. Indexes ─────────────────────────────────────────────────────────────
create index if not exists idx_sb_reg_number      on public.service_bookings(reg_number);
create index if not exists idx_sb_customer_phone  on public.service_bookings(customer_phone);
create index if not exists idx_sb_booking_date    on public.service_bookings(booking_date);
create index if not exists idx_sb_appointment     on public.service_bookings(appointment_date);
create index if not exists idx_sb_status          on public.service_bookings(status);
create index if not exists idx_sb_source          on public.service_bookings(booking_source);
create index if not exists idx_sb_branch          on public.service_bookings(branch);
create index if not exists idx_sbf_booking        on public.service_booking_followups(booking_id);

-- ── 4. updated_at trigger ──────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_sb_updated_at on public.service_bookings;
create trigger trg_sb_updated_at
  before update on public.service_bookings
  for each row execute procedure public.set_updated_at();

-- ── 5. Auto lead number function ───────────────────────────────────────────
create or replace function public.generate_lead_number()
returns trigger language plpgsql as $$
declare
  date_part text;
  seq_num   int;
begin
  if new.lead_number is null or new.lead_number = '' then
    date_part := to_char(current_date, 'YYYYMMDD');
    select coalesce(max(
      case when lead_number ~ ('^BKG-' || date_part || '-[0-9]+$')
           then (split_part(lead_number, '-', 3))::int else 0 end
    ), 0) + 1
    into seq_num
    from public.service_bookings;
    new.lead_number := 'BKG-' || date_part || '-' || lpad(seq_num::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sb_lead_number on public.service_bookings;
create trigger trg_sb_lead_number
  before insert on public.service_bookings
  for each row execute procedure public.generate_lead_number();

-- ── 6. RLS ─────────────────────────────────────────────────────────────────
alter table public.service_bookings         enable row level security;
alter table public.service_booking_followups enable row level security;

drop policy if exists "service_bookings_all_auth"         on public.service_bookings;
drop policy if exists "service_booking_followups_all_auth" on public.service_booking_followups;

create policy "service_bookings_all_auth"
  on public.service_bookings for all to authenticated
  using (true) with check (true);

create policy "service_booking_followups_all_auth"
  on public.service_booking_followups for all to authenticated
  using (true) with check (true);

-- ── 7. Register module ─────────────────────────────────────────────────────
insert into public.modules (id, name, label, route, icon, is_active, sort_order)
values (21, 'service_booking', 'Service Booking', '/service-booking', 'calendar', true, 21)
on conflict (id) do update
  set name = excluded.name, label = excluded.label,
      route = excluded.route, is_active = excluded.is_active;

-- ── 8. Grant access to all users ──────────────────────────────────────────
insert into public.user_module_permissions (user_id, module_name, can_view, can_edit)
select u.id, 'service_booking', true, true
from public.users u
on conflict (user_id, module_name) do update
  set can_view = true, can_edit = true;

commit;
