-- Match-level player reminders for MVP.
-- Contacts/guests use the host's match reminder setting. Registered-user
-- preference overrides can be added later without changing this contract.

alter table public.matches
  add column if not exists player_reminder_minutes integer default 1440;

alter table public.matches
  drop constraint if exists matches_player_reminder_minutes_check;

alter table public.matches
  add constraint matches_player_reminder_minutes_check
  check (player_reminder_minutes is null or player_reminder_minutes in (120, 1440));

comment on column public.matches.player_reminder_minutes is
  'MVP match-level reminder setting. NULL means no reminder; 1440 means 1 day before; 120 means 2 hours before. Contacts/guests follow this match setting.';

alter table public.match_participant_notification_events
  drop constraint if exists match_participant_notification_events_type_check;

alter table public.match_participant_notification_events
  add constraint match_participant_notification_events_type_check
  check (notification_type in (
    'invite',
    'confirmed_lineup',
    'critical_update',
    'cancellation',
    'host_managed_confirmation',
    'match_reminder'
  ));

alter table public.match_participant_sms_reply_codes
  drop constraint if exists match_participant_sms_reply_codes_purpose_check;

alter table public.match_participant_sms_reply_codes
  add constraint match_participant_sms_reply_codes_purpose_check
  check (purpose in ('invite', 'confirmed_lineup', 'critical_update', 'match_reminder'));

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
  v_template text;
  v_guest_email text;
  v_guest_phone text;
  v_guest_name text;
  v_invitation_id uuid;
begin
  select * into v_mp from public.match_participants where id = p_participant_id;
  if not found then
    raise exception 'participant_not_found';
  end if;

  select * into v_match from public.matches where id = v_mp.match_id;
  if not found then
    raise exception 'match_not_found';
  end if;

  select v.name into v_venue_name from public.venues v where v.id = v_match.venue_id;

  if v_mp.user_id is null and v_mp.guest_id is not null then
    select * into v_guest from public.guests where id = v_mp.guest_id;
    v_guest_email := nullif(lower(btrim(v_guest.email)), '');
    v_guest_phone := nullif(btrim(v_guest.phone), '');
    v_guest_name := nullif(btrim(v_guest.display_name), '');

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
    'match_date', v_match.match_date,
    'start_time', v_match.start_time,
    'duration_minutes', v_match.duration_minutes,
    'club_name', v_venue_name,
    'venue_name', v_venue_name,
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

create or replace function public.notification_should_send_match_reminder(
  p_match_id uuid,
  p_participant_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_match public.matches%rowtype;
  v_mp public.match_participants%rowtype;
  v_start_at timestamptz;
begin
  select * into v_match from public.matches where id = p_match_id;
  select * into v_mp from public.match_participants where id = p_participant_id;

  if v_match.id is null or v_mp.id is null then
    return false;
  end if;

  if v_match.player_reminder_minutes is null
    or v_match.match_date is null
    or v_match.start_time is null
  then
    return false;
  end if;

  v_start_at := ((v_match.match_date::timestamp + v_match.start_time) at time zone 'America/Toronto');

  return public.notification_is_game_formed(v_match)
    and public.notification_is_participant_confirmed(v_mp)
    and coalesce(v_mp.user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_match.organizer_id
    and v_start_at > now()
    and v_start_at - make_interval(mins => v_match.player_reminder_minutes) <= now()
    and not exists (
      select 1
      from public.match_participant_notification_events e
      where e.participant_id = p_participant_id
        and e.notification_type = 'match_reminder'
        and e.dedupe_key = 'match_reminder:' || p_match_id::text
    );
end;
$$;

create or replace function public.notification_enqueue_match_reminder_if_needed(
  p_participant_id uuid
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_match_id uuid;
begin
  select match_id into v_match_id from public.match_participants where id = p_participant_id;

  if v_match_id is null or not public.notification_should_send_match_reminder(v_match_id, p_participant_id) then
    return null;
  end if;

  return public.notification_enqueue_for_participant(
    p_participant_id,
    'match_reminder',
    'match_reminder:' || v_match_id::text
  );
end;
$$;

create or replace function public.notification_enqueue_due_match_reminders(
  p_limit integer default 50
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer := 0;
  v_row record;
  v_delivery uuid;
begin
  for v_row in
    select mp.id
    from public.match_participants mp
    join public.matches m on m.id = mp.match_id
    where m.status = 'active'
      and m.formed_at is not null
      and m.player_reminder_minutes is not null
      and public.notification_should_send_match_reminder(m.id, mp.id)
    order by m.match_date asc nulls last, m.start_time asc nulls last
    limit greatest(1, p_limit)
  loop
    v_delivery := public.notification_enqueue_match_reminder_if_needed(v_row.id);
    if v_delivery is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.notification_should_send_match_reminder(uuid, uuid) to authenticated, service_role;
grant execute on function public.notification_enqueue_match_reminder_if_needed(uuid) to authenticated, service_role;
grant execute on function public.notification_enqueue_due_match_reminders(integer) to authenticated, service_role;
grant execute on function public.notification_match_payload(uuid, text, jsonb) to authenticated, service_role;

create or replace function public.rpc_validate_match_level_reminders()
returns table(check_name text, ok boolean, details text)
language sql
security definer
set search_path to 'public'
as $$
  select
    'matches_player_reminder_minutes_column'::text,
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'matches'
        and column_name = 'player_reminder_minutes'
    ),
    'matches.player_reminder_minutes stores host-set match reminder timing.'::text
  union all
  select
    'match_reminder_notification_type'::text,
    exists (
      select 1
      from pg_constraint c
      where c.conname = 'match_participant_notification_events_type_check'
        and pg_get_constraintdef(c.oid) ilike '%match_reminder%'
    ),
    'notification event constraint accepts match_reminder.'::text
  union all
  select
    'due_reminder_enqueue_function'::text,
    to_regprocedure('public.notification_enqueue_due_match_reminders(integer)') is not null,
    'Due reminder enqueue function is installed.'::text;
$$;

grant execute on function public.rpc_validate_match_level_reminders() to authenticated, service_role;
