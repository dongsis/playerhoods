-- Ensure all contact/guest participant notification links use the public invitation
-- route instead of falling back to protected /matches/:id.

create or replace function public.notification_magic_link_for_participant(
  p_participant_id uuid
) returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_inv_id uuid;
  v_match_id uuid;
begin
  select ei.id into v_inv_id
  from public.email_invitations ei
  where ei.match_participant_id = p_participant_id
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

  if v_inv_id is not null then
    return '/i/' || v_inv_id::text;
  end if;

  select mp.match_id into v_match_id
  from public.match_participants mp
  where mp.id = p_participant_id;

  if v_match_id is null then
    return null;
  end if;

  return '/matches/' || v_match_id::text;
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
        else 'critical_update'
      end
    ),
    'change_set', coalesce(p_change_set, '{}'::jsonb)
  );
end;
$$;

comment on function public.notification_magic_link_for_participant(uuid) is
  'Returns a public invitation short link for contact/guest participants whenever an invitation anchor exists; falls back to protected match page only when no anchor exists.';

comment on function public.notification_match_payload(uuid, text, jsonb) is
  'Builds match notification payloads and ensures unregistered contact/guest participants have a public invitation anchor before email/SMS links are rendered.';

grant execute on function public.notification_magic_link_for_participant(uuid) to authenticated, service_role;
grant execute on function public.notification_match_payload(uuid, text, jsonb) to authenticated, service_role;

create or replace function public.rpc_validate_contact_notification_public_links()
returns table(check_name text, ok boolean, details text)
language sql
security definer
set search_path to 'public'
as $$
  select
    'notification_magic_link_for_participant_exists'::text,
    to_regprocedure('public.notification_magic_link_for_participant(uuid)') is not null,
    'Public invitation link resolver is installed.'::text
  union all
  select
    'notification_match_payload_exists'::text,
    to_regprocedure('public.notification_match_payload(uuid, text, jsonb)') is not null,
    'Notification payload builder is installed.'::text
  union all
  select
    'email_invitations_match_participant_anchor_available'::text,
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'email_invitations'
        and column_name = 'match_participant_id'
    ),
    'email_invitations can anchor public links to match participants.'::text;
$$;

grant execute on function public.rpc_validate_contact_notification_public_links() to authenticated, service_role;
