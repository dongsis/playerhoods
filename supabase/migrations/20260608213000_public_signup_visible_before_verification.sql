-- Phase 3: make anonymous public join requests host-visible before email verification.
-- Email remains untrusted until rpc_public_match_signup_verify succeeds.

create or replace function public.rpc_public_match_signup_start(
  p_public_token uuid,
  p_display_name text,
  p_email text,
  p_phone text default null,
  p_marketing_email_opt_in boolean default false
)
returns table (
  signup_id uuid,
  status text,
  verification_required boolean,
  verification_token text,
  email_normalized text,
  recipient_name text,
  match_id uuid,
  game_type text,
  sport_name text,
  match_date date,
  start_time time,
  venue_name text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_link public.public_match_signup_links%rowtype;
  v_match public.matches%rowtype;
  v_signup public.public_match_signups%rowtype;
  v_identity public.public_match_signup_identities%rowtype;
  v_mp public.match_participants%rowtype;
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(public.normalize_discovery_phone(p_phone), '');
  v_email_hash text;
  v_token uuid := gen_random_uuid();
  v_token_hash text;
  v_system_actor_id uuid;
  v_person_id uuid;
  v_guest_id uuid;
  v_removed_mp_id uuid;
  v_verification_cooldown constant interval := interval '5 minutes';
  v_link_cooldown constant interval := interval '10 minutes';
  v_link_cooldown_limit constant integer := 5;
  v_link_recent_verification_count integer := 0;
  v_existing_signup_found boolean := false;
  v_should_send_verification boolean := true;
begin
  select * into v_link
  from public.public_match_signup_links
  where public_token = p_public_token
    and disabled_at is null;

  if not found then
    raise exception 'signup_link_not_found';
  end if;

  select * into v_match
  from public.matches m
  where m.id = v_link.match_id
    and m.status = 'active';

  if not found then
    raise exception 'match_not_active';
  end if;

  if v_display_name is null then
    raise exception 'display_name_required';
  end if;

  if v_email is null then
    raise exception 'email_required';
  end if;

  if length(v_display_name) > 120 then
    raise exception 'display_name_too_long';
  end if;

  if length(v_email) > 320 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalid';
  end if;

  select cfg.system_actor_user_id into v_system_actor_id
  from public.public_match_signup_config cfg
  where cfg.singleton_key = true;

  if v_system_actor_id is null then
    raise exception 'public_signup_system_actor_not_configured';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_system_actor_id) then
    raise exception 'public_signup_system_actor_missing';
  end if;

  v_email_hash := encode(extensions.digest(v_email, 'sha256'), 'hex');
  v_token_hash := encode(extensions.digest(v_token::text, 'sha256'), 'hex');

  update public.public_match_signups
  set status = 'expired'
  where public_match_signups.match_id = v_match.id
    and public_match_signups.email_sha256 = v_email_hash
    and public_match_signups.status = 'pending_verification'
    and public_match_signups.verification_expires_at < now();

  update public.public_match_signups s
  set status = 'participant_removed'
  where s.match_id = v_match.id
    and s.email_sha256 = v_email_hash
    and s.status = 'participant_created'
    and (
      s.match_participant_id is null
      or not exists (
        select 1
        from public.match_participants mp
        where mp.id = s.match_participant_id
          and mp.removed_at is null
      )
    );

  select * into v_signup
  from public.public_match_signups
  where public_match_signups.match_id = v_match.id
    and public_match_signups.email_sha256 = v_email_hash
    and (
      public_match_signups.status = 'pending_verification'
      or (
        public_match_signups.status = 'participant_created'
        and public_match_signups.match_participant_id is not null
        and exists (
          select 1
          from public.match_participants mp
          where mp.id = public_match_signups.match_participant_id
            and mp.removed_at is null
        )
      )
    )
  order by public_match_signups.created_at desc
  limit 1
  for update;
  v_existing_signup_found := found;

  if v_existing_signup_found and v_signup.status = 'participant_created' then
    return query
    select
      v_signup.id,
      'already_verified'::text,
      false,
      null::text,
      null::text,
      null::text,
      v_match.id,
      v_match.game_type,
      (select s.display_name from public.sports s where s.id = v_match.sport_id),
      v_match.match_date,
      v_match.start_time,
      (select v.name from public.venues v where v.id = v_match.venue_id);
    return;
  end if;

  if v_existing_signup_found
    and v_signup.status = 'pending_verification'
    and v_signup.verification_sent_at is not null
    and v_signup.verification_sent_at > now() - v_verification_cooldown
  then
    v_should_send_verification := false;
  end if;

  if v_should_send_verification then
    select count(*)::integer into v_link_recent_verification_count
    from public.public_match_signups s
    where s.link_id = v_link.id
      and s.verification_sent_at is not null
      and s.verification_sent_at > now() - v_link_cooldown;

    if v_link_recent_verification_count >= v_link_cooldown_limit then
      if v_existing_signup_found then
        update public.public_match_signups
        set verification_delivery_status = 'throttled'
        where id = v_signup.id
        returning * into v_signup;
        v_should_send_verification := false;
      else
        raise exception 'public_signup_rate_limited';
      end if;
    elsif v_existing_signup_found then
      update public.public_match_signups
      set
        display_name = v_display_name,
        email_normalized = v_email,
        phone_normalized = v_phone,
        marketing_email_opt_in = coalesce(p_marketing_email_opt_in, false),
        marketing_email_opt_in_at = case when coalesce(p_marketing_email_opt_in, false) then now() else null end,
        verification_token_hash = v_token_hash,
        verification_sent_at = now(),
        verification_delivery_status = 'queued',
        verification_delivery_error = null,
        verification_expires_at = now() + interval '24 hours',
        status = 'pending_verification'
      where id = v_signup.id
      returning * into v_signup;
    else
      insert into public.public_match_signups (
        link_id,
        match_id,
        display_name,
        email_normalized,
        email_sha256,
        phone_normalized,
        marketing_email_opt_in,
        marketing_email_opt_in_at,
        verification_token_hash,
        verification_sent_at,
        verification_delivery_status,
        verification_expires_at,
        status
      ) values (
        v_link.id,
        v_match.id,
        v_display_name,
        v_email,
        v_email_hash,
        v_phone,
        coalesce(p_marketing_email_opt_in, false),
        case when coalesce(p_marketing_email_opt_in, false) then now() else null end,
        v_token_hash,
        now(),
        'queued',
        now() + interval '24 hours',
        'pending_verification'
      )
      returning * into v_signup;
    end if;
  end if;

  select * into v_identity
  from public.public_match_signup_identities
  where email_sha256 = v_email_hash
  for update;

  if found then
    v_person_id := v_identity.person_id;
    v_guest_id := v_identity.guest_id;
  else
    v_person_id := v_signup.person_id;
    v_guest_id := v_signup.guest_id;
  end if;

  if v_person_id is null or v_guest_id is null then
    insert into public.people(person_type, display_name, status)
    values ('limited_contact', v_display_name, 'active')
    returning person_id into v_person_id;

    insert into public.guests(display_name, email, phone, status, created_by, person_id)
    values (v_display_name, null, null, 'active', v_system_actor_id, v_person_id)
    returning id into v_guest_id;
  else
    update public.people
    set display_name = v_display_name,
        status = 'active'
    where person_id = v_person_id;

    update public.guests
    set display_name = v_display_name,
        status = 'active',
        person_id = coalesce(person_id, v_person_id)
    where id = v_guest_id;
  end if;

  if v_signup.match_participant_id is not null then
    select * into v_mp
    from public.match_participants
    where id = v_signup.match_participant_id
      and removed_at is null
    for update;
  end if;

  for v_removed_mp_id in
    select match_participants.id
    from public.match_participants
    where match_participants.match_id = v_match.id
      and match_participants.guest_id = v_guest_id
      and (
        match_participants.removed_at is not null
        or match_participants.status = 'removed'
      )
    for update
  loop
    perform public.match_participant_reconcile_status(v_removed_mp_id);
  end loop;

  if v_mp.id is null then
    select * into v_mp
    from public.match_participants
    where match_id = v_match.id
      and guest_id = v_guest_id
      and removed_at is null
    order by created_at desc
    limit 1
    for update;
  end if;

  if v_mp.id is null then
    insert into public.match_participants (
      match_id,
      status,
      join_method,
      guest_id,
      created_by,
      participant_accepted_at,
      participant_accepted_via,
      org_approved_at,
      org_approved_by,
      confirmation_source,
      source_person_id
    ) values (
      v_match.id,
      'pending',
      'requested',
      v_guest_id,
      v_system_actor_id,
      null,
      null,
      null,
      null,
      'player_response',
      v_person_id
    )
    returning * into v_mp;

    insert into public.match_participant_actions(match_id, match_participant_id, action_type, note, created_by)
    values (v_match.id, v_mp.id, 'request_join', 'public_match_signup_pending_verification', v_system_actor_id);
  end if;

  update public.public_match_signups
  set
    identity_id = case when v_identity.id is not null then v_identity.id else identity_id end,
    person_id = v_person_id,
    guest_id = v_guest_id,
    match_participant_id = v_mp.id
  where id = v_signup.id
  returning * into v_signup;

  return query
  select
    v_signup.id,
    'verification_sent'::text,
    v_should_send_verification,
    case when v_should_send_verification then v_token::text else null::text end,
    case when v_should_send_verification then v_email else null::text end,
    case when v_should_send_verification then v_display_name else null::text end,
    v_match.id,
    v_match.game_type,
    (select s.display_name from public.sports s where s.id = v_match.sport_id),
    v_match.match_date,
    v_match.start_time,
    (select v.name from public.venues v where v.id = v_match.venue_id);
end;
$$;

create or replace function public.rpc_public_match_signup_verify(
  p_public_token uuid,
  p_signup_id uuid,
  p_verification_token text
)
returns table (
  status text,
  match_id uuid,
  match_participant_id uuid,
  participant_status text,
  display_name text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_system_actor_id uuid;
  v_signup public.public_match_signups%rowtype;
  v_link public.public_match_signup_links%rowtype;
  v_match public.matches%rowtype;
  v_identity public.public_match_signup_identities%rowtype;
  v_person_id uuid;
  v_guest_id uuid;
  v_mp public.match_participants%rowtype;
  v_token_hash text;
  v_removed_mp_id uuid;
begin
  if nullif(btrim(coalesce(p_verification_token, '')), '') is null then
    raise exception 'verification_token_required';
  end if;

  v_token_hash := encode(extensions.digest(btrim(p_verification_token), 'sha256'), 'hex');

  select * into v_signup
  from public.public_match_signups
  where id = p_signup_id
  for update;

  if not found then
    raise exception 'signup_not_found';
  end if;

  if v_signup.verification_token_hash <> v_token_hash then
    raise exception 'verification_token_invalid';
  end if;

  select * into v_link
  from public.public_match_signup_links
  where id = v_signup.link_id
    and public_token = p_public_token
    and disabled_at is null;

  if not found then
    raise exception 'signup_link_not_found';
  end if;

  select * into v_match
  from public.matches m
  where m.id = v_signup.match_id
    and m.id = v_link.match_id
    and m.status = 'active';

  if not found then
    raise exception 'match_not_active';
  end if;

  if v_signup.status = 'participant_created' then
    if v_signup.match_participant_id is not null then
      select * into v_mp
      from public.match_participants
      where id = v_signup.match_participant_id
      for update;

      if found and v_mp.removed_at is null then
        return query
        select v_signup.status, v_signup.match_id, v_signup.match_participant_id, coalesce(v_mp.status::text, null), v_signup.display_name;
        return;
      end if;
    end if;

    update public.public_match_signups
    set status = 'participant_removed'
    where id = v_signup.id
    returning * into v_signup;
  end if;

  if v_signup.status <> 'pending_verification' then
    raise exception 'signup_not_verifiable';
  end if;

  if v_signup.verification_expires_at < now() then
    update public.public_match_signups
    set status = 'expired'
    where id = v_signup.id;
    raise exception 'verification_token_expired';
  end if;

  select cfg.system_actor_user_id into v_system_actor_id
  from public.public_match_signup_config cfg
  where cfg.singleton_key = true;

  if v_system_actor_id is null then
    raise exception 'public_signup_system_actor_not_configured';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_system_actor_id) then
    raise exception 'public_signup_system_actor_missing';
  end if;

  select * into v_identity
  from public.public_match_signup_identities
  where email_sha256 = v_signup.email_sha256
  for update;

  if not found then
    v_person_id := v_signup.person_id;
    v_guest_id := v_signup.guest_id;

    if v_person_id is null or v_guest_id is null then
      insert into public.people(person_type, display_name, status)
      values ('limited_contact', v_signup.display_name, 'active')
      returning person_id into v_person_id;

      insert into public.guests(display_name, email, phone, status, created_by, person_id)
      values (v_signup.display_name, null, null, 'active', v_system_actor_id, v_person_id)
      returning id into v_guest_id;
    end if;

    insert into public.public_match_signup_identities(email_sha256, person_id, guest_id, last_verified_at)
    values (v_signup.email_sha256, v_person_id, v_guest_id, now())
    on conflict (email_sha256) do update
      set last_verified_at = now()
    returning * into v_identity;
  end if;

  v_person_id := v_identity.person_id;
  v_guest_id := v_identity.guest_id;

  update public.people
  set display_name = v_signup.display_name,
      status = 'active'
  where person_id = v_person_id;

  update public.guests
  set display_name = v_signup.display_name,
      email = v_signup.email_normalized,
      phone = null,
      status = 'active',
      person_id = v_person_id
  where id = v_guest_id;

  update public.public_match_signup_identities
  set last_verified_at = now()
  where id = v_identity.id
  returning * into v_identity;

  for v_removed_mp_id in
    select match_participants.id
    from public.match_participants
    where match_participants.match_id = v_match.id
      and match_participants.guest_id = v_guest_id
      and (
        match_participants.removed_at is not null
        or match_participants.status = 'removed'
      )
    for update
  loop
    perform public.match_participant_reconcile_status(v_removed_mp_id);
  end loop;

  if v_signup.match_participant_id is not null then
    select * into v_mp
    from public.match_participants
    where id = v_signup.match_participant_id
    for update;
  end if;

  if v_mp.id is null or v_mp.removed_at is not null then
    select * into v_mp
    from public.match_participants
    where match_participants.match_id = v_match.id
      and match_participants.guest_id = v_guest_id
      and match_participants.removed_at is null
    order by match_participants.created_at desc
    limit 1
    for update;
  end if;

  if v_mp.id is not null and v_mp.removed_at is null then
    update public.match_participants
    set
      participant_accepted_at = coalesce(participant_accepted_at, now()),
      participant_accepted_via = coalesce(participant_accepted_via, 'email_invitation'),
      confirmation_source = coalesce(confirmation_source, 'player_response'),
      source_person_id = coalesce(source_person_id, v_person_id)
    where id = v_mp.id
    returning * into v_mp;
  else
    insert into public.match_participants (
      match_id,
      status,
      join_method,
      guest_id,
      created_by,
      participant_accepted_at,
      participant_accepted_via,
      confirmation_source,
      source_person_id
    ) values (
      v_match.id,
      'pending',
      'requested',
      v_guest_id,
      v_system_actor_id,
      now(),
      'email_invitation',
      'player_response',
      v_person_id
    )
    returning * into v_mp;

    insert into public.match_participant_actions(match_id, match_participant_id, action_type, note, created_by)
    values (v_match.id, v_mp.id, 'request_join', 'public_match_signup', v_system_actor_id);
  end if;

  perform public.match_participant_reconcile_status(v_mp.id);
  select * into v_mp from public.match_participants where id = v_mp.id;

  update public.public_match_signups
  set
    identity_id = v_identity.id,
    person_id = v_person_id,
    guest_id = v_guest_id,
    match_participant_id = v_mp.id,
    verified_at = coalesce(verified_at, now()),
    status = 'participant_created'
  where id = v_signup.id
  returning * into v_signup;

  return query
  select v_signup.status, v_signup.match_id, v_mp.id, v_mp.status::text, v_signup.display_name;
end;
$$;

create or replace function public.rpc_public_match_signup_participant_metadata(
  p_match_id uuid
)
returns table (
  match_participant_id uuid,
  match_id uuid,
  source text,
  email_verified boolean,
  signup_status text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'match_not_found';
  end if;

  if v_match.organizer_id <> v_uid then
    raise exception 'not_match_organizer';
  end if;

  return query
  select
    s.match_participant_id,
    s.match_id,
    'public_match_signup'::text,
    (s.verified_at is not null),
    s.status
  from public.public_match_signups s
  join public.match_participants mp
    on mp.id = s.match_participant_id
  where s.match_id = p_match_id
    and s.match_participant_id is not null
    and s.status in ('pending_verification', 'participant_created')
    and mp.removed_at is null;
end;
$$;
