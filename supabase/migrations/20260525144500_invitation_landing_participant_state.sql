create or replace function public.rpc_email_invitation_get(p_invitation_id uuid)
returns table (
  id uuid,
  inviter_user_id uuid,
  inviter_display_name text,
  target_email text,
  target_name text,
  related_type text,
  related_id uuid,
  status text,
  magic_link_flow_status text,
  accepted_by_user_id uuid,
  accepted_at timestamptz,
  declined_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  match_summary jsonb,
  caller_email_matches boolean
)
language plpgsql
security definer
set search_path to public
as $$
declare
  v_inv public.email_invitations%rowtype;
  v_inviter_name text;
  v_match jsonb;
  v_caller_email text;
begin
  select *
  into v_inv
  from public.email_invitations ei
  where ei.id = p_invitation_id;

  if not found then
    return;
  end if;

  select p.display_name into v_inviter_name
  from public.profiles p
  where p.id = v_inv.inviter_user_id;

  v_match := null;
  if v_inv.related_type = 'match' then
    select jsonb_build_object(
      'match_id', m.id,
      'game_type', m.game_type,
      'match_date', m.match_date,
      'start_time', m.start_time,
      'club_name', c.name,
      'match_status', m.status,
      'formed_at', m.formed_at,
      'match_participant_id', mp.id,
      'participant_status', mp.status,
      'participant_removed_at', mp.removed_at,
      'participant_accepted_at', mp.participant_accepted_at,
      'participant_org_approved_at', mp.org_approved_at,
      'participant_confirmation_source', mp.confirmation_source,
      'participant_accepted_via', mp.participant_accepted_via
    ) into v_match
    from public.matches m
    left join public.venues c on c.id = m.venue_id
    left join public.match_participants mp on mp.id = v_inv.match_participant_id
    where m.id = v_inv.related_id;
  end if;

  v_caller_email := null;
  if auth.uid() is not null then
    select u.email into v_caller_email from auth.users u where u.id = auth.uid();
  end if;

  return query select
    v_inv.id,
    v_inv.inviter_user_id,
    coalesce(v_inviter_name, 'Someone'),
    v_inv.target_email,
    v_inv.target_name,
    v_inv.related_type,
    v_inv.related_id,
    v_inv.status,
    v_inv.magic_link_flow_status,
    v_inv.accepted_by_user_id,
    v_inv.accepted_at,
    v_inv.declined_at,
    v_inv.expires_at,
    v_inv.created_at,
    v_match,
    coalesce(lower(trim(v_caller_email)) = lower(trim(v_inv.target_email)), false);
end;
$$;

alter function public.rpc_email_invitation_get(uuid) owner to postgres;
grant execute on function public.rpc_email_invitation_get(uuid) to anon, authenticated, service_role;
