-- Issue #76: public match signup with ownerless Contact Player identity.
-- V1 intentionally avoids match_join_method enum and participant_accepted_via
-- constraint changes. Public signup source semantics live in these tables/RPCs.

create table if not exists public.public_match_signup_links (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  public_token uuid not null default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  enabled_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_match_signup_links_public_token_key unique (public_token)
);

create unique index if not exists uq_public_match_signup_links_active_match
  on public.public_match_signup_links(match_id)
  where disabled_at is null;

create table if not exists public.public_match_signup_identities (
  id uuid primary key default gen_random_uuid(),
  email_sha256 text not null,
  person_id uuid not null references public.people(person_id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_verified_at timestamptz,
  constraint public_match_signup_identities_email_sha256_key unique (email_sha256)
);

comment on table public.public_match_signup_identities is
  'Sensitive public-signup identity reuse table. email_sha256 is PII-derived and must not be exposed to host/public clients.';

create table if not exists public.public_match_signups (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.public_match_signup_links(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  identity_id uuid references public.public_match_signup_identities(id) on delete set null,
  person_id uuid references public.people(person_id) on delete set null,
  guest_id uuid references public.guests(id) on delete set null,
  match_participant_id uuid references public.match_participants(id) on delete set null,
  display_name text not null,
  email_normalized text not null,
  email_sha256 text not null,
  phone_normalized text,
  marketing_email_opt_in boolean not null default false,
  marketing_email_opt_in_at timestamptz,
  match_notification_consent_at timestamptz not null default now(),
  verification_token_hash text not null,
  verification_sent_at timestamptz,
  verification_delivery_status text not null default 'not_requested',
  verification_delivery_attempt_count integer not null default 0,
  verification_delivery_last_attempt_at timestamptz,
  verification_delivery_sent_at timestamptz,
  verification_delivery_error text,
  verification_expires_at timestamptz not null,
  verified_at timestamptz,
  status text not null default 'pending_verification',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_match_signups_display_name_not_blank check (btrim(display_name) <> ''),
  constraint public_match_signups_email_not_blank check (btrim(email_normalized) <> ''),
  constraint public_match_signups_status_check check (
    status in ('pending_verification', 'participant_created', 'expired', 'cancelled')
  ),
  constraint public_match_signups_delivery_status_check check (
    verification_delivery_status in ('not_requested', 'queued', 'sent', 'failed', 'skipped', 'throttled')
  ),
  constraint public_match_signups_delivery_attempt_count_check check (
    verification_delivery_attempt_count >= 0
  ),
  constraint public_match_signups_delivery_error_length_check check (
    verification_delivery_error is null or length(verification_delivery_error) <= 500
  ),
  constraint public_match_signups_marketing_opt_in_at_check check (
    (marketing_email_opt_in = true and marketing_email_opt_in_at is not null)
    or (marketing_email_opt_in = false and marketing_email_opt_in_at is null)
  )
);

comment on table public.public_match_signups is
  'Sensitive public match signup records. Contains raw normalized email and optional phone; expose only through PII-safe RPCs.';

create unique index if not exists uq_public_match_signups_active_match_email
  on public.public_match_signups(match_id, email_sha256)
  where status in ('pending_verification', 'participant_created');

create index if not exists idx_public_match_signups_participant
  on public.public_match_signups(match_participant_id)
  where match_participant_id is not null;

create table if not exists public.public_match_signup_config (
  singleton_key boolean primary key default true,
  system_actor_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_match_signup_config_singleton_key_check check (singleton_key)
);

comment on table public.public_match_signup_config is
  'Restricted public signup setup config. system_actor_user_id must be a controlled Supabase Auth user and is verified by RPC/preflight before participant creation.';

comment on column public.public_match_signup_config.system_actor_user_id is
  'Configured system actor used only for public signup compatibility/audit created_by fields. Do not use the organizer as fallback.';

drop trigger if exists set_updated_at__public_match_signup_links on public.public_match_signup_links;
create trigger set_updated_at__public_match_signup_links
before update on public.public_match_signup_links
for each row
execute function public.tg__set_updated_at();

drop trigger if exists set_updated_at__public_match_signup_identities on public.public_match_signup_identities;
create trigger set_updated_at__public_match_signup_identities
before update on public.public_match_signup_identities
for each row
execute function public.tg__set_updated_at();

drop trigger if exists set_updated_at__public_match_signups on public.public_match_signups;
create trigger set_updated_at__public_match_signups
before update on public.public_match_signups
for each row
execute function public.tg__set_updated_at();

drop trigger if exists set_updated_at__public_match_signup_config on public.public_match_signup_config;
create trigger set_updated_at__public_match_signup_config
before update on public.public_match_signup_config
for each row
execute function public.tg__set_updated_at();

alter table public.public_match_signup_links enable row level security;
alter table public.public_match_signup_identities enable row level security;
alter table public.public_match_signups enable row level security;
alter table public.public_match_signup_config enable row level security;

drop policy if exists public_match_signup_links_no_direct_select on public.public_match_signup_links;
create policy public_match_signup_links_no_direct_select
  on public.public_match_signup_links
  for select
  to authenticated
  using (false);

drop policy if exists public_match_signup_identities_no_direct_select on public.public_match_signup_identities;
create policy public_match_signup_identities_no_direct_select
  on public.public_match_signup_identities
  for select
  to authenticated
  using (false);

drop policy if exists public_match_signups_no_direct_select on public.public_match_signups;
create policy public_match_signups_no_direct_select
  on public.public_match_signups
  for select
  to authenticated
  using (false);

drop policy if exists public_match_signup_config_no_direct_select on public.public_match_signup_config;
create policy public_match_signup_config_no_direct_select
  on public.public_match_signup_config
  for select
  to authenticated
  using (false);

revoke all on public.public_match_signup_links from anon, authenticated;
revoke all on public.public_match_signup_identities from anon, authenticated;
revoke all on public.public_match_signups from anon, authenticated;
revoke all on public.public_match_signup_config from anon, authenticated;
grant all on public.public_match_signup_links to service_role;
grant all on public.public_match_signup_identities to service_role;
grant all on public.public_match_signups to service_role;
grant all on public.public_match_signup_config to service_role;

create or replace function public.rpc_public_match_signup_link_get_or_create(
  p_match_id uuid
)
returns table (
  link_id uuid,
  match_id uuid,
  public_token uuid,
  enabled_at timestamptz,
  disabled_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
  v_link public.public_match_signup_links%rowtype;
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

  select * into v_link
  from public.public_match_signup_links l
  where l.match_id = p_match_id
    and l.disabled_at is null
  order by l.created_at desc
  limit 1;

  if not found then
    insert into public.public_match_signup_links(match_id, created_by)
    values (p_match_id, v_uid)
    returning * into v_link;
  end if;

  return query
  select v_link.id, v_link.match_id, v_link.public_token, v_link.enabled_at, v_link.disabled_at;
end;
$$;

create or replace function public.rpc_public_match_signup_context(
  p_public_token uuid
)
returns table (
  match_id uuid,
  signup_open boolean,
  match_status text,
  host_display_name text,
  game_type text,
  sport_name text,
  match_date date,
  start_time time,
  venue_name text,
  venue_timezone text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  return query
  select
    m.id,
    (l.disabled_at is null and m.status = 'active') as signup_open,
    m.status::text,
    coalesce(nullif(btrim(p.display_name), ''), 'the host') as host_display_name,
    m.game_type,
    s.display_name,
    m.match_date,
    m.start_time,
    v.name,
    coalesce(v.timezone, 'America/Toronto')
  from public.public_match_signup_links l
  join public.matches m on m.id = l.match_id
  left join public.profiles p on p.id = m.organizer_id
  left join public.sports s on s.id = m.sport_id
  left join public.venues v on v.id = m.venue_id
  where l.public_token = p_public_token
    and l.disabled_at is null
  limit 1;
end;
$$;

create or replace function public.rpc_public_match_signup_start(
  p_public_token uuid,
  p_display_name text,
  p_email text,
  p_phone text default null,
  p_marketing_email_opt_in boolean default false
)
returns table (
  signup_id uuid,
  status text,
  verification_required boolean,
  verification_token text,
  email_normalized text,
  recipient_name text,
  match_id uuid,
  game_type text,
  sport_name text,
  match_date date,
  start_time time,
  venue_name text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_link public.public_match_signup_links%rowtype;
  v_match public.matches%rowtype;
  v_signup public.public_match_signups%rowtype;
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(public.normalize_discovery_phone(p_phone), '');
  v_email_hash text;
  v_token uuid := gen_random_uuid();
  v_token_hash text;
  v_verification_cooldown constant interval := interval '5 minutes';
  v_link_cooldown constant interval := interval '10 minutes';
  v_link_cooldown_limit constant integer := 5;
  v_link_recent_verification_count integer := 0;
  v_existing_signup_found boolean := false;
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

  if v_email is null then
    raise exception 'email_required';
  end if;

  if length(v_display_name) > 120 then
    raise exception 'display_name_too_long';
  end if;

  if length(v_email) > 320 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalid';
  end if;

  v_email_hash := encode(extensions.digest(v_email, 'sha256'), 'hex');
  v_token_hash := encode(extensions.digest(v_token::text, 'sha256'), 'hex');

  update public.public_match_signups
  set status = 'expired'
  where public_match_signups.match_id = v_match.id
    and public_match_signups.email_sha256 = v_email_hash
    and public_match_signups.status = 'pending_verification'
    and public_match_signups.verification_expires_at < now();

  select * into v_signup
  from public.public_match_signups
  where public_match_signups.match_id = v_match.id
    and public_match_signups.email_sha256 = v_email_hash
    and public_match_signups.status in ('pending_verification', 'participant_created')
  order by public_match_signups.created_at desc
  limit 1
  for update;
  v_existing_signup_found := found;

  if v_existing_signup_found and v_signup.status = 'participant_created' then
    return query
    select
      v_signup.id,
      'already_verified'::text,
      false,
      null::text,
      null::text,
      null::text,
      v_match.id,
      v_match.game_type,
      (select s.display_name from public.sports s where s.id = v_match.sport_id),
      v_match.match_date,
      v_match.start_time,
      (select v.name from public.venues v where v.id = v_match.venue_id);
    return;
  end if;

  if v_existing_signup_found
    and v_signup.status = 'pending_verification'
    and v_signup.verification_sent_at is not null
    and v_signup.verification_sent_at > now() - v_verification_cooldown
  then
    return query
    select
      v_signup.id,
      'verification_sent'::text,
      false,
      null::text,
      null::text,
      null::text,
      v_match.id,
      v_match.game_type,
      (select s.display_name from public.sports s where s.id = v_match.sport_id),
      v_match.match_date,
      v_match.start_time,
      (select v.name from public.venues v where v.id = v_match.venue_id);
    return;
  end if;

  select count(*)::integer into v_link_recent_verification_count
  from public.public_match_signups s
  where s.link_id = v_link.id
    and s.verification_sent_at is not null
    and s.verification_sent_at > now() - v_link_cooldown;

  if v_link_recent_verification_count >= v_link_cooldown_limit then
    if v_existing_signup_found then
      update public.public_match_signups
      set verification_delivery_status = 'throttled'
      where id = v_signup.id;
    end if;

    return query
    select
      v_signup.id,
      'verification_sent'::text,
      false,
      null::text,
      null::text,
      null::text,
      v_match.id,
      v_match.game_type,
      (select s.display_name from public.sports s where s.id = v_match.sport_id),
      v_match.match_date,
      v_match.start_time,
      (select v.name from public.venues v where v.id = v_match.venue_id);
    return;
  end if;

  if v_existing_signup_found then
    update public.public_match_signups
    set
      display_name = v_display_name,
      email_normalized = v_email,
      phone_normalized = v_phone,
      marketing_email_opt_in = coalesce(p_marketing_email_opt_in, false),
      marketing_email_opt_in_at = case when coalesce(p_marketing_email_opt_in, false) then now() else null end,
      verification_token_hash = v_token_hash,
      verification_sent_at = now(),
      verification_delivery_status = 'queued',
      verification_delivery_error = null,
      verification_expires_at = now() + interval '24 hours',
      status = 'pending_verification'
    where id = v_signup.id
    returning * into v_signup;
  else
    insert into public.public_match_signups (
      link_id,
      match_id,
      display_name,
      email_normalized,
      email_sha256,
      phone_normalized,
      marketing_email_opt_in,
      marketing_email_opt_in_at,
      verification_token_hash,
      verification_sent_at,
      verification_delivery_status,
      verification_expires_at,
      status
    ) values (
      v_link.id,
      v_match.id,
      v_display_name,
      v_email,
      v_email_hash,
      v_phone,
      coalesce(p_marketing_email_opt_in, false),
      case when coalesce(p_marketing_email_opt_in, false) then now() else null end,
      v_token_hash,
      now(),
      'queued',
      now() + interval '24 hours',
      'pending_verification'
    )
    returning * into v_signup;
  end if;

  return query
  select
    v_signup.id,
    'verification_sent'::text,
    true,
    v_token::text,
    v_email,
    v_display_name,
    v_match.id,
    v_match.game_type,
    (select s.display_name from public.sports s where s.id = v_match.sport_id),
    v_match.match_date,
    v_match.start_time,
    (select v.name from public.venues v where v.id = v_match.venue_id);
end;
$$;

create or replace function public.rpc_public_match_signup_record_delivery_result(
  p_signup_id uuid,
  p_delivery_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_delivery_status not in ('sent', 'failed', 'skipped') then
    raise exception 'invalid_delivery_status';
  end if;

  update public.public_match_signups
  set
    verification_delivery_status = p_delivery_status,
    verification_delivery_attempt_count = verification_delivery_attempt_count + 1,
    verification_delivery_last_attempt_at = now(),
    verification_delivery_sent_at = case
      when p_delivery_status = 'sent' then now()
      else verification_delivery_sent_at
    end,
    verification_delivery_error = case
      when p_delivery_status = 'failed' then left(coalesce(nullif(btrim(p_error), ''), 'send_failed'), 500)
      else null
    end
  where id = p_signup_id
    and status = 'pending_verification';

  if not found then
    raise exception 'signup_delivery_target_not_found';
  end if;

  insert into public.notification_deliveries (
    channel,
    provider,
    destination,
    delivery_status,
    attempt_count,
    last_attempt_at,
    sent_at,
    error_code,
    error_message,
    payload
  )
  select
    'email',
    'resend',
    s.email_normalized,
    p_delivery_status,
    1,
    now(),
    case when p_delivery_status = 'sent' then now() else null end,
    case
      when p_delivery_status = 'failed' then 'public_signup_verification_send_failed'
      when p_delivery_status = 'skipped' then 'public_signup_verification_delivery_skipped'
      else null
    end,
    case
      when p_delivery_status in ('failed', 'skipped') then left(coalesce(nullif(btrim(p_error), ''), 'send_failed'), 500)
      else null
    end,
    jsonb_build_object(
      'template_type', 'public_match_signup_verification',
      'delivery_audit_only', true,
      'signup_id', s.id,
      'match_id', s.match_id
    )
  from public.public_match_signups s
  where s.id = p_signup_id;
end;
$$;

create or replace function public.rpc_public_match_signup_verify(
  p_public_token uuid,
  p_signup_id uuid,
  p_verification_token text
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
  v_signup public.public_match_signups%rowtype;
  v_link public.public_match_signup_links%rowtype;
  v_match public.matches%rowtype;
  v_identity public.public_match_signup_identities%rowtype;
  v_person_id uuid;
  v_guest_id uuid;
  v_mp public.match_participants%rowtype;
  v_token_hash text;
  v_removed_mp_id uuid;
begin
  if nullif(btrim(coalesce(p_verification_token, '')), '') is null then
    raise exception 'verification_token_required';
  end if;

  v_token_hash := encode(extensions.digest(btrim(p_verification_token), 'sha256'), 'hex');

  select * into v_signup
  from public.public_match_signups
  where id = p_signup_id
  for update;

  if not found then
    raise exception 'signup_not_found';
  end if;

  if v_signup.verification_token_hash <> v_token_hash then
    raise exception 'verification_token_invalid';
  end if;

  if v_signup.status = 'participant_created' and v_signup.match_participant_id is not null then
    select * into v_mp from public.match_participants where id = v_signup.match_participant_id;
    return query
    select v_signup.status, v_signup.match_id, v_signup.match_participant_id, coalesce(v_mp.status::text, null), v_signup.display_name;
    return;
  end if;

  if v_signup.status <> 'pending_verification' then
    raise exception 'signup_not_verifiable';
  end if;

  if v_signup.verification_expires_at < now() then
    update public.public_match_signups
    set status = 'expired'
    where id = v_signup.id;
    raise exception 'verification_token_expired';
  end if;

  select * into v_link
  from public.public_match_signup_links
  where id = v_signup.link_id
    and public_token = p_public_token
    and disabled_at is null;

  if not found then
    raise exception 'signup_link_not_found';
  end if;

  select * into v_match
  from public.matches m
  where m.id = v_signup.match_id
    and m.status = 'active';

  if not found then
    raise exception 'match_not_active';
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

  select * into v_identity
  from public.public_match_signup_identities
  where email_sha256 = v_signup.email_sha256
  for update;

  if found then
    v_person_id := v_identity.person_id;
    v_guest_id := v_identity.guest_id;

    update public.people
    set display_name = v_signup.display_name,
        status = 'active'
    where person_id = v_person_id;

    update public.guests
    set display_name = v_signup.display_name,
        email = v_signup.email_normalized,
        phone = null,
        status = 'active',
        person_id = v_person_id
    where id = v_guest_id;

    update public.public_match_signup_identities
    set last_verified_at = now()
    where id = v_identity.id
    returning * into v_identity;
  else
    insert into public.people(person_type, display_name, status)
    values ('limited_contact', v_signup.display_name, 'active')
    returning person_id into v_person_id;

    insert into public.guests(display_name, email, phone, status, created_by, person_id)
    values (v_signup.display_name, v_signup.email_normalized, null, 'active', v_system_actor_id, v_person_id)
    returning id into v_guest_id;

    insert into public.public_match_signup_identities(email_sha256, person_id, guest_id, last_verified_at)
    values (v_signup.email_sha256, v_person_id, v_guest_id, now())
    returning * into v_identity;
  end if;

  -- Normalize removed_at/status drift through the canonical lifecycle helper
  -- before selecting the active participant by removed_at.
  for v_removed_mp_id in
    select match_participants.id
    from public.match_participants
    where match_participants.match_id = v_match.id
      and match_participants.guest_id = v_guest_id
      and (
        match_participants.removed_at is not null
        or match_participants.status = 'removed'
      )
    for update
  loop
    perform public.match_participant_reconcile_status(v_removed_mp_id);
  end loop;

  select * into v_mp
  from public.match_participants
  where match_participants.match_id = v_match.id
    and match_participants.guest_id = v_guest_id
    and match_participants.removed_at is null
  order by match_participants.created_at desc
  limit 1
  for update;

  if found then
    update public.match_participants
    set
      participant_accepted_at = coalesce(participant_accepted_at, now()),
      participant_accepted_via = coalesce(participant_accepted_via, 'email_invitation'),
      confirmation_source = coalesce(confirmation_source, 'player_response'),
      source_person_id = coalesce(source_person_id, v_person_id)
    where id = v_mp.id
    returning * into v_mp;
  else
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
      'email_invitation',
      'player_response',
      v_person_id
    )
    returning * into v_mp;

    insert into public.match_participant_actions(match_id, match_participant_id, action_type, note, created_by)
    values (v_match.id, v_mp.id, 'request_join', 'public_match_signup', v_system_actor_id);
  end if;

  perform public.match_participant_reconcile_status(v_mp.id);
  select * into v_mp from public.match_participants where id = v_mp.id;

  update public.public_match_signups
  set
    identity_id = v_identity.id,
    person_id = v_person_id,
    guest_id = v_guest_id,
    match_participant_id = v_mp.id,
    verified_at = coalesce(verified_at, now()),
    status = 'participant_created'
  where id = v_signup.id
  returning * into v_signup;

  return query
  select v_signup.status, v_signup.match_id, v_mp.id, v_mp.status::text, v_signup.display_name;
end;
$$;

create or replace function public.rpc_public_match_signup_participant_metadata(
  p_match_id uuid
)
returns table (
  match_participant_id uuid,
  match_id uuid,
  source text,
  email_verified boolean,
  signup_status text
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
    s.status
  from public.public_match_signups s
  where s.match_id = p_match_id
    and s.match_participant_id is not null
    and s.status = 'participant_created';
end;
$$;

grant execute on function public.rpc_public_match_signup_link_get_or_create(uuid) to authenticated, service_role;
grant execute on function public.rpc_public_match_signup_context(uuid) to anon, authenticated, service_role;
revoke all on function public.rpc_public_match_signup_start(uuid, text, text, text, boolean) from public;
revoke all on function public.rpc_public_match_signup_start(uuid, text, text, text, boolean) from anon;
revoke all on function public.rpc_public_match_signup_start(uuid, text, text, text, boolean) from authenticated;
grant execute on function public.rpc_public_match_signup_start(uuid, text, text, text, boolean) to service_role;
revoke all on function public.rpc_public_match_signup_record_delivery_result(uuid, text, text) from public;
revoke all on function public.rpc_public_match_signup_record_delivery_result(uuid, text, text) from anon;
revoke all on function public.rpc_public_match_signup_record_delivery_result(uuid, text, text) from authenticated;
grant execute on function public.rpc_public_match_signup_record_delivery_result(uuid, text, text) to service_role;
revoke all on function public.rpc_public_match_signup_verify(uuid, uuid, text) from public;
revoke all on function public.rpc_public_match_signup_verify(uuid, uuid, text) from anon;
revoke all on function public.rpc_public_match_signup_verify(uuid, uuid, text) from authenticated;
grant execute on function public.rpc_public_match_signup_verify(uuid, uuid, text) to service_role;
grant execute on function public.rpc_public_match_signup_participant_metadata(uuid) to authenticated, service_role;
