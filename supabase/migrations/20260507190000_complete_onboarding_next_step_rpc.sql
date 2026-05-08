create or replace function public.rpc_complete_onboarding_next_step()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles
  set
    onboarding_completed = true,
    updated_at = now()
  where id = v_uid
    and onboarding_profile_completed = true;

  if not found then
    raise exception 'onboarding_profile_incomplete';
  end if;

  return jsonb_build_object(
    'ok', true,
    'onboarding_completed', true
  );
end;
$$;

comment on function public.rpc_complete_onboarding_next_step() is
  'Completes the final onboarding step for the authenticated user without requiring direct profiles UPDATE RLS.';

grant all on function public.rpc_complete_onboarding_next_step() to authenticated;
grant all on function public.rpc_complete_onboarding_next_step() to service_role;
