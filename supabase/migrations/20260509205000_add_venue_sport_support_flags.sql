alter table public.venues
  add column if not exists supports_tennis boolean not null default false,
  add column if not exists supports_pickleball boolean not null default false;

comment on column public.venues.supports_tennis is
  'Whether tennis can be played at this venue.';

comment on column public.venues.supports_pickleball is
  'Whether pickleball can be played at this venue.';

update public.venues v
set supports_tennis = true
where exists (
  select 1
  from public.venue_sports vs
  join public.sports s on s.id = vs.sport_id
  where vs.venue_id = v.id
    and s.code = 'tennis'
);

update public.venues v
set supports_pickleball = true
where exists (
  select 1
  from public.venue_sports vs
  join public.sports s on s.id = vs.sport_id
  where vs.venue_id = v.id
    and s.code = 'pickleball'
);

update public.venues v
set supports_tennis = true
where exists (
  select 1
  from public.courts c
  join public.sports s on s.id = c.sport_id
  where c.venue_id = v.id
    and s.code = 'tennis'
);

update public.venues v
set supports_pickleball = true
where exists (
  select 1
  from public.courts c
  join public.sports s on s.id = c.sport_id
  where c.venue_id = v.id
    and s.code = 'pickleball'
);

create index if not exists idx_venues_supports_tennis
  on public.venues (supports_tennis)
  where supports_tennis = true;

create index if not exists idx_venues_supports_pickleball
  on public.venues (supports_pickleball)
  where supports_pickleball = true;

drop function if exists public.rpc_venue_create(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text
);

create or replace function public.rpc_venue_create(
  p_name text,
  p_location_text text default null,
  p_timezone text default 'America/Toronto',
  p_notes text default null,
  p_venue_kind text default 'club',
  p_access_type text default 'members',
  p_abbreviation text default null,
  p_city text default null,
  p_province text default null,
  p_postal_code text default null,
  p_country text default null,
  p_website_url text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_contact_email text default null,
  p_venue_phone text default null,
  p_venue_email text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_indoor_outdoor text default null,
  p_facility_type text default null,
  p_booking_required boolean default null,
  p_cost_type text default null,
  p_supports_tennis boolean default false,
  p_supports_pickleball boolean default false
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

  if p_indoor_outdoor is not null and p_indoor_outdoor not in ('indoor', 'outdoor', 'indoor_outdoor') then
    raise exception 'invalid_indoor_outdoor';
  end if;

  if p_facility_type is not null and p_facility_type not in ('court_only', 'full_facility') then
    raise exception 'invalid_facility_type';
  end if;

  if p_cost_type is not null and p_cost_type not in ('free', 'paid') then
    raise exception 'invalid_cost_type';
  end if;

  insert into public.venues (
    name,
    abbreviation,
    location_text,
    city,
    province,
    postal_code,
    country,
    website_url,
    contact_name,
    contact_phone,
    contact_email,
    venue_phone,
    venue_email,
    latitude,
    longitude,
    indoor_outdoor,
    facility_type,
    booking_required,
    cost_type,
    supports_tennis,
    supports_pickleball,
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
    nullif(trim(p_province), ''),
    nullif(trim(p_postal_code), ''),
    nullif(trim(p_country), ''),
    nullif(trim(p_website_url), ''),
    nullif(trim(p_contact_name), ''),
    nullif(trim(p_contact_phone), ''),
    nullif(trim(p_contact_email), ''),
    nullif(trim(p_venue_phone), ''),
    nullif(trim(p_venue_email), ''),
    p_latitude,
    p_longitude,
    p_indoor_outdoor,
    p_facility_type,
    p_booking_required,
    p_cost_type,
    coalesce(p_supports_tennis, false),
    coalesce(p_supports_pickleball, false),
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

alter function public.rpc_venue_create(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text, boolean, boolean
) owner to postgres;

grant all on function public.rpc_venue_create(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text, boolean, boolean
) to anon;
grant all on function public.rpc_venue_create(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text, boolean, boolean
) to authenticated;
grant all on function public.rpc_venue_create(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text, boolean, boolean
) to service_role;

drop function if exists public.rpc_venue_update(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text
);

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
  p_province text default null,
  p_postal_code text default null,
  p_country text default null,
  p_website_url text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_contact_email text default null,
  p_venue_phone text default null,
  p_venue_email text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_indoor_outdoor text default null,
  p_facility_type text default null,
  p_booking_required boolean default null,
  p_cost_type text default null,
  p_supports_tennis boolean default null,
  p_supports_pickleball boolean default null
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

  if p_indoor_outdoor is not null and p_indoor_outdoor not in ('indoor', 'outdoor', 'indoor_outdoor') then
    raise exception 'invalid_indoor_outdoor';
  end if;

  if p_facility_type is not null and p_facility_type not in ('court_only', 'full_facility') then
    raise exception 'invalid_facility_type';
  end if;

  if p_cost_type is not null and p_cost_type not in ('free', 'paid') then
    raise exception 'invalid_cost_type';
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
    province = coalesce(p_province, province),
    postal_code = coalesce(p_postal_code, postal_code),
    country = coalesce(p_country, country),
    website_url = coalesce(p_website_url, website_url),
    contact_name = coalesce(p_contact_name, contact_name),
    contact_phone = coalesce(p_contact_phone, contact_phone),
    contact_email = coalesce(p_contact_email, contact_email),
    venue_phone = coalesce(p_venue_phone, venue_phone),
    venue_email = coalesce(p_venue_email, venue_email),
    latitude = coalesce(p_latitude, latitude),
    longitude = coalesce(p_longitude, longitude),
    indoor_outdoor = coalesce(p_indoor_outdoor, indoor_outdoor),
    facility_type = coalesce(p_facility_type, facility_type),
    booking_required = coalesce(p_booking_required, booking_required),
    cost_type = coalesce(p_cost_type, cost_type),
    supports_tennis = coalesce(p_supports_tennis, supports_tennis),
    supports_pickleball = coalesce(p_supports_pickleball, supports_pickleball),
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

alter function public.rpc_venue_update(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text, boolean, boolean
) owner to postgres;

grant all on function public.rpc_venue_update(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text, boolean, boolean
) to anon;
grant all on function public.rpc_venue_update(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text, boolean, boolean
) to authenticated;
grant all on function public.rpc_venue_update(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text, boolean, boolean
) to service_role;
