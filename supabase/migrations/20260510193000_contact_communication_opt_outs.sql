create table if not exists public.contact_communication_opt_outs (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'sms')),
  destination text not null,
  destination_normalized text not null,
  scope text not null check (scope in ('all', 'playerhoods', 'contact_invites', 'match_invites')),
  source_invitation_id uuid references public.email_invitations(id) on delete set null,
  reason text,
  unsubscribed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_contact_communication_opt_outs_scope
  on public.contact_communication_opt_outs (channel, destination_normalized, scope);

create index if not exists idx_contact_communication_opt_outs_source_invitation
  on public.contact_communication_opt_outs (source_invitation_id);

comment on table public.contact_communication_opt_outs is
  'Public contact communication opt-outs for non-account contact invitations. Used before creating invitation send events.';

alter table public.email_invitations
  add column if not exists email_opted_out_at timestamptz,
  add column if not exists sms_opted_out_at timestamptz,
  add column if not exists delivery_suppressed_reason text;

create or replace function public.normalize_contact_destination(
  p_channel text,
  p_destination text
)
returns text
language sql
immutable
as $$
  select case
    when p_channel = 'email' then nullif(lower(btrim(coalesce(p_destination, ''))), '')
    when p_channel = 'sms' then nullif(regexp_replace(coalesce(p_destination, ''), '\D', '', 'g'), '')
    else null
  end
$$;

create or replace function public.is_contact_communication_opted_out(
  p_channel text,
  p_destination text,
  p_scope text default 'match_invites'
)
returns boolean
language sql
stable
security definer
set search_path to public
as $$
  with normalized as (
    select public.normalize_contact_destination(p_channel, p_destination) as destination_normalized
  ),
  effective_scopes as (
    select unnest(case
      when p_scope = 'contact_invites' then array['all', 'playerhoods', 'contact_invites']::text[]
      when p_scope = 'match_invites' then array['all', 'playerhoods', 'match_invites', 'contact_invites']::text[]
      when p_scope = 'playerhoods' then array['all', 'playerhoods']::text[]
      else array['all']::text[]
    end) as scope
  )
  select exists (
    select 1
    from public.contact_communication_opt_outs o
    join normalized n on n.destination_normalized is not null
    join effective_scopes s on s.scope = o.scope
    where o.channel = p_channel
      and o.destination_normalized = n.destination_normalized
      and o.unsubscribed_at is not null
  )
$$;

create or replace function public.rpc_contact_communication_unsubscribe(
  p_invitation_id uuid,
  p_channel text default null,
  p_scope text default 'contact_invites',
  p_reason text default null
)
returns table(channel text, destination text, scope text, unsubscribed_at timestamptz)
language plpgsql
security definer
set search_path to public
as $$
declare
  v_inv public.email_invitations%rowtype;
  v_scope text := coalesce(nullif(btrim(p_scope), ''), 'contact_invites');
  v_channel text := nullif(btrim(coalesce(p_channel, '')), '');
begin
  select *
  into v_inv
  from public.email_invitations
  where id = p_invitation_id;

  if not found then
    raise exception 'invitation_not_found';
  end if;

  if v_scope not in ('all', 'playerhoods', 'contact_invites', 'match_invites') then
    v_scope := 'contact_invites';
  end if;

  if v_channel is not null and v_channel not in ('email', 'sms') then
    raise exception 'invalid_channel';
  end if;

  if (v_channel is null or v_channel = 'email') and nullif(btrim(coalesce(v_inv.target_email, '')), '') is not null then
    insert into public.contact_communication_opt_outs (
      channel,
      destination,
      destination_normalized,
      scope,
      source_invitation_id,
      reason,
      unsubscribed_at,
      created_at
    )
    values (
      'email',
      btrim(v_inv.target_email),
      public.normalize_contact_destination('email', v_inv.target_email),
      v_scope,
      v_inv.id,
      nullif(btrim(p_reason), ''),
      now(),
      now()
    )
    on conflict (channel, destination_normalized, scope)
    do update set
      source_invitation_id = coalesce(public.contact_communication_opt_outs.source_invitation_id, excluded.source_invitation_id),
      reason = coalesce(excluded.reason, public.contact_communication_opt_outs.reason),
      unsubscribed_at = coalesce(public.contact_communication_opt_outs.unsubscribed_at, excluded.unsubscribed_at);
  end if;

  if (v_channel is null or v_channel = 'sms') and nullif(btrim(coalesce(v_inv.target_phone, '')), '') is not null then
    insert into public.contact_communication_opt_outs (
      channel,
      destination,
      destination_normalized,
      scope,
      source_invitation_id,
      reason,
      unsubscribed_at,
      created_at
    )
    values (
      'sms',
      btrim(v_inv.target_phone),
      public.normalize_contact_destination('sms', v_inv.target_phone),
      v_scope,
      v_inv.id,
      nullif(btrim(p_reason), ''),
      now(),
      now()
    )
    on conflict (channel, destination_normalized, scope)
    do update set
      source_invitation_id = coalesce(public.contact_communication_opt_outs.source_invitation_id, excluded.source_invitation_id),
      reason = coalesce(excluded.reason, public.contact_communication_opt_outs.reason),
      unsubscribed_at = coalesce(public.contact_communication_opt_outs.unsubscribed_at, excluded.unsubscribed_at);
  end if;

  update public.email_invitations
  set
    email_opted_out_at = case
      when (v_channel is null or v_channel = 'email') and nullif(btrim(coalesce(v_inv.target_email, '')), '') is not null then now()
      else email_opted_out_at
    end,
    sms_opted_out_at = case
      when (v_channel is null or v_channel = 'sms') and nullif(btrim(coalesce(v_inv.target_phone, '')), '') is not null then now()
      else sms_opted_out_at
    end,
    delivery_suppressed_reason = 'recipient_unsubscribed'
  where id = v_inv.id;

  return query
  select o.channel, o.destination, o.scope, o.unsubscribed_at
  from public.contact_communication_opt_outs o
  where o.source_invitation_id = v_inv.id
     or (
       o.scope = v_scope
       and (
         (o.channel = 'email' and o.destination_normalized = public.normalize_contact_destination('email', v_inv.target_email))
         or (o.channel = 'sms' and o.destination_normalized = public.normalize_contact_destination('sms', v_inv.target_phone))
       )
     )
  order by o.channel;
end;
$$;

grant execute on function public.normalize_contact_destination(text, text) to anon, authenticated, service_role;
grant execute on function public.is_contact_communication_opted_out(text, text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_contact_communication_unsubscribe(uuid, text, text, text) to anon, authenticated, service_role;

create or replace function public.rpc_contact_invitation_delivery_status(p_guest_ids uuid[])
returns table(
  guest_id uuid,
  email text,
  phone text,
  email_opted_out boolean,
  sms_opted_out boolean,
  has_reachable_channel boolean
)
language sql
stable
security definer
set search_path to public
as $$
  select
    g.id as guest_id,
    nullif(btrim(g.email), '') as email,
    nullif(btrim(g.phone), '') as phone,
    public.is_contact_communication_opted_out('email', g.email, 'match_invites') as email_opted_out,
    public.is_contact_communication_opted_out('sms', g.phone, 'match_invites') as sms_opted_out,
    (
      (nullif(btrim(g.email), '') is not null and not public.is_contact_communication_opted_out('email', g.email, 'match_invites'))
      or (nullif(btrim(g.phone), '') is not null and not public.is_contact_communication_opted_out('sms', g.phone, 'match_invites'))
    ) as has_reachable_channel
  from public.guests g
  where g.id = any(coalesce(p_guest_ids, '{}'::uuid[]))
$$;

grant execute on function public.rpc_contact_invitation_delivery_status(uuid[]) to authenticated, service_role;

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
  'Creates a match invitation and suppresses opted-out contact channels before emitting the send event.';

grant execute on function public.rpc_email_invitation_create(text, text, text, uuid, timestamptz, text) to authenticated, service_role;

create or replace function public.rpc_match_nominate_guest(
  p_match_id uuid,
  p_guest_id uuid
)
returns public.match_participants
language plpgsql
security definer
set search_path to public
as $$
declare
  v_match public.matches%rowtype;
  v_uid uuid := auth.uid();
  v_existing public.match_participants%rowtype;
  v_mp public.match_participants%rowtype;
  v_is_org boolean;
  v_guest_email text;
  v_guest_phone text;
  v_delivery_email text;
  v_delivery_phone text;
  v_email_opted_out boolean := false;
  v_sms_opted_out boolean := false;
  v_guest_name text;
  v_nominator_name text;
  v_evt_id uuid;
  v_inv public.email_invitations%rowtype;
  v_linked_user_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_match from public.matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  if v_match.status <> 'active' then raise exception 'match_not_active'; end if;

  v_is_org := (v_match.organizer_id = v_uid);
  if not v_is_org then
    if not v_match.can_participants_invite_users then
      raise exception 'not_authorized_to_nominate_guest';
    end if;

    if not (
      public.is_user_in_scope_groups(coalesce(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
      or public.is_user_match_associated(p_match_id, v_uid)
    ) then
      raise exception 'not_authorized_to_nominate_guest';
    end if;
  end if;

  if not exists (
    select 1
    from public.user_roster_guests urg
    where urg.owner_user_id = v_uid
      and urg.guest_id = p_guest_id
  ) then
    raise exception 'guest_not_in_my_roster';
  end if;

  select
    nullif(btrim(g.email), ''),
    nullif(btrim(g.phone), ''),
    nullif(btrim(g.display_name), '')
  into v_guest_email, v_guest_phone, v_guest_name
  from public.guests g
  where g.id = p_guest_id
    and g.status = 'active';

  if not found then
    raise exception 'guest_not_found_or_inactive';
  end if;

  select il.user_id
  into v_linked_user_id
  from public.identity_links il
  where il.linked_type = 'contact'
    and il.linked_id = p_guest_id
  order by il.created_at desc
  limit 1;

  if v_linked_user_id is not null then
    if exists (
      select 1
      from public.match_participants mp
      where mp.match_id = p_match_id
        and mp.guest_id = p_guest_id
        and mp.removed_at is null
    ) then
      raise exception 'already_invited_or_participating';
    end if;

    if exists (
      select 1
      from public.match_participants mp
      where mp.match_id = p_match_id
        and mp.user_id = v_linked_user_id
        and mp.removed_at is null
    ) then
      raise exception 'already_invited_or_participating';
    end if;

    if exists (
      select 1
      from public.match_participants mp
      join public.identity_links il
        on il.linked_type = 'guest_participant'
       and il.linked_id = mp.id
       and il.user_id = v_linked_user_id
      where mp.match_id = p_match_id
        and mp.guest_id is not null
        and mp.removed_at is null
    ) then
      raise exception 'already_invited_or_participating';
    end if;

    return public.rpc_match_admit_user(p_match_id, v_linked_user_id);
  end if;

  select * into v_existing
  from public.match_participants
  where match_id = p_match_id
    and guest_id = p_guest_id
    and removed_at is null
  limit 1;

  if found then raise exception 'guest_already_active'; end if;

  v_email_opted_out := v_guest_email is not null and public.is_contact_communication_opted_out('email', v_guest_email, 'match_invites');
  v_sms_opted_out := v_guest_phone is not null and public.is_contact_communication_opted_out('sms', v_guest_phone, 'match_invites');
  v_delivery_email := case when v_email_opted_out then null else v_guest_email end;
  v_delivery_phone := case when v_sms_opted_out then null else v_guest_phone end;

  if (v_guest_email is not null or v_guest_phone is not null)
     and v_delivery_email is null
     and v_delivery_phone is null then
    raise exception 'contact_communication_opted_out';
  end if;

  insert into public.match_participants (
    match_id, join_method, guest_id, created_by, created_at, nominated_by,
    participant_accepted_at, participant_accepted_via, org_approved_at, org_approved_by
  ) values (
    p_match_id, 'nominated', p_guest_id, v_uid, now(), v_uid,
    null, null,
    case when v_is_org then now() else null end,
    case when v_is_org then v_uid else null end
  )
  returning * into v_mp;

  perform public.match_participant_reconcile_status(v_mp.id);
  select * into v_mp from public.match_participants where id = v_mp.id;

  insert into public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  values (p_match_id, v_mp.id, 'nominate_guest', null, v_uid);

  if v_delivery_email is not null or v_delivery_phone is not null then
    select p.display_name into v_nominator_name from public.profiles p where p.id = v_uid;

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
    ) values (
      v_uid,
      case when v_delivery_email is not null then lower(btrim(v_delivery_email)) else null end,
      v_delivery_phone,
      v_guest_name,
      'match',
      p_match_id,
      null,
      v_mp.id,
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
        'inviter_user_id', v_inv.inviter_user_id,
        'inviter_display_name', coalesce(v_nominator_name, 'Someone'),
        'match_participant_id', v_inv.match_participant_id
      )
    )
    returning id into v_evt_id;

    perform public.rpc_process_domain_event(v_evt_id);
  end if;

  return v_mp;
end;
$$;

comment on function public.rpc_match_nominate_guest(uuid, uuid) is
  'Nominate Contact Player. Suppresses opted-out contact communication channels before creating invitation send events.';

grant execute on function public.rpc_match_nominate_guest(uuid, uuid) to authenticated, service_role;
