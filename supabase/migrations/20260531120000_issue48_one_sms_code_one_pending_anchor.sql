-- Issue #48: one active SMS RSVP code and one pending invitation anchor per match participant.
--
-- Focused DB hotfix only:
-- - purpose remains historical metadata; it no longer partitions active SMS reply codes
-- - pending email_invitations anchors are unique per match_participant_id
-- - contact participant insert triggers no longer race ahead of RPC-created anchors
-- - inbound YES keeps the active code available for later Game On / reminder OUT replies

-- Expire old unconsumed codes first so the one-unconsumed index can be durable.
update public.match_participant_sms_reply_codes c
set consumed_at = now(),
    metadata = coalesce(c.metadata, '{}'::jsonb)
      || jsonb_build_object('issue48_cleanup', 'expired_before_unique_active_participant_code')
where c.consumed_at is null
  and c.expires_at is not null
  and c.expires_at <= now();

with ranked_codes as (
  select
    c.id,
    row_number() over (
      partition by c.participant_id
      order by c.created_at desc, c.id::text desc
    ) as rn,
    first_value(c.id) over (
      partition by c.participant_id
      order by c.created_at desc, c.id::text desc
    ) as keep_id
  from public.match_participant_sms_reply_codes c
  where c.consumed_at is null
)
update public.match_participant_sms_reply_codes c
set consumed_at = now(),
    metadata = coalesce(c.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'issue48_cleanup', 'superseded_duplicate_active_participant_code',
        'superseded_by_code_id', ranked_codes.keep_id
      )
from ranked_codes
where c.id = ranked_codes.id
  and ranked_codes.rn > 1;

with ranked_anchors as (
  select
    ei.id,
    row_number() over (
      partition by ei.match_participant_id
      order by ei.created_at desc, ei.id::text desc
    ) as rn,
    first_value(ei.id) over (
      partition by ei.match_participant_id
      order by ei.created_at desc, ei.id::text desc
    ) as keep_id
  from public.email_invitations ei
  where ei.match_participant_id is not null
    and ei.status = 'pending'
)
update public.email_invitations ei
set status = 'canceled',
    updated_at = now()
from ranked_anchors
where ei.id = ranked_anchors.id
  and ranked_anchors.rn > 1;

create unique index if not exists uq_match_participant_sms_reply_codes_one_unconsumed
  on public.match_participant_sms_reply_codes(participant_id)
  where consumed_at is null;

create unique index if not exists uq_email_invitations_one_pending_match_participant
  on public.email_invitations(match_participant_id)
  where match_participant_id is not null
    and status = 'pending';

create or replace function public.notification_create_or_get_sms_reply_code(
  p_participant_id uuid,
  p_purpose text default 'invite'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mp public.match_participants%rowtype;
  v_rec record;
  v_existing_id uuid;
  v_existing text;
  v_code text;
  v_attempt int := 0;
  v_purpose text := coalesce(nullif(p_purpose, ''), 'invite');
begin
  select * into v_mp
  from public.match_participants
  where id = p_participant_id;

  if not found then
    raise exception 'participant_not_found';
  end if;

  select * into v_rec
  from public.notification_recipient_for_participant(p_participant_id, 'sms')
  limit 1;

  if v_rec.phone_e164 is null then
    return null;
  end if;

  update public.match_participant_sms_reply_codes c
  set consumed_at = now(),
      metadata = coalesce(c.metadata, '{}'::jsonb)
        || jsonb_build_object('issue48_cleanup', 'expired_before_code_reuse')
  where c.participant_id = p_participant_id
    and c.consumed_at is null
    and c.expires_at is not null
    and c.expires_at <= now();

  select id, code into v_existing_id, v_existing
  from public.match_participant_sms_reply_codes
  where participant_id = p_participant_id
    and consumed_at is null
  order by created_at desc
  limit 1;

  if v_existing is not null then
    update public.match_participant_sms_reply_codes
    set phone_e164 = v_rec.phone_e164,
        metadata = coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object('last_requested_purpose', v_purpose)
    where id = v_existing_id;
    return v_existing;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := upper(substr(translate(encode(extensions.gen_random_bytes(5), 'base64'), '+/=', '234'), 1, 5));

    begin
      insert into public.match_participant_sms_reply_codes (
        match_id,
        participant_id,
        phone_e164,
        code,
        purpose,
        expires_at,
        metadata
      ) values (
        v_mp.match_id,
        p_participant_id,
        v_rec.phone_e164,
        v_code,
        v_purpose,
        now() + interval '30 days',
        jsonb_build_object('last_requested_purpose', v_purpose)
      );
      return v_code;
    exception when unique_violation then
      if exists (
        select 1
        from public.match_participant_sms_reply_codes c
        where c.participant_id = p_participant_id
          and c.consumed_at is null
      ) then
        select c.code into v_existing
        from public.match_participant_sms_reply_codes c
        where c.participant_id = p_participant_id
          and c.consumed_at is null
        order by c.created_at desc
        limit 1;
        return v_existing;
      end if;

      if v_attempt >= 8 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

comment on function public.notification_create_or_get_sms_reply_code(uuid, text)
is 'Issue #48: creates or reuses one active unconsumed SMS reply code per match participant; purpose is metadata/history only.';

create or replace function public.notification_should_trigger_invite_enqueue(
  p_participant public.match_participants
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    -- Contact Player invite RPCs create/reuse the pending anchor and process the
    -- invitation domain event after participant insert. Skipping the insert-time
    -- trigger avoids creating a competing anchor before the RPC reaches that step.
    not (
      (p_participant).user_id is null
      and (p_participant).guest_id is not null
      and not exists (
        select 1
        from public.email_invitations ei
        where ei.match_participant_id = (p_participant).id
          and ei.status = 'pending'
      )
    );
$$;

create or replace function public.trg_enqueue_invite_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.notification_should_trigger_invite_enqueue(new) then
    return new;
  end if;

  perform public.notification_enqueue_invite_if_needed(new.id);
  return new;
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
        and ei.status = 'pending'
      order by ei.created_at desc
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
            and ei.status = 'pending'
          order by ei.created_at desc
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

grant execute on function public.notification_match_payload(uuid, text, jsonb) to authenticated, service_role;

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
begin
  if v_phone is null then
    return 'We could not read your phone number. Reply YES to accept, NO to decline, or DETAILS for the match link.';
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
    return 'Reply YES to accept, NO to decline, or DETAILS for the match link.';
  end if;

  if v_body in ('MAYBE', 'M') then
    return 'Maybe is not supported yet. Reply YES to accept or NO to decline.';
  end if;

  if v_body ~ '^(YES|Y|IN|ACCEPT)(\s+|$)' then
    v_action := 'accept';
  elsif v_body ~ '^(NO|N|OUT|DECLINE)(\s+|$)' then
    v_action := 'decline';
  elsif v_body ~ '^(DETAILS|INFO|LINK)(\s+|$)' then
    v_action := 'details';
  else
    return 'Reply YES to accept, NO to decline, or DETAILS for the match link.';
  end if;

  select token
  into v_code
  from regexp_split_to_table(v_body, '\s+') as token
  where token ~ '^[A-Z2-9]{4,6}$'
    and token not in ('YES', 'ACCEPT', 'DECLINE', 'DETAILS', 'INFO', 'LINK')
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
      return 'We could not find that invite code. Reply YES to accept, NO to decline, or DETAILS for the match link.';
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
      and mp.participant_accepted_at is null
      and m.status = 'active';

    if coalesce(v_candidate_count, 0) = 0 then
      return 'We could not find an active invite for this number. View your invite link or contact the organizer.';
    end if;

    if v_candidate_count > 1 then
      select string_agg(
        v_action || ' ' || c.code || ' for ' || coalesce(m.match_date::text, 'a match') || coalesce(' at ' || m.start_time::text, ''),
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
        and mp.participant_accepted_at is null
        and m.status = 'active'
      limit 3;
      return 'You have multiple invites. Reply ' || coalesce(v_response, 'YES with the invite code.');
    end if;

    select c.participant_id
    into v_candidate_id
    from public.match_participant_sms_reply_codes c
    join public.match_participants mp on mp.id = c.participant_id
    join public.matches m on m.id = c.match_id
    where c.phone_e164 = v_phone
      and c.consumed_at is null
      and (c.expires_at is null or c.expires_at > now())
      and mp.removed_at is null
      and mp.participant_accepted_at is null
      and m.status = 'active'
    order by c.created_at asc, c.participant_id::text asc
    limit 1;
  end if;

  select * into v_mp from public.match_participants where id = v_candidate_id for update;
  if not found or v_mp.removed_at is not null then
    return 'This invite is no longer active.';
  end if;

  select * into v_match from public.matches where id = v_mp.match_id;
  v_match_id := v_match.id;
  v_link := public.notification_magic_link_for_participant(v_candidate_id);

  if v_action = 'details' then
    return 'View match details here: ' || coalesce(v_link, '/matches/' || v_match_id::text);
  end if;

  if v_action = 'accept' then
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
      return 'You are marked as interested. We will let you know if you are confirmed to play.';
    end if;

    return 'You are marked as in. We will let you know if you are confirmed to play.';
  end if;

  if v_action = 'decline' then
    if v_code_row.id is not null then
      update public.match_participant_sms_reply_codes
      set consumed_at = coalesce(consumed_at, now())
      where id = v_code_row.id;
    end if;

    if v_match.formed_at is not null then
      perform public.apply_participant_exit(v_candidate_id, v_match.organizer_id, 'withdraw', 'sms_out_after_formed');
      return 'You are no longer marked as playing. The organizer has been notified.';
    end if;

    perform public.apply_participant_exit(v_candidate_id, v_match.organizer_id, 'withdraw', 'sms_declined');
    return 'You declined this match. We will not notify you again unless you are invited to another match.';
  end if;

  return 'Reply YES to accept, NO to decline, or DETAILS for the match link.';
end;
$$;

grant execute on function public.rpc_sms_reply_handle(text, text) to anon, authenticated, service_role;

drop function if exists public.rpc_email_invitation_create(text, text, text, uuid, timestamptz);

create or replace function public.rpc_email_invitation_create(
  p_target_email text,
  p_target_name text,
  p_related_type text,
  p_related_id uuid,
  p_expires_at timestamptz default null,
  p_target_phone text default null
)
returns public.email_invitations
language plpgsql
security definer
set search_path to public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.email_invitations%rowtype;
  v_target_email text := nullif(lower(btrim(coalesce(p_target_email, ''))), '');
  v_target_phone text := nullif(btrim(coalesce(p_target_phone, '')), '');
  v_email_opted_out boolean := false;
  v_sms_opted_out boolean := false;
  v_anchor_mp_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_related_type <> 'match' then
    raise exception 'invalid_related_type';
  end if;

  if v_target_email is null and v_target_phone is null then
    raise exception 'email_or_phone_required';
  end if;

  v_email_opted_out := v_target_email is not null and public.is_contact_communication_opted_out('email', v_target_email, 'match_invites');
  v_sms_opted_out := v_target_phone is not null and public.is_contact_communication_opted_out('sms', v_target_phone, 'match_invites');

  if (v_target_email is null or v_email_opted_out) and (v_target_phone is null or v_sms_opted_out) then
    raise exception 'contact_communication_opted_out';
  end if;

  select mp.id
  into v_anchor_mp_id
  from public.match_participants mp
  join public.guests g on g.id = mp.guest_id
  where mp.match_id = p_related_id
    and (
      (v_target_email is not null and lower(btrim(coalesce(g.email, ''))) = v_target_email)
      or (
        v_target_phone is not null
        and regexp_replace(coalesce(g.phone, ''), '\D', '', 'g') = regexp_replace(v_target_phone, '\D', '', 'g')
      )
    )
  order by mp.created_at desc
  limit 1;

  if v_anchor_mp_id is not null then
    select * into v_inv
    from public.email_invitations ei
    where ei.match_participant_id = v_anchor_mp_id
      and ei.status = 'pending'
    order by ei.created_at desc
    limit 1;

    if found then
      return v_inv;
    end if;
  end if;

  insert into public.email_invitations (
    inviter_user_id,
    target_email,
    target_phone,
    target_name,
    related_type,
    related_id,
    expires_at,
    match_participant_id,
    email_opted_out_at,
    sms_opted_out_at,
    delivery_suppressed_reason
  )
  values (
    v_uid,
    case when v_email_opted_out then null else v_target_email end,
    case when v_sms_opted_out then null else v_target_phone end,
    nullif(btrim(p_target_name), ''),
    p_related_type,
    p_related_id,
    p_expires_at,
    v_anchor_mp_id,
    case when v_email_opted_out then now() else null end,
    case when v_sms_opted_out then now() else null end,
    case when v_email_opted_out or v_sms_opted_out then 'recipient_unsubscribed_channel' else null end
  )
  returning * into v_inv;

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
  values (
    'invitation.email_invitation_created',
    'email_invitation',
    v_inv.id,
    v_uid,
    jsonb_build_object(
      'invitation_id', v_inv.id,
      'related_type', v_inv.related_type,
      'related_id', v_inv.related_id,
      'target_email', v_inv.target_email,
      'target_phone', v_inv.target_phone,
      'target_name', v_inv.target_name,
      'inviter_user_id', v_inv.inviter_user_id
    )
  );

  perform public.rpc_process_domain_event((
    select de.id
    from public.domain_events de
    where de.aggregate_type = 'email_invitation'
      and de.aggregate_id = v_inv.id
      and de.event_type = 'invitation.email_invitation_created'
    order by de.created_at desc
    limit 1
  ));

  return v_inv;
end;
$$;

comment on function public.rpc_email_invitation_create(text, text, text, uuid, timestamptz, text) is
  'Creates a match invitation and suppresses opted-out contact channels before emitting the send event. Issue #48: reuses an existing pending participant anchor when present.';

grant execute on function public.rpc_email_invitation_create(text, text, text, uuid, timestamptz, text) to authenticated, service_role;
