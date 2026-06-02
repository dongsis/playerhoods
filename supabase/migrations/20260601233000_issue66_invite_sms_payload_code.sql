-- Issue #66: invite SMS entry copy support and 2-character RSVP codes.
--
-- Focused follow-up only:
-- - new SMS reply codes use a safe two-character alphabet
-- - inbound parser accepts new 2-character codes while keeping old 4-6 character active codes valid
-- - keep RSVP state machine, invitation anchors, notification dedupe, and delivery behavior unchanged

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
  v_requested_purpose text := coalesce(nullif(p_purpose, ''), 'invite');
  v_purpose text := case
    when coalesce(nullif(p_purpose, ''), 'invite') in ('invite', 'confirmed_lineup', 'critical_update')
      then coalesce(nullif(p_purpose, ''), 'invite')
    else 'critical_update'
  end;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
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
        || jsonb_build_object('issue66_cleanup', 'expired_before_code_reuse')
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
        expires_at = case
          when expires_at is null or expires_at > now() + interval '30 days'
            then expires_at
          else now() + interval '30 days'
        end,
        metadata = coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object(
            'last_requested_purpose', v_requested_purpose,
            'stored_purpose', v_purpose
          )
    where id = v_existing_id;
    return v_existing;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_bytes := extensions.gen_random_bytes(2);
    v_code := substring(v_alphabet from (get_byte(v_bytes, 0) % length(v_alphabet)) + 1 for 1)
      || substring(v_alphabet from (get_byte(v_bytes, 1) % length(v_alphabet)) + 1 for 1);

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
        jsonb_build_object(
          'last_requested_purpose', v_requested_purpose,
          'stored_purpose', v_purpose,
          'code_length', 2,
          'safe_alphabet', v_alphabet
        )
      );
      return v_code;
    exception when unique_violation then
      if exists (
        select 1
        from public.match_participant_sms_reply_codes c
        where c.participant_id = p_participant_id
          and c.consumed_at is null
      ) then
        select c.id, c.code into v_existing_id, v_existing
        from public.match_participant_sms_reply_codes c
        where c.participant_id = p_participant_id
          and c.consumed_at is null
        order by c.created_at desc
        limit 1;
        update public.match_participant_sms_reply_codes c
        set phone_e164 = v_rec.phone_e164,
            expires_at = case
              when c.expires_at is null or c.expires_at > now() + interval '30 days'
                then c.expires_at
              else now() + interval '30 days'
            end,
            metadata = coalesce(c.metadata, '{}'::jsonb)
              || jsonb_build_object(
                'last_requested_purpose', v_requested_purpose,
                'stored_purpose', v_purpose
              )
        where c.id = v_existing_id;
        return v_existing;
      end if;

      if v_attempt >= 64 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

comment on function public.notification_create_or_get_sms_reply_code(uuid, text)
is 'Issue #66: creates or reuses one active unconsumed SMS reply code per match participant; new generated codes use a two-character safe alphabet while existing longer active codes remain valid.';

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
begin
  if v_phone is null then
    return 'We could not read your phone number. Reply YES {code} or NO {code} for a pending invite, OUT {code} if you need to back out, or DETAILS {code} for the match link.';
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
    return 'Reply YES {code} or NO {code} for a pending invite, OUT {code} if you need to back out, or DETAILS {code} for the match link.';
  end if;

  if v_body in ('MAYBE', 'M') then
    return 'Maybe is not supported yet. Reply YES {code} or NO {code} for a pending invite, or OUT {code} if you need to back out.';
  end if;

  if v_body ~ '^(YES|Y|IN|ACCEPT)(\s+|$)' then
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
    return 'Reply YES {code} or NO {code} for a pending invite, OUT {code} if you need to back out, or DETAILS {code} for the match link.';
  end if;

  select token
  into v_code
  from regexp_split_to_table(v_body, '\s+') as token
  where token ~ '^[A-Z2-9]{2,6}$'
    and token not in ('YES', 'Y', 'IN', 'ACCEPT', 'NO', 'N', 'DECLINE', 'OUT', 'DETAILS', 'INFO', 'LINK')
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
      return 'We could not find that invite code. Reply YES {code} or NO {code} for a pending invite, or DETAILS {code} for the match link.';
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
        and mp.participant_accepted_at is null
        and m.status = 'active'
      limit 3;
      return 'You have multiple invites. Reply ' || coalesce(v_response, 'YES with the invite code.') || '.';
    end if;

    select c.* into v_code_row
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
      return 'You''re already marked as in. Reply OUT ' || v_reply_code || ' if you need to back out.';
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
      return 'You''re marked as interested. Reply OUT ' || v_reply_code || ' if you need to back out. We''ll let you know if you''re confirmed to play.';
    end if;

    return 'You''re marked as in. Reply OUT ' || v_reply_code || ' if you need to back out.';
  end if;

  if v_action = 'decline' then
    if v_mp.participant_accepted_at is not null then
      return 'You''re already marked as in. Reply OUT ' || v_reply_code || ' if you need to back out.';
    end if;

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

  if v_action = 'withdraw' then
    if v_mp.participant_accepted_at is null then
      return 'Reply NO ' || v_reply_code || ' to decline this invite, or YES ' || v_reply_code || ' to accept.';
    end if;

    if v_code_row.id is not null then
      update public.match_participant_sms_reply_codes
      set consumed_at = coalesce(consumed_at, now())
      where id = v_code_row.id;
    end if;

    perform public.apply_participant_exit(v_candidate_id, v_match.organizer_id, 'withdraw', 'sms_out_after_confirmed');
    return 'You are no longer marked as playing. The organizer has been notified.';
  end if;

  return 'Reply YES {code} or NO {code} for a pending invite, OUT {code} if you need to back out, or DETAILS {code} for the match link.';
end;
$$;

grant execute on function public.rpc_sms_reply_handle(text, text) to anon, authenticated, service_role;
