-- Drift correction: legal agreement is a required onboarding completion gate.
-- Existing completed users with missing legal timestamps are intentionally not backfilled;
-- product flow must collect real acceptance timestamps on next access.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_onboarding_completed_requires_legal'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_onboarding_completed_requires_legal
      check (
        onboarding_completed is not true
        or (
          age_confirmed_at is not null
          and terms_accepted_at is not null
          and privacy_accepted_at is not null
          and responsible_use_accepted_at is not null
        )
      ) not valid;
  end if;
end
$$;

comment on constraint profiles_onboarding_completed_requires_legal on public.profiles is
  'Prevents new onboarding completion writes unless age, terms, privacy, and responsible-use agreement timestamps are present. Added NOT VALID so historical drift can be remediated by user consent rather than silent backfill.';

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
  v_onboarding_completed boolean;
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
    updated_at = v_now
  where id = v_uid
    and onboarding_profile_completed = true
  returning onboarding_completed into v_onboarding_completed;

  if not found then
    raise exception 'onboarding_profile_incomplete';
  end if;

  return jsonb_build_object(
    'ok', true,
    'legal_agreement_completed', true,
    'onboarding_completed', coalesce(v_onboarding_completed, false)
  );
end;
$$;

comment on function public.rpc_complete_onboarding_legal_agreement(text, text, text, text) is
  'Records onboarding legal-agreement acceptance for the authenticated user without completing onboarding by itself.';

grant all on function public.rpc_complete_onboarding_legal_agreement(text, text, text, text) to authenticated;
grant all on function public.rpc_complete_onboarding_legal_agreement(text, text, text, text) to service_role;

create or replace function public.rpc_complete_onboarding_next_step()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_profile record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select
    onboarding_profile_completed,
    age_confirmed_at,
    terms_accepted_at,
    privacy_accepted_at,
    responsible_use_accepted_at
  into v_profile
  from public.profiles
  where id = v_uid
  for update;

  if not found then
    raise exception 'onboarding_profile_incomplete';
  end if;

  if v_profile.onboarding_profile_completed is not true then
    raise exception 'onboarding_profile_incomplete';
  end if;

  if v_profile.age_confirmed_at is null
    or v_profile.terms_accepted_at is null
    or v_profile.privacy_accepted_at is null
    or v_profile.responsible_use_accepted_at is null then
    raise exception 'needs_legal_agreement';
  end if;

  update public.profiles
  set
    onboarding_completed = true,
    updated_at = now()
  where id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'onboarding_completed', true
  );
end;
$$;

comment on function public.rpc_complete_onboarding_next_step() is
  'Completes onboarding only after profile and legal agreement gates are satisfied.';

grant all on function public.rpc_complete_onboarding_next_step() to authenticated;
grant all on function public.rpc_complete_onboarding_next_step() to service_role;

-- Validation:
-- 1. Identify historical drift that must be gated on next access:
-- select id, onboarding_completed, terms_accepted_at, privacy_accepted_at, age_confirmed_at, responsible_use_accepted_at
-- from public.profiles
-- where onboarding_completed = true
--   and (
--     terms_accepted_at is null
--     or privacy_accepted_at is null
--     or age_confirmed_at is null
--     or responsible_use_accepted_at is null
--   );
--
-- 2. Post-remediation target is zero, or all returned users must be redirected to onboarding legal:
-- select count(*) as completed_without_legal
-- from public.profiles
-- where onboarding_completed = true
--   and (
--     terms_accepted_at is null
--     or privacy_accepted_at is null
--     or age_confirmed_at is null
--     or responsible_use_accepted_at is null
--   );
--
-- 3. Confirm a real acceptance timestamp after a user signs:
-- select id, terms_accepted_at, privacy_accepted_at, age_confirmed_at, responsible_use_accepted_at, onboarding_completed
-- from public.profiles
-- where id = '<test_user_id>';
