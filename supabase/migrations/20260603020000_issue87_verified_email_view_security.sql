-- Issue #87: hide auth.users-derived verified email view from public API roles.
-- The view remains available to trusted service/admin paths, while browser/server
-- app code uses a caller-scoped RPC.

create or replace function public.rpc_my_verified_emails()
returns table (
  user_id uuid,
  email_normalized text,
  email_type text,
  verified_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with auth_emails as (
    select
      u.id as user_id,
      lower(btrim(u.email::text)) as email_normalized,
      'auth'::text as email_type,
      u.email_confirmed_at as verified_at
    from auth.users u
    where u.id = auth.uid()
      and u.email is not null
      and btrim(u.email::text) <> ''
      and u.email_confirmed_at is not null
  ),
  profile_contact_emails as (
    select
      p.id as user_id,
      p.profile_contact_email_normalized as email_normalized,
      'profile_contact'::text as email_type,
      p.profile_contact_email_verified_at as verified_at
    from public.profiles p
    where p.id = auth.uid()
      and p.profile_contact_email_normalized is not null
      and p.profile_contact_email_verified_at is not null
  )
  select
    e.user_id,
    e.email_normalized,
    e.email_type,
    e.verified_at
  from auth_emails e
  union all
  select
    e.user_id,
    e.email_normalized,
    e.email_type,
    e.verified_at
  from profile_contact_emails e;
$$;

comment on function public.rpc_my_verified_emails() is
  'Caller-scoped verified email list for the current authenticated user. Replaces direct client access to v_user_verified_emails.';

revoke all on function public.rpc_my_verified_emails() from public;
revoke all on function public.rpc_my_verified_emails() from anon;
grant execute on function public.rpc_my_verified_emails() to authenticated;
grant execute on function public.rpc_my_verified_emails() to service_role;

revoke all on table public.v_user_verified_emails from public;
revoke all on table public.v_user_verified_emails from anon;
revoke all on table public.v_user_verified_emails from authenticated;
grant select on table public.v_user_verified_emails to service_role;
