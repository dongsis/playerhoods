create or replace function public.rpc_email_invitation_resolve_token(
  p_token text
)
returns table(invitation_id uuid)
language sql
security definer
set search_path to public
as $$
  with normalized as (
    select lower(regexp_replace(coalesce(p_token, ''), '[^0-9a-f]', '', 'g')) as token
  )
  select ei.id as invitation_id
  from public.email_invitations ei
  cross join normalized n
  where length(n.token) >= 8
    and replace(ei.id::text, '-', '') like n.token || '%'
  order by ei.created_at desc
  limit 1;
$$;

grant execute on function public.rpc_email_invitation_resolve_token(text) to anon, authenticated, service_role;
