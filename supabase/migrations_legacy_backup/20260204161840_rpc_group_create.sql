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

  insert into public.groups (name, description, created_by, boundary_keeper_id)
  values (p_name, p_description, v_user_id, v_user_id)
  returning * into v_row;

  return v_row;
end;
$$;

-- Allow authenticated to call the RPC
revoke all on function public.rpc_group_create(text, text) from public;
grant execute on function public.rpc_group_create(text, text) to authenticated;

commit;
