-- Prefer human-facing contact/link names in match participant displays.
-- Some person nodes keep generic labels such as "Contact Player"; match rosters
-- should show the linked registered profile name when available, otherwise the
-- original contact/guest name.

create or replace function public.rpc_contact_player_lookup(
  p_guest_ids uuid[]
)
returns table(
  guest_id uuid,
  person_id uuid,
  display_name text,
  avatar_url text,
  primary_sport_id integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    g.id as guest_id,
    g.person_id,
    coalesce(
      nullif(trim(lp.display_name), ''),
      nullif(trim(g.display_name), ''),
      nullif(trim(p.display_name), ''),
      g.id::text
    ) as display_name,
    coalesce(lp.avatar_url, p.avatar_url) as avatar_url,
    p.primary_sport_id
  from public.guests g
  left join public.people p
    on p.person_id = g.person_id
  left join public.identity_links il
    on il.linked_type = 'contact'
   and il.linked_id = g.id
  left join public.profiles lp
    on lp.id = coalesce(p.linked_user_id, il.user_id)
  where g.status = 'active'
    and g.id = any(coalesce(p_guest_ids, array[]::uuid[]))
    and public.can_user_view_contact_player(g.id, auth.uid());
$$;

comment on function public.rpc_contact_player_lookup(uuid[]) is
  'Scoped Contact Player lookup. Returns minimum display data only for trusted callers. Display names prefer linked registered profile, then original guest/contact name, then person fallback.';

grant all on function public.rpc_contact_player_lookup(uuid[]) to authenticated;
grant all on function public.rpc_contact_player_lookup(uuid[]) to service_role;
