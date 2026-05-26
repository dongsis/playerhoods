create or replace function public.rpc_match_confirm_and_notify(
  p_match_id uuid
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match_not_found';
  end if;

  if v_match.organizer_id <> v_uid then
    raise exception 'only_organizer_can_confirm_match';
  end if;

  if v_match.status <> 'active' then
    raise exception 'match_not_active';
  end if;

  if v_match.formed_at is null and not public.match_ready_to_form(p_match_id) then
    raise exception 'match_not_ready_to_form';
  end if;

  if v_match.formed_at is null then
    update public.matches
    set formed_at = now(),
        formed_by_user_id = v_uid,
        formation_source = 'manual'
    where id = p_match_id;
  end if;

  return public.notification_enqueue_confirmed_lineup_notifications_for_match(p_match_id);
end;
$$;

grant execute on function public.rpc_match_confirm_and_notify(uuid) to authenticated, service_role;
