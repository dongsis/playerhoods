create or replace function public.rpc_match_invite_group(p_match_id uuid, p_group_id uuid)
returns table(group_id uuid, group_name text, status text, created_at timestamptz)
language plpgsql
security definer
set search_path to public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
  v_group public.groups%rowtype;
  v_row public.match_group_invitations%rowtype;
  v_should_notify boolean := false;
  v_inviter_display_name text;
  v_contact record;
  v_mp public.match_participants%rowtype;
  v_inv public.email_invitations%rowtype;
  v_evt_id uuid;
  v_email_opted_out boolean;
  v_sms_opted_out boolean;
  v_delivery_email text;
  v_delivery_phone text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_match
  from public.matches m
  where m.id = p_match_id;

  if not found then
    raise exception 'match_not_found';
  end if;

  if v_match.organizer_id <> v_uid then
    raise exception 'not_authorized';
  end if;

  if v_match.status <> 'active' then
    raise exception 'match_not_active';
  end if;

  select *
  into v_group
  from public.groups g
  where g.id = p_group_id;

  if not found then
    raise exception 'group_not_found';
  end if;

  if v_group.primary_sport_id is not null and v_group.primary_sport_id <> v_match.sport_id then
    raise exception 'group_sport_mismatch';
  end if;

  select *
  into v_row
  from public.match_group_invitations mgi
  where mgi.match_id = p_match_id
    and mgi.group_id = p_group_id
  order by mgi.created_at desc
  limit 1;

  if found then
    v_should_notify := v_row.status <> 'active' or v_row.revoked_at is not null;

    update public.match_group_invitations mgi
    set
      invited_by_user_id = v_uid,
      status = 'active',
      revoked_at = null,
      updated_at = now()
    where mgi.id = v_row.id
    returning * into v_row;
  else
    insert into public.match_group_invitations (
      match_id,
      group_id,
      invited_by_user_id,
      status,
      created_at,
      updated_at
    )
    values (
      p_match_id,
      p_group_id,
      v_uid,
      'active',
      now(),
      now()
    )
    returning * into v_row;

    v_should_notify := true;
  end if;

  if v_should_notify then
    perform public.notify_match_group_invite_recipients(p_match_id, p_group_id, v_uid);

    select coalesce(nullif(btrim(p.display_name), ''), 'Someone')
    into v_inviter_display_name
    from public.profiles p
    where p.id = v_uid;

    for v_contact in
      with group_contact_people as (
        select distinct gc.person_id, gc.created_by
        from public.group_contacts gc
        where gc.group_id = p_group_id
          and gc.removed_at is null
      ),
      contact_guests as (
        select distinct on (gcp.person_id)
          gcp.person_id,
          g.id as guest_id,
          coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(g.display_name), ''), 'Contact Player') as display_name,
          nullif(btrim(g.email), '') as email,
          nullif(btrim(g.phone), '') as phone
        from group_contact_people gcp
        join public.people p
          on p.person_id = gcp.person_id
        join public.guests g
          on g.person_id = gcp.person_id
         and g.status = 'active'
        where p.linked_user_id is null
          and not exists (
            select 1
            from public.identity_links il
            where il.linked_type = 'contact'
              and il.linked_id = g.id
          )
        order by
          gcp.person_id,
          (g.created_by = gcp.created_by) desc,
          (nullif(btrim(g.email), '') is not null or nullif(btrim(g.phone), '') is not null) desc,
          g.created_at desc
      )
      select cg.*
      from contact_guests cg
      where not exists (
        select 1
        from public.match_participants mp
        left join public.guests existing_guest
          on existing_guest.id = mp.guest_id
        where mp.match_id = p_match_id
          and mp.removed_at is null
          and (
            mp.guest_id = cg.guest_id
            or existing_guest.person_id = cg.person_id
          )
      )
    loop
      v_email_opted_out := v_contact.email is not null
        and public.is_contact_communication_opted_out('email', v_contact.email, 'match_invites');
      v_sms_opted_out := v_contact.phone is not null
        and public.is_contact_communication_opted_out('sms', v_contact.phone, 'match_invites');
      v_delivery_email := case when v_email_opted_out then null else v_contact.email end;
      v_delivery_phone := case when v_sms_opted_out then null else v_contact.phone end;

      if v_delivery_email is null and v_delivery_phone is null then
        continue;
      end if;

      insert into public.match_participants (
        match_id,
        join_method,
        guest_id,
        created_by,
        created_at,
        nominated_by,
        participant_accepted_at,
        participant_accepted_via,
        org_approved_at,
        org_approved_by
      )
      values (
        p_match_id,
        'nominated',
        v_contact.guest_id,
        v_uid,
        now(),
        v_uid,
        null,
        null,
        now(),
        v_uid
      )
      returning * into v_mp;

      perform public.match_participant_reconcile_status(v_mp.id);
      select * into v_mp from public.match_participants where id = v_mp.id;

      insert into public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
      values (p_match_id, v_mp.id, 'nominate_guest', 'Invited via Shared Group contact', v_uid);

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
        case when v_delivery_email is not null then lower(btrim(v_delivery_email)) else null end,
        v_delivery_phone,
        v_contact.display_name,
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
          'inviter_display_name', coalesce(v_inviter_display_name, 'Someone'),
          'match_participant_id', v_inv.match_participant_id,
          'source_group_id', p_group_id
        )
      )
      returning id into v_evt_id;

      perform public.rpc_process_domain_event(v_evt_id);
    end loop;
  end if;

  return query
  select v_row.group_id, v_group.name, v_row.status, v_row.created_at;
end;
$$;

alter function public.rpc_match_invite_group(uuid, uuid) owner to postgres;

comment on function public.rpc_match_invite_group(uuid, uuid) is
  'Creates or reactivates a group-level invitation for a match, notifies active registered group members in inbox, and sends contact invitations to reachable active group contacts with opt-out enforcement.';

grant all on function public.rpc_match_invite_group(uuid, uuid) to authenticated;
grant all on function public.rpc_match_invite_group(uuid, uuid) to service_role;

-- Validation:
-- 1. Invite a group with active registered members and active group_contacts with email/phone.
-- 2. Registered members receive notifications.
-- 3. Reachable group_contacts get match_participants + email_invitations + queued notification_deliveries.
-- 4. Opted-out destinations do not get queued deliveries; fully opted-out contacts are skipped.
-- 5. Re-running an already-active group invite does not duplicate participants or invitations.
