create index if not exists idx_match_participants_user_id
  on public.match_participants (user_id)
  where user_id is not null;

create index if not exists idx_guests_person_id
  on public.guests (person_id)
  where person_id is not null;

create index if not exists idx_group_contacts_person_id
  on public.group_contacts (person_id)
  where person_id is not null;

create index if not exists idx_match_participants_source_person_id
  on public.match_participants (source_person_id)
  where source_person_id is not null;
