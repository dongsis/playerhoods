-- Issue #66 follow-up: active match_invite SMS path recipient/sport payload.
--
-- Production validation showed fresh invite SMS uses:
-- notification_enqueue_invite_if_needed -> notification_match_payload('invite')
-- -> template_type = match_invite -> renderMatchInviteSms.
--
-- Keep this focused:
-- - add sport_name to match notification payloads
-- - preserve recipient_name behavior from #61
-- - do not alter RSVP state machine, invitation anchors, dedupe, lifecycle, drain, or providers

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

comment on function public.notification_match_payload(uuid, text, jsonb)
is 'Issue #66 follow-up: builds match notification payloads with recipient_name, venue_timezone, and sport_name for the active match_invite SMS path.';

grant execute on function public.notification_match_payload(uuid, text, jsonb) to authenticated, service_role;
