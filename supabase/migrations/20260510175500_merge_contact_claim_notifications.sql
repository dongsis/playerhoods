create or replace function public.trg_merge_contact_claim_notifications()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_claim_id text;
  v_claim_prefix text;
  v_existing public.notifications;
  v_existing_priority integer;
  v_new_priority integer;
begin
  if new.kind not in (
    'contact_joined_playerhoods',
    'saved_contact_joined_playerhoods',
    'group_contact_joined_playerhoods',
    'match_contact_joined_playerhoods'
  ) then
    return new;
  end if;

  if new.dedupe_key is null or new.dedupe_key not like 'contact_claim:%' then
    return new;
  end if;

  v_claim_id := split_part(new.dedupe_key, ':', 2);
  if v_claim_id = '' then
    return new;
  end if;

  v_claim_prefix := 'contact_claim:' || v_claim_id || ':';
  v_new_priority := case new.kind
    when 'match_contact_joined_playerhoods' then 40
    when 'group_contact_joined_playerhoods' then 30
    when 'saved_contact_joined_playerhoods' then 20
    when 'contact_joined_playerhoods' then 10
    else 0
  end;

  select n.*
  into v_existing
  from public.notifications n
  where n.recipient_user_id = new.recipient_user_id
    and n.kind in (
      'contact_joined_playerhoods',
      'saved_contact_joined_playerhoods',
      'group_contact_joined_playerhoods',
      'match_contact_joined_playerhoods'
    )
    and n.dedupe_key like v_claim_prefix || '%'
  order by
    case n.kind
      when 'match_contact_joined_playerhoods' then 40
      when 'group_contact_joined_playerhoods' then 30
      when 'saved_contact_joined_playerhoods' then 20
      when 'contact_joined_playerhoods' then 10
      else 0
    end desc,
    n.created_at asc
  limit 1
  for update;

  if v_existing.id is null then
    return new;
  end if;

  v_existing_priority := case v_existing.kind
    when 'match_contact_joined_playerhoods' then 40
    when 'group_contact_joined_playerhoods' then 30
    when 'saved_contact_joined_playerhoods' then 20
    when 'contact_joined_playerhoods' then 10
    else 0
  end;

  update public.notifications n
  set
    kind = case when v_new_priority > v_existing_priority then new.kind else n.kind end,
    match_id = case when v_new_priority > v_existing_priority then new.match_id else coalesce(n.match_id, new.match_id) end,
    match_participant_id = case when v_new_priority > v_existing_priority then new.match_participant_id else coalesce(n.match_participant_id, new.match_participant_id) end,
    actor_user_id = coalesce(new.actor_user_id, n.actor_user_id),
    note = case when v_new_priority > v_existing_priority then new.note else n.note end,
    dedupe_key = v_claim_prefix || 'summary'
  where n.id = v_existing.id;

  return null;
end;
$$;

drop trigger if exists trg_merge_contact_claim_notifications on public.notifications;

create trigger trg_merge_contact_claim_notifications
before insert on public.notifications
for each row
execute function public.trg_merge_contact_claim_notifications();

with contact_claim_notifications as (
  select
    n.*,
    split_part(n.dedupe_key, ':', 2) as claim_id,
    case n.kind
      when 'match_contact_joined_playerhoods' then 40
      when 'group_contact_joined_playerhoods' then 30
      when 'saved_contact_joined_playerhoods' then 20
      when 'contact_joined_playerhoods' then 10
      else 0
    end as priority
  from public.notifications n
  where n.kind in (
      'contact_joined_playerhoods',
      'saved_contact_joined_playerhoods',
      'group_contact_joined_playerhoods',
      'match_contact_joined_playerhoods'
    )
    and n.dedupe_key like 'contact_claim:%'
),
ranked as (
  select
    c.*,
    row_number() over (
      partition by c.recipient_user_id, c.claim_id
      order by c.priority desc, c.created_at asc, c.id asc
    ) as rn,
    bool_or(c.read_at is null) over (
      partition by c.recipient_user_id, c.claim_id
    ) as has_unread
  from contact_claim_notifications c
),
winners as (
  select *
  from ranked
  where rn = 1
)
update public.notifications n
set
  dedupe_key = 'contact_claim:' || w.claim_id || ':summary',
  read_at = case when w.has_unread then null else n.read_at end
from winners w
where n.id = w.id;

with contact_claim_notifications as (
  select
    n.id,
    split_part(n.dedupe_key, ':', 2) as claim_id,
    case n.kind
      when 'match_contact_joined_playerhoods' then 40
      when 'group_contact_joined_playerhoods' then 30
      when 'saved_contact_joined_playerhoods' then 20
      when 'contact_joined_playerhoods' then 10
      else 0
    end as priority,
    n.recipient_user_id,
    n.created_at
  from public.notifications n
  where n.kind in (
      'contact_joined_playerhoods',
      'saved_contact_joined_playerhoods',
      'group_contact_joined_playerhoods',
      'match_contact_joined_playerhoods'
    )
    and n.dedupe_key like 'contact_claim:%'
),
ranked as (
  select
    c.id,
    row_number() over (
      partition by c.recipient_user_id, c.claim_id
      order by c.priority desc, c.created_at asc, c.id asc
    ) as rn
  from contact_claim_notifications c
)
delete from public.notifications n
using ranked r
where n.id = r.id
  and r.rn > 1;
