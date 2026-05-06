alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

comment on column public.profiles.onboarding_completed is
  'True only after the user successfully completes the required first onboarding save flow.';

alter table public.venue_user_relationships
  add column if not exists visible_in_venue_member_discovery boolean;

comment on column public.venue_user_relationships.visible_in_venue_member_discovery is
  'Venue-specific discovery visibility for member relationships. Null preserves legacy behavior and is treated as visible.';

update public.venue_user_relationships rel
set visible_in_venue_member_discovery = vi.visible_in_venue_member_discovery
from public.venue_identities vi
where rel.venue_id = vi.venue_id
  and rel.user_id = vi.user_id
  and rel.relationship_type = 'member'
  and rel.visible_in_venue_member_discovery is null
  and vi.visible_in_venue_member_discovery is not null;

create or replace function public.rpc_venue_relationship_set_member_discovery(
  p_venue_id uuid,
  p_visible_in_venue_member_discovery boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.venue_user_relationships
  set
    visible_in_venue_member_discovery = p_visible_in_venue_member_discovery,
    updated_at = now()
  where venue_id = p_venue_id
    and user_id = v_uid
    and relationship_type = 'member';

  if not found then
    raise exception 'venue_relation_not_found';
  end if;
end;
$$;

grant all on function public.rpc_venue_relationship_set_member_discovery(uuid, boolean) to authenticated;
grant all on function public.rpc_venue_relationship_set_member_discovery(uuid, boolean) to service_role;

create or replace function public.rpc_complete_first_onboarding(
  p_display_name text,
  p_sport_ids smallint[],
  p_play_cities jsonb default '[]'::jsonb,
  p_venue_ids uuid[] default '{}'::uuid[],
  p_visible_in_city_discovery boolean default false,
  p_visible_in_club_member_discovery boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_default_country constant text := 'Canada';
  v_default_region constant text := 'Ontario';
  v_requested_venue_ids uuid[] := coalesce(p_venue_ids, '{}'::uuid[]);
  v_unique_sport_ids smallint[] := '{}'::smallint[];
  v_unique_venue_ids uuid[] := '{}'::uuid[];
  v_primary_venue_id uuid := null;
  v_city_count integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_display_name is null then
    raise exception 'display_name_required';
  end if;

  if p_sport_ids is null or coalesce(array_length(p_sport_ids, 1), 0) = 0 then
    raise exception 'sports_required';
  end if;

  select coalesce(array_agg(distinct sport_id order by sport_id), '{}'::smallint[])
  into v_unique_sport_ids
  from unnest(p_sport_ids) as sport_id
  where sport_id is not null;

  if coalesce(array_length(v_unique_sport_ids, 1), 0) = 0 then
    raise exception 'sports_required';
  end if;

  if exists (
    select 1
    from unnest(v_unique_sport_ids) as sport_id
    where not exists (
      select 1
      from public.sports s
      where s.id = sport_id
        and s.is_active = true
    )
  ) then
    raise exception 'invalid_sport_id';
  end if;

  if p_play_cities is null then
    p_play_cities := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_play_cities) <> 'array' then
    raise exception 'invalid_city';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_play_cities) as item
    where nullif(btrim(coalesce(item ->> 'city_name', item ->> 'city', '')), '') is null
  ) then
    raise exception 'city_required';
  end if;

  with parsed as (
    select
      nullif(btrim(coalesce(item ->> 'city_name', item ->> 'city', '')), '') as city_name,
      coalesce(nullif(btrim(item ->> 'region'), ''), v_default_region) as region,
      coalesce(nullif(btrim(item ->> 'country'), ''), v_default_country) as country
    from jsonb_array_elements(p_play_cities) as item
  )
  select count(*)
  into v_city_count
  from parsed;

  if v_city_count > 8 then
    raise exception 'too_many_play_cities';
  end if;

  if exists (
    with parsed as (
      select
        nullif(btrim(coalesce(item ->> 'city_name', item ->> 'city', '')), '') as city_name,
        coalesce(nullif(btrim(item ->> 'region'), ''), v_default_region) as region,
        coalesce(nullif(btrim(item ->> 'country'), ''), v_default_country) as country
      from jsonb_array_elements(p_play_cities) as item
    )
    select 1
    from parsed
    group by lower(city_name), lower(region), lower(country)
    having count(*) > 1
  ) then
    raise exception 'duplicate_play_city';
  end if;

  select coalesce(array_agg(distinct venue_id order by venue_id), '{}'::uuid[])
  into v_unique_venue_ids
  from unnest(v_requested_venue_ids) as venue_id
  where venue_id is not null;

  if exists (
    select 1
    from unnest(v_unique_venue_ids) as venue_id
    where not exists (
      select 1
      from public.venues v
      where v.id = venue_id
    )
  ) then
    raise exception 'invalid_club_or_venue';
  end if;

  if v_city_count > 0 and exists (
    with normalized_cities as (
      select
        lower(nullif(btrim(coalesce(item ->> 'city_name', item ->> 'city', '')), '')) as city_name,
        lower(coalesce(nullif(btrim(item ->> 'region'), ''), v_default_region)) as region,
        lower(coalesce(nullif(btrim(item ->> 'country'), ''), v_default_country)) as country
      from jsonb_array_elements(p_play_cities) as item
    )
    select 1
    from public.venues v
    where v.id = any(v_unique_venue_ids)
      and v.city is not null
      and not exists (
        select 1
        from normalized_cities c
        where c.city_name = lower(btrim(v.city))
          and c.region = lower(coalesce(nullif(btrim(v.province), ''), v_default_region))
          and c.country = lower(coalesce(nullif(btrim(v.country), ''), v_default_country))
      )
  ) then
    raise exception 'club_city_mismatch';
  end if;

  insert into public.profiles (id, display_name)
  values (v_uid, v_display_name)
  on conflict (id) do update
  set display_name = excluded.display_name;

  delete from public.user_sports
  where user_id = v_uid;

  insert into public.user_sports (user_id, sport_id)
  select v_uid, sport_id
  from unnest(v_unique_sport_ids) as sport_id;

  delete from public.user_play_cities
  where user_id = v_uid;

  insert into public.user_play_cities (
    user_id,
    city_name,
    region,
    country
  )
  select
    v_uid,
    nullif(btrim(coalesce(item ->> 'city_name', item ->> 'city', '')), ''),
    coalesce(nullif(btrim(item ->> 'region'), ''), v_default_region),
    coalesce(nullif(btrim(item ->> 'country'), ''), v_default_country)
  from jsonb_array_elements(p_play_cities) as item;

  if coalesce(array_length(v_unique_venue_ids, 1), 0) > 0 then
    insert into public.venue_user_relationships (
      venue_id,
      user_id,
      relationship_type,
      visible_in_venue_member_discovery
    )
    select
      venue_id,
      v_uid,
      'member'::public.venue_relationship_type,
      p_visible_in_club_member_discovery
    from unnest(v_unique_venue_ids) as venue_id
    on conflict (venue_id, user_id, relationship_type) do update
    set
      visible_in_venue_member_discovery = excluded.visible_in_venue_member_discovery,
      updated_at = now();

    select venue_id
    into v_primary_venue_id
    from unnest(v_unique_venue_ids) as venue_id
    order by venue_id
    limit 1;
  end if;

  update public.profiles
  set
    display_name = v_display_name,
    visible_in_city_discovery = case
      when v_city_count > 0 then p_visible_in_city_discovery
      else false
    end,
    onboarding_completed = true,
    primary_venue_id = case
      when v_primary_venue_id is null then primary_venue_id
      when primary_venue_id = any(v_unique_venue_ids) then primary_venue_id
      else v_primary_venue_id
    end,
    updated_at = now()
  where id = v_uid;

  return jsonb_build_object(
    'onboarding_completed', true,
    'display_name', v_display_name,
    'sport_ids', to_jsonb(v_unique_sport_ids),
    'play_cities', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'city_name', city.city_name,
          'region', city.region,
          'country', city.country
        )
        order by lower(city.city_name), lower(city.region), lower(city.country)
      )
      from public.user_play_cities city
      where city.user_id = v_uid
    ), '[]'::jsonb),
    'club_or_venue_ids', to_jsonb(v_unique_venue_ids),
    'visible_in_city_discovery', case when v_city_count > 0 then p_visible_in_city_discovery else false end,
    'visible_in_club_member_discovery', case
      when coalesce(array_length(v_unique_venue_ids, 1), 0) > 0 then p_visible_in_club_member_discovery
      else false
    end
  );
end;
$$;

grant all on function public.rpc_complete_first_onboarding(text, smallint[], jsonb, uuid[], boolean, boolean) to authenticated;
grant all on function public.rpc_complete_first_onboarding(text, smallint[], jsonb, uuid[], boolean, boolean) to service_role;

create or replace function public.rpc_venue_people_discovery_v2(
  p_venue_id uuid,
  p_search text default null
) returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  relationship_type public.venue_relationship_type
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_search text := nullif(btrim(p_search), '');
  v_kind text;
  v_required_type public.venue_relationship_type;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select venue_kind
  into v_kind
  from public.venues
  where id = p_venue_id;

  if v_kind is null then
    return;
  end if;

  v_required_type := case
    when v_kind in ('club', 'private_facility', 'condo', 'school') then 'member'::public.venue_relationship_type
    else 'starred'::public.venue_relationship_type
  end;

  if not exists (
    select 1
    from public.venue_user_relationships caller_rel
    where caller_rel.venue_id = p_venue_id
      and caller_rel.user_id = v_uid
      and caller_rel.relationship_type = v_required_type
  ) then
    return;
  end if;

  return query
  select
    rel.user_id,
    p.display_name,
    p.avatar_url,
    rel.relationship_type
  from public.venue_user_relationships rel
  join public.profiles p
    on p.id = rel.user_id
  where rel.venue_id = p_venue_id
    and rel.relationship_type = v_required_type
    and rel.user_id <> v_uid
    and (
      rel.relationship_type <> 'member'
      or coalesce(rel.visible_in_venue_member_discovery, true) = true
    )
    and (
      v_search is null
      or coalesce(p.display_name, '') ilike '%' || v_search || '%'
      or coalesce(p.first_name, '') ilike '%' || v_search || '%'
      or coalesce(p.last_name, '') ilike '%' || v_search || '%'
    )
  order by lower(coalesce(nullif(trim(p.display_name), ''), rel.user_id::text));
end;
$$;

grant execute on function public.rpc_venue_people_discovery_v2(uuid, text) to authenticated;
grant execute on function public.rpc_venue_people_discovery_v2(uuid, text) to service_role;
