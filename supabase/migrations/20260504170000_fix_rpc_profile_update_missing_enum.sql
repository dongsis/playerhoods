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
    and lower(trim(p_looking_to_play)) not in ('yes', 'no', 'maybe') then
    raise exception 'invalid_looking_to_play';
  end if;

  if p_preferred_play_times is not null then
    select coalesce(array_agg(value), '{}'::text[])
    into v_preferred_play_times
    from (
      select distinct nullif(trim(lower(entry)), '') as value
      from unnest(p_preferred_play_times) as entry
    ) cleaned
    where value is not null;

    if exists (
      select 1
      from unnest(coalesce(v_preferred_play_times, '{}'::text[])) as value
      where value not in (
        'early_mornings',
        'weekday_mornings',
        'weekday_lunch',
        'weekday_afternoons',
        'weekday_evenings',
        'friday_evenings',
        'saturday_mornings',
        'saturday_afternoons',
        'saturday_evenings',
        'sunday_mornings',
        'sunday_afternoons',
        'sunday_evenings',
        'late_nights',
        'flexible',
        'custom'
      )
    ) then
      raise exception 'invalid_preferred_play_times';
    end if;
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
      and v_shared_group_join_preference not in ('approval_required_all', 'auto_join_enabled_sports', 'auto_join_all') then
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

  update public.profiles
  set
    first_name = coalesce(p_first_name, first_name),
    last_name = coalesce(p_last_name, last_name),
    contact_channel = case
      when p_contact_channel is not null then coalesce(nullif(trim(lower(p_contact_channel)), ''), 'email')
      else contact_channel
    end,
    contact_email = case
      when p_contact_email is not null then nullif(trim(lower(p_contact_email)), '')
      else contact_email
    end,
    contact_phone = case
      when p_contact_phone is not null then nullif(trim(p_contact_phone), '')
      else contact_phone
    end,
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
      when p_looking_to_play is not null then nullif(trim(lower(p_looking_to_play)), '')
      else looking_to_play
    end,
    preferred_play_times = case
      when p_preferred_play_times is not null then v_preferred_play_times
      else preferred_play_times
    end,
    gender = case
      when p_gender is not null then coalesce(v_gender, 'unspecified')
      else gender
    end,
    shared_group_join_preference = case
      when p_shared_group_join_preference is not null then v_shared_group_join_preference::public.shared_group_join_preference
      else shared_group_join_preference
    end,
    availability_status = case
      when p_availability_status is not null then coalesce(v_availability_status, 'available')
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
