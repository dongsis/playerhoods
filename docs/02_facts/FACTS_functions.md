# Database Facts: Functions - Current Index

**Status:** current active index  
**Scope:** public functions and helpers actively used by the current Contact Player / Match Proxy model  
**Last updated:** 2026-04-10

This file is intentionally concise. It is not a historical dump of every function name that ever existed.

Current truth sources for match behavior:

- `docs/01_authority/Contact_Player_and_Match_Proxy_Canonical_v1_2.md`
- `docs/01_authority/Match_Participant_Lifecycle_Canonical.md`
- `docs/03_specs/Match_Participation_Flows_and_Scope.md`
- post-baseline migrations in `supabase/migrations/`

---

## Match Public RPCs

### Create and discovery

- `public.rpc_match_create(...) -> matches`
  Current create entry point. Creates the match and auto-adds organizer as confirmed participant.

- `public.rpc_match_admission_targets(p_match_id uuid, p_search text) -> table`
  Unified read model for user and Contact Player direct-invite targets.

### Admission

- `public.rpc_match_request_join(p_match_id uuid) -> match_participants`
  Self request-join path for registered users.

- `public.rpc_match_admit_user(p_match_id uuid, p_target_user_id uuid) -> match_participants`
  Canonical user admission write path.

- `public.rpc_match_invite_user(p_match_id uuid, p_user_id uuid) -> match_participants`
  Organizer-only thin wrapper around `rpc_match_admit_user`.

- `public.rpc_match_nominate_user(p_match_id uuid, p_user_id uuid) -> match_participants`
  Non-organizer thin wrapper around `rpc_match_admit_user`.

- `public.rpc_match_nominate_guest(p_match_id uuid, p_guest_id uuid) -> match_participants`
  Canonical Contact Player direct-invite admission write path.

### Participant-side self-service and proxy-service

- `public.rpc_match_accept_invite(p_match_id uuid) -> match_participants`
  Self participant-side confirmation for registered users.

- `public.rpc_email_invitation_accept_as_guest(p_invitation_id uuid) -> email_invitations`
  Contact Player self accept through a private invitation link without registration.

- `public.rpc_email_invitation_decline_as_guest(p_invitation_id uuid, p_system_actor_id uuid) -> email_invitations`
  Contact Player self decline through a private invitation link without registration.

- `public.rpc_match_proxy_confirm_participant(p_match_participant_id uuid) -> match_participants`
  Canonical proxy-side participant confirmation RPC.

- `public.rpc_match_org_approve_participant(p_match_participant_id uuid) -> match_participants`
  Organizer-side approval.

### Exit

- `public.rpc_match_user_withdraw(p_match_id uuid) -> match_participants`
  Self withdraw / decline / leave.

- `public.rpc_match_remove_participant(p_match_participant_id uuid) -> match_participants`
  Organizer removal.

### Contact Player / person / proxy support

- `public.rpc_contact_player_resolution() -> table`
  Owner-facing Contact Player resolution view over private contact records and linked identities.

- `public.rpc_group_add_contact_player(p_group_id uuid, p_guest_id uuid) -> group_contacts`
  Add a Contact Player to a group as a limited group contact.

- `public.rpc_group_contact_list(p_group_id uuid) -> table`
  List visible Contact Player group contacts.

- `public.rpc_contact_player_save(p_guest_id uuid, p_source text, p_group_id uuid, p_match_id uuid) -> person_relationships`
  Save a Contact Player person node after owner, shared-match, or group-contact exposure.

- `public.rpc_match_proxy_request_self(p_proxy_user_id uuid) -> person_match_proxies`
  Registered-user principal requests a pending Match Proxy binding for themselves and triggers verification email delivery.

- `public.rpc_match_proxy_revoke_self(p_binding_id uuid) -> person_match_proxies`
  Registered-user principal revokes an active self binding.

- `public.rpc_match_proxy_request_contact_player(p_guest_id uuid) -> person_match_proxies`
  Create a pending Match Proxy binding request for a Contact Player principal and send verification.

- `public.rpc_match_proxy_manageable_participants(p_match_id uuid) -> table`
  Read model listing which match participants are manageable by the current active proxy.

- `public.rpc_match_proxy_decline_participant(p_match_participant_id uuid) -> match_participants`
  Proxy-side decline of an invited or pending participant row with provenance.

- `public.rpc_match_proxy_withdraw_participant(p_match_participant_id uuid) -> match_participants`
  Proxy-side withdraw of a confirmed participant row with provenance.

### Read helpers still used by app flows

- `public.rpc_match_participant_display_names(p_match_id uuid, p_participant_ids uuid[]) -> table`
- `public.rpc_match_participant_email(p_match_participant_id uuid) -> text`
- `public.rpc_match_participant_emails_for_notification(p_match_id uuid) -> table`
- `public.rpc_match_confirmed_participant_emails(p_match_id uuid) -> table`

---

## Match Internal Helpers

- `public.apply_participant_admission(...) -> match_participants`
  Internal user-admission write core used by `request_join` and `admit_user`.

- `public.apply_participant_acceptance(...) -> void`
  Internal participant-acceptance write core used by self accept and proxy confirm paths.

- `public.apply_participant_exit(...) -> match_participants`
  Internal exit write core used by `user_withdraw` and `remove_participant`.

- `public.match_participant_reconcile_status(p_mp_id uuid) -> void`
  Sole status derivation function.

- `public.is_user_match_associated(p_match_id uuid, p_user_id uuid) -> boolean`
  Caller-gate helper. Self-withdrawn users remain match-associated; organizer-removed users do not.

- `public.can_admit_user_to_match(p_match_id uuid, p_actor_id uuid, p_target_user_id uuid) -> boolean`
  Canonical predicate for user admission.

- `public.fn_match_detail_change_reconfirm() -> trigger`
  Trigger function that resets confirmed non-organizer participants to pending after match detail changes.

- `public.resolve_person_id_for_user(p_user_id uuid) -> uuid`
  Resolve a registered user into the canonical person node.

- `public.resolve_person_id_for_guest(p_guest_id uuid) -> uuid`
  Resolve a Contact Player contact record into the canonical person node.

- `public.is_active_match_proxy_for_participant(p_match_participant_id uuid, p_proxy_user_id uuid) -> boolean`
  Canonical authority check for participant-side proxy actions.

---

## Current Match Function Families

### Admission family

- Public RPCs:
  - `rpc_match_request_join`
  - `rpc_match_admit_user`
  - `rpc_match_invite_user`
  - `rpc_match_nominate_user`
  - `rpc_match_nominate_guest`
- Internal write core:
  - `apply_participant_admission`

Note:

- `apply_participant_admission` covers registered-user admission.
- `rpc_match_nominate_guest` remains the Contact Player direct-invite write path.

### Acceptance family

- Public RPCs:
  - `rpc_match_accept_invite`
  - `rpc_email_invitation_accept_as_guest`
  - `rpc_match_proxy_confirm_participant`
- Internal write core:
  - `apply_participant_acceptance`

Note:

- Self acceptance and proxy acceptance share the same lifecycle invariant.
- The old public meaning of "delegate confirm" is retired. Shared group, shared match, participant status, and contact ownership no longer authorize this action.

### Exit family

- Public RPCs:
  - `rpc_match_user_withdraw`
  - `rpc_email_invitation_decline_as_guest`
  - `rpc_match_remove_participant`
- Internal write core:
  - `apply_participant_exit`

---

## Deprecated / Removed Match Functions

These names are intentionally listed only as removed or compatibility-only references.

- `public.rpc_match_manual_confirm`
- `public.rpc_match_manual_confirm_user`
- `public.rpc_match_revoke_delegate_confirm_participant`
- `public.rpc_match_delegate_confirm_participant`
- `public.rpc_match_proxy_bind_self`
- `public.rpc_match_proxy_confirm_self`
- `public.rpc_match_proxy_reject_self`
- `public.rpc_match_delegate_confirm_user`
- `public.rpc_match_delegate_manual_confirm_targets`
- `public.rpc_match_add_guest_org`
- `public.rpc_match_add_guest_participant`
- `public.rpc_match_invite_guest_from_roster`
- `public.rpc_match_invite_targets`
- `public.rpc_match_nominate_targets`
- `public.can_add_guests`

Do not use these names for new work.

---

## Legacy Residue Still Present in Schema or Types

These items may still exist in compatibility layers, history, or some type surfaces, but they are not canonical controls anymore:

- `matches.can_participants_add_guests`
  Legacy guest-add flag. Canonical Contact Player admission no longer uses it.

- `match_join_method = 'guest_add'`
  Historical join method value. Not part of the canonical Contact Player flow.

- `participant_accepted_via = 'delegate_manual'`
  Historical participant-side marker from the retired ad-hoc delegate model.

---

## Notes for Future Updates

- Do not add archive-only function names back into the active index.
- When a function is superseded by a composition or compatibility shim, document the current canonical meaning instead of restoring the old semantics.
- When post-baseline migrations redefine a function, this file should reflect the latest active version only.
