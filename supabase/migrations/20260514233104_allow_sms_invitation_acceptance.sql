alter table public.match_participants
  drop constraint if exists chk_participant_accepted_via;

alter table public.match_participants
  add constraint chk_participant_accepted_via
  check (
    participant_accepted_via is null
    or participant_accepted_via = any (array[
      'in_app'::text,
      'manual'::text,
      'delegate_manual'::text,
      'email_invitation'::text,
      'sms_invitation'::text,
      'proxy'::text
    ])
  );

comment on constraint chk_participant_accepted_via on public.match_participants is
  'Allowed participant acceptance sources, including public SMS invitation links.';
