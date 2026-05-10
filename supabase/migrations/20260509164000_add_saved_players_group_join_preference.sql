alter table public.profiles
  drop constraint if exists profiles_shared_group_join_preference_check;

update public.profiles
set shared_group_join_preference = 'auto_join_saved_players'
where shared_group_join_preference is null
   or shared_group_join_preference = 'approval_required_all';

alter table public.profiles
  alter column shared_group_join_preference set default 'auto_join_saved_players';

alter table public.profiles
  add constraint profiles_shared_group_join_preference_check
  check (
    shared_group_join_preference = any (
      array[
        'auto_join_saved_players'::text,
        'approval_required_all'::text,
        'auto_join_enabled_sports'::text,
        'auto_join_all'::text
      ]
    )
  );

comment on column public.profiles.shared_group_join_preference
is 'Shared Groups: auto_join_saved_players | approval_required_all | auto_join_enabled_sports | auto_join_all.';

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
      and v_shared_group_join_preference not in (
        'auto_join_saved_players',
        'approval_required_all',
        'auto_join_enabled_sports',
        'auto_join_all'
      )
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
    first_name = case when p_first_name is not null then trim(p_first_name) else first_name end,
    last_name = case when p_last_name is not null then trim(p_last_name) else last_name end,
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
      when p_gender is not null then coalesce(v_gender, 'unspecified')
      else gender
    end,
    shared_group_join_preference = case
      when p_shared_group_join_preference is not null then coalesce(v_shared_group_join_preference, 'auto_join_saved_players')
      else shared_group_join_preference
    end,
    availability_status = case
      when p_availability_status is not null then v_availability_status
      else availability_status
    end,
    availability_note = case
      when p_availability_note is not null then nullif(trim(p_availability_note), '')
      else availability_note
    end,
    availability_until = case
      when p_availability_until is not null then v_availability_until
      else availability_until
    end,
    updated_at = now()
  where id = auth.uid();
end;
$$;

comment on function public.rpc_profile_update(
  text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text, boolean, boolean
) is 'Canonical profile update RPC. Supports shared group join preferences including auto_join_saved_players.';

grant all on function public.rpc_profile_update(
  text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text, boolean, boolean
) to anon;
grant all on function public.rpc_profile_update(
  text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text, boolean, boolean
) to authenticated;
grant all on function public.rpc_profile_update(
  text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text, boolean, boolean
) to service_role;

create or replace function public.rpc_group_add_member(
  p_group_id uuid,
  p_target_user_id uuid,
  p_note text default null::text
) returns table (
  result text,
  group_id uuid,
  target_user_id uuid,
  request_id uuid,
  message text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor_id uuid := auth.uid();
  v_group public.groups%rowtype;
  v_existing_member public.group_members%rowtype;
  v_pending_request public.group_join_requests%rowtype;
  v_target_preference text;
  v_requires_approval boolean := true;
  v_sport_name text := null;
  v_group_label text;
  v_actor_name text := null;
  v_has_add_relationship boolean := false;
  v_actor_saved_by_target boolean := false;
begin
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_group
  from public.groups
  where id = p_group_id;

  if not found then
    raise exception 'group_not_found';
  end if;

  if p_target_user_id is null or p_target_user_id = v_actor_id then
    return query
    select
      'not_allowed'::text,
      p_group_id,
      p_target_user_id,
      null::uuid,
      'Choose someone else to add to this Shared Group.'::text;
    return;
  end if;

  if not exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = v_actor_id
      and gm.status = 'active'
      and gm.accepted_at is not null
      and gm.removed_at is null
  ) then
    return query
    select
      'not_allowed'::text,
      p_group_id,
      p_target_user_id,
      null::uuid,
      'Only active group members can add people to this Shared Group.'::text;
    return;
  end if;

  select coalesce(shared_group_join_preference, 'auto_join_saved_players')
  into v_target_preference
  from public.profiles
  where id = p_target_user_id;

  if v_target_preference is null then
    raise exception 'target_user_not_found';
  end if;

  select (
    exists (
      select 1
      from public.user_invite_circle uic
      where uic.owner_user_id = v_actor_id
        and uic.target_user_id = p_target_user_id
    )
    or public.do_users_share_group(v_actor_id, p_target_user_id)
    or exists (
      select 1
      from public.contact_records cr
      join public.people p
        on p.person_id = cr.person_id
       and p.linked_user_id = p_target_user_id
       and p.status = 'active'
      where cr.owner_user_id = v_actor_id
        and cr.archived_at is null
    )
    or exists (
      select 1
      from public.person_relationships pr
      join public.people p
        on p.person_id = pr.person_id
       and p.linked_user_id = p_target_user_id
       and p.status = 'active'
      where pr.actor_user_id = v_actor_id
        and pr.relationship_type in ('saved', 'direct_contact', 'group_contact', 'linked', 'imported_by')
    )
  )
  into v_has_add_relationship;

  if not coalesce(v_has_add_relationship, false) then
    return query
    select
      'not_allowed'::text,
      p_group_id,
      p_target_user_id,
      null::uuid,
      'You can only add saved players, linked contacts, or players who share a group with you.'::text;
    return;
  end if;

  select (
    exists (
      select 1
      from public.user_invite_circle uic
      where uic.owner_user_id = p_target_user_id
        and uic.target_user_id = v_actor_id
    )
    or exists (
      select 1
      from public.person_relationships pr
      join public.people p
        on p.person_id = pr.person_id
       and p.linked_user_id = v_actor_id
       and p.status = 'active'
      where pr.actor_user_id = p_target_user_id
        and pr.relationship_type = 'saved'
    )
  )
  into v_actor_saved_by_target;

  select display_name
  into v_actor_name
  from public.profiles
  where id = v_actor_id;

  if v_group.primary_sport_id is not null then
    select display_name
    into v_sport_name
    from public.sports
    where id = v_group.primary_sport_id;
  end if;

  v_group_label := case
    when v_sport_name is not null and nullif(trim(v_sport_name), '') is not null
      then trim(v_sport_name) || ' Group "' || v_group.name || '"'
    else 'Group "' || v_group.name || '"'
  end;

  select *
  into v_existing_member
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.user_id = p_target_user_id
  limit 1
  for update;

  if found
     and v_existing_member.status = 'active'
     and v_existing_member.accepted_at is not null
     and v_existing_member.removed_at is null then
    return query
    select
      'already_member'::text,
      p_group_id,
      p_target_user_id,
      null::uuid,
      'Already a member of this Shared Group.'::text;
    return;
  end if;

  if found
     and v_existing_member.status = 'pending'
     and v_existing_member.accepted_at is null
     and v_existing_member.removed_at is null then
    return query
    select
      'already_pending'::text,
      p_group_id,
      p_target_user_id,
      null::uuid,
      'This person already has a pending group invite.'::text;
    return;
  end if;

  select *
  into v_pending_request
  from public.group_join_requests gjr
  where gjr.group_id = p_group_id
    and gjr.target_user_id = p_target_user_id
    and gjr.status = 'pending'
  limit 1
  for update;

  if found then
    return query
    select
      'already_pending'::text,
      p_group_id,
      p_target_user_id,
      v_pending_request.id,
      'Approval is already pending for this person.'::text;
    return;
  end if;

  if v_target_preference = 'auto_join_all' then
    v_requires_approval := false;
  elsif v_target_preference = 'auto_join_saved_players' then
    v_requires_approval := not coalesce(v_actor_saved_by_target, false);
  elsif v_target_preference = 'auto_join_enabled_sports' then
    v_requires_approval := not exists (
      select 1
      from public.user_sports us
      where us.user_id = p_target_user_id
        and us.sport_id = v_group.primary_sport_id
    );
  else
    v_requires_approval := true;
  end if;

  if v_group.primary_sport_id is null and v_target_preference = 'auto_join_enabled_sports' then
    v_requires_approval := true;
  end if;

  if not v_requires_approval then
    if v_existing_member.id is not null then
      update public.group_members
      set
        status = 'active',
        join_method = 'added_by_member',
        invited_by = v_actor_id,
        accepted_at = now(),
        removed_at = null,
        removed_by = null
      where id = v_existing_member.id;
    else
      insert into public.group_members (
        group_id,
        user_id,
        status,
        join_method,
        invited_by,
        accepted_at
      ) values (
        p_group_id,
        p_target_user_id,
        'active',
        'added_by_member',
        v_actor_id,
        now()
      );
    end if;

    insert into public.notifications (
      recipient_user_id,
      kind,
      actor_user_id,
      note
    ) values (
      p_target_user_id,
      'group_added',
      v_actor_id,
      coalesce(v_actor_name, 'Someone') || ' added you to ' || v_group_label || '.'
    );

    return query
    select
      'direct_add_success'::text,
      p_group_id,
      p_target_user_id,
      null::uuid,
      'Added to group.'::text;
    return;
  end if;

  insert into public.group_join_requests (
    group_id,
    sport_id,
    requester_user_id,
    target_user_id,
    status,
    note,
    group_name_snapshot,
    sport_name_snapshot,
    requester_display_name_snapshot
  ) values (
    p_group_id,
    v_group.primary_sport_id,
    v_actor_id,
    p_target_user_id,
    'pending',
    nullif(trim(p_note), ''),
    v_group.name,
    v_sport_name,
    v_actor_name
  )
  returning * into v_pending_request;

  insert into public.notifications (
    recipient_user_id,
    kind,
    actor_user_id,
    note
  ) values (
    p_target_user_id,
    'group_join_request',
    v_actor_id,
    coalesce(v_actor_name, 'Someone') || ' requested to add you to ' || v_group_label || '.'
  );

  return query
  select
    'approval_required_request_created'::text,
    p_group_id,
    p_target_user_id,
    v_pending_request.id,
    'Approval requested.'::text;
end;
$$;

alter function public.rpc_group_add_member(uuid, uuid, text) owner to postgres;

comment on function public.rpc_group_add_member(uuid, uuid, text)
is 'Shared Groups: active members can add only saved/contact/shared-group users. Target join preference decides direct add vs group_join_request, including auto_join_saved_players when requester is saved by target.';

grant all on function public.rpc_group_add_member(uuid, uuid, text) to anon;
grant all on function public.rpc_group_add_member(uuid, uuid, text) to authenticated;
grant all on function public.rpc_group_add_member(uuid, uuid, text) to service_role;
