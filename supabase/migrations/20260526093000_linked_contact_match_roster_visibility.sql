-- Linked Contact Players can arrive at a match through an older guest/contact
-- participant row. Treat those linked guest identities as match-associated when
-- resolving minimum roster display names for other Contact Players in the same
-- match. This keeps roster names visible without exposing private channel data.

create or replace function public.can_user_request_match_proxy_for_guest(
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

  v_person_id := public.find_person_id_for_guest(p_guest_id);
  if v_person_id is null then
    return false;
  end if;

  return
    exists (
      select 1
      from public.user_roster_guests urg
      where urg.owner_user_id = p_actor_user_id
        and urg.guest_id = p_guest_id
    )
    or exists (
      select 1
      from public.person_relationships pr
      where pr.actor_user_id = p_actor_user_id
        and pr.person_id = v_person_id
        and pr.relationship_type in ('saved', 'direct_contact', 'group_contact')
    )
    or exists (
      select 1
      from public.group_contacts gc
      join public.group_members gm
        on gm.group_id = gc.group_id
       and gm.user_id = p_actor_user_id
       and gm.status = 'active'
       and gm.accepted_at is not null
       and gm.removed_at is null
      where gc.person_id = v_person_id
        and gc.removed_at is null
    )
    or exists (
      select 1
      from public.match_participants mp_actor
      join public.match_participants mp_guest
        on mp_guest.match_id = mp_actor.match_id
       and mp_guest.guest_id = p_guest_id
       and mp_guest.removed_at is null
      left join public.guests actor_guest
        on actor_guest.id = mp_actor.guest_id
      left join public.people actor_person
        on actor_person.person_id = actor_guest.person_id
      where mp_actor.removed_at is null
        and (
          mp_actor.user_id = p_actor_user_id
          or actor_person.linked_user_id = p_actor_user_id
          or exists (
            select 1
            from public.identity_links il_participant
            where il_participant.linked_type = 'guest_participant'
              and il_participant.linked_id = mp_actor.id
              and il_participant.user_id = p_actor_user_id
          )
          or (
            mp_actor.guest_id is not null
            and exists (
              select 1
              from public.identity_links il_contact
              where il_contact.linked_type = 'contact'
                and il_contact.linked_id = mp_actor.guest_id
                and il_contact.user_id = p_actor_user_id
            )
          )
        )
    )
    or exists (
      select 1
      from public.matches m
      join public.match_participants mp_guest
        on mp_guest.match_id = m.id
       and mp_guest.guest_id = p_guest_id
       and mp_guest.removed_at is null
      where m.organizer_id = p_actor_user_id
    )
    or exists (
      select 1
      from public.people p
      where p.person_id = v_person_id
        and p.linked_user_id = p_actor_user_id
    )
    or public.is_active_match_proxy_for_person(v_person_id, p_actor_user_id);
end;
$$;

comment on function public.can_user_request_match_proxy_for_guest(uuid, uuid) is
  'Returns true when a user has trusted access to minimum Contact Player display data/proxy request context. Includes linked guest/contact participant identities as same-match association.';

grant all on function public.can_user_request_match_proxy_for_guest(uuid, uuid) to authenticated;
grant all on function public.can_user_request_match_proxy_for_guest(uuid, uuid) to service_role;
