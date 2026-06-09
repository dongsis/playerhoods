-- Queue a narrow SMS notification when a host chooses Not This Time for a
-- phone-confirmed public join request.

alter table public.match_participant_notification_events
  drop constraint if exists match_participant_notification_events_type_check;

alter table public.match_participant_notification_events
  add constraint match_participant_notification_events_type_check
  check (
    notification_type in (
      'invite',
      'confirmed_lineup',
      'critical_update',
      'cancellation',
      'add_request',
      'host_managed_confirmation',
      'match_reminder',
      'sms_reply_confirmation',
      'sms_reply_help',
      'sms_reply_disambiguation',
      'public_join_not_this_time'
    )
  );

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
      'organizer_display_name', coalesce(v_host_name, 'Someone'),
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

comment on function public.notification_enqueue_public_join_not_this_time_if_needed(uuid, uuid)
is 'Queues one idempotent SMS when the host chooses Not This Time for a phone-confirmed public join request.';

revoke all on function public.notification_enqueue_public_join_not_this_time_if_needed(uuid, uuid) from public, anon;
grant execute on function public.notification_enqueue_public_join_not_this_time_if_needed(uuid, uuid) to authenticated, service_role;
