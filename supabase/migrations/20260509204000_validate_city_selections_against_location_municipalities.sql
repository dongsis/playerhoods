create or replace function public.location_municipality_exists(
  p_city_name text,
  p_region text default null::text,
  p_country text default null::text
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.location_municipalities lm
    where lower(btrim(lm.city_municipality)) = lower(btrim(coalesce(p_city_name, '')))
      and (
        nullif(btrim(coalesce(p_country, '')), '') is null
        or lower(btrim(lm.country_name)) = lower(btrim(p_country))
        or lower(btrim(lm.country_code)) = lower(btrim(p_country))
      )
      and (
        nullif(btrim(coalesce(p_region, '')), '') is null
        or lower(btrim(lm.province_name)) = lower(btrim(p_region))
        or lower(btrim(lm.province_code)) = lower(btrim(p_region))
      )
  );
$$;

alter function public.location_municipality_exists(text, text, text) owner to postgres;

comment on function public.location_municipality_exists(text, text, text)
is 'Validates a city/municipality against the canonical location_municipalities reference table. Accepts province/country names or codes.';

grant all on function public.location_municipality_exists(text, text, text) to anon;
grant all on function public.location_municipality_exists(text, text, text) to authenticated;
grant all on function public.location_municipality_exists(text, text, text) to service_role;

create or replace function public.trg_validate_user_play_city_known()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.location_municipality_exists(new.city_name, new.region, new.country) then
    raise exception 'invalid_play_city';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_user_play_city_known on public.user_play_cities;
create trigger validate_user_play_city_known
  before insert or update of city_name, region, country
  on public.user_play_cities
  for each row
  execute function public.trg_validate_user_play_city_known();

create or replace function public.trg_validate_group_location_city_known()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.location_kind = 'city'
     and not public.location_municipality_exists(new.city_name, new.region, new.country) then
    raise exception 'invalid_group_city';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_group_location_city_known on public.group_locations;
create trigger validate_group_location_city_known
  before insert or update of location_kind, city_name, region, country
  on public.group_locations
  for each row
  execute function public.trg_validate_group_location_city_known();

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

  if exists (
    with parsed as (
      select
        nullif(btrim(coalesce(item ->> 'city_name', item ->> 'city', '')), '') as city_name,
        nullif(btrim(item ->> 'region'), '') as region,
        coalesce(nullif(btrim(item ->> 'country'), ''), 'Canada') as country
      from jsonb_array_elements(p_cities) as item
    )
    select 1
    from parsed
    where city_name is not null
      and not public.location_municipality_exists(city_name, region, country)
  ) then
    raise exception 'invalid_play_city';
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

alter function public.rpc_user_play_cities_replace(jsonb) owner to postgres;
grant all on function public.rpc_user_play_cities_replace(jsonb) to authenticated;
grant all on function public.rpc_user_play_cities_replace(jsonb) to service_role;
