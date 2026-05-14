create table if not exists public.user_save_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'allowed', 'declined')),
  request_source text not null default 'contact_lookup',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint user_save_requests_no_self check (requester_user_id <> target_user_id)
);

comment on table public.user_save_requests is
  'Privacy-aware user-to-user save requests. Used when direct contact-info save is not permitted or only weak social matching exists.';

create unique index if not exists uq_user_save_requests_pending_pair
  on public.user_save_requests (requester_user_id, target_user_id)
  where status = 'pending';

create index if not exists idx_user_save_requests_target_status_created
  on public.user_save_requests (target_user_id, status, created_at desc);

create index if not exists idx_user_save_requests_pair_created
  on public.user_save_requests (requester_user_id, target_user_id, created_at desc);

alter table public.user_save_requests enable row level security;

drop policy if exists user_save_requests_select_participants on public.user_save_requests;
create policy user_save_requests_select_participants
  on public.user_save_requests
  for select
  to authenticated
  using (requester_user_id = auth.uid() or target_user_id = auth.uid());

grant select on public.user_save_requests to authenticated;
grant all on public.user_save_requests to service_role;

create or replace function public.users_share_save_request_club(
  p_requester_user_id uuid,
  p_target_user_id uuid
) returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.venue_user_relationships requester_vur
    join public.venue_user_relationships target_vur
      on target_vur.venue_id = requester_vur.venue_id
     and target_vur.user_id = p_target_user_id
     and target_vur.relationship_type in ('member', 'guest')
    where requester_vur.user_id = p_requester_user_id
      and requester_vur.relationship_type in ('member', 'guest')
  ) or exists (
    select 1
    from public.venue_identities requester_vi
    join public.venue_identities target_vi
      on target_vi.venue_id = requester_vi.venue_id
     and target_vi.user_id = p_target_user_id
    where requester_vi.user_id = p_requester_user_id
  );
$$;

comment on function public.users_share_save_request_club(uuid, uuid) is
  'Returns true when two registered users share at least one club/venue membership identity used for weak save-request matching.';

grant execute on function public.users_share_save_request_club(uuid, uuid) to authenticated, service_role;

drop function if exists public.rpc_player_search_by_contact_info(text);

create or replace function public.rpc_player_search_by_contact_info(
  p_query text
) returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  match_type text,
  is_saved boolean,
  action_kind text,
  request_status text,
  next_eligible_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_query, ''))), '');
  v_phone text := public.normalize_discovery_phone(p_query);
  v_has_saveable_exact boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_query is null then
    return;
  end if;

  if v_email is not null and position('@' in v_email) > 0 then
    v_has_saveable_exact := exists (
      select 1
      from public.profiles p
      where p.id <> v_uid
        and p.searchable_by_contact_info = true
        and exists (
          select 1
          from public.v_user_verified_emails vve
          where vve.user_id = p.id
            and vve.email_normalized = v_email
        )
    );

    return query
    with matches as (
      select p.id, p.display_name, p.avatar_url, p.searchable_by_contact_info
      from public.profiles p
      where p.id <> v_uid
        and exists (
          select 1
          from public.v_user_verified_emails vve
          where vve.user_id = p.id
            and vve.email_normalized = v_email
        )
      order by p.searchable_by_contact_info desc, lower(coalesce(nullif(btrim(p.display_name), ''), p.id::text))
      limit 10
    ),
    recent_requests as (
      select distinct on (usr.target_user_id)
        usr.target_user_id,
        usr.status,
        case
          when usr.status = 'pending' then null::timestamptz
          when usr.created_at > now() - interval '30 days' then usr.created_at + interval '30 days'
          else null::timestamptz
        end as next_eligible_at
      from public.user_save_requests usr
      where usr.requester_user_id = v_uid
      order by usr.target_user_id, usr.created_at desc
    )
    select
      m.id,
      m.display_name,
      m.avatar_url,
      case when m.searchable_by_contact_info then 'email' else 'possible_match' end,
      exists (
        select 1 from public.user_invite_circle uic
        where uic.owner_user_id = v_uid and uic.target_user_id = m.id
      ),
      case
        when m.searchable_by_contact_info then 'direct_save'
        else 'save_request'
      end,
      rr.status,
      rr.next_eligible_at
    from matches m
    left join recent_requests rr on rr.target_user_id = m.id
    where m.searchable_by_contact_info = true or not v_has_saveable_exact;
    return;
  end if;

  if v_phone is not null then
    v_has_saveable_exact := exists (
      select 1
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.id <> v_uid
        and p.searchable_by_contact_info = true
        and public.normalize_discovery_phone(coalesce(nullif(btrim(p.contact_phone), ''), u.phone::text)) = v_phone
    );

    return query
    with matches as (
      select p.id, p.display_name, p.avatar_url, p.searchable_by_contact_info
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.id <> v_uid
        and public.normalize_discovery_phone(coalesce(nullif(btrim(p.contact_phone), ''), u.phone::text)) = v_phone
      order by p.searchable_by_contact_info desc, lower(coalesce(nullif(btrim(p.display_name), ''), p.id::text))
      limit 10
    ),
    recent_requests as (
      select distinct on (usr.target_user_id)
        usr.target_user_id,
        usr.status,
        case
          when usr.status = 'pending' then null::timestamptz
          when usr.created_at > now() - interval '30 days' then usr.created_at + interval '30 days'
          else null::timestamptz
        end as next_eligible_at
      from public.user_save_requests usr
      where usr.requester_user_id = v_uid
      order by usr.target_user_id, usr.created_at desc
    )
    select
      m.id,
      m.display_name,
      m.avatar_url,
      case when m.searchable_by_contact_info then 'phone' else 'possible_match' end,
      exists (
        select 1 from public.user_invite_circle uic
        where uic.owner_user_id = v_uid and uic.target_user_id = m.id
      ),
      case
        when m.searchable_by_contact_info then 'direct_save'
        else 'save_request'
      end,
      rr.status,
      rr.next_eligible_at
    from matches m
    left join recent_requests rr on rr.target_user_id = m.id
    where m.searchable_by_contact_info = true or not v_has_saveable_exact;
    return;
  end if;

  return query
  with weak_matches as (
    select p.id, p.display_name, p.avatar_url
    from public.profiles p
    where p.id <> v_uid
      and lower(btrim(coalesce(p.display_name, ''))) = lower(v_query)
      and public.users_share_save_request_club(v_uid, p.id)
      and p.show_in_venue_member_discovery = true
    order by lower(coalesce(nullif(btrim(p.display_name), ''), p.id::text))
    limit 10
  ),
  recent_requests as (
    select distinct on (usr.target_user_id)
      usr.target_user_id,
      usr.status,
      case
        when usr.status = 'pending' then null::timestamptz
        when usr.created_at > now() - interval '30 days' then usr.created_at + interval '30 days'
        else null::timestamptz
      end as next_eligible_at
    from public.user_save_requests usr
    where usr.requester_user_id = v_uid
    order by usr.target_user_id, usr.created_at desc
  )
  select
    wm.id,
    wm.display_name,
    wm.avatar_url,
    'same_club_name'::text,
    exists (
      select 1 from public.user_invite_circle uic
      where uic.owner_user_id = v_uid and uic.target_user_id = wm.id
    ),
    'save_request'::text,
    rr.status,
    rr.next_eligible_at
  from weak_matches wm
  left join recent_requests rr on rr.target_user_id = wm.id;
end;
$$;

comment on function public.rpc_player_search_by_contact_info(text) is
  'Privacy-aware exact Email / Phone Search plus same-club exact display-name weak matching. Direct save is returned only when the target allows contact-info lookup; otherwise callers can send a save request without seeing private contact details.';

grant execute on function public.rpc_player_search_by_contact_info(text) to authenticated, service_role;

create or replace function public.rpc_user_save_request_create(
  p_target_user_id uuid,
  p_source text default 'contact_lookup'
) returns table (
  request_id uuid,
  status text,
  next_eligible_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.user_save_requests%rowtype;
  v_inserted public.user_save_requests%rowtype;
  v_source text := coalesce(nullif(btrim(p_source), ''), 'contact_lookup');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'invalid_target';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_target_user_id) then
    raise exception 'target_not_found';
  end if;

  if exists (
    select 1 from public.user_invite_circle uic
    where uic.owner_user_id = v_uid and uic.target_user_id = p_target_user_id
  ) then
    return query select null::uuid, 'already_saved'::text, null::timestamptz;
    return;
  end if;

  select *
  into v_existing
  from public.user_save_requests usr
  where usr.requester_user_id = v_uid
    and usr.target_user_id = p_target_user_id
  order by usr.created_at desc
  limit 1;

  if v_existing.id is not null then
    if v_existing.status = 'pending' then
      return query select v_existing.id, v_existing.status, null::timestamptz;
      return;
    end if;

    if v_existing.created_at > now() - interval '30 days' then
      return query select v_existing.id, v_existing.status, v_existing.created_at + interval '30 days';
      return;
    end if;
  end if;

  insert into public.user_save_requests (
    requester_user_id,
    target_user_id,
    status,
    request_source
  )
  values (
    v_uid,
    p_target_user_id,
    'pending',
    v_source
  )
  returning * into v_inserted;

  insert into public.notifications (
    recipient_user_id,
    kind,
    actor_user_id,
    note,
    dedupe_key
  )
  values (
    p_target_user_id,
    'save_request',
    v_uid,
    'wants to save you to their Hood.',
    'save_request:' || v_inserted.id::text
  )
  on conflict (recipient_user_id, kind, dedupe_key) where dedupe_key is not null do nothing;

  return query select v_inserted.id, v_inserted.status, null::timestamptz;
end;
$$;

grant execute on function public.rpc_user_save_request_create(uuid, text) to authenticated, service_role;

create or replace function public.rpc_user_save_request_list()
returns table (
  request_id uuid,
  requester_user_id uuid,
  requester_display_name text,
  requester_avatar_url text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  select
    usr.id,
    usr.requester_user_id,
    coalesce(nullif(btrim(p.display_name), ''), usr.requester_user_id::text),
    p.avatar_url,
    usr.status,
    usr.created_at
  from public.user_save_requests usr
  left join public.profiles p on p.id = usr.requester_user_id
  where usr.target_user_id = auth.uid()
    and usr.status = 'pending'
  order by usr.created_at desc;
$$;

grant execute on function public.rpc_user_save_request_list() to authenticated, service_role;

create or replace function public.rpc_user_save_request_respond(
  p_request_id uuid,
  p_allow boolean
) returns public.user_save_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_request public.user_save_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_request
  from public.user_save_requests usr
  where usr.id = p_request_id
    and usr.target_user_id = v_uid
  for update;

  if v_request.id is null then
    raise exception 'request_not_found';
  end if;

  if v_request.status <> 'pending' then
    return v_request;
  end if;

  update public.user_save_requests
  set status = case when p_allow then 'allowed' else 'declined' end,
      responded_at = now()
  where id = p_request_id
  returning * into v_request;

  if p_allow then
    insert into public.user_invite_circle (owner_user_id, target_user_id, source)
    values (v_request.requester_user_id, v_request.target_user_id, 'manual')
    on conflict (owner_user_id, target_user_id) do nothing;
  end if;

  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.recipient_user_id = v_uid
    and n.kind = 'save_request'
    and n.dedupe_key = 'save_request:' || p_request_id::text;

  return v_request;
end;
$$;

grant execute on function public.rpc_user_save_request_respond(uuid, boolean) to authenticated, service_role;
