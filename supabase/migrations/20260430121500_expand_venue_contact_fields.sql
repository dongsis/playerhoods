alter table public.venues
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists venue_phone text,
  add column if not exists venue_email text;

comment on column public.venues.contact_name is
  'Primary venue contact person name.';

comment on column public.venues.contact_phone is
  'Primary venue contact phone number.';

comment on column public.venues.contact_email is
  'Primary venue contact email address.';

comment on column public.venues.venue_phone is
  'General venue phone number.';

comment on column public.venues.venue_email is
  'General venue email address.';

drop function if exists public.rpc_venue_create(text, text, text, text, text, text, text, text, text, text, text);

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
  p_website_url text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_contact_email text default null,
  p_venue_phone text default null,
  p_venue_email text default null
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
    contact_name,
    contact_phone,
    contact_email,
    venue_phone,
    venue_email,
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
    nullif(trim(p_contact_name), ''),
    nullif(trim(p_contact_phone), ''),
    nullif(trim(p_contact_email), ''),
    nullif(trim(p_venue_phone), ''),
    nullif(trim(p_venue_email), ''),
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

alter function public.rpc_venue_create(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) owner to postgres;

grant all on function public.rpc_venue_create(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to anon;
grant all on function public.rpc_venue_create(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant all on function public.rpc_venue_create(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to service_role;

drop function if exists public.rpc_venue_update(uuid, text, text, text, text, text, text, text, text, text, text, text);

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
  p_website_url text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_contact_email text default null,
  p_venue_phone text default null,
  p_venue_email text default null
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
    contact_name = coalesce(p_contact_name, contact_name),
    contact_phone = coalesce(p_contact_phone, contact_phone),
    contact_email = coalesce(p_contact_email, contact_email),
    venue_phone = coalesce(p_venue_phone, venue_phone),
    venue_email = coalesce(p_venue_email, venue_email),
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

alter function public.rpc_venue_update(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) owner to postgres;

grant all on function public.rpc_venue_update(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to anon;
grant all on function public.rpc_venue_update(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant all on function public.rpc_venue_update(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to service_role;
