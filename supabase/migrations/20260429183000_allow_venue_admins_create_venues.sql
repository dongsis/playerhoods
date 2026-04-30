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

  insert into public.venue_admins (user_id, venue_id, granted_by)
  values (auth.uid(), v_venue.id, auth.uid())
  on conflict (user_id, venue_id) do nothing;

  return v_venue;
end;
$$;

alter function public.rpc_venue_create(text, text, text, text, text, text, text) owner to postgres;

grant all on function public.rpc_venue_create(text, text, text, text, text, text, text) to anon;
grant all on function public.rpc_venue_create(text, text, text, text, text, text, text) to authenticated;
grant all on function public.rpc_venue_create(text, text, text, text, text, text, text) to service_role;
