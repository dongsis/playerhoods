-- Allow confirmed participants to create their own public signup link for a match.
-- Attribution remains server-side via public_match_signup_links.created_by.

drop index if exists public.uq_public_match_signup_links_active_match;

create unique index if not exists uq_public_match_signup_links_active_match_created_by
  on public.public_match_signup_links(match_id, created_by)
  where disabled_at is null;

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
  v_is_confirmed_participant boolean := false;
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

  if v_match.status <> 'active' then
    raise exception 'match_not_active';
  end if;

  select exists (
    select 1
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.user_id = v_uid
      and mp.status = 'confirmed'
      and mp.removed_at is null
  ) into v_is_confirmed_participant;

  if v_match.organizer_id <> v_uid and not v_is_confirmed_participant then
    raise exception 'not_match_organizer_or_confirmed_participant';
  end if;

  select * into v_link
  from public.public_match_signup_links l
  where l.match_id = p_match_id
    and l.created_by = v_uid
    and l.disabled_at is null
  order by l.created_at desc
  limit 1;

  if not found then
    insert into public.public_match_signup_links(match_id, created_by)
    values (p_match_id, v_uid)
    on conflict do nothing
    returning * into v_link;

    if v_link.id is null then
      select * into v_link
      from public.public_match_signup_links l
      where l.match_id = p_match_id
        and l.created_by = v_uid
        and l.disabled_at is null
      order by l.created_at desc
      limit 1;
    end if;
  end if;

  if v_link.id is null then
    raise exception 'public_signup_link_not_created';
  end if;

  return query
  select v_link.id, v_link.match_id, v_link.public_token, v_link.enabled_at, v_link.disabled_at;
end;
$$;

revoke execute on function public.rpc_public_match_signup_link_get_or_create(uuid) from public;
revoke execute on function public.rpc_public_match_signup_link_get_or_create(uuid) from anon;
grant execute on function public.rpc_public_match_signup_link_get_or_create(uuid) to authenticated;
grant execute on function public.rpc_public_match_signup_link_get_or_create(uuid) to service_role;
