-- Issue #212: normalize SMS copy and expose level/short summary payload fields.
-- Public join keeps JOIN/NO semantics; private invite-like SMS keeps YES/NO code semantics.

drop function if exists public.rpc_public_match_signup_start_sms(uuid, text, text);

create or replace function public.rpc_public_match_signup_start_sms(
  p_public_token uuid,
  p_display_name text,
  p_phone text
)
returns table (
  sms_intent_id uuid,
  status text,
  sms_send_required boolean,
  sms_token text,
  phone_normalized text,
  recipient_name text,
  match_id uuid,
  game_type text,
  sport_name text,
  match_date date,
  start_time time,
  venue_name text,
  host_display_name text,
  level_label text,
  match_summary_sms text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_link public.public_match_signup_links%rowtype;
  v_match public.matches%rowtype;
  v_intent public.public_match_signup_sms_intents%rowtype;
  v_existing_request public.public_match_signup_sms_intents%rowtype;
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_phone text := nullif(public.normalize_discovery_phone(p_phone), '');
  v_token uuid := gen_random_uuid();
  v_token_hash text;
  v_sms_cooldown constant interval := interval '5 minutes';
  v_link_cooldown constant interval := interval '10 minutes';
  v_link_cooldown_limit constant integer := 5;
  v_phone_cooldown_limit constant integer := 3;
  v_link_recent_count integer := 0;
  v_phone_recent_count integer := 0;
  v_sport_name text;
  v_venue_name text;
  v_host_display_name text;
  v_level_label text;
  v_confirmed_count integer := 0;
  v_players_needed integer := 0;
  v_match_summary_sms text;
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

  if length(v_display_name) > 120 then
    raise exception 'display_name_too_long';
  end if;

  if v_phone is null then
    raise exception 'phone_required';
  end if;

  if v_phone !~ '^[0-9]{10}$' then
    raise exception 'phone_invalid';
  end if;

  if public.is_contact_communication_opted_out('sms', v_phone, 'match_invites') then
    raise exception 'sms_opted_out';
  end if;

  select nullif(btrim(s.display_name), '') into v_sport_name
  from public.sports s
  where s.id = v_match.sport_id;

  select v.name into v_venue_name
  from public.venues v
  where v.id = v_match.venue_id;

  select coalesce(nullif(btrim(p.display_name), ''), 'Someone')
  into v_host_display_name
  from public.profiles p
  where p.id = v_match.organizer_id;

  v_level_label := nullif(btrim(v_match.level), '');

  select count(*)::integer into v_confirmed_count
  from public.match_participants mp
  where mp.match_id = v_match.id
    and mp.removed_at is null
    and (
      mp.status = 'confirmed'
      or (mp.participant_accepted_at is not null and mp.org_approved_at is not null)
    );

  v_players_needed := greatest(coalesce(v_match.required_count, 0) - coalesce(v_confirmed_count, 0), 0);
  if v_players_needed > 0 then
    v_match_summary_sms := v_players_needed::text || ' player' || case when v_players_needed = 1 then '' else 's' end || ' needed.';
  end if;

  update public.public_match_signup_sms_intents i
  set status = 'expired'
  where i.match_id = v_match.id
    and i.phone_normalized = v_phone
    and i.status = 'pending_sms_response'
    and i.expires_at < now();

  select i.* into v_existing_request
  from public.public_match_signup_sms_intents i
  join public.match_participants mp
    on mp.id = i.match_participant_id
  where i.match_id = v_match.id
    and i.phone_normalized = v_phone
    and i.status = 'request_created'
    and mp.removed_at is null
  order by i.created_at desc
  limit 1;

  if found then
    return query
    select
      v_existing_request.id,
      'already_requested'::text,
      false,
      null::text,
      v_phone,
      v_display_name,
      v_match.id,
      v_match.game_type,
      v_sport_name,
      v_match.match_date,
      v_match.start_time,
      v_venue_name,
      coalesce(v_host_display_name, 'Someone'),
      v_level_label,
      v_match_summary_sms;
    return;
  end if;

  select * into v_intent
  from public.public_match_signup_sms_intents
  where public_match_signup_sms_intents.match_id = v_match.id
    and public_match_signup_sms_intents.phone_normalized = v_phone
    and public_match_signup_sms_intents.status = 'pending_sms_response'
    and public_match_signup_sms_intents.expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if found and v_intent.sms_sent_at is not null and v_intent.sms_sent_at > now() - v_sms_cooldown then
    update public.public_match_signup_sms_intents i
    set display_name = v_display_name
    where i.id = v_intent.id
    returning * into v_intent;

    return query
    select
      v_intent.id,
      'sms_recently_sent'::text,
      false,
      null::text,
      v_phone,
      v_display_name,
      v_match.id,
      v_match.game_type,
      v_sport_name,
      v_match.match_date,
      v_match.start_time,
      v_venue_name,
      coalesce(v_host_display_name, 'Someone'),
      v_level_label,
      v_match_summary_sms;
    return;
  end if;

  select count(*)::integer into v_link_recent_count
  from public.public_match_signup_sms_intents i
  where i.link_id = v_link.id
    and i.sms_sent_at is not null
    and i.sms_sent_at > now() - v_link_cooldown;

  select count(*)::integer into v_phone_recent_count
  from public.public_match_signup_sms_intents i
  where i.phone_normalized = v_phone
    and i.sms_sent_at is not null
    and i.sms_sent_at > now() - v_link_cooldown;

  if v_link_recent_count >= v_link_cooldown_limit or v_phone_recent_count >= v_phone_cooldown_limit then
    if v_intent.id is not null then
      update public.public_match_signup_sms_intents i
      set sms_delivery_status = 'throttled'
      where i.id = v_intent.id
      returning * into v_intent;
    end if;

    return query
    select
      v_intent.id,
      'sms_throttled'::text,
      false,
      null::text,
      v_phone,
      v_display_name,
      v_match.id,
      v_match.game_type,
      v_sport_name,
      v_match.match_date,
      v_match.start_time,
      v_venue_name,
      coalesce(v_host_display_name, 'Someone'),
      v_level_label,
      v_match_summary_sms;
    return;
  end if;

  v_token_hash := encode(extensions.digest(v_token::text, 'sha256'), 'hex');

  if v_intent.id is not null then
    update public.public_match_signup_sms_intents i
    set
      display_name = v_display_name,
      sms_token = v_token,
      sms_token_hash = v_token_hash,
      sms_sent_at = now(),
      sms_delivery_status = 'queued',
      sms_delivery_error = null,
      expires_at = now() + interval '24 hours',
      status = 'pending_sms_response'
    where i.id = v_intent.id
    returning * into v_intent;
  else
    insert into public.public_match_signup_sms_intents (
      link_id,
      match_id,
      display_name,
      phone_normalized,
      sms_token,
      sms_token_hash,
      sms_sent_at,
      sms_delivery_status,
      expires_at
    ) values (
      v_link.id,
      v_match.id,
      v_display_name,
      v_phone,
      v_token,
      v_token_hash,
      now(),
      'queued',
      now() + interval '24 hours'
    )
    returning * into v_intent;
  end if;

  return query
  select
    v_intent.id,
    'sms_queued'::text,
    true,
    v_token::text,
    v_phone,
    v_display_name,
    v_match.id,
    v_match.game_type,
    v_sport_name,
    v_match.match_date,
    v_match.start_time,
    v_venue_name,
    coalesce(v_host_display_name, 'Someone'),
    v_level_label,
    v_match_summary_sms;
end;
$$;

create or replace function public.notification_match_payload(
  p_participant_id uuid,
  p_notification_type text,
  p_change_set jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mp public.match_participants%rowtype;
  v_match public.matches%rowtype;
  v_guest public.guests%rowtype;
  v_venue_name text;
  v_venue_timezone text;
  v_sport_name text;
  v_template text;
  v_guest_email text;
  v_guest_phone text;
  v_guest_name text;
  v_recipient_name text;
  v_invitation_id uuid;
  v_level_label text;
  v_confirmed_count integer := 0;
  v_players_needed integer := 0;
  v_match_summary_sms text;
begin
  select * into v_mp from public.match_participants where id = p_participant_id;
  if not found then
    raise exception 'participant_not_found';
  end if;

  select * into v_match from public.matches where id = v_mp.match_id;
  if not found then
    raise exception 'match_not_found';
  end if;

  select v.name, v.timezone
  into v_venue_name, v_venue_timezone
  from public.venues v
  where v.id = v_match.venue_id;

  select nullif(btrim(s.display_name), '')
  into v_sport_name
  from public.sports s
  where s.id = v_match.sport_id;

  v_level_label := nullif(btrim(v_match.level), '');

  select count(*)::integer into v_confirmed_count
  from public.match_participants mp
  where mp.match_id = v_match.id
    and mp.removed_at is null
    and (
      mp.status = 'confirmed'
      or (mp.participant_accepted_at is not null and mp.org_approved_at is not null)
    );

  v_players_needed := greatest(coalesce(v_match.required_count, 0) - coalesce(v_confirmed_count, 0), 0);
  if v_players_needed > 0 then
    v_match_summary_sms := v_players_needed::text || ' player' || case when v_players_needed = 1 then '' else 's' end || ' needed.';
  end if;

  if v_mp.user_id is not null then
    select nullif(btrim(p.display_name), '')
    into v_recipient_name
    from public.profiles p
    where p.id = v_mp.user_id;
  end if;

  if v_mp.user_id is null and v_mp.guest_id is not null then
    select * into v_guest from public.guests where id = v_mp.guest_id;
    v_guest_email := nullif(lower(btrim(v_guest.email)), '');
    v_guest_phone := nullif(btrim(v_guest.phone), '');
    v_guest_name := nullif(btrim(v_guest.display_name), '');
    v_recipient_name := v_guest_name;

    if v_guest_email is not null or v_guest_phone is not null then
      select ei.id into v_invitation_id
      from public.email_invitations ei
      where ei.match_participant_id = v_mp.id
        and ei.status <> 'canceled'
      order by
        case ei.status
          when 'pending' then 0
          when 'accepted' then 1
          when 'declined' then 2
          when 'expired' then 3
          else 4
        end,
        ei.created_at desc
      limit 1;

      if v_invitation_id is null then
        begin
          insert into public.email_invitations (
            inviter_user_id,
            target_email,
            target_phone,
            target_name,
            related_type,
            related_id,
            status,
            expires_at,
            match_participant_id
          ) values (
            v_match.organizer_id,
            v_guest_email,
            v_guest_phone,
            v_guest_name,
            'match',
            v_match.id,
            'pending',
            null,
            v_mp.id
          )
          returning id into v_invitation_id;
        exception when unique_violation then
          select ei.id into v_invitation_id
          from public.email_invitations ei
          where ei.match_participant_id = v_mp.id
            and ei.status <> 'canceled'
          order by
            case ei.status
              when 'pending' then 0
              when 'accepted' then 1
              when 'declined' then 2
              when 'expired' then 3
              else 4
            end,
            ei.created_at desc
          limit 1;
        end;
      end if;
    end if;
  end if;

  v_template := case
    when p_notification_type = 'invite' then 'match_invite'
    when p_notification_type = 'confirmed_lineup' then 'confirmed_lineup'
    when p_notification_type = 'match_reminder' then 'match_reminder'
    when p_notification_type = 'cancellation' then 'cancellation'
    else 'critical_update'
  end;

  return jsonb_build_object(
    'template_type', v_template,
    'match_id', v_match.id,
    'match_participant_id', v_mp.id,
    'game_type', v_match.game_type,
    'sport_name', v_sport_name,
    'match_date', v_match.match_date,
    'start_time', v_match.start_time,
    'duration_minutes', v_match.duration_minutes,
    'club_name', v_venue_name,
    'venue_name', v_venue_name,
    'venue_timezone', coalesce(v_venue_timezone, 'America/Toronto'),
    'recipient_name', v_recipient_name,
    'level_label', v_level_label,
    'match_summary_sms', v_match_summary_sms,
    'magic_link_path', public.notification_magic_link_for_participant(v_mp.id),
    'reply_code', public.notification_create_or_get_sms_reply_code(
      v_mp.id,
      case
        when p_notification_type = 'invite' then 'invite'
        when p_notification_type = 'confirmed_lineup' then 'confirmed_lineup'
        when p_notification_type = 'match_reminder' then 'match_reminder'
        else 'critical_update'
      end
    ),
    'change_set', coalesce(p_change_set, '{}'::jsonb),
    'is_formed', (v_match.formed_at is not null)
  );
end;
$$;

create or replace function public.notification_host_offline_confirmation_payload(
  p_participant_id uuid,
  p_host_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mp public.match_participants%rowtype;
  v_match public.matches%rowtype;
  v_guest public.guests%rowtype;
  v_venue_name text;
  v_venue_timezone text;
  v_sport_name text;
  v_host_name text;
  v_invitation_id uuid;
  v_target_email text;
  v_target_phone text;
  v_target_name text;
  v_recipient_name text;
  v_level_label text;
  v_confirmed_count integer := 0;
  v_players_needed integer := 0;
  v_match_summary_sms text;
begin
  select * into v_mp
  from public.match_participants
  where id = p_participant_id;

  if not found then
    raise exception 'participant_not_found';
  end if;

  select * into v_match
  from public.matches
  where id = v_mp.match_id;

  if not found then
    raise exception 'match_not_found';
  end if;

  select v.name, v.timezone
  into v_venue_name, v_venue_timezone
  from public.venues v
  where v.id = v_match.venue_id;

  select nullif(btrim(s.display_name), '')
  into v_sport_name
  from public.sports s
  where s.id = v_match.sport_id;

  select coalesce(nullif(btrim(p.display_name), ''), 'Someone')
  into v_host_name
  from public.profiles p
  where p.id = p_host_user_id;

  v_level_label := nullif(btrim(v_match.level), '');

  select count(*)::integer into v_confirmed_count
  from public.match_participants mp
  where mp.match_id = v_match.id
    and mp.removed_at is null
    and (
      mp.status = 'confirmed'
      or (mp.participant_accepted_at is not null and mp.org_approved_at is not null)
    );

  v_players_needed := greatest(coalesce(v_match.required_count, 0) - coalesce(v_confirmed_count, 0), 0);
  if v_players_needed > 0 then
    v_match_summary_sms := v_players_needed::text || ' player' || case when v_players_needed = 1 then '' else 's' end || ' needed.';
  end if;

  if v_mp.user_id is not null then
    select nullif(btrim(p.display_name), '')
    into v_recipient_name
    from public.profiles p
    where p.id = v_mp.user_id;
  end if;

  if v_mp.user_id is null and v_mp.guest_id is not null then
    select * into v_guest
    from public.guests
    where id = v_mp.guest_id;

    v_target_email := nullif(btrim(v_guest.email), '');
    v_target_phone := nullif(btrim(v_guest.phone), '');
    v_target_name := nullif(btrim(v_guest.display_name), '');
    v_recipient_name := v_target_name;

    if v_target_email is not null or v_target_phone is not null then
      select ei.id into v_invitation_id
      from public.email_invitations ei
      where ei.match_participant_id = v_mp.id
        and ei.status = 'pending'
      order by ei.created_at desc
      limit 1;

      if v_invitation_id is null then
        insert into public.email_invitations (
          inviter_user_id,
          target_email,
          target_phone,
          target_name,
          related_type,
          related_id,
          status,
          expires_at,
          match_participant_id
        ) values (
          p_host_user_id,
          v_target_email,
          v_target_phone,
          v_target_name,
          'match',
          v_match.id,
          'pending',
          now() + interval '30 days',
          v_mp.id
        )
        returning id into v_invitation_id;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'template_type', 'host_managed_confirmation',
    'match_id', v_match.id,
    'match_participant_id', v_mp.id,
    'game_type', v_match.game_type,
    'sport_name', v_sport_name,
    'match_date', v_match.match_date,
    'start_time', v_match.start_time,
    'duration_minutes', v_match.duration_minutes,
    'club_name', v_venue_name,
    'venue_name', v_venue_name,
    'venue_timezone', coalesce(v_venue_timezone, 'America/Toronto'),
    'recipient_name', v_recipient_name,
    'level_label', v_level_label,
    'match_summary_sms', v_match_summary_sms,
    'formed_at', v_match.formed_at,
    'is_formed', (v_match.formed_at is not null),
    'organizer_display_name', coalesce(v_host_name, 'Someone'),
    'magic_link_path', public.notification_magic_link_for_participant(v_mp.id),
    'reply_code', public.notification_create_or_get_sms_reply_code(v_mp.id, 'confirmed_lineup'),
    'change_set', '{}'::jsonb
  );
end;
$$;

create or replace function public.notification_enqueue_public_join_not_this_time_if_needed(
  p_participant_id uuid,
  p_host_user_id uuid
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_mp public.match_participants%rowtype;
  v_match public.matches%rowtype;
  v_intent public.public_match_signup_sms_intents%rowtype;
  v_phone text;
  v_host_name text;
  v_venue_name text;
  v_venue_timezone text;
  v_sport_name text;
  v_level_label text;
  v_confirmed_count integer := 0;
  v_players_needed integer := 0;
  v_match_summary_sms text;
  v_event_id uuid;
  v_delivery_id uuid;
begin
  if v_uid is null or v_uid <> p_host_user_id then
    return 'skipped_not_authorized';
  end if;

  select * into v_mp
  from public.match_participants
  where id = p_participant_id;

  if not found then
    return 'skipped_not_public_join';
  end if;

  select * into v_match
  from public.matches
  where id = v_mp.match_id;

  if not found or v_match.organizer_id <> p_host_user_id then
    return 'skipped_not_authorized';
  end if;

  if v_mp.removed_at is null or v_mp.status <> 'removed' then
    return 'skipped_not_removed';
  end if;

  if v_mp.join_method <> 'requested' or v_mp.org_approved_at is not null then
    return 'skipped_not_public_join';
  end if;

  select * into v_intent
  from public.public_match_signup_sms_intents i
  where i.match_participant_id = p_participant_id
    and i.match_id = v_mp.match_id
    and i.status = 'request_created'
    and i.phone_confirmed_at is not null
  order by i.phone_confirmed_at desc nulls last, i.created_at desc
  limit 1;

  if not found then
    return 'skipped_not_public_join';
  end if;

  select e.id into v_event_id
  from public.match_participant_notification_events e
  where e.participant_id = p_participant_id
    and e.notification_type = 'public_join_not_this_time'
    and e.dedupe_key = 'public_join_not_this_time'
  limit 1;

  if v_event_id is not null then
    return 'already_queued';
  end if;

  v_phone := public.normalize_discovery_phone(v_intent.phone_normalized);
  if v_phone is null or v_phone !~ '^[0-9]{10}$' then
    return 'skipped_no_phone';
  end if;

  if public.is_contact_communication_opted_out('sms', v_phone, 'match_invites') then
    return 'skipped_opted_out';
  end if;

  select coalesce(nullif(btrim(p.display_name), ''), 'Someone')
  into v_host_name
  from public.profiles p
  where p.id = p_host_user_id;

  select v.name, v.timezone
  into v_venue_name, v_venue_timezone
  from public.venues v
  where v.id = v_match.venue_id;

  select nullif(btrim(s.display_name), '')
  into v_sport_name
  from public.sports s
  where s.id = v_match.sport_id;

  v_level_label := nullif(btrim(v_match.level), '');

  select count(*)::integer into v_confirmed_count
  from public.match_participants mp
  where mp.match_id = v_match.id
    and mp.removed_at is null
    and (
      mp.status = 'confirmed'
      or (mp.participant_accepted_at is not null and mp.org_approved_at is not null)
    );

  v_players_needed := greatest(coalesce(v_match.required_count, 0) - coalesce(v_confirmed_count, 0), 0);
  if v_players_needed > 0 then
    v_match_summary_sms := v_players_needed::text || ' player' || case when v_players_needed = 1 then '' else 's' end || ' needed.';
  end if;

  insert into public.match_participant_notification_events (
    match_id,
    participant_id,
    notification_type,
    dedupe_key,
    channel,
    destination,
    metadata
  ) values (
    v_mp.match_id,
    p_participant_id,
    'public_join_not_this_time',
    'public_join_not_this_time',
    'sms',
    v_phone,
    jsonb_build_object('host_user_id', p_host_user_id)
  )
  on conflict (participant_id, notification_type, dedupe_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return 'already_queued';
  end if;

  insert into public.notification_deliveries (
    channel,
    provider,
    destination,
    delivery_status,
    payload
  ) values (
    'sms',
    'twilio',
    v_phone,
    'queued',
    jsonb_build_object(
      'template_type', 'public_join_not_this_time',
      'match_id', v_match.id,
      'match_participant_id', v_mp.id,
      'game_type', v_match.game_type,
      'sport_name', v_sport_name,
      'match_date', v_match.match_date,
      'start_time', v_match.start_time,
      'duration_minutes', v_match.duration_minutes,
      'club_name', v_venue_name,
      'venue_name', v_venue_name,
      'venue_timezone', coalesce(v_venue_timezone, 'America/Toronto'),
      'recipient_name', v_intent.display_name,
      'level_label', v_level_label,
      'match_summary_sms', v_match_summary_sms,
      'organizer_display_name', coalesce(v_host_name, 'Someone'),
      'magic_link_path', public.notification_magic_link_for_participant(v_mp.id),
      'change_set', '{}'::jsonb
    )
  )
  returning id into v_delivery_id;

  update public.match_participant_notification_events
  set delivery_id = v_delivery_id,
      sent_at = now()
  where id = v_event_id;

  return 'queued';
end;
$$;

create or replace function public.rpc_public_match_signup_sms_reply_handle(
  p_from_phone text,
  p_action text
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_phone text := public.normalize_discovery_phone(p_from_phone);
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_count integer := 0;
  v_intent public.public_match_signup_sms_intents%rowtype;
  v_confirm record;
  v_link text;
begin
  if v_phone is null or v_phone !~ '^[0-9]{10}$' then
    return 'We could not find a pending public join text for this number. Open the latest PlayerHoods link or ask the host for a fresh share link.';
  end if;

  update public.public_match_signup_sms_intents i
  set status = 'expired'
  where i.phone_normalized = v_phone
    and i.status = 'pending_sms_response'
    and i.expires_at < now();

  select count(*)::integer into v_count
  from public.public_match_signup_sms_intents i
  join public.matches m on m.id = i.match_id
  where i.phone_normalized = v_phone
    and i.status = 'pending_sms_response'
    and i.expires_at > now()
    and m.status = 'active';

  if coalesce(v_count, 0) = 0 then
    return 'We could not find a pending public join text for this number. Open the latest PlayerHoods link or ask the host for a fresh share link.';
  end if;

  if v_count > 1 then
    return 'We found more than one recent match request for this number. Open the latest PlayerHoods link we texted you to choose.';
  end if;

  select i.* into v_intent
  from public.public_match_signup_sms_intents i
  join public.matches m on m.id = i.match_id
  where i.phone_normalized = v_phone
    and i.status = 'pending_sms_response'
    and i.expires_at > now()
    and m.status = 'active'
  order by i.sms_sent_at desc nulls last, i.created_at desc
  limit 1;

  v_link := 'https://www.playerhoods.com/j/' || v_intent.sms_token::text;

  if v_action = 'details' then
    return 'View match details here: ' || v_link;
  end if;

  if v_action = 'decline' then
    perform *
    from public.rpc_public_match_signup_decline_sms(v_intent.sms_token::text);

    return 'No problem - you''re marked as not this time. We won''t notify you again for this request.';
  end if;

  if v_action = 'join' then
    select * into v_confirm
    from public.public_match_signup_sms_confirm_intent(v_intent.id)
    limit 1;

    return 'Request sent. The host can now review your request. We''ll let you know if you''re confirmed. Details: ' || v_link;
  end if;

  return null;
end;
$$;

create or replace function public.rpc_sms_reply_handle(
  p_from_phone text,
  p_body text
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_phone text := public.normalize_discovery_phone(p_from_phone);
  v_body text := upper(btrim(coalesce(p_body, '')));
  v_action text;
  v_code text;
  v_code_row public.match_participant_sms_reply_codes%rowtype;
  v_candidate_count integer;
  v_candidate_id uuid;
  v_match_id uuid;
  v_match public.matches%rowtype;
  v_mp public.match_participants%rowtype;
  v_link text;
  v_response text;
  v_reply_code text;
  v_reply_command text;
  v_public_response text;
begin
  if v_phone is null then
    return 'We could not read your phone number. Private invites use YES code or NO code; public join texts use JOIN or NO; confirmed matches use OUT code; DETAILS code returns the match link.';
  end if;

  if v_body in ('STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT') then
    insert into public.contact_communication_opt_outs (
      channel,
      destination_normalized,
      scope,
      reason,
      unsubscribed_at
    ) values (
      'sms',
      v_phone,
      'match_invites',
      'sms_stop',
      now()
    )
    on conflict (channel, destination_normalized, scope)
    do update set
      unsubscribed_at = coalesce(public.contact_communication_opt_outs.unsubscribed_at, excluded.unsubscribed_at),
      reason = coalesce(excluded.reason, public.contact_communication_opt_outs.reason);

    return 'You are unsubscribed from PlayerHoods match SMS. Reply START to opt back in if supported by your carrier.';
  end if;

  if v_body = 'START' then
    update public.contact_communication_opt_outs
    set unsubscribed_at = null,
        reason = null
    where channel = 'sms'
      and destination_normalized = v_phone
      and scope = 'match_invites';
    return 'PlayerHoods match SMS is turned back on.';
  end if;

  if v_body in ('HELP', '?') then
    return 'Private invite: reply YES code or NO code. Public join: reply JOIN or NO. Confirmed match: reply OUT code if you can''t make it. Reply DETAILS code for the match link.';
  end if;

  if v_body in ('MAYBE', 'M') then
    return 'Maybe is not supported yet. Reply YES code or NO code for a private invite, JOIN for a public join text, or OUT code if you need to back out.';
  end if;

  if v_body ~ '^(JOIN)(\s+|$)' then
    v_public_response := public.rpc_public_match_signup_sms_reply_handle(v_phone, 'join');
    if v_public_response is not null then
      return v_public_response;
    end if;
    return 'We could not find a pending public join text for this number. Open the latest PlayerHoods link or ask the host for a fresh share link.';
  elsif v_body ~ '^(YES|Y|IN|ACCEPT)(\s+|$)' then
    v_action := 'accept';
    v_reply_command := 'YES';
  elsif v_body ~ '^(NO|N|DECLINE)(\s+|$)' then
    v_action := 'decline';
    v_reply_command := 'NO';
  elsif v_body ~ '^(OUT)(\s+|$)' then
    v_action := 'withdraw';
    v_reply_command := 'OUT';
  elsif v_body ~ '^(DETAILS|INFO|LINK)(\s+|$)' then
    v_action := 'details';
    v_reply_command := 'DETAILS';
  else
    return 'Private invite: reply YES code or NO code. Public join: reply JOIN or NO. Confirmed match: reply OUT code if you can''t make it. Reply DETAILS code for the match link.';
  end if;

  select token
  into v_code
  from regexp_split_to_table(v_body, '\s+') as token
  where token ~ '^[A-Z2-9]{2,6}$'
    and token not in ('YES', 'Y', 'IN', 'ACCEPT', 'NO', 'N', 'DECLINE', 'OUT', 'DETAILS', 'INFO', 'LINK', 'JOIN')
  order by length(token) desc
  limit 1;

  if v_code is not null then
    select * into v_code_row
    from public.match_participant_sms_reply_codes
    where phone_e164 = v_phone
      and code = v_code
      and consumed_at is null
      and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1;

    if not found then
      return 'We could not find that invite code. Reply YES code, NO code, or DETAILS code for the match link.';
    end if;

    v_candidate_id := v_code_row.participant_id;
  else
    select count(*)
    into v_candidate_count
    from public.match_participant_sms_reply_codes c
    join public.match_participants mp on mp.id = c.participant_id
    join public.matches m on m.id = c.match_id
    where c.phone_e164 = v_phone
      and c.consumed_at is null
      and (c.expires_at is null or c.expires_at > now())
      and mp.removed_at is null
      and m.status = 'active'
      and (
        (v_action in ('accept', 'decline', 'details') and mp.participant_accepted_at is null)
        or (v_action = 'withdraw' and mp.participant_accepted_at is not null)
      );

    if coalesce(v_candidate_count, 0) = 0 then
      if v_action in ('decline', 'details') then
        v_public_response := public.rpc_public_match_signup_sms_reply_handle(v_phone, v_action);
        if v_public_response is not null then
          return v_public_response;
        end if;
      end if;

      if v_action = 'withdraw' then
        return 'We could not find a match you can back out of for this number. Reply OUT with the code from your confirmed match text.';
      end if;
      return 'We could not find an active invite for this number. View your invite link or contact the organizer.';
    end if;

    if v_candidate_count > 1 then
      select string_agg(
        v_reply_command || ' ' || c.code || ' for ' || coalesce(m.match_date::text, 'a match') || coalesce(' at ' || to_char(m.start_time, 'FMHH12:MI AM'), ''),
        ' or '
        order by m.match_date, m.start_time
      )
      into v_response
      from public.match_participant_sms_reply_codes c
      join public.match_participants mp on mp.id = c.participant_id
      join public.matches m on m.id = c.match_id
      where c.phone_e164 = v_phone
        and c.consumed_at is null
        and (c.expires_at is null or c.expires_at > now())
        and mp.removed_at is null
        and m.status = 'active'
        and (
          (v_action in ('accept', 'decline', 'details') and mp.participant_accepted_at is null)
          or (v_action = 'withdraw' and mp.participant_accepted_at is not null)
        );

      if v_action = 'withdraw' then
        return 'You have multiple matches. Reply ' || coalesce(v_response, 'OUT with the match code.') || '.';
      end if;
      return 'You have multiple invites. Reply ' || coalesce(v_response, 'YES code or NO code for one of them.') || '.';
    end if;

    select c.* into v_code_row
    from public.match_participant_sms_reply_codes c
    join public.match_participants mp on mp.id = c.participant_id
    join public.matches m on m.id = c.match_id
    where c.phone_e164 = v_phone
      and c.consumed_at is null
      and (c.expires_at is null or c.expires_at > now())
      and mp.removed_at is null
      and m.status = 'active'
      and (
        (v_action in ('accept', 'decline', 'details') and mp.participant_accepted_at is null)
        or (v_action = 'withdraw' and mp.participant_accepted_at is not null)
      )
    order by c.created_at asc, c.participant_id::text asc
    limit 1;

    v_candidate_id := v_code_row.participant_id;
  end if;

  select * into v_mp from public.match_participants where id = v_candidate_id for update;
  if not found or v_mp.removed_at is not null then
    return 'This invite is no longer active.';
  end if;

  select * into v_match from public.matches where id = v_mp.match_id;
  v_match_id := v_match.id;
  v_link := public.notification_magic_link_for_participant(v_candidate_id);
  v_reply_code := coalesce(v_code, v_code_row.code, 'with your code');

  if v_match.id is null then
    return 'This invite is no longer active.';
  end if;

  if v_action in ('accept', 'decline', 'withdraw') and v_match.status <> 'active' then
    return 'This invite is no longer active.';
  end if;

  if v_action = 'details' then
    return 'View match details here: ' || coalesce(v_link, '/matches/' || v_match_id::text);
  end if;

  if v_action = 'accept' then
    if v_mp.participant_accepted_at is not null then
      if v_mp.org_approved_at is null then
        return 'You''re already marked as interested. The host can now review your request. We''ll let you know if you''re confirmed.';
      end if;
      return 'You''re already marked as in. Reply OUT ' || v_reply_code || ' if you can''t make it.';
    end if;

    update public.match_participants
    set participant_accepted_at = coalesce(participant_accepted_at, now()),
        participant_accepted_via = case when participant_accepted_at is null then 'sms_invitation' else participant_accepted_via end
    where id = v_candidate_id;

    perform public.match_participant_reconcile_status(v_candidate_id);
    perform public.notification_maybe_auto_form_match(v_match_id);

    insert into public.match_participant_notification_events (
      match_id,
      participant_id,
      notification_type,
      dedupe_key,
      channel,
      destination,
      sent_at,
      metadata
    ) values (
      v_match_id,
      v_candidate_id,
      'sms_reply_confirmation',
      'accept:' || md5(v_body || ':' || now()::text),
      'sms',
      v_phone,
      now(),
      jsonb_build_object('action', 'accept')
    );

    if v_mp.org_approved_at is null then
      return 'You''re marked as interested. The host can now review your request. We''ll let you know if you''re confirmed.';
    end if;

    return 'You''re marked as in for this match. We''ll send Game On if the lineup is formed. Reply OUT ' || v_reply_code || ' if you can''t make it.';
  end if;

  if v_action = 'decline' then
    if v_mp.participant_accepted_at is not null then
      if v_mp.org_approved_at is null then
        return 'You''re already marked as interested. Reply OUT ' || v_reply_code || ' if you can''t make it.';
      end if;
      return 'You''re already marked as in. Reply OUT ' || v_reply_code || ' if you can''t make it.';
    end if;

    if v_code_row.id is not null then
      update public.match_participant_sms_reply_codes
      set consumed_at = coalesce(consumed_at, now())
      where id = v_code_row.id;
    end if;

    if v_match.formed_at is not null then
      perform public.apply_participant_exit(v_candidate_id, v_match.organizer_id, 'withdraw', 'sms_out_after_formed');
      return 'You''re no longer marked as playing. The organizer has been notified.';
    end if;

    perform public.apply_participant_exit(v_candidate_id, v_match.organizer_id, 'withdraw', 'sms_declined');
    return 'No problem - you''re marked as not this time. We won''t notify you again for this invite.';
  end if;

  if v_action = 'withdraw' then
    if v_mp.participant_accepted_at is null then
      return 'Reply NO ' || v_reply_code || ' if not this time, or YES ' || v_reply_code || ' if you''d like to play.';
    end if;

    if v_code_row.id is not null then
      update public.match_participant_sms_reply_codes
      set consumed_at = coalesce(consumed_at, now())
      where id = v_code_row.id;
    end if;

    perform public.apply_participant_exit(v_candidate_id, v_match.organizer_id, 'withdraw', 'sms_out_after_confirmed');
    return 'You''re no longer marked as playing. The organizer has been notified.';
  end if;

  return 'Private invite: reply YES code or NO code. Public join: reply JOIN or NO. Confirmed match: reply OUT code if you can''t make it. Reply DETAILS code for the match link.';
end;
$$;

comment on function public.rpc_public_match_signup_start_sms(uuid, text, text) is
  'Issue #212: starts public join SMS intents and returns level/short summary fields for request-a-spot SMS copy.';

comment on function public.notification_match_payload(uuid, text, jsonb) is
  'Issue #212: builds match notification payloads with recipient_name, venue_timezone, sport_name, level_label, and match_summary_sms for SMS copy.';

comment on function public.notification_host_offline_confirmation_payload(uuid, uuid) is
  'Issue #212: builds host-managed confirmation delivery payload with level/short summary fields and anchored invitation links.';

comment on function public.notification_enqueue_public_join_not_this_time_if_needed(uuid, uuid) is
  'Issue #212: queues one idempotent Not This Time SMS for phone-confirmed public join requests with recipient/link payload copy fields.';

revoke all on function public.rpc_public_match_signup_start_sms(uuid, text, text) from public, anon, authenticated;
revoke all on function public.rpc_public_match_signup_sms_reply_handle(text, text) from public, anon, authenticated;
revoke all on function public.rpc_sms_reply_handle(text, text) from public;
revoke all on function public.notification_host_offline_confirmation_payload(uuid, uuid) from public, anon;
revoke all on function public.notification_enqueue_public_join_not_this_time_if_needed(uuid, uuid) from public, anon;

grant execute on function public.rpc_public_match_signup_start_sms(uuid, text, text) to service_role;
grant execute on function public.rpc_public_match_signup_sms_reply_handle(text, text) to service_role;
grant execute on function public.rpc_sms_reply_handle(text, text) to anon, authenticated, service_role;
grant execute on function public.notification_match_payload(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.notification_host_offline_confirmation_payload(uuid, uuid) to authenticated, service_role;
grant execute on function public.notification_enqueue_public_join_not_this_time_if_needed(uuid, uuid) to authenticated, service_role;
