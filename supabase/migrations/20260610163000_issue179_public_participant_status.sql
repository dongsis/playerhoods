create table if not exists public.public_participant_status_tokens (
  id uuid primary key default gen_random_uuid(),
  match_participant_id uuid not null references public.match_participants(id) on delete cascade,
  token_hash text not null unique,
  source text not null default 'system',
  out_actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  constraint public_participant_status_tokens_source_check
    check (source in ('invitation', 'public_join_sms', 'authenticated_self', 'system'))
);

comment on table public.public_participant_status_tokens
is 'Issue #179: participant-bound public status tokens. Raw tokens are never stored; only token_hash is persisted.';

create index if not exists idx_public_participant_status_tokens_participant
  on public.public_participant_status_tokens(match_participant_id)
  where revoked_at is null;

revoke all on table public.public_participant_status_tokens from public, anon, authenticated;
grant all on table public.public_participant_status_tokens to service_role;

create or replace function public.public_participant_status_payload(
  p_match_participant_id uuid
)
returns table (
  match_participant_id uuid,
  match_id uuid,
  participant_status text,
  participant_join_method text,
  participant_display_name text,
  participant_avatar_url text,
  participant_removed_at timestamptz,
  participant_accepted_at timestamptz,
  participant_org_approved_at timestamptz,
  participant_confirmation_source text,
  player_visible_note text,
  match_status text,
  game_type text,
  sport_name text,
  match_date date,
  start_time time,
  venue_name text,
  venue_timezone text,
  host_display_name text,
  is_formed boolean,
  formed_at timestamptz,
  confirmed_players jsonb,
  can_out boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  return query
  select
    mp.id,
    m.id,
    mp.status::text,
    mp.join_method::text,
    coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(g.display_name), ''), 'Player'),
    p.avatar_url,
    mp.removed_at,
    mp.participant_accepted_at,
    mp.org_approved_at,
    mp.confirmation_source,
    case
      when mp.removed_at is not null
        and mp.removed_by = m.organizer_id
      then nullif(btrim(mp.removal_note), '')
      else null::text
    end,
    m.status::text,
    m.game_type,
    s.display_name,
    m.match_date,
    m.start_time,
    v.name,
    coalesce(v.timezone, 'America/Toronto'),
    coalesce(nullif(btrim(host.display_name), ''), 'the host'),
    (m.formed_at is not null),
    m.formed_at,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'display_name', coalesce(nullif(btrim(cp.display_name), ''), nullif(btrim(cg.display_name), ''), 'Player'),
            'avatar_url', cp.avatar_url,
            'is_self', cmp.id = mp.id
          )
          order by coalesce(nullif(btrim(cp.display_name), ''), nullif(btrim(cg.display_name), ''), 'Player')
        ),
        '[]'::jsonb
      )
      from public.match_participants cmp
      left join public.profiles cp on cp.id = cmp.user_id
      left join public.guests cg on cg.id = cmp.guest_id
      where cmp.match_id = m.id
        and cmp.status = 'confirmed'
        and cmp.removed_at is null
    ),
    (
      mp.removed_at is null
      and m.status = 'active'
      and not (mp.user_id is not null and mp.user_id = m.organizer_id)
    )
  from public.match_participants mp
  join public.matches m on m.id = mp.match_id
  left join public.profiles p on p.id = mp.user_id
  left join public.guests g on g.id = mp.guest_id
  left join public.profiles host on host.id = m.organizer_id
  left join public.sports s on s.id = m.sport_id
  left join public.venues v on v.id = m.venue_id
  where mp.id = p_match_participant_id;
end;
$$;

alter function public.public_participant_status_payload(uuid) owner to postgres;
revoke all on function public.public_participant_status_payload(uuid) from public, anon, authenticated;
grant execute on function public.public_participant_status_payload(uuid) to service_role;

create or replace function public.rpc_public_participant_status_token_issue(
  p_match_participant_id uuid,
  p_source text default 'system',
  p_actor_id uuid default null
)
returns table (
  status_token text,
  token_id uuid,
  match_participant_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mp public.match_participants%rowtype;
  v_source text := coalesce(nullif(btrim(p_source), ''), 'system');
  v_system_actor_id uuid;
  v_out_actor_id uuid;
  v_token text;
  v_hash text;
  v_token_id uuid;
  v_attempt integer;
begin
  if v_source not in ('invitation', 'public_join_sms', 'authenticated_self', 'system') then
    raise exception 'invalid_status_token_source';
  end if;

  select * into v_mp
  from public.match_participants
  where id = p_match_participant_id;

  if not found then
    raise exception 'participant_not_found';
  end if;

  select cfg.system_actor_user_id into v_system_actor_id
  from public.public_match_signup_config cfg
  where cfg.singleton_key = true;

  v_out_actor_id := coalesce(v_mp.user_id, p_actor_id, v_system_actor_id);

  if v_out_actor_id is null then
    raise exception 'status_token_actor_required';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_out_actor_id) then
    raise exception 'status_token_actor_missing';
  end if;

  for v_attempt in 1..5 loop
    begin
      v_token := encode(extensions.gen_random_bytes(32), 'hex');
      v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

      insert into public.public_participant_status_tokens(
        match_participant_id,
        token_hash,
        source,
        out_actor_id
      )
      values (
        v_mp.id,
        v_hash,
        v_source,
        v_out_actor_id
      )
      returning id into v_token_id;

      return query
      select v_token, v_token_id, v_mp.id, null::timestamptz;
      return;
    exception when unique_violation then
      null;
    end;
  end loop;

  raise exception 'status_token_generation_failed';
end;
$$;

alter function public.rpc_public_participant_status_token_issue(uuid, text, uuid) owner to postgres;
revoke all on function public.rpc_public_participant_status_token_issue(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.rpc_public_participant_status_token_issue(uuid, text, uuid) to service_role;

create or replace function public.rpc_public_participant_status_token_issue_for_invitation(
  p_invitation_id uuid,
  p_actor_id uuid default null
)
returns table (
  status_token text,
  token_id uuid,
  match_participant_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_match_participant_id uuid;
begin
  select ei.match_participant_id into v_match_participant_id
  from public.email_invitations ei
  where ei.id = p_invitation_id;

  if v_match_participant_id is null then
    raise exception 'invitation_participant_not_found';
  end if;

  return query
  select *
  from public.rpc_public_participant_status_token_issue(
    v_match_participant_id,
    'invitation',
    p_actor_id
  );
end;
$$;

alter function public.rpc_public_participant_status_token_issue_for_invitation(uuid, uuid) owner to postgres;
revoke all on function public.rpc_public_participant_status_token_issue_for_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.rpc_public_participant_status_token_issue_for_invitation(uuid, uuid) to service_role;

create or replace function public.rpc_public_participant_status(
  p_status_token text
)
returns table (
  match_participant_id uuid,
  match_id uuid,
  participant_status text,
  participant_join_method text,
  participant_display_name text,
  participant_avatar_url text,
  participant_removed_at timestamptz,
  participant_accepted_at timestamptz,
  participant_org_approved_at timestamptz,
  participant_confirmation_source text,
  player_visible_note text,
  match_status text,
  game_type text,
  sport_name text,
  match_date date,
  start_time time,
  venue_name text,
  venue_timezone text,
  host_display_name text,
  is_formed boolean,
  formed_at timestamptz,
  confirmed_players jsonb,
  can_out boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hash text;
  v_token public.public_participant_status_tokens%rowtype;
begin
  if p_status_token is null or btrim(p_status_token) = '' then
    return;
  end if;

  v_hash := encode(extensions.digest(btrim(p_status_token), 'sha256'), 'hex');

  select * into v_token
  from public.public_participant_status_tokens t
  where t.token_hash = v_hash
    and t.revoked_at is null
    and (t.expires_at is null or t.expires_at > now());

  if not found then
    return;
  end if;

  update public.public_participant_status_tokens
  set last_used_at = now()
  where id = v_token.id;

  return query
  select *
  from public.public_participant_status_payload(v_token.match_participant_id);
end;
$$;

alter function public.rpc_public_participant_status(text) owner to postgres;
revoke all on function public.rpc_public_participant_status(text) from public;
grant execute on function public.rpc_public_participant_status(text) to anon, authenticated, service_role;

create or replace function public.rpc_public_participant_out(
  p_status_token text
)
returns table (
  match_participant_id uuid,
  match_id uuid,
  participant_status text,
  participant_join_method text,
  participant_display_name text,
  participant_avatar_url text,
  participant_removed_at timestamptz,
  participant_accepted_at timestamptz,
  participant_org_approved_at timestamptz,
  participant_confirmation_source text,
  player_visible_note text,
  match_status text,
  game_type text,
  sport_name text,
  match_date date,
  start_time time,
  venue_name text,
  venue_timezone text,
  host_display_name text,
  is_formed boolean,
  formed_at timestamptz,
  confirmed_players jsonb,
  can_out boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hash text;
  v_token public.public_participant_status_tokens%rowtype;
  v_mp public.match_participants%rowtype;
  v_match public.matches%rowtype;
begin
  if p_status_token is null or btrim(p_status_token) = '' then
    return;
  end if;

  v_hash := encode(extensions.digest(btrim(p_status_token), 'sha256'), 'hex');

  select * into v_token
  from public.public_participant_status_tokens t
  where t.token_hash = v_hash
    and t.revoked_at is null
    and (t.expires_at is null or t.expires_at > now())
  for update;

  if not found then
    return;
  end if;

  update public.public_participant_status_tokens
  set last_used_at = now()
  where id = v_token.id;

  select * into v_mp
  from public.match_participants
  where id = v_token.match_participant_id
  for update;

  if not found then
    return;
  end if;

  select * into v_match
  from public.matches
  where id = v_mp.match_id;

  if not found then
    raise exception 'match_not_found';
  end if;

  if v_mp.removed_at is null then
    if v_match.status <> 'active' then
      raise exception 'match_not_active';
    end if;

    if v_mp.user_id is not null and v_mp.user_id = v_match.organizer_id then
      raise exception 'cannot_out_organizer';
    end if;

    perform public.apply_participant_exit(
      v_mp.id,
      v_token.out_actor_id,
      'withdraw',
      null
    );
  end if;

  return query
  select *
  from public.public_participant_status_payload(v_token.match_participant_id);
end;
$$;

alter function public.rpc_public_participant_out(text) owner to postgres;
revoke all on function public.rpc_public_participant_out(text) from public;
grant execute on function public.rpc_public_participant_out(text) to anon, authenticated, service_role;

create or replace function public.rpc_match_self_participant_status(
  p_match_id uuid
)
returns table (
  match_participant_id uuid,
  match_id uuid,
  participant_status text,
  participant_join_method text,
  participant_display_name text,
  participant_avatar_url text,
  participant_removed_at timestamptz,
  participant_accepted_at timestamptz,
  participant_org_approved_at timestamptz,
  participant_confirmation_source text,
  player_visible_note text,
  match_status text,
  game_type text,
  sport_name text,
  match_date date,
  start_time time,
  venue_name text,
  venue_timezone text,
  host_display_name text,
  is_formed boolean,
  formed_at timestamptz,
  confirmed_players jsonb,
  can_out boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mp_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select mp.id into v_mp_id
  from public.match_participants mp
  where mp.match_id = p_match_id
    and mp.user_id = auth.uid()
  order by (mp.removed_at is null) desc, mp.created_at desc
  limit 1;

  if v_mp_id is null then
    return;
  end if;

  return query
  select *
  from public.public_participant_status_payload(v_mp_id);
end;
$$;

alter function public.rpc_match_self_participant_status(uuid) owner to postgres;
revoke all on function public.rpc_match_self_participant_status(uuid) from public, anon;
grant execute on function public.rpc_match_self_participant_status(uuid) to authenticated, service_role;
