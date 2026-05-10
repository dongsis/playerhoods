create table if not exists public.group_locations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  location_kind text not null,
  city_name text,
  region text,
  country text,
  venue_id uuid references public.venues(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint group_locations_location_kind_check check (location_kind in ('city', 'venue')),
  constraint group_locations_city_shape_check check (
    (location_kind = 'city'
      and venue_id is null
      and city_name is not null
      and char_length(btrim(city_name)) between 1 and 80
      and country is not null
      and char_length(btrim(country)) between 1 and 80)
    or
    (location_kind = 'venue'
      and venue_id is not null
      and city_name is null
      and region is null
      and country is null)
  )
);

create unique index if not exists group_locations_one_primary_idx
  on public.group_locations (group_id)
  where is_primary;

create unique index if not exists group_locations_group_venue_unique_idx
  on public.group_locations (group_id, venue_id)
  where venue_id is not null;

create unique index if not exists group_locations_group_city_unique_idx
  on public.group_locations (
    group_id,
    lower(btrim(city_name)),
    lower(btrim(coalesce(region, ''))),
    lower(btrim(country))
  )
  where location_kind = 'city';

create index if not exists idx_group_locations_group_id
  on public.group_locations (group_id);

create index if not exists idx_group_locations_venue_id
  on public.group_locations (venue_id)
  where venue_id is not null;

comment on table public.group_locations
is 'Cities and venues where a Shared Group is active. Used for group display, discovery, and trusted invitation matching.';

comment on column public.group_locations.is_primary
is 'One primary location per group. This is what appears first on group cards.';

alter table public.group_locations enable row level security;

drop policy if exists group_locations_select_member on public.group_locations;
create policy group_locations_select_member
  on public.group_locations
  for select
  to authenticated
  using (public.is_group_member_any(group_id, auth.uid()));

drop policy if exists group_locations_write_boundary_keeper on public.group_locations;
create policy group_locations_write_boundary_keeper
  on public.group_locations
  for all
  to authenticated
  using (public.group_boundary_keeper_id(group_id) = auth.uid())
  with check (public.group_boundary_keeper_id(group_id) = auth.uid());

grant all on table public.group_locations to anon;
grant all on table public.group_locations to authenticated;
grant all on table public.group_locations to service_role;

insert into public.group_locations (
  group_id,
  location_kind,
  venue_id,
  is_primary
)
select
  g.id,
  'venue',
  g.venue_id,
  true
from public.groups g
where g.venue_id is not null
  and not exists (
    select 1
    from public.group_locations gl
    where gl.group_id = g.id
  )
on conflict do nothing;

create or replace function public.rpc_group_locations_replace(
  p_group_id uuid,
  p_locations jsonb
) returns setof public.group_locations
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_group public.groups%rowtype;
  v_count int;
  v_primary_count int;
  v_primary_venue_id uuid := null;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_group
  from public.groups
  where id = p_group_id
  for update;

  if not found then
    raise exception 'group_not_found';
  end if;

  if v_group.boundary_keeper_id <> v_user_id then
    raise exception 'not_group_boundary_keeper';
  end if;

  if p_locations is null or jsonb_typeof(p_locations) <> 'array' then
    raise exception 'invalid_group_locations';
  end if;

  create temp table if not exists pg_temp.next_group_locations (
    ordinal int not null,
    location_kind text not null,
    city_name text,
    region text,
    country text,
    venue_id uuid,
    is_primary_input boolean not null default false,
    is_primary boolean not null default false
  ) on commit drop;

  truncate table pg_temp.next_group_locations;

  insert into pg_temp.next_group_locations (
    ordinal,
    location_kind,
    city_name,
    region,
    country,
    venue_id,
    is_primary_input
  )
  select
    item.ordinality::int,
    lower(btrim(coalesce(item.value->>'kind', item.value->>'location_kind', ''))),
    nullif(btrim(coalesce(item.value->>'city_name', item.value->>'cityName', '')), ''),
    nullif(btrim(coalesce(item.value->>'region', '')), ''),
    nullif(btrim(coalesce(item.value->>'country', '')), ''),
    case
      when nullif(btrim(coalesce(item.value->>'venue_id', item.value->>'venueId', '')), '') is null then null
      else nullif(btrim(coalesce(item.value->>'venue_id', item.value->>'venueId', '')), '')::uuid
    end,
    coalesce((item.value->>'is_primary')::boolean, (item.value->>'isPrimary')::boolean, false)
  from jsonb_array_elements(p_locations) with ordinality as item(value, ordinality);

  select count(*), count(*) filter (where is_primary_input)
  into v_count, v_primary_count
  from pg_temp.next_group_locations;

  if v_count = 0 then
    raise exception 'group_location_required';
  end if;

  if v_count > 20 then
    raise exception 'too_many_group_locations';
  end if;

  if exists (
    select 1
    from pg_temp.next_group_locations
    where location_kind not in ('city', 'venue')
       or (location_kind = 'city' and (city_name is null or country is null or venue_id is not null))
       or (location_kind = 'venue' and venue_id is null)
  ) then
    raise exception 'invalid_group_location';
  end if;

  if exists (
    select 1
    from pg_temp.next_group_locations gl
    where gl.location_kind = 'venue'
      and not exists (
        select 1
        from public.venue_user_relationships vur
        where vur.user_id = v_user_id
          and vur.venue_id = gl.venue_id
          and vur.relationship_type = 'member'
      )
  ) then
    raise exception 'invalid_group_venue';
  end if;

  if exists (
    select 1
    from pg_temp.next_group_locations gl
    where gl.location_kind = 'city'
    group by lower(gl.city_name), lower(coalesce(gl.region, '')), lower(gl.country)
    having count(*) > 1
  ) then
    raise exception 'duplicate_group_city';
  end if;

  if exists (
    select 1
    from pg_temp.next_group_locations gl
    where gl.location_kind = 'venue'
    group by gl.venue_id
    having count(*) > 1
  ) then
    raise exception 'duplicate_group_venue';
  end if;

  update pg_temp.next_group_locations
  set is_primary = false;

  if v_count = 1 then
    update pg_temp.next_group_locations
    set is_primary = true;
  elsif v_primary_count = 0 then
    update pg_temp.next_group_locations
    set is_primary = true
    where ordinal = (select min(ordinal) from pg_temp.next_group_locations);
  else
    update pg_temp.next_group_locations
    set is_primary = true
    where ordinal = (
      select min(ordinal)
      from pg_temp.next_group_locations
      where is_primary_input
    );
  end if;

  delete from public.group_locations
  where group_id = p_group_id;

  insert into public.group_locations (
    group_id,
    location_kind,
    city_name,
    region,
    country,
    venue_id,
    is_primary
  )
  select
    p_group_id,
    location_kind,
    city_name,
    region,
    country,
    venue_id,
    is_primary
  from pg_temp.next_group_locations
  order by ordinal;

  select coalesce(
    (
      select venue_id
      from pg_temp.next_group_locations
      where location_kind = 'venue'
        and is_primary
      limit 1
    ),
    (
      select venue_id
      from pg_temp.next_group_locations
      where location_kind = 'venue'
      order by ordinal
      limit 1
    )
  )
  into v_primary_venue_id;

  update public.groups
  set venue_id = v_primary_venue_id
  where id = p_group_id;

  return query
  select *
  from public.group_locations
  where group_id = p_group_id
  order by is_primary desc, created_at asc;
end;
$$;

alter function public.rpc_group_locations_replace(uuid, jsonb) owner to postgres;

comment on function public.rpc_group_locations_replace(uuid, jsonb)
is 'Boundary keeper replaces the cities and venues where a Shared Group plays. At least one city or venue is required; primary location is normalized server-side.';

grant all on function public.rpc_group_locations_replace(uuid, jsonb) to anon;
grant all on function public.rpc_group_locations_replace(uuid, jsonb) to authenticated;
grant all on function public.rpc_group_locations_replace(uuid, jsonb) to service_role;

create or replace function public.group_matches_user_play_locations(
  p_group_id uuid,
  p_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.group_locations gl
    where gl.group_id = p_group_id
      and (
        (
          gl.location_kind = 'city'
          and exists (
            select 1
            from public.user_play_cities upc
            where upc.user_id = p_user_id
              and lower(btrim(upc.city_name)) = lower(btrim(gl.city_name))
              and lower(btrim(coalesce(upc.region, ''))) = lower(btrim(coalesce(gl.region, '')))
              and lower(btrim(upc.country)) = lower(btrim(gl.country))
          )
        )
        or
        (
          gl.location_kind = 'venue'
          and (
            exists (
              select 1
              from public.venue_user_relationships vur
              where vur.user_id = p_user_id
                and vur.venue_id = gl.venue_id
                and vur.relationship_type = 'member'
            )
            or exists (
              select 1
              from public.venue_identities vi
              where vi.user_id = p_user_id
                and vi.venue_id = gl.venue_id
            )
            or exists (
              select 1
              from public.venues v
              join public.user_play_cities upc
                on lower(btrim(upc.city_name)) = lower(btrim(v.city))
               and lower(btrim(coalesce(upc.region, ''))) = lower(btrim(coalesce(v.province, '')))
               and lower(btrim(upc.country)) = lower(btrim(coalesce(v.country, '')))
              where v.id = gl.venue_id
                and upc.user_id = p_user_id
                and v.city is not null
                and v.country is not null
            )
          )
        )
      )
  );
$$;

alter function public.group_matches_user_play_locations(uuid, uuid) owner to postgres;

comment on function public.group_matches_user_play_locations(uuid, uuid)
is 'Checks a user against group-defined city/venue scope only. Does not use inviter location or group owner profile location.';

grant all on function public.group_matches_user_play_locations(uuid, uuid) to anon;
grant all on function public.group_matches_user_play_locations(uuid, uuid) to authenticated;
grant all on function public.group_matches_user_play_locations(uuid, uuid) to service_role;

create or replace function public.rpc_group_add_member(
  p_group_id uuid,
  p_target_user_id uuid,
  p_note text default null::text
) returns table (
  result text,
  group_id uuid,
  target_user_id uuid,
  request_id uuid,
  message text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor_id uuid := auth.uid();
  v_group public.groups%rowtype;
  v_existing_member public.group_members%rowtype;
  v_pending_request public.group_join_requests%rowtype;
  v_target_preference text;
  v_requires_approval boolean := true;
  v_sport_name text := null;
  v_group_label text;
  v_actor_name text := null;
  v_has_add_relationship boolean := false;
  v_actor_saved_by_target boolean := false;
  v_actor_shares_target_venue boolean := false;
  v_target_sport_matches boolean := false;
  v_group_matches_target_profile boolean := false;
begin
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_group
  from public.groups
  where id = p_group_id;

  if not found then
    raise exception 'group_not_found';
  end if;

  if p_target_user_id is null or p_target_user_id = v_actor_id then
    return query
    select
      'not_allowed'::text,
      p_group_id,
      p_target_user_id,
      null::uuid,
      'Choose someone else to add to this Shared Group.'::text;
    return;
  end if;

  if not exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = v_actor_id
      and gm.status = 'active'
      and gm.accepted_at is not null
      and gm.removed_at is null
  ) then
    return query
    select
      'not_allowed'::text,
      p_group_id,
      p_target_user_id,
      null::uuid,
      'Only active group members can add people to this Shared Group.'::text;
    return;
  end if;

  select coalesce(shared_group_join_preference, 'auto_join_saved_players')
  into v_target_preference
  from public.profiles
  where id = p_target_user_id;

  if v_target_preference is null then
    raise exception 'target_user_not_found';
  end if;

  select (
    exists (
      select 1
      from public.user_invite_circle uic
      where uic.owner_user_id = v_actor_id
        and uic.target_user_id = p_target_user_id
    )
    or public.do_users_share_group(v_actor_id, p_target_user_id)
    or exists (
      select 1
      from public.contact_records cr
      join public.people p
        on p.person_id = cr.person_id
       and p.linked_user_id = p_target_user_id
       and p.status = 'active'
      where cr.owner_user_id = v_actor_id
        and cr.archived_at is null
    )
    or exists (
      select 1
      from public.person_relationships pr
      join public.people p
        on p.person_id = pr.person_id
       and p.linked_user_id = p_target_user_id
       and p.status = 'active'
      where pr.actor_user_id = v_actor_id
        and pr.relationship_type in ('saved', 'direct_contact', 'group_contact', 'linked', 'imported_by')
    )
  )
  into v_has_add_relationship;

  if not coalesce(v_has_add_relationship, false) then
    return query
    select
      'not_allowed'::text,
      p_group_id,
      p_target_user_id,
      null::uuid,
      'You can only add saved players, linked contacts, or players who share a group with you.'::text;
    return;
  end if;

  select (
    exists (
      select 1
      from public.user_invite_circle uic
      where uic.owner_user_id = p_target_user_id
        and uic.target_user_id = v_actor_id
    )
    or exists (
      select 1
      from public.person_relationships pr
      join public.people p
        on p.person_id = pr.person_id
       and p.linked_user_id = v_actor_id
       and p.status = 'active'
      where pr.actor_user_id = p_target_user_id
        and pr.relationship_type = 'saved'
    )
  )
  into v_actor_saved_by_target;

  select exists (
    select 1
    from public.venue_user_relationships actor_vur
    join public.venue_user_relationships target_vur
      on target_vur.venue_id = actor_vur.venue_id
     and target_vur.user_id = p_target_user_id
     and target_vur.relationship_type = 'member'
    where actor_vur.user_id = v_actor_id
      and actor_vur.relationship_type = 'member'
  )
  into v_actor_shares_target_venue;

  v_target_sport_matches := (
    v_group.primary_sport_id is null
    or exists (
      select 1
      from public.user_sports us
      where us.user_id = p_target_user_id
        and us.sport_id = v_group.primary_sport_id
    )
  );

  v_group_matches_target_profile :=
    coalesce(v_target_sport_matches, false)
    and public.group_matches_user_play_locations(p_group_id, p_target_user_id);

  select display_name
  into v_actor_name
  from public.profiles
  where id = v_actor_id;

  if v_group.primary_sport_id is not null then
    select display_name
    into v_sport_name
    from public.sports
    where id = v_group.primary_sport_id;
  end if;

  v_group_label := case
    when v_sport_name is not null and nullif(trim(v_sport_name), '') is not null
      then trim(v_sport_name) || ' Group "' || v_group.name || '"'
    else 'Group "' || v_group.name || '"'
  end;

  select *
  into v_existing_member
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.user_id = p_target_user_id
  limit 1
  for update;

  if found
     and v_existing_member.status = 'active'
     and v_existing_member.accepted_at is not null
     and v_existing_member.removed_at is null then
    return query
    select
      'already_member'::text,
      p_group_id,
      p_target_user_id,
      null::uuid,
      'Already a member of this Shared Group.'::text;
    return;
  end if;

  if found
     and v_existing_member.status = 'pending'
     and v_existing_member.accepted_at is null
     and v_existing_member.removed_at is null then
    return query
    select
      'already_pending'::text,
      p_group_id,
      p_target_user_id,
      null::uuid,
      'This person already has a pending group invite.'::text;
    return;
  end if;

  select *
  into v_pending_request
  from public.group_join_requests gjr
  where gjr.group_id = p_group_id
    and gjr.target_user_id = p_target_user_id
    and gjr.status = 'pending'
  limit 1
  for update;

  if found then
    return query
    select
      'already_pending'::text,
      p_group_id,
      p_target_user_id,
      v_pending_request.id,
      'Approval is already pending for this person.'::text;
    return;
  end if;

  if v_target_preference = 'auto_join_all' then
    v_requires_approval := false;
  elsif v_target_preference = 'auto_join_saved_players' then
    v_requires_approval := not (
      coalesce(v_actor_saved_by_target, false)
      or coalesce(v_actor_shares_target_venue, false)
      or coalesce(v_group_matches_target_profile, false)
    );
  elsif v_target_preference = 'auto_join_enabled_sports' then
    v_requires_approval := not coalesce(v_group_matches_target_profile, false);
  else
    v_requires_approval := true;
  end if;

  if not v_requires_approval then
    if v_existing_member.id is not null then
      update public.group_members
      set
        status = 'active',
        join_method = 'added_by_member',
        invited_by = v_actor_id,
        accepted_at = now(),
        removed_at = null,
        removed_by = null
      where id = v_existing_member.id;
    else
      insert into public.group_members (
        group_id,
        user_id,
        status,
        join_method,
        invited_by,
        accepted_at
      ) values (
        p_group_id,
        p_target_user_id,
        'active',
        'added_by_member',
        v_actor_id,
        now()
      );
    end if;

    insert into public.notifications (
      recipient_user_id,
      kind,
      actor_user_id,
      note
    ) values (
      p_target_user_id,
      'group_added',
      v_actor_id,
      coalesce(v_actor_name, 'Someone') || ' added you to ' || v_group_label || '.'
    );

    return query
    select
      'direct_add_success'::text,
      p_group_id,
      p_target_user_id,
      null::uuid,
      'Added to group.'::text;
    return;
  end if;

  insert into public.group_join_requests (
    group_id,
    sport_id,
    requester_user_id,
    target_user_id,
    status,
    note,
    group_name_snapshot,
    sport_name_snapshot,
    requester_display_name_snapshot
  ) values (
    p_group_id,
    v_group.primary_sport_id,
    v_actor_id,
    p_target_user_id,
    'pending',
    nullif(trim(p_note), ''),
    v_group.name,
    v_sport_name,
    v_actor_name
  )
  returning * into v_pending_request;

  insert into public.notifications (
    recipient_user_id,
    kind,
    actor_user_id,
    note
  ) values (
    p_target_user_id,
    'group_join_request',
    v_actor_id,
    coalesce(v_actor_name, 'Someone') || ' requested to add you to ' || v_group_label || '.'
  );

  return query
  select
    'approval_required_request_created'::text,
    p_group_id,
    p_target_user_id,
    v_pending_request.id,
    'Approval requested.'::text;
end;
$$;

alter function public.rpc_group_add_member(uuid, uuid, text) owner to postgres;

comment on function public.rpc_group_add_member(uuid, uuid, text)
is 'Shared Groups: active members can add only saved/contact/shared-group users. Trusted auto-join uses target saved players, shared venues, and group-defined sport/location scope; it does not use inviter or group-owner profile locations.';

grant all on function public.rpc_group_add_member(uuid, uuid, text) to anon;
grant all on function public.rpc_group_add_member(uuid, uuid, text) to authenticated;
grant all on function public.rpc_group_add_member(uuid, uuid, text) to service_role;
