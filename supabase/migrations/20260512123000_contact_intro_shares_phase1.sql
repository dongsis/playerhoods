-- Contact Intro Share Phase 1
-- Adds person-node Intro sharing without exposing private contact_record data.

create table if not exists public.contact_intro_shares (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  person_id uuid not null references public.people(person_id) on delete cascade,
  status text not null default 'pending'
    check (status = any (array['pending'::text, 'saved'::text, 'dismissed'::text, 'revoked'::text])),
  optional_message text,
  source_contact_record_id uuid references public.contact_records(contact_record_id) on delete set null,
  source_group_id uuid references public.groups(id) on delete set null,
  source_match_id uuid references public.matches(id) on delete set null,
  created_at timestamptz not null default now(),
  saved_at timestamptz,
  dismissed_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint contact_intro_shares_no_self_share check (sender_user_id <> recipient_user_id)
);

create unique index if not exists uq_contact_intro_shares_active_pending
  on public.contact_intro_shares (sender_user_id, recipient_user_id, person_id)
  where status = 'pending';

create index if not exists idx_contact_intro_shares_recipient_status
  on public.contact_intro_shares (recipient_user_id, status, created_at desc);

create index if not exists idx_contact_intro_shares_sender_created
  on public.contact_intro_shares (sender_user_id, created_at desc);

create index if not exists idx_contact_intro_shares_person
  on public.contact_intro_shares (person_id, created_at desc);

comment on table public.contact_intro_shares is
  'Direct user-to-user Contact Intro sharing. Shares trusted exposure to a person node, not private contact_record phone/email/notes.';

comment on column public.contact_intro_shares.source_contact_record_id is
  'Internal provenance only. User-facing RPCs do not populate or return this value because contact_record IDs are private owner-scoped data.';

alter table public.contact_intro_shares enable row level security;

drop policy if exists contact_intro_shares_select_participants on public.contact_intro_shares;
create policy contact_intro_shares_select_participants
  on public.contact_intro_shares
  for select
  to authenticated
  using (sender_user_id = auth.uid() or recipient_user_id = auth.uid());

grant all on table public.contact_intro_shares to authenticated;
grant all on table public.contact_intro_shares to service_role;

alter table public.person_relationships
  add column if not exists source_intro_share_id uuid references public.contact_intro_shares(id) on delete set null;

create index if not exists idx_person_relationships_source_intro_share
  on public.person_relationships (source_intro_share_id)
  where source_intro_share_id is not null;

comment on column public.person_relationships.source_intro_share_id is
  'Optional provenance for saved person relationships created from a Contact Intro Share.';

create or replace function public.can_user_have_contact_person_exposure(
  p_user_id uuid,
  p_person_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if p_user_id is null or p_person_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.people p
    where p.person_id = p_person_id
      and p.linked_user_id = p_user_id
  )
  or exists (
    select 1
    from public.contact_records cr
    where cr.owner_user_id = p_user_id
      and cr.person_id = p_person_id
      and cr.archived_at is null
  )
  or exists (
    select 1
    from public.person_relationships pr
    where pr.actor_user_id = p_user_id
      and pr.person_id = p_person_id
      and pr.relationship_type in ('saved', 'shared_match', 'same_group', 'group_contact', 'direct_contact', 'linked', 'imported_by')
  )
  or exists (
    select 1
    from public.group_contacts gc
    left join public.groups g
      on g.id = gc.group_id
    where gc.person_id = p_person_id
      and gc.removed_at is null
      and (
        public.is_group_active_member(gc.group_id, p_user_id)
        or g.boundary_keeper_id = p_user_id
      )
  )
  or exists (
    select 1
    from public.match_participants mp_person
    join public.guests gp
      on gp.id = mp_person.guest_id
    join public.matches m
      on m.id = mp_person.match_id
    left join public.match_participants mp_user
      on mp_user.match_id = mp_person.match_id
     and mp_user.user_id = p_user_id
     and mp_user.removed_at is null
    where gp.person_id = p_person_id
      and mp_person.removed_at is null
      and (
        m.organizer_id = p_user_id
        or mp_user.id is not null
        or public.is_user_match_associated(mp_person.match_id, p_user_id)
      )
  )
  or public.is_active_match_proxy_for_person(p_person_id, p_user_id);
end;
$$;

comment on function public.can_user_have_contact_person_exposure(uuid, uuid) is
  'Returns true when a user has trusted person-node exposure through ownership, saved/direct/group/shared-match/link/imported relationship, group contact visibility, match co-participation/organizer scope, or explicit Match Proxy. Does not expose private contact_record data.';

grant all on function public.can_user_have_contact_person_exposure(uuid, uuid) to authenticated;
grant all on function public.can_user_have_contact_person_exposure(uuid, uuid) to service_role;

create or replace function public.can_user_view_contact_player(
  p_guest_id uuid,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_person_id uuid;
begin
  if p_guest_id is null or p_actor_user_id is null then
    return false;
  end if;

  v_person_id := public.resolve_person_id_for_guest(p_guest_id);
  if v_person_id is null then
    return false;
  end if;

  return public.can_user_request_match_proxy_for_guest(p_guest_id, p_actor_user_id)
    or exists (
      select 1
      from public.contact_intro_shares cis
      where cis.recipient_user_id = p_actor_user_id
        and cis.person_id = v_person_id
        and cis.status in ('pending', 'saved')
    );
end;
$$;

comment on function public.can_user_view_contact_player(uuid, uuid) is
  'Returns true when the caller can view minimum Contact Player display data through existing trust paths or an inbound Contact Intro Share. This does not grant Match Proxy authority.';

grant all on function public.can_user_view_contact_player(uuid, uuid) to authenticated;
grant all on function public.can_user_view_contact_player(uuid, uuid) to service_role;

create or replace function public.can_user_share_intro_with_recipient(
  p_sender_user_id uuid,
  p_recipient_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_sender_user_id is not null
    and p_recipient_user_id is not null
    and p_sender_user_id <> p_recipient_user_id
    and exists (
      select 1 from public.profiles p where p.id = p_recipient_user_id
    )
    and (
      public.do_users_share_group(p_sender_user_id, p_recipient_user_id)
      or exists (
        select 1
        from public.user_invite_circle uic
        where uic.owner_user_id = p_sender_user_id
          and uic.target_user_id = p_recipient_user_id
      )
      or exists (
        select 1
        from public.user_invite_circle uic
        where uic.owner_user_id = p_recipient_user_id
          and uic.target_user_id = p_sender_user_id
      )
      or exists (
        select 1
        from public.match_participants mp_sender
        join public.match_participants mp_recipient
          on mp_recipient.match_id = mp_sender.match_id
         and mp_recipient.user_id = p_recipient_user_id
         and mp_recipient.removed_at is null
        where mp_sender.user_id = p_sender_user_id
          and mp_sender.removed_at is null
      )
    );
$$;

comment on function public.can_user_share_intro_with_recipient(uuid, uuid) is
  'P0 recipient gate for Contact Intro Share: shared group, saved registered-player relation in either direction, or shared active match.';

grant all on function public.can_user_share_intro_with_recipient(uuid, uuid) to authenticated;
grant all on function public.can_user_share_intro_with_recipient(uuid, uuid) to service_role;

create or replace function public.rpc_contact_intro_share_create(
  p_person_id uuid,
  p_recipient_user_id uuid,
  p_optional_message text default null
)
returns public.contact_intro_shares
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.contact_intro_shares;
  v_row public.contact_intro_shares;
  v_person_display_name text;
  v_sender_display_name text;
  v_note text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_person_id is null or p_recipient_user_id is null then
    raise exception 'invalid_contact_intro_share';
  end if;

  if p_recipient_user_id = v_uid then
    raise exception 'cannot_share_intro_with_self';
  end if;

  if not exists (select 1 from public.people p where p.person_id = p_person_id and p.status = 'active') then
    raise exception 'person_not_found';
  end if;

  if not public.can_user_have_contact_person_exposure(v_uid, p_person_id) then
    raise exception 'not_authorized_to_share_intro';
  end if;

  if not public.can_user_share_intro_with_recipient(v_uid, p_recipient_user_id) then
    raise exception 'recipient_not_in_share_scope';
  end if;

  if exists (
    select 1
    from public.person_relationships pr
    where pr.actor_user_id = p_recipient_user_id
      and pr.person_id = p_person_id
      and pr.relationship_type = 'saved'
  ) then
    select *
    into v_existing
    from public.contact_intro_shares cis
    where cis.sender_user_id = v_uid
      and cis.recipient_user_id = p_recipient_user_id
      and cis.person_id = p_person_id
      and cis.status = 'saved'
    order by cis.saved_at desc nulls last, cis.created_at desc
    limit 1;

    if found then
      return v_existing;
    end if;

    insert into public.contact_intro_shares (
      sender_user_id,
      recipient_user_id,
      person_id,
      status,
      optional_message,
      saved_at
    )
    values (
      v_uid,
      p_recipient_user_id,
      p_person_id,
      'saved',
      nullif(trim(coalesce(p_optional_message, '')), ''),
      now()
    )
    returning * into v_row;

    return v_row;
  end if;

  select *
  into v_existing
  from public.contact_intro_shares cis
  where cis.sender_user_id = v_uid
    and cis.recipient_user_id = p_recipient_user_id
    and cis.person_id = p_person_id
  order by
    case cis.status when 'pending' then 0 when 'saved' then 1 else 2 end,
    cis.created_at desc
  limit 1;

  if found then
    if v_existing.status in ('pending', 'saved') then
      return v_existing;
    end if;

    update public.contact_intro_shares cis
    set
      status = 'pending',
      optional_message = nullif(trim(coalesce(p_optional_message, '')), ''),
      dismissed_at = null,
      revoked_at = null,
      updated_at = now()
    where cis.id = v_existing.id
    returning * into v_row;
  else
    insert into public.contact_intro_shares (
      sender_user_id,
      recipient_user_id,
      person_id,
      status,
      optional_message
    )
    values (
      v_uid,
      p_recipient_user_id,
      p_person_id,
      'pending',
      nullif(trim(coalesce(p_optional_message, '')), '')
    )
    returning * into v_row;
  end if;

  select coalesce(nullif(trim(p.display_name), ''), p.person_id::text)
  into v_person_display_name
  from public.people p
  where p.person_id = p_person_id;

  select coalesce(nullif(trim(pd.display_name), ''), v_uid::text)
  into v_sender_display_name
  from public.profile_display pd
  where pd.id = v_uid;

  v_note := coalesce(v_sender_display_name, 'Someone') || ' shared ' || coalesce(v_person_display_name, 'a player') || '''s Intro with you. Contact details stay private.';

  insert into public.notifications (
    recipient_user_id,
    kind,
    actor_user_id,
    note,
    dedupe_key
  )
  values (
    p_recipient_user_id,
    'contact_intro_share',
    v_uid,
    v_note,
    'contact_intro_share:' || v_row.id::text
  )
  on conflict (recipient_user_id, kind, dedupe_key) where dedupe_key is not null
  do update set
    actor_user_id = excluded.actor_user_id,
    note = excluded.note,
    read_at = null,
    created_at = now();

  return v_row;
end;
$$;

comment on function public.rpc_contact_intro_share_create(uuid, uuid, text) is
  'Creates or reopens a Contact Intro Share after sender trusted-exposure and recipient relationship checks. Shares person-node exposure only, never private contact_record data.';

grant all on function public.rpc_contact_intro_share_create(uuid, uuid, text) to authenticated;
grant all on function public.rpc_contact_intro_share_create(uuid, uuid, text) to service_role;

create or replace function public.rpc_contact_intro_share_list()
returns table (
  share_id uuid,
  direction text,
  status text,
  sender_user_id uuid,
  sender_display_name text,
  recipient_user_id uuid,
  recipient_display_name text,
  person_id uuid,
  person_display_name text,
  person_avatar_url text,
  person_primary_sport_id integer,
  optional_message text,
  already_saved boolean,
  created_at timestamptz,
  saved_at timestamptz,
  dismissed_at timestamptz,
  revoked_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    cis.id as share_id,
    case when cis.recipient_user_id = auth.uid() then 'inbound' else 'outbound' end as direction,
    cis.status,
    cis.sender_user_id,
    coalesce(nullif(trim(sender.display_name), ''), cis.sender_user_id::text) as sender_display_name,
    cis.recipient_user_id,
    coalesce(nullif(trim(recipient.display_name), ''), cis.recipient_user_id::text) as recipient_display_name,
    cis.person_id,
    coalesce(nullif(trim(p.display_name), ''), cis.person_id::text) as person_display_name,
    p.avatar_url as person_avatar_url,
    p.primary_sport_id::integer as person_primary_sport_id,
    cis.optional_message,
    exists (
      select 1
      from public.person_relationships pr
      where pr.actor_user_id = auth.uid()
        and pr.person_id = cis.person_id
        and pr.relationship_type = 'saved'
    ) as already_saved,
    cis.created_at,
    cis.saved_at,
    cis.dismissed_at,
    cis.revoked_at
  from public.contact_intro_shares cis
  join public.people p
    on p.person_id = cis.person_id
  left join public.profile_display sender
    on sender.id = cis.sender_user_id
  left join public.profile_display recipient
    on recipient.id = cis.recipient_user_id
  where auth.uid() is not null
    and (cis.sender_user_id = auth.uid() or cis.recipient_user_id = auth.uid())
  order by cis.created_at desc;
$$;

comment on function public.rpc_contact_intro_share_list() is
  'Lists current user Contact Intro Shares with person-level display data only. Does not expose phone, email, owner notes, or contact_record IDs.';

grant all on function public.rpc_contact_intro_share_list() to authenticated;
grant all on function public.rpc_contact_intro_share_list() to service_role;

create or replace function public.rpc_contact_intro_share_accept_or_save(
  p_share_id uuid
)
returns public.person_relationships
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_share public.contact_intro_shares;
  v_row public.person_relationships;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_share
  from public.contact_intro_shares cis
  where cis.id = p_share_id
    and cis.recipient_user_id = v_uid;

  if not found then
    raise exception 'contact_intro_share_not_found';
  end if;

  if v_share.status not in ('pending', 'saved') then
    raise exception 'contact_intro_share_not_active';
  end if;

  select *
  into v_row
  from public.person_relationships pr
  where pr.actor_user_id = v_uid
    and pr.person_id = v_share.person_id
    and pr.relationship_type = 'saved'
  order by pr.created_at desc
  limit 1;

  if not found then
    insert into public.person_relationships (
      actor_user_id,
      person_id,
      relationship_type,
      source_intro_share_id
    )
    values (
      v_uid,
      v_share.person_id,
      'saved',
      v_share.id
    )
    returning * into v_row;
  elsif v_row.source_intro_share_id is null then
    update public.person_relationships pr
    set source_intro_share_id = v_share.id
    where pr.relationship_id = v_row.relationship_id
      and pr.source_intro_share_id is null
    returning * into v_row;
  end if;

  update public.contact_intro_shares cis
  set
    status = 'saved',
    saved_at = coalesce(cis.saved_at, now()),
    updated_at = now()
  where cis.id = v_share.id;

  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.recipient_user_id = v_uid
    and n.kind = 'contact_intro_share'
    and n.dedupe_key = 'contact_intro_share:' || v_share.id::text;

  return v_row;
end;
$$;

comment on function public.rpc_contact_intro_share_accept_or_save(uuid) is
  'Recipient accepts a Contact Intro Share by saving the person to Hood. Creates person_relationships.saved with Intro Share provenance and does not copy contact_records.';

grant all on function public.rpc_contact_intro_share_accept_or_save(uuid) to authenticated;
grant all on function public.rpc_contact_intro_share_accept_or_save(uuid) to service_role;

create or replace function public.rpc_contact_intro_share_dismiss(
  p_share_id uuid
)
returns public.contact_intro_shares
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.contact_intro_shares;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.contact_intro_shares cis
  set
    status = 'dismissed',
    dismissed_at = coalesce(cis.dismissed_at, now()),
    updated_at = now()
  where cis.id = p_share_id
    and cis.recipient_user_id = v_uid
    and cis.status = 'pending'
  returning * into v_row;

  if not found then
    raise exception 'contact_intro_share_not_pending';
  end if;

  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.recipient_user_id = v_uid
    and n.kind = 'contact_intro_share'
    and n.dedupe_key = 'contact_intro_share:' || p_share_id::text;

  return v_row;
end;
$$;

comment on function public.rpc_contact_intro_share_dismiss(uuid) is
  'Recipient dismisses a pending Contact Intro Share.';

grant all on function public.rpc_contact_intro_share_dismiss(uuid) to authenticated;
grant all on function public.rpc_contact_intro_share_dismiss(uuid) to service_role;

create or replace function public.rpc_contact_intro_share_revoke(
  p_share_id uuid
)
returns public.contact_intro_shares
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.contact_intro_shares;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.contact_intro_shares cis
  set
    status = 'revoked',
    revoked_at = coalesce(cis.revoked_at, now()),
    updated_at = now()
  where cis.id = p_share_id
    and cis.sender_user_id = v_uid
    and cis.status = 'pending'
  returning * into v_row;

  if not found then
    raise exception 'contact_intro_share_not_pending';
  end if;

  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.recipient_user_id = v_row.recipient_user_id
    and n.kind = 'contact_intro_share'
    and n.dedupe_key = 'contact_intro_share:' || p_share_id::text;

  return v_row;
end;
$$;

comment on function public.rpc_contact_intro_share_revoke(uuid) is
  'Sender revokes a pending Contact Intro Share.';

grant all on function public.rpc_contact_intro_share_revoke(uuid) to authenticated;
grant all on function public.rpc_contact_intro_share_revoke(uuid) to service_role;

create or replace function public.rpc_validate_contact_intro_shares()
returns table (
  check_name text,
  ok boolean,
  details text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    'duplicate_pending_intro_shares'::text as check_name,
    not exists (
      select 1
      from public.contact_intro_shares
      where status = 'pending'
      group by sender_user_id, recipient_user_id, person_id
      having count(*) > 1
    ) as ok,
    'No duplicate pending Contact Intro Shares for the same sender, recipient, and person.'::text as details
  union all
  select
    'intro_saved_without_contact_record_copy'::text,
    not exists (
      select 1
      from public.contact_intro_shares cis
      join public.contact_records cr
        on cr.owner_user_id = cis.recipient_user_id
       and cr.person_id = cis.person_id
       and cr.source = 'direct_intro_share'
      where cis.status = 'saved'
    ),
    'Saving an Intro should not create contact_records with direct_intro_share provenance for the recipient.'::text
  union all
  select
    'intro_notifications_deduped'::text,
    not exists (
      select 1
      from public.notifications n
      where n.kind = 'contact_intro_share'
        and n.dedupe_key is not null
      group by n.recipient_user_id, n.kind, n.dedupe_key
      having count(*) > 1
    ),
    'Contact Intro Share notification dedupe keys are unique per recipient/kind/share.'::text;
$$;

comment on function public.rpc_validate_contact_intro_shares() is
  'Validation checks for Contact Intro Share Phase 1 invariants.';

grant all on function public.rpc_validate_contact_intro_shares() to authenticated;
grant all on function public.rpc_validate_contact_intro_shares() to service_role;
