-- Owner-created Contact Players should be saved by the owner by default.
-- This keeps the Contacts tab star state aligned with ownership and makes existing
-- owner contacts available wherever saved contact relationships are used.

insert into public.person_relationships (
  actor_user_id,
  person_id,
  relationship_type
)
select distinct
  cr.owner_user_id,
  cr.person_id,
  'saved'
from public.contact_records cr
where cr.owner_user_id is not null
  and cr.person_id is not null
  and not exists (
    select 1
    from public.person_relationships pr
    where pr.actor_user_id = cr.owner_user_id
      and pr.person_id = cr.person_id
      and pr.relationship_type = 'saved'
  );

create or replace function public.rpc_roster_guest_create(
  p_display_name text,
  p_email text default null::text,
  p_phone text default null::text,
  p_notes text default null::text,
  p_gender text default null::text,
  p_availability_status text default null::text,
  p_availability_note text default null::text,
  p_availability_until text default null::text
)
returns public.guests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_guest public.guests;
  v_person_id uuid;
  v_matched_user_id uuid;
  v_norm_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_norm_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_gender text := coalesce(nullif(lower(trim(coalesce(p_gender, ''))), ''), 'unspecified');
  v_availability_status text := coalesce(nullif(lower(trim(coalesce(p_availability_status, ''))), ''), 'available');
  v_availability_until date := null;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_display_name is null or btrim(p_display_name) = '' then
    raise exception 'display_name_required';
  end if;

  if v_gender <> all (array['male'::text, 'female'::text, 'unspecified'::text]) then
    raise exception 'invalid_gender';
  end if;

  if v_availability_status not in ('available', 'busy', 'away', 'inactive') then
    raise exception 'invalid_availability_status';
  end if;

  if nullif(trim(coalesce(p_availability_until, '')), '') is not null then
    begin
      v_availability_until := trim(p_availability_until)::date;
    exception
      when others then
        raise exception 'invalid_availability_until';
    end;
  end if;

  if v_norm_email is not null then
    select u.id
    into v_matched_user_id
    from auth.users u
    where lower(trim(u.email::text)) = v_norm_email
    limit 1;
  end if;

  if v_matched_user_id is not null then
    v_person_id := public.resolve_person_id_for_user(v_matched_user_id);
  end if;

  if v_person_id is null then
    select g.person_id
    into v_person_id
    from public.guests g
    where g.person_id is not null
      and (
        (v_norm_email is not null and lower(trim(coalesce(g.email, ''))) = v_norm_email)
        or (
          v_norm_phone is not null
          and regexp_replace(coalesce(g.phone, ''), '\D', '', 'g') = v_norm_phone
        )
      )
    order by g.created_at
    limit 1;
  end if;

  if v_person_id is null then
    insert into public.people (
      person_type,
      display_name,
      linked_user_id,
      status
    )
    values (
      case when v_matched_user_id is not null then 'linked_hybrid' else 'limited_contact' end,
      btrim(p_display_name),
      v_matched_user_id,
      'active'
    )
    returning person_id into v_person_id;
  end if;

  insert into public.guests(
    display_name,
    email,
    phone,
    notes,
    gender,
    availability_status,
    availability_note,
    availability_until,
    status,
    created_by,
    created_at,
    person_id
  )
  values (
    btrim(p_display_name),
    p_email,
    p_phone,
    p_notes,
    v_gender,
    v_availability_status,
    nullif(trim(p_availability_note), ''),
    v_availability_until,
    'active',
    auth.uid(),
    now(),
    v_person_id
  )
  returning * into v_guest;

  insert into public.user_roster_guests(
    owner_user_id,
    guest_id,
    created_by,
    created_at
  )
  select
    auth.uid(),
    v_guest.id,
    auth.uid(),
    now()
  where not exists (
    select 1
    from public.user_roster_guests urg
    where urg.owner_user_id = auth.uid()
      and urg.guest_id = v_guest.id
  );

  insert into public.contact_records (
    owner_user_id,
    person_id,
    guest_id,
    raw_name,
    raw_phone,
    raw_email,
    owner_notes,
    source
  )
  values (
    auth.uid(),
    v_person_id,
    v_guest.id,
    v_guest.display_name,
    v_guest.phone,
    v_guest.email,
    v_guest.notes,
    'manual'
  );

  insert into public.person_relationships (actor_user_id, person_id, relationship_type)
  select auth.uid(), v_person_id, relationship_type
  from (values ('direct_contact'), ('saved')) as relationships(relationship_type)
  where not exists (
    select 1
    from public.person_relationships pr
    where pr.actor_user_id = auth.uid()
      and pr.person_id = v_person_id
      and pr.relationship_type = relationships.relationship_type
  );

  return v_guest;
end;
$$;

comment on function public.rpc_roster_guest_create(text, text, text, text, text, text, text, text) is
'Create a Contact Player private record and link it to the canonical person layer. Owner-created contacts are direct_contact and saved by default so the owner star/saved state is consistent.';

grant all on function public.rpc_roster_guest_create(text, text, text, text, text, text, text, text) to anon;
grant all on function public.rpc_roster_guest_create(text, text, text, text, text, text, text, text) to authenticated;
grant all on function public.rpc_roster_guest_create(text, text, text, text, text, text, text, text) to service_role;
