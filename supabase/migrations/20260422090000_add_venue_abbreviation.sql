alter table public.venues
  add column if not exists abbreviation text;

comment on column public.venues.abbreviation is
  'Optional short display label for a venue. UI uses this in compact club display contexts.';

create or replace function public.rpc_venue_create(
  p_name text,
  p_location_text text default null,
  p_timezone text default 'America/Toronto',
  p_notes text default null,
  p_venue_kind text default 'club',
  p_access_type text default 'members',
  p_abbreviation text default null
) returns public.venues
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_venue public.venues;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true) then
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

  insert into public.venues (name, abbreviation, location_text, timezone, notes, venue_kind, access_type)
  values (
    trim(p_name),
    nullif(trim(p_abbreviation), ''),
    p_location_text,
    coalesce(nullif(trim(p_timezone), ''), 'America/Toronto'),
    p_notes,
    p_venue_kind,
    p_access_type
  )
  returning * into v_venue;

  return v_venue;
end;
$$;

alter function public.rpc_venue_create(text, text, text, text, text, text, text) owner to postgres;

grant all on function public.rpc_venue_create(text, text, text, text, text, text, text) to anon;
grant all on function public.rpc_venue_create(text, text, text, text, text, text, text) to authenticated;
grant all on function public.rpc_venue_create(text, text, text, text, text, text, text) to service_role;

create or replace function public.rpc_venue_update(
  p_venue_id uuid,
  p_name text default null,
  p_location_text text default null,
  p_timezone text default null,
  p_notes text default null,
  p_venue_kind text default null,
  p_access_type text default null,
  p_abbreviation text default null
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
    timezone = coalesce(p_timezone, timezone),
    notes = coalesce(p_notes, notes),
    venue_kind = coalesce(p_venue_kind, venue_kind),
    access_type = coalesce(p_access_type, access_type)
  where id = p_venue_id;

  if not found then
    raise exception 'club_not_found';
  end if;
end;
$$;

alter function public.rpc_venue_update(uuid, text, text, text, text, text, text, text) owner to postgres;

grant all on function public.rpc_venue_update(uuid, text, text, text, text, text, text, text) to anon;
grant all on function public.rpc_venue_update(uuid, text, text, text, text, text, text, text) to authenticated;
grant all on function public.rpc_venue_update(uuid, text, text, text, text, text, text, text) to service_role;
