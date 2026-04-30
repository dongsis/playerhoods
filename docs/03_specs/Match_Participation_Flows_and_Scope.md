# Match Participation: Entry, Acceptance, Approval, Exit, and Proxy Scope

**Status:** authoritative working reference  
**Last updated:** 2026-04-10  
**Canonical companions:** `../01_authority/Contact_Player_and_Match_Proxy_Canonical_v1_2.md`, `../01_authority/Match_Participant_Lifecycle_Canonical.md`

---

## 1. Core Scope Rules

### 1.1 Match-level scope

| Term | Definition | Used for |
|------|------------|----------|
| `invitation_scope_group_ids` | `matches.invitation_scope_group_ids` | user invite / request-join targeting |
| `is_user_in_scope_groups(scope_group_ids, user_id)` | user is an active member of at least one scope group | target eligibility and caller eligibility |
| `is_user_in_match_scope(match_id, user_id)` | wrapper over scope group membership for a specific match | request-join and nominate gating |

### 1.2 Association and trust

| Term | Definition | Used for |
|------|------------|----------|
| `is_user_match_associated(match_id, user_id)` | user has a non-removed participant row, or a self-withdraw / self-decline removed row | caller gates and visibility |
| `do_users_share_group(user_a, user_b)` | both users are active members of at least one friend group | user-to-user trust checks |

### 1.3 Explicit proxy authority

| Term | Definition | Used for |
|------|------------|----------|
| `is_active_match_proxy_for_participant(match_participant_id, proxy_user_id)` | proxy user has an active explicit binding for the participant's principal person | participant-side proxy actions |
| `resolve_person_id_for_user(user_id)` | registered user -> canonical person node | proxy binding and person relationships |
| `resolve_person_id_for_guest(guest_id)` | Contact Player contact record -> canonical person node | proxy binding and person relationships |

---

## 2. Entry Paths

| Action | RPC | Caller | Target | Result |
|--------|-----|--------|--------|--------|
| Invite user | `rpc_match_invite_user` | organizer | registered user | invited pending row; organizer side already approved |
| Request join | `rpc_match_request_join` | self | self | requested pending row; participant side already accepted |
| Nominate user | `rpc_match_nominate_user` | eligible non-organizer | registered user | nominated pending row |
| Direct-invite Contact Player | `rpc_match_nominate_guest` | organizer or eligible non-organizer | Contact Player | nominated pending Contact Player row |

### Contact Player Entry Rules

- Contact Player enters a match through direct invite only.
- Contact Player does not enter recruit flows.
- Contact Player is person-specific, not broadcast-targeted.
- Contact Player self response uses the invitation-link flow and does not require registration.

---

## 3. Acceptance and Approval

Unified invariant:

**confirmed iff `participant_accepted_at IS NOT NULL` and `org_approved_at IS NOT NULL`**

| Action | RPC | Authority source | Notes |
|--------|-----|------------------|-------|
| User self accept | `rpc_match_accept_invite` | self | participant-side confirmation |
| Contact Player self accept | `rpc_email_invitation_accept_as_guest` | self via private invitation link | participant-side confirmation without registration |
| Organizer approve | `rpc_match_org_approve_participant` | organizer role | organizer-side approval only |
| Proxy confirm | `rpc_match_proxy_confirm_participant` | explicit active Match Proxy binding only | canonical proxy participant confirmation |

### Retired Model

The following are no longer valid participant-side authority sources:

- shared group
- shared match
- participant status
- contact owner status
- organizer convenience flows that write participant-side confirmation without explicit proxy authority

### Principal Retained Authority

Even when an active Match Proxy exists:

- the principal keeps full self-service participant-side rights
- principal and proxy may both act
- audit must distinguish self action vs proxy action

---

## 4. Exit

| Action | RPC | Caller | Notes |
|--------|-----|--------|-------|
| Self withdraw / decline | `rpc_match_user_withdraw` | participant self | removes current participation |
| Contact Player self decline | `rpc_email_invitation_decline_as_guest` | Contact Player self via invitation link | private-link decline without registration |
| Organizer remove | `rpc_match_remove_participant` | organizer | organizer-side removal |

There is no longer any special remove power derived from being the old delegate confirmer.

---

## 5. Group and Save Effects

### Group inclusion

- Contact Player may be added to a group only as a limited group contact.
- Group inclusion allows group members to see, save, and direct-invite that person.
- Group inclusion does not create Match Proxy authority.

### Save

- Save targets the person node, not another user's private contact row.
- Save is allowed only after trusted exposure such as ownership, shared match, or explicit group inclusion.
- Save does not expose contact details and does not create proxy authority.

---

## 6. Discovery

Contact Players do not enter:

- public player discovery
- venue member discovery
- club member discovery
- default invite candidate pools outside direct-invite context

Proxy binding does not change these discovery rules.

---

## 7. UI Consequences

- Remove old "Confirm on their behalf" UI that was based on shared group / participant proximity.
- Keep self-service accept / decline flows for both registered users and Contact Players.
- Label Contact Player actions as direct invite, not recruit.
- Distinguish owner, saved-by, group-known, and proxy-for relationships in the UI.

---

## 8. Compatibility Note

Some legacy values may still remain temporarily in history rows or old audits:

- `rpc_match_proxy_confirm_participant`
- legacy `delegate_manual_confirm` history rows may remain in audits, but new proxy confirmations write `participant_accepted_via = 'proxy'`
- `match_join_method = 'guest_add'`
- `matches.can_participants_add_guests`

These should be treated as legacy residue, not as canonical semantics.
