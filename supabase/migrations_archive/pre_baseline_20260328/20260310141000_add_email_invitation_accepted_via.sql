-- Allow participant_accepted_via = 'email_invitation' for email-invite accept flow

ALTER TABLE public.match_participants
  DROP CONSTRAINT IF EXISTS chk_participant_accepted_via;

ALTER TABLE public.match_participants
  ADD CONSTRAINT chk_participant_accepted_via CHECK (
    participant_accepted_via IS NULL
    OR participant_accepted_via = ANY (ARRAY['in_app'::text, 'manual'::text, 'delegate_manual'::text, 'email_invitation'::text])
  );
