alter table public.groups
  add column if not exists recommended_level_min numeric(3,1),
  add column if not exists recommended_level_max numeric(3,1);

comment on column public.groups.recommended_level_min is
  'Optional lower bound for the Shared Group recommended player level, e.g. 3.0.';

comment on column public.groups.recommended_level_max is
  'Optional upper bound for the Shared Group recommended player level, e.g. 4.0.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'groups_recommended_level_range_check'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_recommended_level_range_check
      check (
        (recommended_level_min is null or recommended_level_min between 1.0 and 7.0)
        and (recommended_level_max is null or recommended_level_max between 1.0 and 7.0)
        and (
          recommended_level_min is null
          or recommended_level_max is null
          or recommended_level_min <= recommended_level_max
        )
      );
  end if;
end
$$;

drop function if exists public.rpc_group_create(text, text, smallint, text, uuid);

create or replace function public.rpc_group_create(
  p_name text,
  p_description text default null,
  p_primary_sport_id smallint default null,
  p_icon_key text default 'spark',
  p_venue_id uuid default null,
  p_recommended_level_min numeric default null,
  p_recommended_level_max numeric default null
) returns public.groups
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid;
  v_row public.groups;
  v_trimmed_name text;
  v_icon_key text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  v_trimmed_name := trim(p_name);
  if v_trimmed_name is null or v_trimmed_name = '' then
    raise exception 'Group name must not be empty';
  end if;

  if p_primary_sport_id is not null and not exists (
    select 1 from public.sports s where s.id = p_primary_sport_id and s.is_active = true
  ) then
    raise exception 'invalid_sport';
  end if;

  if p_venue_id is not null and not exists (
    select 1
    from public.venue_user_relationships vur
    where vur.user_id = v_user_id
      and vur.venue_id = p_venue_id
      and vur.relationship_type = 'member'
  ) then
    raise exception 'invalid_group_venue';
  end if;

  if (p_recommended_level_min is not null and (p_recommended_level_min < 1.0 or p_recommended_level_min > 7.0))
    or (p_recommended_level_max is not null and (p_recommended_level_max < 1.0 or p_recommended_level_max > 7.0))
    or (
      p_recommended_level_min is not null
      and p_recommended_level_max is not null
      and p_recommended_level_min > p_recommended_level_max
    ) then
    raise exception 'invalid_group_level_range';
  end if;

  v_icon_key := nullif(trim(coalesce(p_icon_key, 'spark')), '');
  if v_icon_key is null then
    v_icon_key := 'spark';
  end if;

  insert into public.groups (
    name,
    description,
    created_by,
    boundary_keeper_id,
    primary_sport_id,
    icon_key,
    venue_id,
    recommended_level_min,
    recommended_level_max
  )
  values (
    v_trimmed_name,
    nullif(trim(coalesce(p_description, '')), ''),
    v_user_id,
    v_user_id,
    p_primary_sport_id,
    v_icon_key,
    p_venue_id,
    p_recommended_level_min,
    p_recommended_level_max
  )
  returning * into v_row;

  insert into public.group_members (group_id, user_id, status, join_method, accepted_at)
  values (v_row.id, v_user_id, 'active', 'created', now());

  return v_row;
end;
$$;

alter function public.rpc_group_create(text, text, smallint, text, uuid, numeric, numeric) owner to postgres;
grant all on function public.rpc_group_create(text, text, smallint, text, uuid, numeric, numeric) to anon;
grant all on function public.rpc_group_create(text, text, smallint, text, uuid, numeric, numeric) to authenticated;
grant all on function public.rpc_group_create(text, text, smallint, text, uuid, numeric, numeric) to service_role;

drop function if exists public.rpc_group_update(uuid, text, text, smallint, boolean, text, uuid);

create or replace function public.rpc_group_update(
  p_group_id uuid,
  p_name text,
  p_description text default null,
  p_primary_sport_id smallint default null,
  p_open_to_club_members boolean default null,
  p_icon_key text default null,
  p_venue_id uuid default null,
  p_recommended_level_min numeric default null,
  p_recommended_level_max numeric default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_affected int;
  v_trimmed text;
  v_icon_key text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_trimmed := trim(p_name);
  if v_trimmed is null or v_trimmed = '' then
    raise exception 'Group name must not be empty';
  end if;

  if p_primary_sport_id is not null and not exists (
    select 1 from public.sports s where s.id = p_primary_sport_id and s.is_active = true
  ) then
    raise exception 'invalid_sport';
  end if;

  if p_venue_id is not null and not exists (
    select 1
    from public.venue_user_relationships vur
    where vur.user_id = auth.uid()
      and vur.venue_id = p_venue_id
      and vur.relationship_type = 'member'
  ) then
    raise exception 'invalid_group_venue';
  end if;

  if (p_recommended_level_min is not null and (p_recommended_level_min < 1.0 or p_recommended_level_min > 7.0))
    or (p_recommended_level_max is not null and (p_recommended_level_max < 1.0 or p_recommended_level_max > 7.0))
    or (
      p_recommended_level_min is not null
      and p_recommended_level_max is not null
      and p_recommended_level_min > p_recommended_level_max
    ) then
    raise exception 'invalid_group_level_range';
  end if;

  v_icon_key := nullif(trim(coalesce(p_icon_key, '')), '');

  update public.groups
  set name = v_trimmed,
      description = nullif(trim(coalesce(p_description, '')), ''),
      primary_sport_id = p_primary_sport_id,
      open_to_club_members = coalesce(p_open_to_club_members, open_to_club_members),
      icon_key = coalesce(v_icon_key, icon_key),
      venue_id = p_venue_id,
      recommended_level_min = p_recommended_level_min,
      recommended_level_max = p_recommended_level_max
  where id = p_group_id
    and boundary_keeper_id = auth.uid();

  get diagnostics v_affected = row_count;
  if v_affected = 0 then
    raise exception 'Group not found or you are not the boundary keeper';
  end if;
end;
$$;

alter function public.rpc_group_update(uuid, text, text, smallint, boolean, text, uuid, numeric, numeric) owner to postgres;
grant all on function public.rpc_group_update(uuid, text, text, smallint, boolean, text, uuid, numeric, numeric) to anon;
grant all on function public.rpc_group_update(uuid, text, text, smallint, boolean, text, uuid, numeric, numeric) to authenticated;
grant all on function public.rpc_group_update(uuid, text, text, smallint, boolean, text, uuid, numeric, numeric) to service_role;
