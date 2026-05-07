create or replace function public.rpc_identity_link_accept(
  p_guest_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_guest public.guests%rowtype;
  v_email_normalized text;
  v_email_type text;
  v_linked_match_participant_count integer := 0;
  v_saved_owner_count integer := 0;
  v_owner_notification_count integer := 0;
  v_contact_link_inserted integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_guest
  from public.guests g
  where g.id = p_guest_id
    and g.status = 'active';

  if not found then
    raise exception 'guest_not_found';
  end if;

  select
    vve.email_normalized,
    vve.email_type
  into
    v_email_normalized,
    v_email_type
  from public.v_user_verified_emails vve
  where vve.user_id = v_uid
    and vve.email_normalized = lower(trim(v_guest.email))
  order by case when vve.email_type = 'auth' then 0 else 1 end
  limit 1;

  if v_email_normalized is null then
    raise exception 'review_required';
  end if;

  insert into public.identity_link_review_decisions (
    user_id,
    guest_id,
    email_normalized,
    decision,
    decided_at
  )
  values (
    v_uid,
    p_guest_id,
    v_email_normalized,
    'accepted',
    now()
  )
  on conflict (user_id, guest_id, email_normalized)
  do update set
    decision = 'accepted',
    decided_at = now();

  with inserted as (
    insert into public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
    values (
      case when v_email_type = 'profile_contact' then 'profile_contact' else 'auth' end,
      v_email_normalized,
      v_uid,
      'contact',
      p_guest_id,
      v_uid
    )
    on conflict (user_id, linked_type, linked_id) do nothing
    returning 1
  )
  select count(*)::integer
  into v_contact_link_inserted
  from inserted;

  insert into public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  select distinct
    case when v_email_type = 'profile_contact' then 'profile_contact' else 'auth' end,
    v_email_normalized,
    v_uid,
    'guest_participant',
    mp.id,
    v_uid
  from public.match_participants mp
  where mp.guest_id = p_guest_id
    and mp.removed_at is null
  on conflict (user_id, linked_type, linked_id) do nothing;

  get diagnostics v_linked_match_participant_count = row_count;

  insert into public.user_invite_circle (owner_user_id, target_user_id, source)
  select distinct
    cr.owner_user_id,
    v_uid,
    'manual'
  from public.contact_records cr
  where cr.guest_id = p_guest_id
    and cr.owner_user_id <> v_uid
  on conflict (owner_user_id, target_user_id) do nothing;

  get diagnostics v_saved_owner_count = row_count;

  if v_contact_link_inserted > 0 then
    insert into public.notifications (
      recipient_user_id,
      kind,
      match_id,
      match_participant_id,
      actor_user_id,
      note
    )
    select distinct
      cr.owner_user_id,
      'contact_joined_playerhoods',
      null,
      null,
      v_uid,
      coalesce(v_guest.display_name, 'This player') ||
        ' is now on PlayerHoods. Future invitations can go to their PlayerHoods account. Your past contact notes and match history were not deleted.'
    from public.contact_records cr
    where cr.guest_id = p_guest_id
      and cr.owner_user_id <> v_uid;

    get diagnostics v_owner_notification_count = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'guest_id', p_guest_id,
    'linked_user_id', v_uid,
    'linked_match_participant_count', v_linked_match_participant_count,
    'saved_owner_count', v_saved_owner_count,
    'owner_notification_count', v_owner_notification_count
  );
end;
$$;

comment on function public.rpc_identity_link_accept(uuid) is
  'Explicitly accepts a verified-email identity link candidate for the current user. Creates contact and guest_participant identity_links without mutating historical match_participants, and notifies contact owners the first time the link is accepted.';
