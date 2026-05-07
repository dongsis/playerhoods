create or replace function public.rpc_complete_onboarding_legal_agreement(
  p_age_confirmation_version text,
  p_terms_version text,
  p_privacy_version text,
  p_responsible_use_version text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles
  set
    age_confirmed_at = v_now,
    age_confirmation_version = nullif(btrim(coalesce(p_age_confirmation_version, '')), ''),
    terms_accepted_at = v_now,
    terms_version = nullif(btrim(coalesce(p_terms_version, '')), ''),
    privacy_accepted_at = v_now,
    privacy_version = nullif(btrim(coalesce(p_privacy_version, '')), ''),
    responsible_use_accepted_at = v_now,
    responsible_use_version = nullif(btrim(coalesce(p_responsible_use_version, '')), ''),
    onboarding_completed = true,
    updated_at = v_now
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

comment on function public.rpc_complete_onboarding_legal_agreement(text, text, text, text) is
  'Completes the legal-agreement onboarding step for the authenticated user without requiring direct profiles UPDATE RLS.';

grant all on function public.rpc_complete_onboarding_legal_agreement(text, text, text, text) to authenticated;
grant all on function public.rpc_complete_onboarding_legal_agreement(text, text, text, text) to service_role;
