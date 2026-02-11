-- ============================================================================
-- Slice 3 — Derived Formed + formed_at (playerhoods.com v1 Frozen)
-- File: supabase/migrations/003_slice3_formed_derived.sql
-- ============================================================================
-- - is_formed derived from confirmed_count >= required_count
-- - formed_at written once when threshold first reached
-- - match.status unchanged (no 'formed')
-- ============================================================================

begin;

-- 1) View: match_counts (confirmed_count)
create or replace view public.match_counts as
select
  m.id as match_id,
  m.required_count,
  count(*) filter (where mp.status = 'confirmed')::int as confirmed_count
from public.matches m
left join public.match_participants mp
  on mp.match_id = m.id
group by m.id, m.required_count;

-- 2) View: match_formed (derived is_formed)
create or replace view public.match_formed as
select
  mc.match_id,
  mc.required_count,
  mc.confirmed_count,
  (mc.confirmed_count >= mc.required_count) as is_formed
from public.match_counts mc;

-- 3) Trigger function: set formed_at once
create or replace function public.trg_set_formed_at_once()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required int;
  v_confirmed int;
  v_is_formed boolean;
begin
  -- Recompute for the match affected by participant change
  select m.required_count into v_required
  from public.matches m
  where m.id = new.match_id;

  select count(*)::int into v_confirmed
  from public.match_participants mp
  where mp.match_id = new.match_id
    and mp.status = 'confirmed';

  v_is_formed := (v_confirmed >= v_required);

  -- Write formed_at only once: from NULL -> now() when first formed
  if v_is_formed then
    update public.matches m
    set formed_at = coalesce(m.formed_at, now())
    where m.id = new.match_id;
  end if;

  return new;
end;
$$;

-- 4) Attach trigger on match_participants updates/inserts that could affect confirmed_count
drop trigger if exists set_formed_at_once_on_mp on public.match_participants;

create trigger set_formed_at_once_on_mp
after insert or update of status
on public.match_participants
for each row
execute function public.trg_set_formed_at_once();

commit;
