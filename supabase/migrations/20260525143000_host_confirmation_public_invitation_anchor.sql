-- Ensure host-managed confirmation emails for unregistered contact players open a public
-- invitation route instead of falling back to the protected /matches/:id route.

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
  v_host_name text;
  v_invitation_id uuid;
  v_target_email text;
  v_target_name text;
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

  select v.name into v_venue_name
  from public.venues v
  where v.id = v_match.venue_id;

  select coalesce(nullif(btrim(p.display_name), ''), 'Someone')
  into v_host_name
  from public.profiles p
  where p.id = p_host_user_id;

  if v_mp.user_id is null and v_mp.guest_id is not null then
    select * into v_guest
    from public.guests
    where id = v_mp.guest_id;

    v_target_email := nullif(btrim(v_guest.email), '');
    v_target_name := nullif(btrim(v_guest.display_name), '');

    if v_target_email is not null then
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
          target_name,
          related_type,
          related_id,
          status,
          expires_at,
          match_participant_id
        ) values (
          p_host_user_id,
          v_target_email,
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
    'match_date', v_match.match_date,
    'start_time', v_match.start_time,
    'duration_minutes', v_match.duration_minutes,
    'club_name', v_venue_name,
    'venue_name', v_venue_name,
    'formed_at', v_match.formed_at,
    'is_formed', (v_match.formed_at is not null),
    'organizer_display_name', coalesce(v_host_name, 'Someone'),
    'magic_link_path', public.notification_magic_link_for_participant(v_mp.id),
    'reply_code', public.notification_create_or_get_sms_reply_code(v_mp.id, 'confirmed_lineup'),
    'change_set', '{}'::jsonb
  );
end;
$$;

comment on function public.notification_host_offline_confirmation_payload(uuid, uuid) is
  'Builds host-managed confirmation delivery payload. For unregistered contact players with email, creates an anchored pending email invitation so email CTAs resolve through the public invitation flow.';

grant execute on function public.notification_host_offline_confirmation_payload(uuid, uuid) to authenticated, service_role;

create or replace function public.rpc_validate_host_confirmation_public_invitation_anchor()
returns table(check_name text, ok boolean, details text)
language sql
security definer
set search_path to 'public'
as $$
  select
    'notification_host_offline_confirmation_payload_exists'::text,
    to_regprocedure('public.notification_host_offline_confirmation_payload(uuid, uuid)') is not null,
    'Host confirmation payload function is installed.'::text
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
    'email_invitations can anchor public invitation links to match_participants.'::text;
$$;

grant execute on function public.rpc_validate_host_confirmation_public_invitation_anchor() to authenticated, service_role;
