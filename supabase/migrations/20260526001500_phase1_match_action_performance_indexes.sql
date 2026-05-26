create index if not exists idx_mp_match_active_status_created
  on public.match_participants (match_id, status, created_at)
  where removed_at is null;

create index if not exists idx_mp_match_waiting_created
  on public.match_participants (match_id, waiting_list_at, created_at)
  where removed_at is null and status = 'waiting_list';

create index if not exists idx_mp_user_active_match
  on public.match_participants (user_id, match_id)
  where removed_at is null and user_id is not null;

create index if not exists idx_mp_guest_active_match
  on public.match_participants (guest_id, match_id)
  where removed_at is null and guest_id is not null;

create index if not exists idx_identity_links_user_linked
  on public.identity_links (user_id, linked_type, linked_id);

create index if not exists idx_notifications_recipient_match
  on public.notifications (recipient_user_id, match_id)
  where match_id is not null;

create index if not exists idx_contact_records_owner_person_active
  on public.contact_records (owner_user_id, person_id)
  where archived_at is null;

create index if not exists idx_group_contacts_created_person_active
  on public.group_contacts (created_by, person_id)
  where removed_at is null;

create index if not exists idx_guests_person_status
  on public.guests (person_id, status)
  where person_id is not null;

create index if not exists idx_group_members_user_status_group
  on public.group_members (user_id, status, group_id)
  where removed_at is null;

create index if not exists idx_group_members_group_status_user
  on public.group_members (group_id, status, user_id)
  where removed_at is null;

create index if not exists idx_matches_organizer_start
  on public.matches (organizer_id, start_at_utc);

create index if not exists idx_matches_status_start
  on public.matches (status, start_at_utc);
