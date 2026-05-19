-- PlayerHoods match notification / formation / SMS RSVP MVP.
-- Adds participant-level notification idempotency and makes match formation
-- manual by default while preserving existing match/participant tables.

alter table public.matches
  add column if not exists formation_mode text not null default 'manual',
  add column if not exists formed_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists formation_source text,
  add column if not exists auto_formation_rules jsonb not null default '{}'::jsonb;

alter table public.matches
  drop constraint if exists matches_formation_mode_check,
  add constraint matches_formation_mode_check
  check (formation_mode in ('manual', 'auto'));

alter table public.matches
  drop constraint if exists matches_formation_source_check,
  add constraint matches_formation_source_check
  check (formation_source is null or formation_source in ('manual', 'auto'));

comment on column public.matches.formation_mode is
  'Manual by default. Auto formation only runs when explicitly enabled per match.';
comment on column public.matches.formed_at is
  'Set only by a formation event: organizer manual confirm or authorized auto formation.';

create table if not exists public.contact_communication_opt_outs (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  destination_normalized text not null,
  scope text not null default 'match_invites',
  source_invitation_id uuid references public.email_invitations(id) on delete set null,
  reason text,
  unsubscribed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_contact_communication_opt_outs_scope
  on public.contact_communication_opt_outs(channel, destination_normalized, scope);

grant all on public.contact_communication_opt_outs to service_role;

create or replace function public.normalize_contact_destination(
  p_channel text,
  p_destination text
) returns text
language sql
immutable
security definer
set search_path to 'public'
as $$
  select case
    when lower(coalesce(p_channel, '')) = 'sms' then public.normalize_discovery_phone(p_destination)
    else nullif(lower(btrim(coalesce(p_destination, ''))), '')
  end;
$$;

create or replace function public.is_contact_communication_opted_out(
  p_channel text,
  p_destination text,
  p_scope text default 'match_invites'
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.contact_communication_opt_outs opt
    where opt.channel = lower(coalesce(p_channel, ''))
      and opt.destination_normalized = public.normalize_contact_destination(p_channel, p_destination)
      and opt.scope = coalesce(nullif(p_scope, ''), 'match_invites')
      and opt.unsubscribed_at is not null
  );
$$;

alter table public.match_participants
  add column if not exists invite_notification_sent_at timestamptz,
  add column if not exists confirmed_lineup_notification_sent_at timestamptz,
  add column if not exists last_critical_update_notification_sent_at timestamptz;

create table if not exists public.match_participant_notification_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  participant_id uuid not null references public.match_participants(id) on delete cascade,
  notification_type text not null,
  dedupe_key text not null,
  channel text not null,
  destination text,
  delivery_id uuid references public.notification_deliveries(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint match_participant_notification_events_type_check
    check (notification_type in (
      'invite',
      'confirmed_lineup',
      'critical_update',
      'cancellation',
      'sms_reply_confirmation',
      'sms_reply_help',
      'sms_reply_disambiguation',
      'add_request'
    ))
);

create unique index if not exists uq_match_participant_notification_events_dedupe
  on public.match_participant_notification_events(participant_id, notification_type, dedupe_key);

create index if not exists idx_match_participant_notification_events_match
  on public.match_participant_notification_events(match_id, notification_type, created_at desc);

alter table public.match_participant_notification_events enable row level security;

drop policy if exists match_participant_notification_events_internal on public.match_participant_notification_events;
create policy match_participant_notification_events_internal
  on public.match_participant_notification_events
  to authenticated
  using (false)
  with check (false);

grant all on public.match_participant_notification_events to service_role;

create table if not exists public.match_participant_sms_reply_codes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  participant_id uuid not null references public.match_participants(id) on delete cascade,
  phone_e164 text not null,
  code text not null,
  purpose text not null,
  expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint match_participant_sms_reply_codes_purpose_check
    check (purpose in ('invite', 'confirmed_lineup', 'critical_update'))
);

create unique index if not exists uq_match_participant_sms_reply_codes_active
  on public.match_participant_sms_reply_codes(phone_e164, code)
  where consumed_at is null;

create index if not exists idx_match_participant_sms_reply_codes_participant
  on public.match_participant_sms_reply_codes(match_id, participant_id);

create index if not exists idx_match_participant_sms_reply_codes_phone
  on public.match_participant_sms_reply_codes(phone_e164)
  where consumed_at is null;

alter table public.match_participant_sms_reply_codes enable row level security;

drop policy if exists match_participant_sms_reply_codes_internal on public.match_participant_sms_reply_codes;
create policy match_participant_sms_reply_codes_internal
  on public.match_participant_sms_reply_codes
  to authenticated
  using (false)
  with check (false);

grant all on public.match_participant_sms_reply_codes to service_role;

create or replace function public.notification_is_participant_accepted(
  p_participant public.match_participants
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_participant.participant_accepted_at is not null;
$$;

create or replace function public.notification_is_organizer_approved(
  p_participant public.match_participants
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_participant.org_approved_at is not null;
$$;

create or replace function public.notification_is_participant_removed(
  p_participant public.match_participants
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_participant.removed_at is not null or p_participant.status = 'removed';
$$;

create or replace function public.notification_is_selected_to_play(
  p_participant public.match_participants
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_participant.status = 'confirmed';
$$;

create or replace function public.notification_is_participant_confirmed(
  p_participant public.match_participants
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_participant.participant_accepted_at is not null
    and p_participant.org_approved_at is not null
    and p_participant.status = 'confirmed'
    and p_participant.removed_at is null;
$$;

create or replace function public.notification_is_game_formed(
  p_match public.matches
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_match.formed_at is not null
    and p_match.status = 'active';
$$;

create or replace function public.notification_is_critical_change(
  p_change_set jsonb
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from jsonb_object_keys(coalesce(p_change_set, '{}'::jsonb)) as key(name)
    where key.name in (
      'match_date',
      'start_time',
      'end_time',
      'duration_minutes',
      'venue_id',
      'location',
      'court',
      'court_ids',
      'match_courts',
      'status'
    )
  );
$$;

create or replace function public.notification_recipient_for_participant(
  p_participant_id uuid,
  p_preferred_channel text default null
) returns table (
  channel text,
  destination text,
  phone_e164 text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mp public.match_participants%rowtype;
  v_profile public.profiles%rowtype;
  v_guest public.guests%rowtype;
  v_auth_email text;
  v_email text;
  v_phone text;
  v_phone_e164 text;
  v_preferred text;
  v_email_allowed boolean := false;
  v_sms_allowed boolean := false;
begin
  select * into v_mp
  from public.match_participants
  where id = p_participant_id;

  if not found or v_mp.removed_at is not null then
    return;
  end if;

  if v_mp.user_id is not null then
    select * into v_profile from public.profiles where id = v_mp.user_id;
    select u.email into v_auth_email from auth.users u where u.id = v_mp.user_id;
    v_email := nullif(btrim(coalesce(v_profile.contact_email, v_auth_email)), '');
    v_phone := nullif(btrim(v_profile.contact_phone), '');
    v_preferred := coalesce(nullif(p_preferred_channel, ''), nullif(v_profile.contact_channel, ''));
  else
    select * into v_guest from public.guests where id = v_mp.guest_id;
    v_email := nullif(btrim(v_guest.email), '');
    v_phone := nullif(btrim(v_guest.phone), '');
    v_preferred := coalesce(nullif(p_preferred_channel, ''), 'sms');
  end if;

  v_phone_e164 := public.normalize_discovery_phone(v_phone);
  v_sms_allowed := v_phone_e164 is not null
    and not public.is_contact_communication_opted_out('sms', v_phone_e164, 'match_invites');
  v_email_allowed := v_email is not null
    and not public.is_contact_communication_opted_out('email', v_email, 'match_invites');

  if v_preferred = 'email' and v_email_allowed then
    return query select 'email'::text, v_email, v_phone_e164;
    return;
  end if;

  if v_sms_allowed then
    return query select 'sms'::text, v_phone_e164, v_phone_e164;
    return;
  end if;

  if v_email_allowed then
    return query select 'email'::text, v_email, v_phone_e164;
    return;
  end if;
end;
$$;

create or replace function public.notification_create_or_get_sms_reply_code(
  p_participant_id uuid,
  p_purpose text default 'invite'
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mp public.match_participants%rowtype;
  v_rec record;
  v_existing text;
  v_code text;
  v_attempt int := 0;
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

  select code into v_existing
  from public.match_participant_sms_reply_codes
  where participant_id = p_participant_id
    and purpose = coalesce(nullif(p_purpose, ''), 'invite')
    and consumed_at is null
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := upper(substr(translate(encode(gen_random_bytes(5), 'base64'), '+/=', '234'), 1, 5));

    begin
      insert into public.match_participant_sms_reply_codes (
        match_id,
        participant_id,
        phone_e164,
        code,
        purpose,
        expires_at
      ) values (
        v_mp.match_id,
        p_participant_id,
        v_rec.phone_e164,
        v_code,
        coalesce(nullif(p_purpose, ''), 'invite'),
        now() + interval '30 days'
      );
      return v_code;
    exception when unique_violation then
      if v_attempt >= 8 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

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
    and ei.status = 'pending'
  order by ei.created_at desc
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
  v_venue_name text;
  v_code text;
  v_template text;
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

create or replace function public.notification_should_send_invite(
  p_participant_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_mp public.match_participants%rowtype;
  v_match public.matches%rowtype;
begin
  select * into v_mp from public.match_participants where id = p_participant_id;
  if not found then return false; end if;

  select * into v_match from public.matches where id = v_mp.match_id;
  if not found then return false; end if;

  return v_mp.invite_notification_sent_at is null
    and v_mp.removed_at is null
    and v_mp.participant_accepted_at is null
    and v_mp.org_approved_at is not null
    and v_match.status = 'active'
    and coalesce(v_mp.user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_match.organizer_id
    and (
      v_mp.user_id is null
      or exists (
        select 1 from public.profiles p
        where p.id = v_mp.user_id
          and p.accepting_new_invites = true
          and not public.is_blocked_either_direction(v_match.organizer_id, v_mp.user_id)
      )
    );
end;
$$;

create or replace function public.notification_should_send_confirmed_lineup(
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
begin
  select * into v_match from public.matches where id = p_match_id;
  select * into v_mp from public.match_participants where id = p_participant_id;

  if v_match.id is null or v_mp.id is null then
    return false;
  end if;

  return public.notification_is_game_formed(v_match)
    and public.notification_is_participant_confirmed(v_mp)
    and v_mp.confirmed_lineup_notification_sent_at is null
    and coalesce(v_mp.user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_match.organizer_id;
end;
$$;

create or replace function public.notification_enqueue_for_participant(
  p_participant_id uuid,
  p_notification_type text,
  p_dedupe_key text,
  p_change_set jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mp public.match_participants%rowtype;
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
    p_notification_type,
    p_dedupe_key,
    v_rec.channel,
    v_rec.destination,
    jsonb_build_object('change_set', coalesce(p_change_set, '{}'::jsonb))
  )
  on conflict (participant_id, notification_type, dedupe_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return null;
  end if;

  v_payload := public.notification_match_payload(p_participant_id, p_notification_type, p_change_set);
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

  if p_notification_type = 'invite' then
    update public.match_participants
    set invite_notification_sent_at = coalesce(invite_notification_sent_at, now())
    where id = p_participant_id;
  elsif p_notification_type = 'confirmed_lineup' then
    update public.match_participants
    set confirmed_lineup_notification_sent_at = coalesce(confirmed_lineup_notification_sent_at, now())
    where id = p_participant_id;
  elsif p_notification_type in ('critical_update', 'cancellation') then
    update public.match_participants
    set last_critical_update_notification_sent_at = now()
    where id = p_participant_id;
  end if;

  return v_delivery_id;
end;
$$;

create or replace function public.notification_enqueue_invite_if_needed(
  p_participant_id uuid
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.notification_should_send_invite(p_participant_id) then
    return null;
  end if;

  return public.notification_enqueue_for_participant(
    p_participant_id,
    'invite',
    'invite'
  );
end;
$$;

create or replace function public.notification_enqueue_confirmed_lineup_if_needed(
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

  if v_match_id is null or not public.notification_should_send_confirmed_lineup(v_match_id, p_participant_id) then
    return null;
  end if;

  return public.notification_enqueue_for_participant(
    p_participant_id,
    'confirmed_lineup',
    'confirmed_lineup'
  );
end;
$$;

create or replace function public.notification_enqueue_confirmed_lineup_notifications_for_match(
  p_match_id uuid
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
    where mp.match_id = p_match_id
      and public.notification_should_send_confirmed_lineup(p_match_id, mp.id)
  loop
    v_delivery := public.notification_enqueue_confirmed_lineup_if_needed(v_row.id);
    if v_delivery is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.notification_enqueue_critical_update_notifications(
  p_match_id uuid,
  p_change_set jsonb
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_match public.matches%rowtype;
  v_type text := 'critical_update';
  v_dedupe text;
  v_count integer := 0;
  v_row record;
  v_delivery uuid;
begin
  select * into v_match from public.matches where id = p_match_id;
  if not found then
    raise exception 'match_not_found';
  end if;

  if v_match.formed_at is null or not public.notification_is_critical_change(p_change_set) then
    return 0;
  end if;

  if coalesce(p_change_set->'status'->>'new', '') = 'cancelled' or v_match.status = 'cancelled' then
    v_type := 'cancellation';
  end if;

  v_dedupe := v_type || ':' || p_match_id::text || ':' || md5(coalesce(p_change_set::text, '{}'));

  for v_row in
    select mp.id
    from public.match_participants mp
    where mp.match_id = p_match_id
      and public.notification_is_participant_confirmed(mp)
  loop
    v_delivery := public.notification_enqueue_for_participant(
      v_row.id,
      v_type,
      v_dedupe,
      p_change_set
    );
    if v_delivery is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.match_ready_to_form(
  p_match_id uuid
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and m.status = 'active'
      and m.formed_at is null
      and (
        select count(*)
        from public.match_participants mp
        where mp.match_id = m.id
          and public.notification_is_participant_confirmed(mp)
      ) >= m.required_count
  );
$$;

create or replace function public.rpc_match_confirm_and_notify(
  p_match_id uuid
) returns integer
language plpgsql
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
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match_not_found';
  end if;

  if v_match.organizer_id <> v_uid then
    raise exception 'only_organizer_can_confirm_match';
  end if;

  if v_match.status <> 'active' then
    raise exception 'match_not_active';
  end if;

  if v_match.formed_at is null then
    update public.matches
    set formed_at = now(),
        formed_by_user_id = v_uid,
        formation_source = 'manual'
    where id = p_match_id;
  end if;

  return public.notification_enqueue_confirmed_lineup_notifications_for_match(p_match_id);
end;
$$;

grant execute on function public.rpc_match_confirm_and_notify(uuid) to authenticated, service_role;

create or replace function public.notification_maybe_auto_form_match(
  p_match_id uuid
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_match public.matches%rowtype;
begin
  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match_not_found';
  end if;

  if v_match.formation_mode <> 'auto'
    or v_match.formed_at is not null
    or v_match.status <> 'active'
    or not public.match_ready_to_form(p_match_id)
  then
    return false;
  end if;

  update public.matches
  set formed_at = now(),
      formed_by_user_id = null,
      formation_source = 'auto'
  where id = p_match_id
    and formed_at is null;

  perform public.notification_enqueue_confirmed_lineup_notifications_for_match(p_match_id);
  return true;
end;
$$;

grant execute on function public.notification_maybe_auto_form_match(uuid) to authenticated, service_role;

create or replace function public.trg_enqueue_invite_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.notification_enqueue_invite_if_needed(new.id);
  return new;
end;
$$;

drop trigger if exists trg_enqueue_invite_notification_on_mp on public.match_participants;
create trigger trg_enqueue_invite_notification_on_mp
after insert or update of org_approved_at, removed_at, participant_accepted_at
on public.match_participants
for each row
execute function public.trg_enqueue_invite_notification();

create or replace function public.trg_set_formed_at_once()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'confirmed' then
    perform public.notification_maybe_auto_form_match(new.match_id);
  end if;
  return new;
end;
$$;

create or replace function public.fn_emit_match_formed_on_formed_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.formed_at is null and new.formed_at is not null then
    perform public.notification_enqueue_confirmed_lineup_notifications_for_match(new.id);
  end if;
  return new;
end;
$$;

create or replace function public.rpc_match_participant_sms_reply_code_for_invitation(
  p_invitation_id uuid,
  p_purpose text default 'invite'
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_participant_id uuid;
begin
  select match_participant_id into v_participant_id
  from public.email_invitations
  where id = p_invitation_id;

  if v_participant_id is null then
    return null;
  end if;

  return public.notification_create_or_get_sms_reply_code(v_participant_id, p_purpose);
end;
$$;

grant execute on function public.rpc_match_participant_sms_reply_code_for_invitation(uuid, text) to authenticated, service_role;

create or replace function public.rpc_process_domain_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_evt public.domain_events%rowtype;
  v_inv public.email_invitations%rowtype;
  v_payload jsonb;
  v_dest text;
  v_match_id uuid;
begin
  select * into v_evt from public.domain_events where id = p_event_id;
  if not found then
    raise exception 'event_not_found';
  end if;

  if v_evt.event_type = 'invitation.email_invitation_created' then
    v_payload := v_evt.payload;
    select * into v_inv
    from public.email_invitations
    where id = (v_payload->>'invitation_id')::uuid;

    if not found then
      return;
    end if;

    insert into public.email_invitation_events (invitation_id, event_type, actor_user_id, metadata)
    values (
      v_inv.id,
      'email_delivery_requested',
      v_evt.actor_user_id,
      jsonb_build_object('domain_event_id', p_event_id, 'delegated_to', 'notification_enqueue_invite_if_needed')
    )
    on conflict do nothing;

    if v_inv.match_participant_id is not null then
      perform public.notification_enqueue_invite_if_needed(v_inv.match_participant_id);
      return;
    end if;

    -- Compatibility fallback for non-match-participant invitation records.
    -- Match participant invitations must never bypass NotificationPolicy.
    if v_inv.target_email is not null and trim(v_inv.target_email) <> '' then
      insert into public.notification_deliveries (
        email_invitation_id,
        channel,
        provider,
        destination,
        delivery_status,
        payload
      ) values (
        v_inv.id,
        'email',
        'resend',
        v_inv.target_email,
        'queued',
        jsonb_build_object(
          'template_type', 'invitation',
          'invitation_id', v_inv.id,
          'inviter_display_name', v_payload->>'inviter_display_name',
          'target_email', v_inv.target_email,
          'target_phone', v_inv.target_phone,
          'related_type', v_inv.related_type,
          'related_id', v_inv.related_id
        )
      );
    end if;
    return;
  end if;

  if v_evt.event_type in ('match.guest_nominated', 'match.guest_org_approved') then
    v_payload := v_evt.payload;
    if (v_payload->>'match_participant_id') is not null then
      perform public.notification_enqueue_invite_if_needed((v_payload->>'match_participant_id')::uuid);
    end if;
    return;
  end if;

  if v_evt.event_type = 'match.guest_delegate_confirmed' then
    v_payload := v_evt.payload;
    if (v_payload->>'match_participant_id') is not null then
      perform public.notification_enqueue_confirmed_lineup_if_needed((v_payload->>'match_participant_id')::uuid);
    end if;
    return;
  end if;

  if v_evt.event_type = 'match.formed' then
    v_payload := v_evt.payload;
    v_match_id := (v_payload->>'match_id')::uuid;
    perform public.notification_enqueue_confirmed_lineup_notifications_for_match(v_match_id);
    return;
  end if;

  return;
end;
$$;

comment on function public.rpc_process_domain_event(uuid) is
  'Domain event bridge. Match participant invitation/formation events delegate to notification policy/service functions; direct delivery inserts remain only for non-participant invitation compatibility.';

grant execute on function public.rpc_process_domain_event(uuid) to authenticated, service_role;

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

  if v_body ~ '^(YES|Y|IN|ACCEPT)(\\s+|$)' then
    v_action := 'accept';
  elsif v_body ~ '^(NO|N|OUT|DECLINE)(\\s+|$)' then
    v_action := 'decline';
  elsif v_body ~ '^(DETAILS|INFO|LINK)(\\s+|$)' then
    v_action := 'details';
  else
    return 'Reply YES to accept, NO to decline, or DETAILS for the match link.';
  end if;

  v_code := nullif((regexp_match(v_body, '\\m([A-Z2-9]{4,6})\\M'))[1], '');

  if v_code is not null and v_code in ('YES', 'ACCEPT', 'DECLINE', 'DETAILS', 'INFO', 'LINK') then
    v_code := null;
  end if;

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
    select count(*), min(participant_id)
    into v_candidate_count, v_candidate_id
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
  end if;

  select * into v_mp from public.match_participants where id = v_candidate_id for update;
  select * into v_match from public.matches where id = v_mp.match_id;
  v_match_id := v_match.id;
  v_link := public.notification_magic_link_for_participant(v_candidate_id);

  if v_action = 'details' then
    return 'View match details here: ' || coalesce(v_link, '/matches/' || v_match_id::text);
  end if;

  if v_action = 'accept' then
    if v_mp.removed_at is not null then
      return 'This invite is no longer active.';
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
      return 'You are marked as interested. We will let you know if you are confirmed to play.';
    end if;

    return 'You are marked as in. We will let you know if you are confirmed to play.';
  end if;

  if v_action = 'decline' then
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

grant execute on function public.notification_enqueue_invite_if_needed(uuid) to authenticated, service_role;
grant execute on function public.notification_enqueue_confirmed_lineup_if_needed(uuid) to authenticated, service_role;
grant execute on function public.notification_enqueue_confirmed_lineup_notifications_for_match(uuid) to authenticated, service_role;
grant execute on function public.notification_enqueue_critical_update_notifications(uuid, jsonb) to authenticated, service_role;
grant execute on function public.notification_create_or_get_sms_reply_code(uuid, text) to authenticated, service_role;
