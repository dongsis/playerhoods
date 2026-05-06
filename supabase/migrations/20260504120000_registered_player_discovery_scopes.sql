alter table public.profiles
  add column if not exists visible_in_city_discovery boolean not null default false,
  add column if not exists searchable_by_contact_info boolean not null default false;

comment on column public.profiles.visible_in_city_discovery is
  'Discovery: whether the user appears in city-based player discovery.';

comment on column public.profiles.searchable_by_contact_info is
  'Discovery: whether the user may be found by exact email or phone search.';

create table if not exists public.user_play_cities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  city_name text not null,
  region text null,
  country text not null default 'Canada',
  created_at timestamptz not null default now(),
  constraint user_play_cities_city_name_check check (char_length(btrim(city_name)) between 1 and 80),
  constraint user_play_cities_country_check check (char_length(btrim(country)) between 1 and 80)
);

create unique index if not exists user_play_cities_user_city_unique_idx
  on public.user_play_cities (
    user_id,
    lower(btrim(city_name)),
    lower(coalesce(btrim(region), '')),
    lower(btrim(country))
  );

alter table public.user_play_cities enable row level security;

drop policy if exists user_play_cities_select_own on public.user_play_cities;
create policy user_play_cities_select_own
  on public.user_play_cities
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_play_cities_insert_own on public.user_play_cities;
create policy user_play_cities_insert_own
  on public.user_play_cities
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_play_cities_update_own on public.user_play_cities;
create policy user_play_cities_update_own
  on public.user_play_cities
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists user_play_cities_delete_own on public.user_play_cities;
create policy user_play_cities_delete_own
  on public.user_play_cities
  for delete
  to authenticated
  using (user_id = auth.uid());

create or replace function public.normalize_discovery_phone(p_input text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
begin
  v_digits := nullif(regexp_replace(coalesce(p_input, ''), '\D', '', 'g'), '');
  if v_digits is null then
    return null;
  end if;

  if char_length(v_digits) = 11 and left(v_digits, 1) = '1' then
    return right(v_digits, 10);
  end if;

  return v_digits;
end;
$$;

create or replace function public.rpc_user_play_cities_replace(
  p_cities jsonb default '[]'::jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_cities is null then
    p_cities := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_cities) <> 'array' then
    raise exception 'invalid_play_cities_payload';
  end if;

  with parsed as (
    select
      nullif(btrim(coalesce(item ->> 'city_name', item ->> 'city', '')), '') as city_name,
      nullif(btrim(item ->> 'region'), '') as region,
      coalesce(nullif(btrim(item ->> 'country'), ''), 'Canada') as country
    from jsonb_array_elements(p_cities) as item
  ),
  cleaned as (
    select city_name, region, country
    from parsed
    where city_name is not null
  )
  select count(*)
  into v_count
  from cleaned;

  if v_count > 8 then
    raise exception 'play_cities_limit_exceeded';
  end if;

  if exists (
    with parsed as (
      select
        nullif(btrim(coalesce(item ->> 'city_name', item ->> 'city', '')), '') as city_name,
        nullif(btrim(item ->> 'region'), '') as region,
        coalesce(nullif(btrim(item ->> 'country'), ''), 'Canada') as country
      from jsonb_array_elements(p_cities) as item
    ),
    cleaned as (
      select city_name, region, country
      from parsed
      where city_name is not null
    )
    select 1
    from cleaned
    group by lower(city_name), lower(coalesce(region, '')), lower(country)
    having count(*) > 1
  ) then
    raise exception 'duplicate_play_city';
  end if;

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
    city_name,
    region,
    country
  from (
    select
      nullif(btrim(coalesce(item ->> 'city_name', item ->> 'city', '')), '') as city_name,
      nullif(btrim(item ->> 'region'), '') as region,
      coalesce(nullif(btrim(item ->> 'country'), ''), 'Canada') as country
    from jsonb_array_elements(p_cities) as item
  ) parsed
  where city_name is not null;
end;
$$;

grant all on function public.rpc_user_play_cities_replace(jsonb) to authenticated;
grant all on function public.rpc_user_play_cities_replace(jsonb) to service_role;

drop function if exists public.rpc_profile_update(
  text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text
);

create or replace function public.rpc_profile_update(
  p_first_name text default null::text,
  p_last_name text default null::text,
  p_contact_channel text default null::text,
  p_contact_email text default null::text,
  p_contact_phone text default null::text,
  p_show_in_venue_member_discovery boolean default null::boolean,
  p_allow_non_group_invites boolean default null::boolean,
  p_looking_to_play text default null::text,
  p_preferred_play_times text[] default null::text[],
  p_gender text default null::text,
  p_shared_group_join_preference text default null::text,
  p_availability_status text default null::text,
  p_availability_note text default null::text,
  p_availability_until text default null::text,
  p_visible_in_city_discovery boolean default null::boolean,
  p_searchable_by_contact_info boolean default null::boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_preferred_play_times text[] := null;
  v_gender text := null;
  v_shared_group_join_preference text := null;
  v_availability_status text := null;
  v_availability_until date := null;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_looking_to_play is not null
    and nullif(trim(p_looking_to_play), '') is not null
    and trim(p_looking_to_play) not in ('very_open', 'open', 'occasional', 'quite_full', 'not_looking')
  then
    raise exception 'invalid_looking_to_play';
  end if;

  if p_preferred_play_times is not null and exists (
    select 1
    from unnest(p_preferred_play_times) as raw_value
    where nullif(trim(raw_value), '') is not null
      and char_length(trim(raw_value)) > 80
  ) then
    raise exception 'invalid_preferred_play_times';
  end if;

  if p_gender is not null then
    v_gender := nullif(trim(lower(p_gender)), '');
    if v_gender is not null and v_gender not in ('male', 'female', 'unspecified') then
      raise exception 'invalid_gender';
    end if;
  end if;

  if p_shared_group_join_preference is not null then
    v_shared_group_join_preference := nullif(trim(lower(p_shared_group_join_preference)), '');
    if v_shared_group_join_preference is not null
      and v_shared_group_join_preference not in ('approval_required_all', 'auto_join_enabled_sports', 'auto_join_all')
    then
      raise exception 'invalid_shared_group_join_preference';
    end if;
  end if;

  if p_availability_status is not null then
    v_availability_status := coalesce(nullif(trim(lower(p_availability_status)), ''), 'available');
    if v_availability_status not in ('available', 'busy', 'away', 'inactive') then
      raise exception 'invalid_availability_status';
    end if;
  end if;

  if p_availability_until is not null and nullif(trim(p_availability_until), '') is not null then
    begin
      v_availability_until := trim(p_availability_until)::date;
    exception
      when others then
        raise exception 'invalid_availability_until';
    end;
  end if;

  if p_preferred_play_times is not null then
    select coalesce(
      array_agg(distinct trimmed order by trimmed)
        filter (where trimmed is not null),
      '{}'::text[]
    )
    into v_preferred_play_times
    from (
      select nullif(trim(raw_value), '') as trimmed
      from unnest(p_preferred_play_times) as raw_value
    ) normalized;
  end if;

  update public.profiles
  set
    first_name = case when p_first_name is not null then nullif(trim(p_first_name), '') else first_name end,
    last_name = case when p_last_name is not null then nullif(trim(p_last_name), '') else last_name end,
    contact_channel = case when p_contact_channel in ('email', 'sms') then p_contact_channel else contact_channel end,
    contact_email = case when p_contact_email is not null then nullif(trim(lower(p_contact_email)), '') else contact_email end,
    contact_phone = case when p_contact_phone is not null then nullif(trim(p_contact_phone), '') else contact_phone end,
    show_in_venue_member_discovery = case
      when p_show_in_venue_member_discovery is not null then p_show_in_venue_member_discovery
      else show_in_venue_member_discovery
    end,
    visible_in_city_discovery = case
      when p_visible_in_city_discovery is not null then p_visible_in_city_discovery
      else visible_in_city_discovery
    end,
    searchable_by_contact_info = case
      when p_searchable_by_contact_info is not null then p_searchable_by_contact_info
      else searchable_by_contact_info
    end,
    allow_non_group_invites = case
      when p_allow_non_group_invites is not null then p_allow_non_group_invites
      else allow_non_group_invites
    end,
    looking_to_play = case
      when p_looking_to_play is not null then nullif(trim(p_looking_to_play), '')
      else looking_to_play
    end,
    preferred_play_times = case
      when p_preferred_play_times is not null then v_preferred_play_times
      else preferred_play_times
    end,
    gender = case
      when p_gender is not null then v_gender::public.gender_type
      else gender
    end,
    shared_group_join_preference = case
      when p_shared_group_join_preference is not null then v_shared_group_join_preference::public.shared_group_join_preference
      else shared_group_join_preference
    end,
    availability_status = case
      when p_availability_status is not null then v_availability_status::public.availability_status
      else availability_status
    end,
    availability_note = case
      when p_availability_note is not null then nullif(trim(p_availability_note), '')
      else availability_note
    end,
    availability_until = case
      when p_availability_until is not null then v_availability_until::text
      else availability_until
    end,
    updated_at = now()
  where id = auth.uid();
end;
$$;

comment on function public.rpc_profile_update(
  text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text, boolean, boolean
) is 'Canonical profile update RPC. Includes registered-user discovery scope settings for club, city, and exact email or phone search.';

grant all on function public.rpc_profile_update(
  text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text, boolean, boolean
) to anon;
grant all on function public.rpc_profile_update(
  text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text, boolean, boolean
) to authenticated;
grant all on function public.rpc_profile_update(
  text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text, boolean, boolean
) to service_role;

create or replace function public.rpc_city_players_discovery(
  p_city text,
  p_search text default null
) returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  shared_city_names text[],
  is_saved boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_city text := lower(btrim(coalesce(p_city, '')));
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_city = '' then
    return;
  end if;

  if not exists (
    select 1
    from public.user_play_cities my_city
    where my_city.user_id = v_uid
      and lower(btrim(my_city.city_name)) = v_city
  ) then
    return;
  end if;

  return query
  select
    p.id as user_id,
    p.display_name,
    p.avatar_url,
    array_agg(distinct upc.city_name order by upc.city_name) as shared_city_names,
    exists (
      select 1
      from public.user_invite_circle uic
      where uic.owner_user_id = v_uid
        and uic.target_user_id = p.id
    ) as is_saved
  from public.profiles p
  join public.user_play_cities upc
    on upc.user_id = p.id
  where p.id <> v_uid
    and p.visible_in_city_discovery = true
    and lower(btrim(upc.city_name)) = v_city
    and (
      v_search is null
      or lower(coalesce(nullif(btrim(p.display_name), ''), '')) like '%' || v_search || '%'
    )
  group by p.id, p.display_name, p.avatar_url
  order by lower(coalesce(nullif(btrim(p.display_name), ''), p.id::text));
end;
$$;

grant all on function public.rpc_city_players_discovery(text, text) to authenticated;
grant all on function public.rpc_city_players_discovery(text, text) to service_role;

create or replace function public.rpc_player_search_by_contact_info(
  p_query text
) returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  match_type text,
  is_saved boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := nullif(lower(btrim(coalesce(p_query, ''))), '');
  v_phone text := public.normalize_discovery_phone(p_query);
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_email is null and v_phone is null then
    return;
  end if;

  if v_email is not null and position('@' in v_email) > 0 then
    return query
    select
      p.id as user_id,
      p.display_name,
      p.avatar_url,
      'email'::text as match_type,
      exists (
        select 1
        from public.user_invite_circle uic
        where uic.owner_user_id = v_uid
          and uic.target_user_id = p.id
      ) as is_saved
    from public.profiles p
    join auth.users u
      on u.id = p.id
    where p.id <> v_uid
      and p.searchable_by_contact_info = true
      and lower(coalesce(nullif(btrim(p.contact_email), ''), u.email::text)) = v_email
    order by lower(coalesce(nullif(btrim(p.display_name), ''), p.id::text))
    limit 10;
    return;
  end if;

  if v_phone is null then
    return;
  end if;

  return query
  select
    p.id as user_id,
    p.display_name,
    p.avatar_url,
    'phone'::text as match_type,
    exists (
      select 1
      from public.user_invite_circle uic
      where uic.owner_user_id = v_uid
        and uic.target_user_id = p.id
    ) as is_saved
  from public.profiles p
  join auth.users u
    on u.id = p.id
  where p.id <> v_uid
    and p.searchable_by_contact_info = true
    and public.normalize_discovery_phone(coalesce(nullif(btrim(p.contact_phone), ''), u.phone::text)) = v_phone
  order by lower(coalesce(nullif(btrim(p.display_name), ''), p.id::text))
  limit 10;
end;
$$;

grant all on function public.rpc_player_search_by_contact_info(text) to authenticated;
grant all on function public.rpc_player_search_by_contact_info(text) to service_role;
