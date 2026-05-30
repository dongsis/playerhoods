-- Keep Contact Player display lookups read-only.
-- rpc_contact_player_lookup and rpc_contact_player_lookup_v2 are STABLE read RPCs;
-- this helper must not call resolve_person_id_for_guest(), which may create a
-- person row and update the guest record.

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

  v_person_id := public.find_person_id_for_guest(p_guest_id);

  if v_person_id is not null then
    return public.can_user_request_match_proxy_for_guest(p_guest_id, p_actor_user_id)
      or exists (
        select 1
        from public.contact_intro_shares cis
        where cis.recipient_user_id = p_actor_user_id
          and cis.person_id = v_person_id
          and cis.status in ('pending', 'saved')
      );
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
      from public.matches m
      join public.match_participants mp_guest
        on mp_guest.match_id = m.id
       and mp_guest.guest_id = p_guest_id
       and mp_guest.removed_at is null
      where m.organizer_id = p_actor_user_id
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
    );
end;
$$;

comment on function public.can_user_view_contact_player(uuid, uuid) is
  'Returns true when the caller can view minimum Contact Player display data through read-only trust paths. Does not create person rows or update guests.';

grant all on function public.can_user_view_contact_player(uuid, uuid) to authenticated;
grant all on function public.can_user_view_contact_player(uuid, uuid) to service_role;
