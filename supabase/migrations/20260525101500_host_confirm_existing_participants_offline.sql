create or replace function public.rpc_match_host_confirm_participant_offline(
  p_match_participant_id uuid
) returns public.match_participants
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
  v_mp public.match_participants%rowtype;
  v_host_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_mp
  from public.match_participants
  where id = p_match_participant_id
    and removed_at is null
  for update;

  if not found then
    raise exception 'participant_not_found';
  end if;

  select * into v_match
  from public.matches
  where id = v_mp.match_id;

  if not found then
    raise exception 'match_not_found';
  end if;

  if v_match.status <> 'active' then
    raise exception 'match_not_active';
  end if;

  if v_match.organizer_id <> v_uid then
    raise exception 'not_match_organizer';
  end if;

  if v_mp.user_id = v_uid then
    raise exception 'cannot_host_confirm_self';
  end if;

  if v_mp.status not in ('pending', 'waiting_list') then
    raise exception 'participant_not_waiting_for_confirmation';
  end if;

  update public.match_participants
  set participant_accepted_at = coalesce(participant_accepted_at, now()),
      participant_accepted_via = case
        when participant_accepted_at is null then 'host_offline_confirmation'
        else participant_accepted_via
      end,
      confirmed_by_host_id = coalesce(confirmed_by_host_id, v_uid),
      host_confirmed_at = coalesce(host_confirmed_at, now()),
      confirmation_source = coalesce(confirmation_source, 'host_managed_offline'),
      confirmed_by_user_id = coalesce(confirmed_by_user_id, v_uid),
      confirmed_by_host_at = coalesce(confirmed_by_host_at, now()),
      confirmation_note = coalesce(confirmation_note, 'Confirmed outside PlayerHoods.'),
      manual_confirmed_by = coalesce(manual_confirmed_by, v_uid),
      org_approved_at = coalesce(org_approved_at, now()),
      org_approved_by = coalesce(org_approved_by, v_uid)
  where id = v_mp.id
  returning * into v_mp;

  perform public.match_participant_reconcile_status(v_mp.id);
  perform public.perform_match_roster_rebalance(v_match.id);
  perform public.notification_maybe_auto_form_match(v_match.id);

  select * into v_mp
  from public.match_participants
  where id = v_mp.id;

  insert into public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  select v_match.id, v_mp.id, 'host_offline_confirm', 'Confirmed by host from offline coordination.', v_uid
  where not exists (
    select 1
    from public.match_participant_actions a
    where a.match_participant_id = v_mp.id
      and a.action_type = 'host_offline_confirm'
  );

  if v_mp.user_id is not null then
    select coalesce(nullif(btrim(p.display_name), ''), 'Someone') into v_host_name
    from public.profiles p
    where p.id = v_uid;

    insert into public.notifications (
      recipient_user_id,
      kind,
      match_id,
      match_participant_id,
      actor_user_id,
      note,
      dedupe_key
    ) values (
      v_mp.user_id,
      'host_managed_confirmation',
      v_match.id,
      v_mp.id,
      v_uid,
      coalesce(v_host_name, 'Someone') || ' marked you as confirmed for this match after confirming with you outside PlayerHoods. You can update your response anytime.',
      'host_managed_confirmation:' || v_mp.id::text
    )
    on conflict (recipient_user_id, kind, dedupe_key) where dedupe_key is not null do nothing;
  end if;

  perform public.notification_enqueue_host_offline_confirmation_if_needed(v_mp.id, v_uid);

  return v_mp;
end;
$$;

comment on function public.rpc_match_host_confirm_participant_offline(uuid) is
  'Organizer-only offline confirmation for an existing match participant. Records host audit fields, reconciles roster state, and queues host-managed confirmation SMS/email when a reachable channel exists.';

grant execute on function public.rpc_match_host_confirm_participant_offline(uuid) to authenticated, service_role;
