-- Fix: rpc_group_create should also add creator as active member
-- Without this, the creator cannot read the group due to RLS policy

begin;

create or replace function public.rpc_group_create(
  p_name text,
  p_description text default null
)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row public.groups;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- Create the group
  insert into public.groups (name, description, created_by, boundary_keeper_id)
  values (p_name, p_description, v_user_id, v_user_id)
  returning * into v_row;

  -- Add creator as active member (required by RLS to read the group)
  insert into public.group_members (group_id, user_id, status, join_method, accepted_at)
  values (v_row.id, v_user_id, 'active', 'created', now());

  return v_row;
end;
$$;

commit;
