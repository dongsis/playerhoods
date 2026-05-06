alter table public.profiles
  add column if not exists profile_contact_email_normalized text,
  add column if not exists profile_contact_email_verified_at timestamptz;

comment on column public.profiles.profile_contact_email_normalized is
  'Canonical normalized form of the user-managed profile contact email. Derived from profiles.contact_email.';

comment on column public.profiles.profile_contact_email_verified_at is
  'Timestamp when the user-managed profile contact email became verified for identity-linking use.';

update public.profiles
set profile_contact_email_normalized = nullif(lower(btrim(contact_email)), '')
where profile_contact_email_normalized is distinct from nullif(lower(btrim(contact_email)), '');

update public.profiles p
set profile_contact_email_verified_at = u.email_confirmed_at
from auth.users u
where u.id = p.id
  and u.email_confirmed_at is not null
  and p.profile_contact_email_normalized is not null
  and p.profile_contact_email_normalized = lower(btrim(u.email::text))
  and p.profile_contact_email_verified_at is null;

create index if not exists idx_profiles_profile_contact_email_normalized
  on public.profiles (profile_contact_email_normalized);

create index if not exists idx_profiles_profile_contact_email_verified_at
  on public.profiles (profile_contact_email_verified_at)
  where profile_contact_email_verified_at is not null;

create or replace view public.v_user_verified_emails as
with auth_emails as (
  select
    u.id as user_id,
    lower(btrim(u.email::text)) as email_normalized,
    'auth'::text as email_type,
    u.email_confirmed_at as verified_at
  from auth.users u
  where u.email is not null
    and btrim(u.email::text) <> ''
    and u.email_confirmed_at is not null
),
profile_contact_emails as (
  select
    p.id as user_id,
    p.profile_contact_email_normalized as email_normalized,
    'profile_contact'::text as email_type,
    p.profile_contact_email_verified_at as verified_at
  from public.profiles p
  where p.profile_contact_email_normalized is not null
    and p.profile_contact_email_verified_at is not null
)
select
  e.user_id,
  e.email_normalized,
  e.email_type,
  e.verified_at
from auth_emails e
union all
select
  e.user_id,
  e.email_normalized,
  e.email_type,
  e.verified_at
from profile_contact_emails e;

comment on view public.v_user_verified_emails is
  'App-facing verified email set for a registered user. Includes verified auth email and verified profile contact email.';

grant select on public.v_user_verified_emails to authenticated;
grant select on public.v_user_verified_emails to service_role;

create or replace function public.rpc_profile_update(
  p_first_name text default null,
  p_last_name text default null,
  p_contact_channel text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_show_in_club_member_discovery boolean default null,
  p_allow_non_group_invites boolean default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_auth_email_normalized text;
  v_auth_email_verified_at timestamptz;
  v_profile_contact_email text;
  v_profile_contact_email_normalized text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select
    nullif(lower(btrim(u.email::text)), ''),
    u.email_confirmed_at
  into
    v_auth_email_normalized,
    v_auth_email_verified_at
  from auth.users u
  where u.id = auth.uid();

  v_profile_contact_email := case
    when p_contact_email is not null then nullif(btrim(p_contact_email), '')
    else null
  end;

  v_profile_contact_email_normalized := case
    when p_contact_email is not null then nullif(lower(btrim(p_contact_email)), '')
    else null
  end;

  update public.profiles
  set
    first_name = coalesce(p_first_name, first_name),
    last_name = coalesce(p_last_name, last_name),
    contact_channel = case when p_contact_channel is not null then p_contact_channel else contact_channel end,
    contact_email = case when p_contact_email is not null then v_profile_contact_email else contact_email end,
    contact_phone = case when p_contact_phone is not null then nullif(trim(p_contact_phone), '') else contact_phone end,
    profile_contact_email_normalized = case
      when p_contact_email is not null then v_profile_contact_email_normalized
      else profile_contact_email_normalized
    end,
    profile_contact_email_verified_at = case
      when p_contact_email is null then profile_contact_email_verified_at
      when v_profile_contact_email_normalized is null then null
      when v_auth_email_verified_at is not null
        and v_profile_contact_email_normalized = v_auth_email_normalized
        then v_auth_email_verified_at
      else null
    end,
    show_in_club_member_discovery = case
      when p_show_in_club_member_discovery is not null then p_show_in_club_member_discovery
      else show_in_club_member_discovery
    end,
    allow_non_group_invites = case
      when p_allow_non_group_invites is not null then p_allow_non_group_invites
      else allow_non_group_invites
    end,
    updated_at = now()
  where id = auth.uid();
end;
$$;

comment on function public.rpc_profile_update(
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean
) is 'Updates profile fields and maintains profile contact email normalized / verified metadata. A changed profile contact email is only identity-link verified when it exactly matches the user''s verified auth email.';

create or replace function public.rpc_reconcile_identity_after_magic_link(
  p_user_id uuid,
  p_verified_email text,
  p_invitation_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text := nullif(lower(trim(p_verified_email)), '');
begin
  if v_email is null or p_user_id is null then
    return;
  end if;

  insert into public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  values ('auth', v_email, p_user_id, 'invitation_target', p_invitation_id, p_user_id)
  on conflict (user_id, linked_type, linked_id) do nothing;

  insert into public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  select distinct
    'auth',
    v_email,
    p_user_id,
    'guest_participant',
    mp.id,
    p_user_id
  from public.match_participants mp
  join public.guests g on g.id = mp.guest_id
  where lower(trim(g.email)) = v_email
    and mp.removed_at is null
  on conflict (user_id, linked_type, linked_id) do nothing;
end;
$$;

comment on function public.rpc_reconcile_identity_after_magic_link(uuid, text, uuid) is
  'Links invitation target and guest participants to a user after verified auth-email signup. Uses verified auth email only.';

create or replace function public.rpc_reconcile_identity_guest_participants()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  insert into public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  select distinct
    case when vve.email_type = 'profile_contact' then 'profile_contact' else 'auth' end,
    vve.email_normalized,
    v_uid,
    'guest_participant',
    mp.id,
    v_uid
  from public.v_user_verified_emails vve
  join public.match_participants mp on mp.removed_at is null
  join public.guests g on g.id = mp.guest_id
  where vve.user_id = v_uid
    and lower(trim(g.email)) = vve.email_normalized
  on conflict (user_id, linked_type, linked_id) do nothing;

  insert into public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  select distinct
    case when vve.email_type = 'profile_contact' then 'profile_contact' else 'auth' end,
    vve.email_normalized,
    v_uid,
    'contact',
    g.id,
    v_uid
  from public.v_user_verified_emails vve
  join public.guests g
    on lower(trim(g.email)) = vve.email_normalized
  where vve.user_id = v_uid
  on conflict (user_id, linked_type, linked_id) do nothing;
end;
$$;

comment on function public.rpc_reconcile_identity_guest_participants() is
  'Links guest participants and contact guests to the current user using the user''s verified email set (auth email plus verified profile contact email).';

create or replace function public.rpc_player_search_by_contact_info(
  p_query text
) returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  match_type text,
  is_saved boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := nullif(lower(btrim(coalesce(p_query, ''))), '');
  v_phone text := public.normalize_discovery_phone(p_query);
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_email is null and v_phone is null then
    return;
  end if;

  if v_email is not null and position('@' in v_email) > 0 then
    return query
    select
      p.id as user_id,
      p.display_name,
      p.avatar_url,
      'email'::text as match_type,
      exists (
        select 1
        from public.user_invite_circle uic
        where uic.owner_user_id = v_uid
          and uic.target_user_id = p.id
      ) as is_saved
    from public.profiles p
    where p.id <> v_uid
      and p.searchable_by_contact_info = true
      and exists (
        select 1
        from public.v_user_verified_emails vve
        where vve.user_id = p.id
          and vve.email_normalized = v_email
      )
    order by lower(coalesce(nullif(btrim(p.display_name), ''), p.id::text))
    limit 10;
    return;
  end if;

  if v_phone is null then
    return;
  end if;

  return query
  select
    p.id as user_id,
    p.display_name,
    p.avatar_url,
    'phone'::text as match_type,
    exists (
      select 1
      from public.user_invite_circle uic
      where uic.owner_user_id = v_uid
        and uic.target_user_id = p.id
    ) as is_saved
  from public.profiles p
  join auth.users u
    on u.id = p.id
  where p.id <> v_uid
    and p.searchable_by_contact_info = true
    and public.normalize_discovery_phone(coalesce(nullif(btrim(p.contact_phone), ''), u.phone::text)) = v_phone
  order by lower(coalesce(nullif(btrim(p.display_name), ''), p.id::text))
  limit 10;
end;
$$;

comment on function public.rpc_player_search_by_contact_info(text) is
  'Exact Email / Phone Search for registered users. Email matching uses the user''s verified email set via v_user_verified_emails. Phone matching remains exact normalized phone match.';
