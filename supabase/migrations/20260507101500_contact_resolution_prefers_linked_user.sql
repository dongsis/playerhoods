create or replace function public.rpc_contact_player_resolution()
returns table(
  guest_id uuid,
  display_name text,
  email text,
  phone text,
  notes text,
  gender text,
  availability_status text,
  availability_note text,
  availability_until date,
  linked_user_id uuid,
  resolution_state text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  select
    g.id as guest_id,
    g.display_name,
    g.email,
    g.phone,
    g.notes,
    g.gender,
    g.availability_status,
    g.availability_note,
    g.availability_until,
    linked.user_id as linked_user_id,
    case when linked.user_id is not null then 'linked_user'::text else 'contact_only'::text end as resolution_state
  from public.user_roster_guests urg
  join public.guests g on g.id = urg.guest_id
  join lateral (
    select cr.contact_record_id
    from public.contact_records cr
    where cr.owner_user_id = urg.owner_user_id
      and cr.guest_id = g.id
      and cr.archived_at is null
    order by cr.created_at desc
    limit 1
  ) active_contact on true
  left join lateral (
    select il.user_id
    from public.identity_links il
    where il.linked_type = 'contact'
      and il.linked_id = g.id
    order by il.created_at desc
    limit 1
  ) linked on true
  where urg.owner_user_id = auth.uid()
    and g.status = 'active'
  order by g.display_name;
end;
$$;

comment on function public.rpc_contact_player_resolution() is
  'Returns caller roster guests with gender, lightweight availability status, linked_user_id (nullable), and resolution_state (contact_only | linked_user). If a guest contact is already linked to any registered user, callers see it as linked_user so invite flows can prefer the registered-user path.';
