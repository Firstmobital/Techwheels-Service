begin;

alter table public.post_service_feedback_messages
  add column if not exists remarked_at timestamptz,
  add column if not exists rating_at timestamptz;

comment on column public.post_service_feedback_messages.remarked_at is
  'Timestamp of the most recent CRE Add Remark action. Used for daily productivity tracking.';

comment on column public.post_service_feedback_messages.rating_at is
  'Timestamp of the most recent CRE Set/Change Rating action. Used for daily productivity tracking.';

create index if not exists idx_psfm_remarked_at
  on public.post_service_feedback_messages (remarked_at)
  where remarked_at is not null;

create index if not exists idx_psfm_rating_at
  on public.post_service_feedback_messages (rating_at)
  where rating_at is not null;

-- Update psf_add_remark
create or replace function public.psf_add_remark(
  p_feedback_id bigint,
  p_remark text,
  p_next_follow_up_date date default null,
  p_set_next_follow_up_date boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
begin
  if not (public.is_admin() or public.has_module_modify('post_service_feedback_cre')) then
    raise exception 'Insufficient permissions';
  end if;

  if p_remark is null or btrim(p_remark) = '' then
    raise exception 'Remark cannot be empty';
  end if;

  select coalesce(u.full_name, auth.jwt()->>'email')
  into v_actor_name
  from public.users u
  where u.id = auth.uid();

  if v_actor_name is null then
    v_actor_name := coalesce(auth.jwt()->>'email', 'Unknown');
  end if;

  insert into public.post_service_feedback_remarks
    (feedback_id, remark, created_by_id, created_by_name, is_resolution)
  values
    (p_feedback_id, btrim(p_remark), auth.uid(), v_actor_name, false);

  update public.post_service_feedback_messages
  set cre_status = case when cre_status = 'open' then 'in_progress' else cre_status end,
      next_follow_up_date = case
        when p_set_next_follow_up_date then p_next_follow_up_date
        else next_follow_up_date
      end,
      remarked_at = now(),
      updated_at = now()
  where id = p_feedback_id;

  if not found then
    raise exception 'Feedback row not found: %', p_feedback_id;
  end if;

  return jsonb_build_object('ok', true, 'actor_name', v_actor_name);
end;
$$;

-- Update psf_set_cre_rating
create or replace function public.psf_set_cre_rating(
  p_feedback_id bigint,
  p_cre_rating smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rating smallint;
  v_effective smallint;
begin
  if not (public.is_admin() or public.has_module_modify('post_service_feedback_cre')) then
    raise exception 'Insufficient permissions';
  end if;

  if p_cre_rating is null or p_cre_rating < 1 or p_cre_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  update public.post_service_feedback_messages
  set cre_rating = p_cre_rating,
      rating_at = now(),
      updated_at = now()
  where id = p_feedback_id
  returning rating, effective_rating into v_rating, v_effective;

  if not found then
    raise exception 'Feedback row not found: %', p_feedback_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'cre_rating', p_cre_rating,
    'rating', v_rating,
    'effective_rating', v_effective
  );
end;
$$;

create or replace function public.psf_get_today_productivity()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_res jsonb;
begin
  v_today_start := (timezone('Asia/Kolkata', now())::date)::timestamp at time zone 'Asia/Kolkata';
  v_today_end := v_today_start + interval '1 day' - interval '1 microsecond';

  select jsonb_build_object(
    'positive', count(*) filter (where rating_at >= v_today_start and rating_at <= v_today_end and effective_rating >= 4),
    'needsFollowup', count(*) filter (where rating_at >= v_today_start and rating_at <= v_today_end and effective_rating <= 3),
    'inProgress', count(*) filter (where remarked_at >= v_today_start and remarked_at <= v_today_end and cre_status = 'in_progress'),
    'resolved', count(*) filter (where resolved_at >= v_today_start and resolved_at <= v_today_end and cre_status = 'resolved'),
    'total', count(*) filter (where
      (remarked_at >= v_today_start and remarked_at <= v_today_end)
      or (rating_at >= v_today_start and rating_at <= v_today_end)
      or (resolved_at >= v_today_start and resolved_at <= v_today_end)
    )
  ) into v_res
  from public.post_service_feedback_messages;

  return coalesce(v_res, '{"positive": 0, "needsFollowup": 0, "inProgress": 0, "resolved": 0, "total": 0}'::jsonb);
end;
$$;

grant execute on function public.psf_get_today_productivity() to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
