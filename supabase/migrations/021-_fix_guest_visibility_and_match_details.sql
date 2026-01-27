begin;

-- =========================
-- 1) 统一：重建 helper function（SECURITY DEFINER）
-- =========================
create or replace function public.can_view_match_guest_in_match(p_guest_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- (1) guest creator
    exists (
      select 1
      from public.match_guests g
      where g.id = p_guest_id
        and g.created_by = p_user_id
    )

    -- (2) match organizer / creator of match where this guest participates
    or exists (
      select 1
      from public.match_participants mp
      join public.matches m on m.id = mp.match_id
      where mp.guest_id = p_guest_id
        and (m.organizer_id = p_user_id or m.created_by = p_user_id)
    )

    -- (3) legacy participant (confirmed) in same match as guest
    or exists (
      select 1
      from public.match_participants mp_guest
      join public.participants p_user on p_user.match_id = mp_guest.match_id
      where mp_guest.guest_id = p_guest_id
        and p_user.user_id = p_user_id
        and p_user.state = 'confirmed'
    )

    -- (4) new participant (match_participants user row) in same match as guest
    or exists (
      select 1
      from public.match_participants mp_guest
      join public.match_participants mp_user
        on mp_user.match_id = mp_guest.match_id
      where mp_guest.guest_id = p_guest_id
        and mp_user.user_id = p_user_id
    );
$$;

revoke all on function public.can_view_match_guest_in_match(uuid, uuid) from public;
grant execute on function public.can_view_match_guest_in_match(uuid, uuid) to authenticated;

-- =========================
-- 2) 清理：删掉 match_guests 上所有 SELECT policy（只留一个最终版）
-- =========================
do $$
declare r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname='public'
      and tablename='match_guests'
      and cmd='SELECT'
  loop
    execute format('drop policy if exists %I on public.match_guests;', r.policyname);
  end loop;
end $$;

-- 最终 SELECT policy
create policy match_guests_select_visible
on public.match_guests
for select
to authenticated
using (
  public.can_view_match_guest_in_match(match_guests.id, auth.uid())
);

-- =========================
-- 3) 修复 match_details.confirmed_count：把 guest_count 加进去
-- =========================
drop view if exists public.match_details;

create view public.match_details as
select
  m.*,
  coalesce(p.confirmed_count, 0) + coalesce(g.guest_count, 0) as confirmed_count,
  (coalesce(p.confirmed_count, 0) + coalesce(g.guest_count, 0)) >= m.required_count as is_full,
  m.time_status = 'finalized' and m.venue_status = 'finalized' as is_finalized,
  (coalesce(p.confirmed_count, 0) + coalesce(g.guest_count, 0)) >= m.required_count
    and m.time_status = 'finalized'
    and m.venue_status = 'finalized' as is_formed,
  pr.display_name as organizer_name
from public.matches m
left join (
  select match_id, count(*) as confirmed_count
  from public.participants
  where state = 'confirmed'
  group by match_id
) p on p.match_id = m.id
left join (
  select match_id, count(*) as guest_count
  from public.match_participants
  where guest_id is not null
  group by match_id
) g on g.match_id = m.id
left join public.profiles pr on pr.id = m.organizer_id;

commit;
