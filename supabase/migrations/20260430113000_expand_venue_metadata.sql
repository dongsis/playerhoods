alter table public.venues
  add column if not exists city text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists website_url text;

comment on column public.venues.city is
  'City or municipality for the venue address.';

comment on column public.venues.postal_code is
  'Postal or ZIP code for the venue address.';

comment on column public.venues.country is
  'Country for the venue address.';

comment on column public.venues.website_url is
  'Optional public website for the venue.';

drop function if exists public.rpc_venue_create(text, text, text, text, text, text, text);

create or replace function public.rpc_venue_create(
  p_name text,
  p_location_text text default null,
  p_timezone text default 'America/Toronto',
  p_notes text default null,
  p_venue_kind text default 'club',
  p_access_type text default 'members',
  p_abbreviation text default null,
  p_city text default null,
  p_postal_code text default null,
  p_country text default null,
  p_website_url text default null
) returns public.venues
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_venue public.venues;
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_super_admin = true
  ) and not exists (
    select 1
    from public.venue_admins
    where user_id = auth.uid()
  ) then
    raise exception 'not_authorized';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'name_required';
  end if;

  if p_venue_kind not in ('club', 'park', 'community_centre', 'condo', 'school', 'private_facility') then
    raise exception 'invalid_venue_kind';
  end if;

  if p_access_type not in ('public', 'members', 'private', 'restricted') then
    raise exception 'invalid_access_type';
  end if;

  insert into public.venues (
    name,
    abbreviation,
    location_text,
    city,
    postal_code,
    country,
    website_url,
    timezone,
    notes,
    venue_kind,
    access_type
  )
  values (
    trim(p_name),
    nullif(trim(p_abbreviation), ''),
    nullif(trim(p_location_text), ''),
    nullif(trim(p_city), ''),
    nullif(trim(p_postal_code), ''),
    nullif(trim(p_country), ''),
    nullif(trim(p_website_url), ''),
    coalesce(nullif(trim(p_timezone), ''), 'America/Toronto'),
    nullif(trim(p_notes), ''),
    p_venue_kind,
    p_access_type
  )
  returning * into v_venue;

  insert into public.venue_admins (user_id, venue_id, granted_by)
  values (auth.uid(), v_venue.id, auth.uid())
  on conflict (user_id, venue_id) do nothing;

  return v_venue;
end;
$$;

alter function public.rpc_venue_create(text, text, text, text, text, text, text, text, text, text, text) owner to postgres;

grant all on function public.rpc_venue_create(text, text, text, text, text, text, text, text, text, text, text) to anon;
grant all on function public.rpc_venue_create(text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant all on function public.rpc_venue_create(text, text, text, text, text, text, text, text, text, text, text) to service_role;

drop function if exists public.rpc_venue_update(uuid, text, text, text, text, text, text, text);

create or replace function public.rpc_venue_update(
  p_venue_id uuid,
  p_name text default null,
  p_location_text text default null,
  p_timezone text default null,
  p_notes text default null,
  p_venue_kind text default null,
  p_access_type text default null,
  p_abbreviation text default null,
  p_city text default null,
  p_postal_code text default null,
  p_country text default null,
  p_website_url text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_venue_admin(p_venue_id) then
    raise exception 'not_authorized';
  end if;

  if p_venue_kind is not null and p_venue_kind not in ('club', 'park', 'community_centre', 'condo', 'school', 'private_facility') then
    raise exception 'invalid_venue_kind';
  end if;

  if p_access_type is not null and p_access_type not in ('public', 'members', 'private', 'restricted') then
    raise exception 'invalid_access_type';
  end if;

  update public.venues
  set
    name = coalesce(p_name, name),
    abbreviation = case
      when p_abbreviation is null then abbreviation
      else nullif(trim(p_abbreviation), '')
    end,
    location_text = coalesce(p_location_text, location_text),
    city = coalesce(p_city, city),
    postal_code = coalesce(p_postal_code, postal_code),
    country = coalesce(p_country, country),
    website_url = coalesce(p_website_url, website_url),
    timezone = coalesce(p_timezone, timezone),
    notes = coalesce(p_notes, notes),
    venue_kind = coalesce(p_venue_kind, venue_kind),
    access_type = coalesce(p_access_type, access_type)
  where id = p_venue_id;

  if not found then
    raise exception 'venue_not_found';
  end if;
end;
$$;

alter function public.rpc_venue_update(uuid, text, text, text, text, text, text, text, text, text, text, text) owner to postgres;

grant all on function public.rpc_venue_update(uuid, text, text, text, text, text, text, text, text, text, text, text) to anon;
grant all on function public.rpc_venue_update(uuid, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant all on function public.rpc_venue_update(uuid, text, text, text, text, text, text, text, text, text, text, text) to service_role;
