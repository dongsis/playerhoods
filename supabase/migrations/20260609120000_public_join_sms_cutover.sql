-- MVP cutover: anonymous public join uses invite-style SMS response.
-- Existing email verification RPCs remain for compatibility; new code calls SMS RPCs.

create table if not exists public.public_match_signup_sms_intents (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.public_match_signup_links(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  display_name text not null,
  phone_normalized text not null,
  sms_token uuid not null default gen_random_uuid(),
  sms_token_hash text not null,
  match_notification_consent_at timestamptz not null default now(),
  sms_sent_at timestamptz,
  sms_delivery_status text not null default 'not_requested',
  sms_delivery_attempt_count integer not null default 0,
  sms_delivery_last_attempt_at timestamptz,
  sms_delivery_sent_at timestamptz,
  sms_delivery_error text,
  sms_response_at timestamptz,
  phone_confirmed_at timestamptz,
  status text not null default 'pending_sms_response',
  person_id uuid references public.people(person_id) on delete set null,
  guest_id uuid references public.guests(id) on delete set null,
  match_participant_id uuid references public.match_participants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint public_match_signup_sms_intents_display_name_check
    check (length(btrim(display_name)) between 1 and 120),
  constraint public_match_signup_sms_intents_phone_check
    check (phone_normalized ~ '^[0-9]{10}$'),
  constraint public_match_signup_sms_intents_delivery_status_check
    check (sms_delivery_status in ('not_requested', 'queued', 'sent', 'failed', 'skipped', 'throttled')),
  constraint public_match_signup_sms_intents_status_check
    check (status in ('pending_sms_response', 'request_created', 'declined_by_guest', 'expired', 'cancelled'))
);

create unique index if not exists public_match_signup_sms_intents_sms_token_key
  on public.public_match_signup_sms_intents(sms_token);

create unique index if not exists public_match_signup_sms_intents_sms_token_hash_key
  on public.public_match_signup_sms_intents(sms_token_hash);

create unique index if not exists public_match_signup_sms_intents_one_active_pending
  on public.public_match_signup_sms_intents(match_id, phone_normalized)
  where status = 'pending_sms_response';

create index if not exists public_match_signup_sms_intents_match_phone_idx
  on public.public_match_signup_sms_intents(match_id, phone_normalized);

create index if not exists public_match_signup_sms_intents_participant_idx
  on public.public_match_signup_sms_intents(match_participant_id)
  where match_participant_id is not null;

alter table public.public_match_signup_sms_intents enable row level security;

drop policy if exists public_match_signup_sms_intents_no_direct_select on public.public_match_signup_sms_intents;
create policy public_match_signup_sms_intents_no_direct_select
  on public.public_match_signup_sms_intents
  for select
  using (false);

revoke all on public.public_match_signup_sms_intents from anon, authenticated;
grant all on public.public_match_signup_sms_intents to service_role;

create or replace function public.touch_public_match_signup_sms_intents_updated_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_public_match_signup_sms_intents_updated_at on public.public_match_signup_sms_intents;
create trigger trg_public_match_signup_sms_intents_updated_at
before update on public.public_match_signup_sms_intents
for each row
execute function public.touch_public_match_signup_sms_intents_updated_at();

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
  host_display_name text
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

  select s.display_name into v_sport_name
  from public.sports s
  where s.id = v_match.sport_id;

  select v.name into v_venue_name
  from public.venues v
  where v.id = v_match.venue_id;

  select coalesce(nullif(btrim(p.display_name), ''), 'Someone')
  into v_host_display_name
  from public.profiles p
  where p.id = v_match.organizer_id;

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
      coalesce(v_host_display_name, 'Someone');
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
      coalesce(v_host_display_name, 'Someone');
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
      coalesce(v_host_display_name, 'Someone');
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
    coalesce(v_host_display_name, 'Someone');
end;
$$;

create or replace function public.rpc_public_match_signup_record_sms_delivery_result(
  p_sms_intent_id uuid,
  p_delivery_status text,
  p_error text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_delivery_status not in ('sent', 'failed', 'skipped') then
    raise exception 'invalid_sms_delivery_status';
  end if;

  update public.public_match_signup_sms_intents i
  set
    sms_delivery_status = p_delivery_status,
    sms_delivery_attempt_count = sms_delivery_attempt_count + 1,
    sms_delivery_last_attempt_at = now(),
    sms_delivery_sent_at = case
      when p_delivery_status = 'sent' then coalesce(sms_delivery_sent_at, now())
      else sms_delivery_sent_at
    end,
    sms_delivery_error = nullif(btrim(coalesce(p_error, '')), '')
  where i.id = p_sms_intent_id;
end;
$$;

create or replace function public.rpc_public_match_signup_sms_context(
  p_sms_token text
)
returns table (
  sms_intent_id uuid,
  status text,
  display_name text,
  match_id uuid,
  match_status text,
  game_type text,
  sport_name text,
  match_date date,
  start_time time,
  venue_name text,
  venue_timezone text,
  host_display_name text,
  expires_at timestamptz,
  match_participant_id uuid
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_token uuid;
begin
  begin
    v_token := p_sms_token::uuid;
  exception when invalid_text_representation then
    return;
  end;

  return query
  select
    i.id,
    case
      when i.status = 'pending_sms_response' and i.expires_at < now() then 'expired'
      else i.status
    end,
    i.display_name,
    m.id,
    m.status::text,
    m.game_type,
    s.display_name,
    m.match_date,
    m.start_time,
    v.name,
    v.timezone,
    coalesce(nullif(btrim(p.display_name), ''), 'Someone'),
    i.expires_at,
    i.match_participant_id
  from public.public_match_signup_sms_intents i
  join public.matches m on m.id = i.match_id
  left join public.sports s on s.id = m.sport_id
  left join public.venues v on v.id = m.venue_id
  left join public.profiles p on p.id = m.organizer_id
  where i.sms_token = v_token;
end;
$$;

create or replace function public.public_match_signup_sms_confirm_intent(
  p_sms_intent_id uuid
)
returns table (
  status text,
  match_id uuid,
  match_participant_id uuid,
  participant_status text,
  display_name text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_system_actor_id uuid;
  v_intent public.public_match_signup_sms_intents%rowtype;
  v_match public.matches%rowtype;
  v_person_id uuid;
  v_guest_id uuid;
  v_mp public.match_participants%rowtype;
begin
  select * into v_intent
  from public.public_match_signup_sms_intents i
  where i.id = p_sms_intent_id
  for update;

  if not found then
    raise exception 'sms_intent_not_found';
  end if;

  select * into v_match
  from public.matches m
  where m.id = v_intent.match_id
    and m.status = 'active';

  if not found then
    raise exception 'match_not_active';
  end if;

  if v_intent.status = 'request_created' then
    if v_intent.match_participant_id is not null then
      select * into v_mp
      from public.match_participants
      where id = v_intent.match_participant_id;
    end if;

    return query
    select
      v_intent.status,
      v_intent.match_id,
      v_intent.match_participant_id,
      coalesce(v_mp.status::text, null),
      v_intent.display_name;
    return;
  end if;

  if v_intent.status = 'declined_by_guest' then
    return query
    select v_intent.status, v_intent.match_id, null::uuid, null::text, v_intent.display_name;
    return;
  end if;

  if v_intent.status <> 'pending_sms_response' then
    raise exception 'sms_intent_not_confirmable';
  end if;

  if v_intent.expires_at < now() then
    update public.public_match_signup_sms_intents i
    set status = 'expired'
    where i.id = v_intent.id
    returning * into v_intent;

    return query
    select v_intent.status, v_intent.match_id, null::uuid, null::text, v_intent.display_name;
    return;
  end if;

  select cfg.system_actor_user_id into v_system_actor_id
  from public.public_match_signup_config cfg
  where cfg.singleton_key = true;

  if v_system_actor_id is null then
    raise exception 'public_signup_system_actor_not_configured';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_system_actor_id) then
    raise exception 'public_signup_system_actor_missing';
  end if;

  insert into public.people(person_type, display_name, status)
  values ('limited_contact', v_intent.display_name, 'active')
  returning person_id into v_person_id;

  insert into public.guests(display_name, email, phone, status, created_by, person_id)
  values (v_intent.display_name, null, v_intent.phone_normalized, 'active', v_system_actor_id, v_person_id)
  returning id into v_guest_id;

  insert into public.match_participants (
    match_id,
    status,
    join_method,
    guest_id,
    created_by,
    participant_accepted_at,
    participant_accepted_via,
    confirmation_source,
    source_person_id
  ) values (
    v_match.id,
    'pending',
    'requested',
    v_guest_id,
    v_system_actor_id,
    now(),
    'sms_invitation',
    'player_response',
    v_person_id
  )
  returning * into v_mp;

  insert into public.match_participant_actions(match_id, match_participant_id, action_type, note, created_by)
  values (v_match.id, v_mp.id, 'request_join', 'public_match_signup_sms', v_system_actor_id);

  perform public.match_participant_reconcile_status(v_mp.id);
  select * into v_mp
  from public.match_participants
  where id = v_mp.id;

  update public.public_match_signup_sms_intents i
  set
    person_id = v_person_id,
    guest_id = v_guest_id,
    match_participant_id = v_mp.id,
    sms_response_at = coalesce(sms_response_at, now()),
    phone_confirmed_at = coalesce(phone_confirmed_at, now()),
    status = 'request_created'
  where i.id = v_intent.id
  returning * into v_intent;

  return query
  select v_intent.status, v_intent.match_id, v_mp.id, v_mp.status::text, v_intent.display_name;
end;
$$;

create or replace function public.rpc_public_match_signup_confirm_sms(
  p_sms_token text
)
returns table (
  status text,
  match_id uuid,
  match_participant_id uuid,
  participant_status text,
  display_name text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token uuid;
  v_intent_id uuid;
begin
  begin
    v_token := p_sms_token::uuid;
  exception when invalid_text_representation then
    raise exception 'sms_token_invalid';
  end;

  select id into v_intent_id
  from public.public_match_signup_sms_intents i
  where i.sms_token = v_token;

  if v_intent_id is null then
    raise exception 'sms_intent_not_found';
  end if;

  return query
  select *
  from public.public_match_signup_sms_confirm_intent(v_intent_id);
end;
$$;

create or replace function public.rpc_public_match_signup_decline_sms(
  p_sms_token text
)
returns table (
  status text,
  match_id uuid,
  match_participant_id uuid,
  participant_status text,
  display_name text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token uuid;
  v_intent public.public_match_signup_sms_intents%rowtype;
begin
  begin
    v_token := p_sms_token::uuid;
  exception when invalid_text_representation then
    raise exception 'sms_token_invalid';
  end;

  select * into v_intent
  from public.public_match_signup_sms_intents i
  where i.sms_token = v_token
  for update;

  if not found then
    raise exception 'sms_intent_not_found';
  end if;

  if v_intent.status = 'pending_sms_response' then
    update public.public_match_signup_sms_intents i
    set
      sms_response_at = coalesce(sms_response_at, now()),
      status = case when expires_at < now() then 'expired' else 'declined_by_guest' end
    where i.id = v_intent.id
    returning * into v_intent;
  end if;

  return query
  select v_intent.status, v_intent.match_id, v_intent.match_participant_id, null::text, v_intent.display_name;
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

    return 'No problem. We will not send this request to the host.';
  end if;

  if v_action = 'join' then
    select * into v_confirm
    from public.public_match_signup_sms_confirm_intent(v_intent.id)
    limit 1;

    return 'Request sent. The host can now review your request. If you are added to the lineup, we will text you. Details: ' || v_link;
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
    return 'We could not read your phone number. Reply YES {code} or NO {code} for a pending invite, OUT {code} if you need to back out, DETAILS {code} for the match link, or JOIN for a public join text.';
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
    return 'Reply YES {code} or NO {code} for a pending invite, OUT {code} if you need to back out, DETAILS {code} for the match link, or JOIN for a public join text.';
  end if;

  if v_body in ('MAYBE', 'M') then
    return 'Maybe is not supported yet. Reply YES {code} or NO {code} for a pending invite, JOIN for a public join text, or OUT {code} if you need to back out.';
  end if;

  if v_body ~ '^(JOIN)(\s+|$)' then
    select count(*)
    into v_candidate_count
    from public.match_participant_sms_reply_codes c
    join public.match_participants mp on mp.id = c.participant_id
    join public.matches m on m.id = c.match_id
    where c.phone_e164 = v_phone
      and c.consumed_at is null
      and (c.expires_at is null or c.expires_at > now())
      and mp.removed_at is null
      and m.status = 'active';

    if coalesce(v_candidate_count, 0) > 0 then
      return 'We found an active invite for this number. Reply YES {code} or NO {code} for a pending invite, OUT {code} if you need to back out, or DETAILS {code} for the match link.';
    end if;

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
    return 'Reply YES {code} or NO {code} for a pending invite, OUT {code} if you need to back out, DETAILS {code} for the match link, or JOIN for a public join text.';
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
      if v_action in ('decline', 'details') then
        v_public_response := public.rpc_public_match_signup_sms_reply_handle(v_phone, v_action);
        if v_public_response is not null then
          return v_public_response;
        end if;
      end if;

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

  return 'Reply YES {code} or NO {code} for a pending invite, OUT {code} if you need to back out, DETAILS {code} for the match link, or JOIN for a public join text.';
end;
$$;

drop function if exists public.rpc_public_match_signup_participant_metadata(uuid);

create or replace function public.rpc_public_match_signup_participant_metadata(
  p_match_id uuid
)
returns table (
  match_participant_id uuid,
  match_id uuid,
  source text,
  email_verified boolean,
  signup_status text,
  phone_confirmed boolean,
  contact_state text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
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

  if v_match.organizer_id <> v_uid then
    raise exception 'not_match_organizer';
  end if;

  return query
  select
    s.match_participant_id,
    s.match_id,
    'public_match_signup'::text,
    (s.verified_at is not null),
    s.status,
    false,
    case when s.verified_at is not null then 'email_confirmed' else 'email_pending_verification' end
  from public.public_match_signups s
  join public.match_participants mp
    on mp.id = s.match_participant_id
  where s.match_id = p_match_id
    and s.match_participant_id is not null
    and s.status in ('pending_verification', 'participant_created')
    and mp.removed_at is null

  union all

  select
    i.match_participant_id,
    i.match_id,
    'public_match_signup'::text,
    false,
    i.status,
    (i.phone_confirmed_at is not null),
    case when i.phone_confirmed_at is not null then 'phone_confirmed' else 'sms_pending_response' end
  from public.public_match_signup_sms_intents i
  join public.match_participants mp
    on mp.id = i.match_participant_id
  where i.match_id = p_match_id
    and i.match_participant_id is not null
    and i.status = 'request_created'
    and mp.removed_at is null;
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
  v_host_name text;
  v_invitation_id uuid;
  v_target_email text;
  v_target_phone text;
  v_target_name text;
  v_recipient_name text;
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

  select coalesce(nullif(btrim(p.display_name), ''), 'Someone')
  into v_host_name
  from public.profiles p
  where p.id = p_host_user_id;

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
    'match_date', v_match.match_date,
    'start_time', v_match.start_time,
    'duration_minutes', v_match.duration_minutes,
    'club_name', v_venue_name,
    'venue_name', v_venue_name,
    'venue_timezone', coalesce(v_venue_timezone, 'America/Toronto'),
    'recipient_name', v_recipient_name,
    'formed_at', v_match.formed_at,
    'is_formed', (v_match.formed_at is not null),
    'organizer_display_name', coalesce(v_host_name, 'Someone'),
    'magic_link_path', public.notification_magic_link_for_participant(v_mp.id),
    'reply_code', public.notification_create_or_get_sms_reply_code(v_mp.id, 'confirmed_lineup'),
    'change_set', '{}'::jsonb
  );
end;
$$;

create or replace function public.rpc_match_org_approve_participant(p_match_participant_id uuid)
returns public.match_participants
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mp public.match_participants%rowtype;
  v_match public.matches%rowtype;
  v_match_id uuid;
  v_guest_email text;
  v_guest_phone text;
  v_nominator_name text;
  v_evt_id uuid;
  v_is_public_join_sms boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_mp from public.match_participants where id = p_match_participant_id;
  if not found then
    raise exception 'Participant not found';
  end if;
  v_match_id := v_mp.match_id;

  if not public.is_match_organizer(v_match_id, auth.uid()) then
    raise exception 'Only the organizer can approve participants';
  end if;
  if v_mp.removed_at is not null then
    raise exception 'Cannot approve a removed participant. Re-invite them first.';
  end if;
  if v_mp.confirmed_at is not null then
    return v_mp;
  end if;

  select exists (
    select 1
    from public.public_match_signup_sms_intents i
    where i.match_participant_id = p_match_participant_id
      and i.status = 'request_created'
      and i.phone_confirmed_at is not null
  ) into v_is_public_join_sms;

  update public.match_participants
  set org_approved_at = coalesce(org_approved_at, now()),
      org_approved_by = auth.uid()
  where id = p_match_participant_id;

  perform public.match_participant_reconcile_status(p_match_participant_id);

  insert into public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  values (v_match_id, p_match_participant_id, 'approve', null, auth.uid());

  select * into v_mp from public.match_participants where id = p_match_participant_id;

  if v_is_public_join_sms then
    perform public.notification_enqueue_host_offline_confirmation_if_needed(v_mp.id, auth.uid());
  end if;

  if v_mp.guest_id is not null then
    v_guest_email := public.rpc_match_participant_email(p_match_participant_id);

    select
      nullif(trim(g.phone), ''),
      coalesce(nullif(trim(p.display_name), ''), 'Someone')
    into v_guest_phone, v_nominator_name
    from public.guests g
    left join public.profiles p
      on p.id = coalesce(v_mp.nominated_by, v_mp.created_by, auth.uid())
    where g.id = v_mp.guest_id;

    if v_guest_email is not null or v_guest_phone is not null then
      select * into v_match from public.matches where id = v_match_id;

      insert into public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
      values (
        'match.guest_org_approved',
        'match_participant',
        v_mp.id,
        auth.uid(),
        jsonb_build_object(
          'match_participant_id', v_mp.id,
          'match_id', v_match_id,
          'target_email', v_guest_email,
          'target_phone', v_guest_phone,
          'nominator_display_name', coalesce(v_nominator_name, 'Someone'),
          'game_type', v_match.game_type,
          'match_date', v_match.match_date,
          'club_name', (select v.name from public.venues v where v.id = v_match.venue_id)
        )
      )
      returning id into v_evt_id;

      perform public.rpc_process_domain_event(v_evt_id);
    end if;
  end if;

  return v_mp;
end;
$$;

comment on function public.notification_host_offline_confirmation_payload(uuid, uuid) is
  'Builds host-managed confirmation delivery payload. For unregistered contact players with email or phone, creates an anchored pending invitation so CTAs resolve through the public invitation flow. Public join SMS guests are phone-only and need the same /i anchor after host approval.';

comment on function public.rpc_public_match_signup_start_sms(uuid, text, text) is
  'Starts an anonymous public join SMS intent. Creates no match participant until the recipient confirms from SMS.';

comment on function public.rpc_public_match_signup_confirm_sms(text) is
  'Confirms an anonymous public join SMS intent and creates a host-visible requested participant.';

comment on function public.rpc_public_match_signup_decline_sms(text) is
  'Declines an anonymous public join SMS intent without creating a participant.';

revoke all on function public.rpc_public_match_signup_start_sms(uuid, text, text) from public, anon, authenticated;
revoke all on function public.rpc_public_match_signup_record_sms_delivery_result(uuid, text, text) from public, anon, authenticated;
revoke all on function public.rpc_public_match_signup_sms_context(text) from public;
revoke all on function public.rpc_public_match_signup_confirm_sms(text) from public, anon, authenticated;
revoke all on function public.rpc_public_match_signup_decline_sms(text) from public, anon, authenticated;
revoke all on function public.public_match_signup_sms_confirm_intent(uuid) from public, anon, authenticated;
revoke all on function public.rpc_public_match_signup_sms_reply_handle(text, text) from public, anon, authenticated;
revoke all on function public.rpc_sms_reply_handle(text, text) from public;
revoke all on function public.rpc_public_match_signup_participant_metadata(uuid) from public, anon;
revoke all on function public.notification_host_offline_confirmation_payload(uuid, uuid) from public, anon;
revoke all on function public.rpc_match_org_approve_participant(uuid) from public, anon;
grant execute on function public.rpc_public_match_signup_start_sms(uuid, text, text) to service_role;
grant execute on function public.rpc_public_match_signup_record_sms_delivery_result(uuid, text, text) to service_role;
grant execute on function public.rpc_public_match_signup_confirm_sms(text) to service_role;
grant execute on function public.rpc_public_match_signup_decline_sms(text) to service_role;
grant execute on function public.public_match_signup_sms_confirm_intent(uuid) to service_role;
grant execute on function public.rpc_public_match_signup_sms_context(text) to anon, authenticated, service_role;
grant execute on function public.rpc_public_match_signup_sms_reply_handle(text, text) to service_role;
grant execute on function public.rpc_sms_reply_handle(text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_public_match_signup_participant_metadata(uuid) to authenticated, service_role;
grant execute on function public.notification_host_offline_confirmation_payload(uuid, uuid) to authenticated, service_role;
grant execute on function public.rpc_match_org_approve_participant(uuid) to authenticated, service_role;
