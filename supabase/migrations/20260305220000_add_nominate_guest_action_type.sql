-- Fix: rpc_match_nominate_guest inserts action_type='nominate_guest' but CHECK constraint
-- did not include it. Add 'nominate_guest' to match_participant_actions_action_type_chk.

ALTER TABLE public.match_participant_actions
  DROP CONSTRAINT IF EXISTS match_participant_actions_action_type_chk;

ALTER TABLE public.match_participant_actions
  ADD CONSTRAINT match_participant_actions_action_type_chk
  CHECK (action_type = ANY (ARRAY[
    'invite', 'nominate', 'nominate_guest', 'request_join', 'reenter', 'accept', 'approve',
    'withdraw', 'decline', 'reject_request', 'revoke_invite', 'reject_nomination',
    'remove_confirmed', 'remove', 'add_guest_org', 'add_guest_participant', 'manual_confirm',
    'invited', 'nominated', 'requested', 'accepted', 'approved', 'withdrawn', 'removed',
    'guest_added', 'declined', 'delegate_manual_confirm'
  ]));
