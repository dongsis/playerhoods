-- Host-managed offline confirmation MVP.
-- Hosts can add saved registered players or visible Contact Players as confirmed
-- when that player already confirmed outside PlayerHoods.

alter table public.match_participants
  add column if not exists confirmed_by_host_id uuid references public.profiles(id) on delete set null,
  add column if not exists host_confirmed_at timestamptz,
  add column if not exists confirmation_source text,
  add column if not exists confirmed_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists confirmed_by_host_at timestamptz,
  add column if not exists confirmation_note text;

alter table public.match_participants
  drop constraint if exists match_participants_confirmation_source_check;

alter table public.match_participants
  add constraint match_participants_confirmation_source_check
  check (
    confirmation_source is null
    or confirmation_source = any (array[
      'player_response'::text,
      'host_managed_offline'::text,
      'contact_owner_managed'::text,
      'organizer_added'::text,
      'system'::text
    ])
  );

comment on column public.match_participants.confirmed_by_host_id is
  'Host who added this participant as confirmed from offline coordination. This is not participant self-acceptance authority.';

comment on column public.match_participants.host_confirmed_at is
  'When the host-managed offline confirmation was recorded.';

comment on column public.match_participants.confirmation_source is
  'Business source for confirmed status. Host-managed offline confirmation records offline coordination without implying player self-acceptance.';

comment on column public.match_participants.confirmed_by_user_id is
  'User who recorded the confirmation source, when managed by organizer/contact owner/system.';

comment on column public.match_participants.confirmed_by_host_at is
  'Canonical timestamp for host-managed confirmation. Kept distinct from participant self-response.';

comment on column public.match_participants.confirmation_note is
  'Short audit note for host-managed/offline confirmation flows.';

alter table public.match_participants
  drop constraint if exists chk_participant_accepted_via;

alter table public.match_participants
  add constraint chk_participant_accepted_via
  check (
    participant_accepted_via is null
    or participant_accepted_via = any (array[
      'in_app'::text,
      'manual'::text,
      'delegate_manual'::text,
      'email_invitation'::text,
      'sms_invitation'::text,
      'proxy'::text,
      'host_offline_confirmation'::text
    ])
  );

comment on constraint chk_participant_accepted_via on public.match_participants is
  'Allowed participant acceptance sources, including host-managed offline confirmation.';

alter table public.match_participant_actions
  drop constraint if exists match_participant_actions_action_type_check;

alter table public.match_participant_actions
  drop constraint if exists match_participant_actions_action_type_chk;

alter table public.match_participant_actions
  add constraint match_participant_actions_action_type_check
  check (
    action_type = any (array[
      'invite'::text,
      'nominate'::text,
      'nominate_guest'::text,
      'delegate_confirm_guest'::text,
      'request_join'::text,
      'reenter'::text,
      'accept'::text,
      'approve'::text,
      'withdraw'::text,
      'decline'::text,
      'reject_request'::text,
      'revoke_invite'::text,
      'reject_nomination'::text,
      'remove_confirmed'::text,
      'remove'::text,
      'add_guest_org'::text,
      'add_guest_participant'::text,
      'manual_confirm'::text,
      'invited'::text,
      'nominated'::text,
      'requested'::text,
      'accepted'::text,
      'approved'::text,
      'withdrawn'::text,
      'removed'::text,
      'guest_added'::text,
      'declined'::text,
      'delegate_manual_confirm'::text,
      'revoke_delegate_confirm'::text,
      'proxy_confirm'::text,
      'invite_contact_person'::text,
      'host_offline_confirm'::text
    ])
  );

alter table public.match_participant_notification_events
  drop constraint if exists match_participant_notification_events_type_check;

alter table public.match_participant_notification_events
  add constraint match_participant_notification_events_type_check
  check (notification_type in (
    'invite',
    'confirmed_lineup',
    'critical_update',
    'cancellation',
    'sms_reply_confirmation',
    'sms_reply_help',
    'sms_reply_disambiguation',
    'add_request',
    'host_managed_confirmation'
  ));

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
  v_venue_name text;
  v_host_name text;
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

create or replace function public.notification_enqueue_host_offline_confirmation_if_needed(
  p_participant_id uuid,
  p_host_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mp public.match_participants%rowtype;
  v_match public.matches%rowtype;
  v_rec record;
  v_payload jsonb;
  v_delivery_id uuid;
  v_event_id uuid;
  v_provider text;
begin
  select * into v_mp
  from public.match_participants
  where id = p_participant_id
  for update;

  if not found then
    raise exception 'participant_not_found';
  end if;

  select * into v_match
  from public.matches
  where id = v_mp.match_id;

  if not found or v_match.organizer_id = coalesce(v_mp.user_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    return null;
  end if;

  select * into v_rec
  from public.notification_recipient_for_participant(p_participant_id)
  limit 1;

  if v_rec.channel is null or nullif(btrim(v_rec.destination), '') is null then
    return null;
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
    'host_managed_confirmation',
    'host_managed_confirmation',
    v_rec.channel,
    v_rec.destination,
    jsonb_build_object('host_user_id', p_host_user_id)
  )
  on conflict (participant_id, notification_type, dedupe_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return null;
  end if;

  v_payload := public.notification_host_offline_confirmation_payload(p_participant_id, p_host_user_id);
  v_provider := case when v_rec.channel = 'sms' then 'twilio' else 'resend' end;

  insert into public.notification_deliveries (
    channel,
    provider,
    destination,
    delivery_status,
    payload
  ) values (
    v_rec.channel,
    v_provider,
    v_rec.destination,
    'queued',
    v_payload
  )
  returning id into v_delivery_id;

  update public.match_participant_notification_events
  set delivery_id = v_delivery_id,
      sent_at = now()
  where id = v_event_id;

  return v_delivery_id;
end;
$$;

create or replace function public.rpc_match_host_add_user_confirmed(
  p_match_id uuid,
  p_target_user_id uuid
) returns public.match_participants
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
  v_mp public.match_participants%rowtype;
  v_host_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_target_user_id is null then
    raise exception 'invalid_target_user';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'match_not_found';
  end if;

  if v_match.status <> 'active' then
    raise exception 'match_not_active';
  end if;

  if v_match.organizer_id <> v_uid then
    raise exception 'not_match_organizer';
  end if;

  if p_target_user_id = v_uid then
    raise exception 'cannot_add_self_as_confirmed';
  end if;

  if public.is_blocked_either_direction(v_uid, p_target_user_id) then
    raise exception 'target_blocked';
  end if;

  if not exists (
    select 1
    from public.user_invite_circle uic
    where uic.owner_user_id = v_uid
      and uic.target_user_id = p_target_user_id
  ) then
    raise exception 'target_not_saved';
  end if;

  select * into v_mp
  from public.match_participants mp
  where mp.match_id = p_match_id
    and mp.user_id = p_target_user_id
    and mp.removed_at is null
  order by mp.created_at
  limit 1;

  if found then
    update public.match_participants
    set participant_accepted_at = coalesce(participant_accepted_at, now()),
        participant_accepted_via = case
          when participant_accepted_at is null then 'host_offline_confirmation'
          else participant_accepted_via
        end,
        confirmed_by_host_id = coalesce(confirmed_by_host_id, v_uid),
        host_confirmed_at = coalesce(host_confirmed_at, now()),
        confirmation_source = coalesce(confirmation_source, 'host_managed_offline'),
        confirmed_by_user_id = coalesce(confirmed_by_user_id, v_uid),
        confirmed_by_host_at = coalesce(confirmed_by_host_at, now()),
        confirmation_note = coalesce(confirmation_note, 'Confirmed outside PlayerHoods.'),
        manual_confirmed_by = coalesce(manual_confirmed_by, v_uid),
        org_approved_at = coalesce(org_approved_at, now()),
        org_approved_by = coalesce(org_approved_by, v_uid)
    where id = v_mp.id
    returning * into v_mp;
  else
    insert into public.match_participants (
      match_id,
      join_method,
      user_id,
      created_by,
      created_at,
      nominated_by,
      participant_accepted_at,
      participant_accepted_via,
      manual_confirmed_by,
      confirmed_by_host_id,
      host_confirmed_at,
      confirmation_source,
      confirmed_by_user_id,
      confirmed_by_host_at,
      confirmation_note,
      org_approved_at,
      org_approved_by
    ) values (
      p_match_id,
      'invited',
      p_target_user_id,
      v_uid,
      now(),
      v_uid,
      now(),
      'host_offline_confirmation',
      v_uid,
      v_uid,
      now(),
      'host_managed_offline',
      v_uid,
      now(),
      'Confirmed outside PlayerHoods.',
      now(),
      v_uid
    )
    returning * into v_mp;
  end if;

  perform public.match_participant_reconcile_status(v_mp.id);
  perform public.perform_match_roster_rebalance(p_match_id);
  perform public.notification_maybe_auto_form_match(p_match_id);

  select * into v_mp
  from public.match_participants
  where id = v_mp.id;

  insert into public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  select p_match_id, v_mp.id, 'host_offline_confirm', 'Added by host; confirmed offline.', v_uid
  where not exists (
    select 1
    from public.match_participant_actions a
    where a.match_participant_id = v_mp.id
      and a.action_type = 'host_offline_confirm'
  );

  select coalesce(nullif(btrim(p.display_name), ''), 'Someone') into v_host_name
  from public.profiles p
  where p.id = v_uid;

  insert into public.notifications (
    recipient_user_id,
    kind,
    match_id,
    match_participant_id,
    actor_user_id,
    note,
    dedupe_key
  ) values (
    p_target_user_id,
    'host_managed_confirmation',
    p_match_id,
    v_mp.id,
    v_uid,
    coalesce(v_host_name, 'Someone') || ' added you as confirmed for this match. You can update your response anytime.',
    'host_managed_confirmation:' || v_mp.id::text
  )
  on conflict (recipient_user_id, kind, dedupe_key) where dedupe_key is not null do nothing;

  perform public.notification_enqueue_host_offline_confirmation_if_needed(v_mp.id, v_uid);

  return v_mp;
end;
$$;

create or replace function public.rpc_match_host_add_contact_person_confirmed(
  p_match_id uuid,
  p_person_id uuid
)
returns table(
  match_participant_id uuid,
  target_kind text,
  target_user_id uuid,
  target_person_id uuid
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
  v_person public.people%rowtype;
  v_guest_id uuid;
  v_linked_user_id uuid;
  v_mp public.match_participants%rowtype;
  v_guest_name text;
  v_guest_email text;
  v_guest_phone text;
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

  if v_match.status <> 'active' then
    raise exception 'match_not_active';
  end if;

  if v_match.organizer_id <> v_uid then
    raise exception 'not_match_organizer';
  end if;

  select * into v_person
  from public.people
  where person_id = p_person_id
    and status = 'active';

  if not found then
    raise exception 'person_not_found_or_inactive';
  end if;

  if not public.can_user_have_contact_person_exposure(v_uid, p_person_id) then
    raise exception 'contact_person_not_visible';
  end if;

  v_linked_user_id := v_person.linked_user_id;

  if v_linked_user_id is null then
    select il.user_id
    into v_linked_user_id
    from public.identity_links il
    join public.guests g
      on g.id = il.linked_id
     and g.person_id = p_person_id
    where il.linked_type = 'contact'
    order by il.created_at desc
    limit 1;
  end if;

  if v_linked_user_id is not null then
    select * into v_mp
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.user_id = v_linked_user_id
      and mp.removed_at is null
    order by mp.created_at
    limit 1;

    if found then
      update public.match_participants
      set participant_accepted_at = coalesce(participant_accepted_at, now()),
          participant_accepted_via = case
            when participant_accepted_at is null then 'host_offline_confirmation'
            else participant_accepted_via
          end,
          confirmed_by_host_id = coalesce(confirmed_by_host_id, v_uid),
          host_confirmed_at = coalesce(host_confirmed_at, now()),
          confirmation_source = coalesce(confirmation_source, 'host_managed_offline'),
          confirmed_by_user_id = coalesce(confirmed_by_user_id, v_uid),
          confirmed_by_host_at = coalesce(confirmed_by_host_at, now()),
          confirmation_note = coalesce(confirmation_note, 'Confirmed outside PlayerHoods.'),
          manual_confirmed_by = coalesce(manual_confirmed_by, v_uid),
          org_approved_at = coalesce(org_approved_at, now()),
          org_approved_by = coalesce(org_approved_by, v_uid)
      where id = v_mp.id
      returning * into v_mp;
    else
      insert into public.match_participants (
        match_id,
        join_method,
        user_id,
        created_by,
        created_at,
        nominated_by,
        participant_accepted_at,
        participant_accepted_via,
        manual_confirmed_by,
        confirmed_by_host_id,
        host_confirmed_at,
        confirmation_source,
        confirmed_by_user_id,
        confirmed_by_host_at,
        confirmation_note,
        org_approved_at,
        org_approved_by
      ) values (
        p_match_id,
        'invited',
        v_linked_user_id,
        v_uid,
        now(),
        v_uid,
        now(),
        'host_offline_confirmation',
        v_uid,
        v_uid,
        now(),
        'host_managed_offline',
        v_uid,
        now(),
        'Confirmed outside PlayerHoods.',
        now(),
        v_uid
      )
      returning * into v_mp;
    end if;

    perform public.match_participant_reconcile_status(v_mp.id);
    perform public.perform_match_roster_rebalance(p_match_id);
    perform public.notification_maybe_auto_form_match(p_match_id);

    insert into public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
    select p_match_id, v_mp.id, 'host_offline_confirm', 'Added by host; confirmed offline.', v_uid
    where not exists (
      select 1
      from public.match_participant_actions a
      where a.match_participant_id = v_mp.id
        and a.action_type = 'host_offline_confirm'
    );

    perform public.notification_enqueue_host_offline_confirmation_if_needed(v_mp.id, v_uid);

    return query select v_mp.id, 'registered_user'::text, v_linked_user_id, p_person_id;
    return;
  end if;

  select
    g.id,
    coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(g.display_name), ''), 'Contact Player'),
    nullif(btrim(g.email), ''),
    nullif(btrim(g.phone), '')
  into v_guest_id, v_guest_name, v_guest_email, v_guest_phone
  from public.guests g
  left join public.people p on p.person_id = g.person_id
  where g.person_id = p_person_id
    and g.status = 'active'
  order by
    case
      when exists (
        select 1
        from public.user_roster_guests urg
        where urg.owner_user_id = v_uid
          and urg.guest_id = g.id
      ) then 0
      else 1
    end,
    case
      when nullif(btrim(g.phone), '') is not null or nullif(btrim(g.email), '') is not null then 0
      else 1
    end,
    g.created_at
  limit 1;

  if v_guest_id is null then
    raise exception 'contact_guest_not_found';
  end if;

  select * into v_mp
  from public.match_participants mp
  join public.guests g on g.id = mp.guest_id
  where mp.match_id = p_match_id
    and g.person_id = p_person_id
    and mp.removed_at is null
  order by mp.created_at
  limit 1;

  if found then
    update public.match_participants
    set participant_accepted_at = coalesce(participant_accepted_at, now()),
        participant_accepted_via = case
          when participant_accepted_at is null then 'host_offline_confirmation'
          else participant_accepted_via
        end,
        confirmed_by_host_id = coalesce(confirmed_by_host_id, v_uid),
        host_confirmed_at = coalesce(host_confirmed_at, now()),
        confirmation_source = coalesce(confirmation_source, 'contact_owner_managed'),
        confirmed_by_user_id = coalesce(confirmed_by_user_id, v_uid),
        confirmed_by_host_at = coalesce(confirmed_by_host_at, now()),
        confirmation_note = coalesce(confirmation_note, 'Confirmed outside PlayerHoods.'),
        manual_confirmed_by = coalesce(manual_confirmed_by, v_uid),
        org_approved_at = coalesce(org_approved_at, now()),
        org_approved_by = coalesce(org_approved_by, v_uid)
    where id = v_mp.id
    returning * into v_mp;
  else
    insert into public.match_participants (
      match_id,
      join_method,
      guest_id,
      created_by,
      created_at,
      nominated_by,
      participant_accepted_at,
      participant_accepted_via,
      manual_confirmed_by,
      confirmed_by_host_id,
      host_confirmed_at,
      confirmation_source,
      confirmed_by_user_id,
      confirmed_by_host_at,
      confirmation_note,
      org_approved_at,
      org_approved_by
    ) values (
      p_match_id,
      'nominated',
      v_guest_id,
      v_uid,
      now(),
      v_uid,
      now(),
      'host_offline_confirmation',
      v_uid,
      v_uid,
      now(),
      'contact_owner_managed',
      v_uid,
      now(),
      'Confirmed outside PlayerHoods.',
      now(),
      v_uid
    )
    returning * into v_mp;
  end if;

  if v_guest_email is not null or v_guest_phone is not null then
    insert into public.email_invitations (
      inviter_user_id,
      target_email,
      target_phone,
      target_name,
      related_type,
      related_id,
      expires_at,
      match_participant_id
    )
    select
      v_uid,
      case when v_guest_email is not null then lower(btrim(v_guest_email)) else null end,
      v_guest_phone,
      v_guest_name,
      'match',
      p_match_id,
      null,
      v_mp.id
    where not exists (
      select 1
      from public.email_invitations ei
      where ei.match_participant_id = v_mp.id
        and ei.status = 'pending'
    );
  end if;

  perform public.match_participant_reconcile_status(v_mp.id);
  perform public.perform_match_roster_rebalance(p_match_id);
  perform public.notification_maybe_auto_form_match(p_match_id);

  insert into public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  select p_match_id, v_mp.id, 'host_offline_confirm', 'Added by host; confirmed offline.', v_uid
  where not exists (
    select 1
    from public.match_participant_actions a
    where a.match_participant_id = v_mp.id
      and a.action_type = 'host_offline_confirm'
  );

  perform public.notification_enqueue_host_offline_confirmation_if_needed(v_mp.id, v_uid);

  return query select v_mp.id, 'contact_person'::text, null::uuid, p_person_id;
end;
$$;

comment on function public.rpc_match_host_add_user_confirmed(uuid, uuid) is
  'Host-managed offline confirmation for saved registered players. Records host audit fields and notifies the player without claiming participant self-action.';

comment on function public.rpc_match_host_add_contact_person_confirmed(uuid, uuid) is
  'Host-managed offline confirmation for Contact Players exposed to the host. Records host audit fields and notifies reachable contacts.';

grant execute on function public.notification_host_offline_confirmation_payload(uuid, uuid) to authenticated, service_role;
grant execute on function public.notification_enqueue_host_offline_confirmation_if_needed(uuid, uuid) to authenticated, service_role;
grant execute on function public.rpc_match_host_add_user_confirmed(uuid, uuid) to authenticated, service_role;
grant execute on function public.rpc_match_host_add_contact_person_confirmed(uuid, uuid) to authenticated, service_role;

create or replace function public.rpc_match_reconfirm_participation(p_match_id uuid)
returns public.match_participants
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_mp public.match_participants%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select mp.* into v_mp
  from public.match_participants mp
  left join public.identity_links il
    on il.linked_type = 'guest_participant'
   and il.linked_id = mp.id
   and il.user_id = v_uid
  where mp.match_id = p_match_id
    and (mp.user_id = v_uid or il.user_id is not null)
    and mp.removed_at is null
  order by case when mp.user_id = v_uid then 0 else 1 end, mp.created_at desc
  limit 1
  for update of mp;

  if not found then
    raise exception 'participant_not_found';
  end if;

  if v_mp.status not in ('pending', 'confirmed') then
    raise exception 'reconfirm_not_allowed_for_status:%', v_mp.status;
  end if;

  update public.match_participants
  set participant_accepted_at = coalesce(participant_accepted_at, now()),
      participant_accepted_via = 'in_app',
      confirmation_source = 'player_response',
      confirmation_note = null
  where id = v_mp.id
  returning * into v_mp;

  perform public.match_participant_reconcile_status(v_mp.id);
  perform public.perform_match_roster_rebalance(p_match_id);
  perform public.notification_maybe_auto_form_match(p_match_id);

  insert into public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  select p_match_id, v_mp.id, 'accept', 'Player confirmed in PlayerHoods.', v_uid
  where not exists (
    select 1
    from public.match_participant_actions a
    where a.match_participant_id = v_mp.id
      and a.action_type = 'accept'
      and a.created_by = v_uid
  );

  select * into v_mp from public.match_participants where id = v_mp.id;
  return v_mp;
end;
$$;

grant execute on function public.rpc_match_reconfirm_participation(uuid) to authenticated, service_role;

create or replace function public.rpc_validate_host_offline_confirmation_mvp()
returns table(check_name text, ok boolean, detail text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    'participant_accepted_via_allows_host_offline_confirmation',
    exists (
      select 1
      from pg_constraint c
      where c.conname = 'chk_participant_accepted_via'
        and pg_get_constraintdef(c.oid) like '%host_offline_confirmation%'
    ),
    'match_participants.participant_accepted_via constraint includes host_offline_confirmation'
  union all
  select
    'host_audit_columns_exist',
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'match_participants'
        and column_name = 'confirmed_by_host_id'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'match_participants'
        and column_name = 'host_confirmed_at'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'match_participants'
        and column_name = 'confirmation_source'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'match_participants'
        and column_name = 'confirmed_by_user_id'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'match_participants'
        and column_name = 'confirmed_by_host_at'
    ),
    'match_participants has host-managed confirmation audit columns'
  union all
  select
    'confirmation_source_constraint_exists',
    exists (
      select 1
      from pg_constraint c
      where c.conname = 'match_participants_confirmation_source_check'
        and pg_get_constraintdef(c.oid) like '%host_managed_offline%'
        and pg_get_constraintdef(c.oid) like '%contact_owner_managed%'
    ),
    'confirmation_source constraint includes host-managed/contact-owner sources'
  union all
  select
    'host_managed_notification_type_exists',
    exists (
      select 1
      from pg_constraint c
      where c.conname = 'match_participant_notification_events_type_check'
        and pg_get_constraintdef(c.oid) like '%host_managed_confirmation%'
    ),
    'notification event constraint includes host_managed_confirmation'
  union all
  select
    'rpc_functions_exist',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'rpc_match_host_add_user_confirmed'
    )
    and exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'rpc_match_host_add_contact_person_confirmed'
    )
    and exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'rpc_match_reconfirm_participation'
    ),
    'host-managed confirmation RPCs are installed';
$$;

grant execute on function public.rpc_validate_host_offline_confirmation_mvp() to authenticated, service_role;

