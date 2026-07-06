-- Root-cause fix for "Part Number / stock status doesn't update without a page refresh"
-- on the Service Advisor page and Parts SPM Dashboard.
--
-- Both PartsRequirementSection.tsx (advisor) and PartsSPMDashboardPage.tsx (admin/SPM)
-- already subscribe to postgres_changes on public.parts_requests via
-- supabase.channel(...).on('postgres_changes', ...). That code was correct, but it was a
-- silent no-op: the `parts_requests` table was never added to the `supabase_realtime`
-- publication, so Postgres never broadcast any change events to those subscriptions.
-- (On inspection, this same publication is empty project-wide — no table was ever
-- registered — but this migration only touches parts_requests, which is what the current
-- Parts Entry ticket is scoped to. It's a purely additive, non-destructive change: it does
-- not alter any table structure, data, RLS policy, or existing query/report behavior.)
--
-- After this: the advisor's own request list, and the SPM dashboard's full list, will
-- reflect changes made from *other* sessions/tabs in real time — e.g. an SPM edit, or the
-- parts-request-order-match auto-sync after an import — without needing a manual refresh.
-- (A user's *own* save already refreshed instantly via the explicit `void load()` call
-- right after a successful create/update — that path was never affected by this bug.)

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'parts_requests'
  ) then
    alter publication supabase_realtime add table public.parts_requests;
  end if;
end $$;
