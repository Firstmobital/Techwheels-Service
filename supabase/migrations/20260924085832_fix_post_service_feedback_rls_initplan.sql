-- Employee reads of post_service_feedback_messages were calling is_admin()
-- and has_module_view() once per row. Admins short-circuit; other employees
-- do not, so exact counts exceeded the 8s authenticated statement timeout
-- and the CRE queue failed to load. These helpers do not depend on row data,
-- so wrapping them in scalar subqueries makes Postgres initPlan them once
-- per statement. Who can read or write does not change.

begin;

drop policy if exists admin_unrestricted_all_ops_v1 on public.post_service_feedback_messages;
create policy admin_unrestricted_all_ops_v1
  on public.post_service_feedback_messages
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists view_post_service_feedback on public.post_service_feedback_messages;
create policy view_post_service_feedback
  on public.post_service_feedback_messages
  for select
  to authenticated
  using (
    (select public.is_admin())
    or (select public.has_module_view('auto_service_reminder'))
    or (select public.has_module_view('post_service_feedback_cre'))
  );

drop policy if exists admin_unrestricted_all_ops_v1 on public.post_service_feedback_remarks;
create policy admin_unrestricted_all_ops_v1
  on public.post_service_feedback_remarks
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists view_post_service_feedback_remarks on public.post_service_feedback_remarks;
create policy view_post_service_feedback_remarks
  on public.post_service_feedback_remarks
  for select
  to authenticated
  using (
    (select public.is_admin())
    or (select public.has_module_view('post_service_feedback_cre'))
  );

commit;
