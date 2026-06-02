-- Issue #72: host-facing visibility when a formed match loses a lineup player.
-- Keeps removed_at as the canonical lifecycle state and only expands Inbox notification targeting.

create or replace function public.trg_notify_delegator_on_mp_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_delegator uuid;
  v_kind text;
  v_actor uuid := auth.uid();
  v_organizer uuid;
  v_match_formed_at timestamptz;
  v_match_status public.match_status;
  v_match_required_count integer;
  v_remaining_confirmed_count integer := 0;
  v_should_notify_organizer_exit boolean := false;
begin
  -- Removed: notify delegator, notify host when a formed lineup becomes short,
  -- and notify the removed user when applicable.
  if (new.removed_at is distinct from old.removed_at) and new.removed_at is not null then
    v_kind := 'delegate_target_removed';

    select m.organizer_id, m.formed_at, m.status, m.required_count
      into v_organizer, v_match_formed_at, v_match_status, v_match_required_count
    from public.matches m
    where m.id = new.match_id;

    v_should_notify_organizer_exit :=
      v_organizer is not null
      and v_match_status = 'active'::public.match_status
      and v_match_formed_at is not null
      and new.removed_at >= v_match_formed_at
      and old.participant_accepted_at is not null
      and old.org_approved_at is not null;

    if v_should_notify_organizer_exit then
      select count(*)::integer
        into v_remaining_confirmed_count
      from public.match_participants mp
      where mp.match_id = new.match_id
        and mp.id <> new.id
        and mp.removed_at is null
        and mp.participant_accepted_at is not null
        and mp.org_approved_at is not null;

      v_should_notify_organizer_exit :=
        v_remaining_confirmed_count < coalesce(v_match_required_count, 0);
    end if;

    -- Notify delegator with the legacy kind. When the organizer is also the
    -- legacy delegator for a formed-lineup exit, the host-specific notification
    -- below replaces the ambiguous delegator row.
    if new.user_id is not null and new.manual_confirmed_by is not null then
      v_delegator := new.manual_confirmed_by;
    elsif new.user_id is not null and new.nominated_by is not null then
      v_delegator := new.nominated_by;
    elsif new.guest_id is not null then
      v_delegator := v_organizer;
    end if;

    if v_delegator is not null
      and not (v_should_notify_organizer_exit and v_delegator = v_organizer)
    then
      insert into public.notifications (
        recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
      ) values (
        v_delegator, v_kind, new.match_id, new.id, v_actor, null
      );
    end if;

    if v_should_notify_organizer_exit then
      insert into public.notifications (
        recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
      ) values (
        v_organizer, 'host_lineup_short_after_formed', new.match_id, new.id, v_actor, new.removal_note
      );
    end if;

    -- Notify the removed user (skip when self-removed).
    if new.user_id is not null and new.user_id <> v_actor then
      insert into public.notifications (
        recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
      ) values (
        new.user_id, 'removed', new.match_id, new.id, v_actor, new.removal_note
      );
    end if;

    return new;
  end if;

  -- Confirmed: notify delegator only.
  if (new.confirmed_at is distinct from old.confirmed_at) and new.confirmed_at is not null then
    v_kind := 'delegate_target_confirmed';

    if new.user_id is not null and new.manual_confirmed_by is not null then
      v_delegator := new.manual_confirmed_by;
    elsif new.user_id is not null and new.nominated_by is not null then
      v_delegator := new.nominated_by;
    elsif new.guest_id is not null then
      select organizer_id into v_delegator
      from public.matches
      where id = new.match_id;
    end if;

    if v_delegator is not null then
      insert into public.notifications (
        recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
      ) values (
        v_delegator, v_kind, new.match_id, new.id, v_actor, null
      );
    end if;
  end if;

  return new;
end;
$$;

comment on function public.trg_notify_delegator_on_mp_change() is
  'Issue #72: participant removal notifier. Preserves non-host delegator/removed-user notifications and notifies the organizer with host_lineup_short_after_formed when an active formed match becomes short after losing a canonically confirmed lineup participant.';

grant all on function public.trg_notify_delegator_on_mp_change() to anon;
grant all on function public.trg_notify_delegator_on_mp_change() to authenticated;
grant all on function public.trg_notify_delegator_on_mp_change() to service_role;

create or replace function public.rpc_validate_issue72_host_exit_visibility_notifications()
returns table(check_name text, passed boolean, details text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    'notify_function_exists'::text,
    to_regprocedure('public.trg_notify_delegator_on_mp_change()') is not null,
    'participant removal notification trigger function is installed'::text
  union all
  select
    'host_exit_logic_present'::text,
    coalesce(
      pg_get_functiondef(to_regprocedure('public.trg_notify_delegator_on_mp_change()'))
        like '%host_lineup_short_after_formed%',
      false
    ),
    'trigger function contains distinct formed-match organizer exit notification kind'::text
  union all
  select
    'host_exit_requires_active_match'::text,
    coalesce(
      pg_get_functiondef(to_regprocedure('public.trg_notify_delegator_on_mp_change()'))
        like '%v_match_status = ''active''::public.match_status%',
      false
    ),
    'organizer lineup-short notification is limited to active matches'::text
  union all
  select
    'host_exit_requires_canonical_confirmation'::text,
    coalesce(
      pg_get_functiondef(to_regprocedure('public.trg_notify_delegator_on_mp_change()'))
        like '%old.participant_accepted_at is not null%'
        and pg_get_functiondef(to_regprocedure('public.trg_notify_delegator_on_mp_change()'))
          like '%old.org_approved_at is not null%'
        and pg_get_functiondef(to_regprocedure('public.trg_notify_delegator_on_mp_change()'))
          not like '%old.status = ''confirmed''%',
      false
    ),
    'organizer lineup-short notification uses canonical confirmation timestamps, not status fallback'::text
  union all
  select
    'host_exit_requires_lineup_short'::text,
    coalesce(
      pg_get_functiondef(to_regprocedure('public.trg_notify_delegator_on_mp_change()'))
        like '%v_remaining_confirmed_count < coalesce(v_match_required_count, 0)%'
        and pg_get_functiondef(to_regprocedure('public.trg_notify_delegator_on_mp_change()'))
          like '%mp.participant_accepted_at is not null%'
        and pg_get_functiondef(to_regprocedure('public.trg_notify_delegator_on_mp_change()'))
          like '%mp.org_approved_at is not null%',
      false
    ),
    'organizer lineup-short notification requires remaining canonical lineup to be below required count'::text
  union all
  select
    'removed_at_trigger_present'::text,
    exists (
      select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'match_participants'
        and t.tgname = 'notify_delegator_on_mp_change'
        and not t.tgisinternal
    ),
    'match_participants removal/confirmation trigger exists'::text;
$$;

comment on function public.rpc_validate_issue72_host_exit_visibility_notifications() is
  'Validation helper for Issue #72 host exit visibility notification targeting.';

grant execute on function public.rpc_validate_issue72_host_exit_visibility_notifications() to authenticated;
grant execute on function public.rpc_validate_issue72_host_exit_visibility_notifications() to service_role;
