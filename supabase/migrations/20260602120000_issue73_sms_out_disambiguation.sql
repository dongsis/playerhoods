-- Issue #73: bare OUT should disambiguate withdraw-eligible matches, not pending invites.

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
      and m.status = 'active'
      and (
        (v_action in ('accept', 'decline', 'details') and mp.participant_accepted_at is null)
        or (v_action = 'withdraw' and mp.participant_accepted_at is not null)
      );

    if coalesce(v_candidate_count, 0) = 0 then
      if v_action = 'withdraw' then
        return 'We could not find a match you can back out of for this number. Reply YES {code} or NO {code} for a pending invite.';
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
