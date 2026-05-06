alter table public.venues
  add column if not exists province text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists indoor_outdoor text,
  add column if not exists facility_type text,
  add column if not exists booking_required boolean,
  add column if not exists cost_type text;

comment on column public.venues.province is
  'Province or state for the venue address.';

comment on column public.venues.latitude is
  'Latitude for the venue location when known.';

comment on column public.venues.longitude is
  'Longitude for the venue location when known.';

comment on column public.venues.indoor_outdoor is
  'Venue environment classification: indoor, outdoor, or indoor_outdoor.';

comment on column public.venues.facility_type is
  'Facility scope classification: court_only or full_facility.';

comment on column public.venues.booking_required is
  'Whether bookings are usually required to use the venue.';

comment on column public.venues.cost_type is
  'High-level venue cost classification: free or paid.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'venues_indoor_outdoor_check'
      and conrelid = 'public.venues'::regclass
  ) then
    alter table public.venues
      add constraint venues_indoor_outdoor_check
      check (indoor_outdoor in ('indoor', 'outdoor', 'indoor_outdoor'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'venues_facility_type_check'
      and conrelid = 'public.venues'::regclass
  ) then
    alter table public.venues
      add constraint venues_facility_type_check
      check (facility_type in ('court_only', 'full_facility'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'venues_cost_type_check'
      and conrelid = 'public.venues'::regclass
  ) then
    alter table public.venues
      add constraint venues_cost_type_check
      check (cost_type in ('free', 'paid'));
  end if;
end
$$;

drop function if exists public.rpc_venue_create(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text);

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
  p_cost_type text default null
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
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text
) owner to postgres;

grant all on function public.rpc_venue_create(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text
) to anon;
grant all on function public.rpc_venue_create(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text
) to authenticated;
grant all on function public.rpc_venue_create(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text
) to service_role;

drop function if exists public.rpc_venue_update(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text);

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
  p_cost_type text default null
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
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text
) owner to postgres;

grant all on function public.rpc_venue_update(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text
) to anon;
grant all on function public.rpc_venue_update(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text
) to authenticated;
grant all on function public.rpc_venue_update(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, boolean, text
) to service_role;

do $$
declare
  seed record;
  v_venue_id uuid;
  v_tennis_id smallint;
  v_pickleball_id smallint;
  v_venue_kind text;
  v_access_type text;
  v_indoor_outdoor text;
  v_facility_type text;
  v_cost_type text;
  v_website_url text;
  v_index integer;
  v_sport_code text;
  v_sport_id smallint;
begin
  if not exists (
    select 1
    from public.sports
    where code = 'tennis'
  ) then
    insert into public.sports (id, code, display_name)
    values (
      coalesce((select max(id) from public.sports), 0)::smallint + 1,
      'tennis',
      'Tennis'
    );
  end if;

  if not exists (
    select 1
    from public.sports
    where code = 'pickleball'
  ) then
    insert into public.sports (id, code, display_name)
    values (
      coalesce((select max(id) from public.sports), 0)::smallint + 1,
      'pickleball',
      'Pickleball'
    );
  end if;

  select id into v_tennis_id
  from public.sports
  where code = 'tennis'
  limit 1;

  select id into v_pickleball_id
  from public.sports
  where code = 'pickleball'
  limit 1;

  if v_tennis_id is null or v_pickleball_id is null then
    raise exception 'required_sports_missing';
  end if;

  for seed in
    select *
    from (
      values
        ('Wallace Park Tennis Club', array['tennis']::text[], array[5]::integer[], '245 Reynolds St', 'Oakville', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'wallaceparktennis.com', true, 'Paid'),
        ('Meadowwood Tennis Club', array['tennis']::text[], array[3]::integer[], '1463 Litchfield Rd', 'Oakville', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'meadowwoodtennis.com', true, 'Paid'),
        ('Lawson Tennis Club', array['tennis']::text[], array[3]::integer[], '1152 Lawson Rd', 'Oakville', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'lawsontennis.com', true, 'Paid'),
        ('Glenashton Park', array['tennis']::text[], array[4]::integer[], '1051 Glenashton Dr', 'Oakville', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Full Facility', 'oakville.ca', false, 'Free'),
        ('Jonathan Park', array['tennis']::text[], array[2]::integer[], '1180 Jonathan Dr', 'Oakville', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'oakville.ca', false, 'Free'),
        ('Holton Heights Park', array['tennis']::text[], array[2]::integer[], '1315 Holton Heights Dr', 'Oakville', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'oakville.ca', false, 'Free'),
        ('William Rose Park', array['pickleball']::text[], array[3]::integer[], '455 Wheat Boom Dr', 'Oakville', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'oakville.ca', false, 'Free'),
        ('Fowley Park', array['pickleball']::text[], array[4]::integer[], '106 Fowley Dr', 'Oakville', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'oakville.ca', false, 'Free'),
        ('George Savage Park', array['pickleball']::text[], array[4]::integer[], '3200 George Savage Ave', 'Oakville', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'oakville.ca', false, 'Free'),
        ('Saw Whet Park', array['pickleball']::text[], array[2]::integer[], 'Bronte Rd', 'Oakville', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'oakville.ca', false, 'Free'),
        ('JSI Hockey Oakville', array['pickleball']::text[], array[1]::integer[], '505 Iroquois Shore Rd', 'Oakville', 'ON', 'Canada', 'America/Toronto', 'Indoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'jsihockey.com', true, 'Paid'),
        ('Burlington Tennis Club', array['tennis']::text[], array[6]::integer[], '501 Drury Ln', 'Burlington', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'burlingtontennis.com', true, 'Paid'),
        ('Appleby Tennis Club', array['tennis']::text[], array[6]::integer[], '4348 Longmoor Dr', 'Burlington', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'applebytennisclub.ca', true, 'Paid'),
        ('Aldershot Tennis Club', array['tennis']::text[], array[4]::integer[], '1061 Gallagher Rd', 'Burlington', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'aldershottennis.ca', true, 'Paid'),
        ('Tyandaga Tennis Club', array['tennis']::text[], array[4]::integer[], '1265 Tyandaga Park Dr', 'Burlington', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'tyandagatennis.com', true, 'Paid'),
        ('Burlington Fitness & Racquet', array['tennis']::text[], array[4]::integer[], '1233 Dillon Rd', 'Burlington', 'ON', 'Canada', 'America/Toronto', 'Indoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'burlingtonfitness.ca', true, 'Paid'),
        ('Palmer Park', array['pickleball']::text[], array[4]::integer[], '3409 Palmer Dr', 'Burlington', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'burlington.ca', false, 'Free'),
        ('Tansley Woods Park', array['pickleball']::text[], array[3]::integer[], '4100 Kilmer Dr', 'Burlington', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Full Facility', 'burlington.ca', false, 'Free'),
        ('Leighland Park', array['pickleball']::text[], array[2]::integer[], '1200 Leighland Rd', 'Burlington', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'burlington.ca', false, 'Free'),
        ('Blue Zone Courts', array['pickleball']::text[], array[8]::integer[], '5041 Fairview St', 'Burlington', 'ON', 'Canada', 'America/Toronto', 'Indoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'bluezonecourts.com', true, 'Paid'),
        ('Squeeze Pickleball', array['pickleball']::text[], array[6]::integer[], '3485 North Service Rd', 'Burlington', 'ON', 'Canada', 'America/Toronto', 'Indoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'squeezepickleball.com', true, 'Paid'),
        ('Burlington Pickleball', array['pickleball']::text[], array[5]::integer[], '3185 Harvester Rd', 'Burlington', 'ON', 'Canada', 'America/Toronto', 'Indoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'burlingtonpickleball.ca', true, 'Paid'),
        ('Milton Tennis Club', array['tennis']::text[], array[8]::integer[], '800 Santa Maria Blvd', 'Milton', 'ON', 'Canada', 'America/Toronto', 'Indoor/Outdoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'miltontennis.com', true, 'Paid'),
        ('Bronte Meadows Park', array['tennis', 'pickleball']::text[], array[2, 2]::integer[], '165 Laurier Ave', 'Milton', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'milton.ca', false, 'Free'),
        ('Optimist Park', array['tennis']::text[], array[3]::integer[], '881 Savoline Blvd', 'Milton', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'milton.ca', false, 'Free'),
        ('Rotary Park', array['tennis', 'pickleball']::text[], array[4, 4]::integer[], '100 Garden Ln', 'Milton', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'milton.ca', false, 'Free'),
        ('Kinsmen Park', array['pickleball']::text[], array[4]::integer[], '180 Wilson Dr', 'Milton', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'milton.ca', false, 'Free'),
        ('Milton Sports Centre', array['pickleball']::text[], array[4]::integer[], '605 Santa Maria Blvd', 'Milton', 'ON', 'Canada', 'America/Toronto', 'Indoor', 'Public', null::double precision, null::double precision, 'Full Facility', 'milton.ca', true, 'Paid'),
        ('Halton Hills TC (Eighth Line)', array['tennis']::text[], array[6]::integer[], '10241 8th Line', 'Georgetown', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'haltonhillstennis.com', true, 'Paid'),
        ('Prospect Park', array['tennis', 'pickleball']::text[], array[7, 7]::integer[], '30 Park Ave', 'Acton', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'haltonhills.ca', false, 'Free'),
        ('Emmerson Park', array['tennis', 'pickleball']::text[], array[6, 6]::integer[], '52 Carruthers Rd', 'Georgetown', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'haltonhills.ca', false, 'Free'),
        ('Joseph Gibbons Park', array['tennis', 'pickleball']::text[], array[4, 4]::integer[], '77 Weber St', 'Georgetown', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Public', null::double precision, null::double precision, 'Court Only', 'haltonhills.ca', false, 'Free'),
        ('Georgetown Racquet Club', array['pickleball']::text[], array[4]::integer[], '215 Armstrong Ave', 'Georgetown', 'ON', 'Canada', 'America/Toronto', 'Outdoor', 'Private', null::double precision, null::double precision, 'Full Facility', 'georgetownracquetclub.ca', true, 'Paid')
    ) as source(
      name,
      sport_codes,
      court_counts,
      location_text,
      city,
      province,
      country,
      timezone,
      indoor_outdoor_label,
      access_label,
      latitude,
      longitude,
      facility_type_label,
      website_host,
      booking_required,
      cost_label
    )
  loop
    v_website_url := case
      when seed.website_host is null or btrim(seed.website_host) = '' then null
      when seed.website_host ~* '^https?://' then btrim(seed.website_host)
      else 'https://' || btrim(seed.website_host)
    end;

    v_access_type := case lower(seed.access_label)
      when 'public' then 'public'
      when 'private' then 'private'
      else 'restricted'
    end;

    v_indoor_outdoor := case lower(seed.indoor_outdoor_label)
      when 'indoor' then 'indoor'
      when 'outdoor' then 'outdoor'
      when 'indoor/outdoor' then 'indoor_outdoor'
      else null
    end;

    v_facility_type := case lower(seed.facility_type_label)
      when 'court only' then 'court_only'
      when 'full facility' then 'full_facility'
      else null
    end;

    v_cost_type := case lower(seed.cost_label)
      when 'free' then 'free'
      when 'paid' then 'paid'
      else null
    end;

    v_venue_kind := case
      when seed.name = 'Milton Sports Centre' then 'community_centre'
      when lower(seed.access_label) = 'public' then 'park'
      when seed.name in ('JSI Hockey Oakville', 'Blue Zone Courts', 'Squeeze Pickleball', 'Burlington Pickleball', 'Georgetown Racquet Club') then 'private_facility'
      else 'club'
    end;

    select id
    into v_venue_id
    from public.venues
    where lower(name) = lower(seed.name)
    limit 1;

    if v_venue_id is null then
      insert into public.venues (
        name,
        location_text,
        city,
        province,
        country,
        website_url,
        timezone,
        venue_kind,
        access_type,
        latitude,
        longitude,
        indoor_outdoor,
        facility_type,
        booking_required,
        cost_type
      )
      values (
        seed.name,
        seed.location_text,
        seed.city,
        seed.province,
        seed.country,
        v_website_url,
        seed.timezone,
        v_venue_kind,
        v_access_type,
        seed.latitude,
        seed.longitude,
        v_indoor_outdoor,
        v_facility_type,
        seed.booking_required,
        v_cost_type
      )
      returning id into v_venue_id;
    else
      update public.venues
      set
        location_text = seed.location_text,
        city = seed.city,
        province = seed.province,
        country = seed.country,
        website_url = v_website_url,
        timezone = seed.timezone,
        venue_kind = v_venue_kind,
        access_type = v_access_type,
        latitude = seed.latitude,
        longitude = seed.longitude,
        indoor_outdoor = v_indoor_outdoor,
        facility_type = v_facility_type,
        booking_required = seed.booking_required,
        cost_type = v_cost_type
      where id = v_venue_id;
    end if;

    delete from public.venue_sports
    where venue_id = v_venue_id;

    for v_index in 1..coalesce(array_length(seed.sport_codes, 1), 0) loop
      v_sport_code := seed.sport_codes[v_index];
      v_sport_id := case v_sport_code
        when 'tennis' then v_tennis_id
        when 'pickleball' then v_pickleball_id
        else null
      end;

      if v_sport_id is null then
        raise exception 'unsupported_sport_code: %', v_sport_code;
      end if;

      insert into public.venue_sports (venue_id, sport_id, court_count)
      values (
        v_venue_id,
        v_sport_id,
        coalesce(seed.court_counts[v_index], seed.court_counts[1], 0)
      )
      on conflict (venue_id, sport_id) do update
      set court_count = excluded.court_count;
    end loop;
  end loop;
end
$$;
