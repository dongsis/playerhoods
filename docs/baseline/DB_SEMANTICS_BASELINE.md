# DB Semantics Baseline

## Scope

This document records the currently enforced database semantics baseline for invitation and participant lifecycle behavior.

## Core Invariants

### 1) Unified confirmation invariant

- Participant state transitions are reconciled through canonical participant lifecycle helpers.
- Acceptance/withdraw semantics must remain idempotent and explicit.

### 2) Guest current-match response invariant

- Invitation response for guest current-match path must update or exit the intended guest participant path.
- Guest response must not create a new user participant row in the same current-match response chain.

### 3) Invitation anchoring invariant

- `email_invitations.match_participant_id` is the primary anchor when available.
- Anchor must match invitation related entity and participant ownership constraints.
- Fallback resolution is allowed only under strict uniqueness checks.

### 4) Decline semantics = withdraw

- Guest decline follows withdraw semantics via participant exit helper path.
- Decline must be attributable to a configured system actor in server action path.

### 5) Registration separation invariant

- Registration CTA (`/login?mode=register`) is identity onboarding only.
- Registration must not rewrite the current invitation's match participant state.

### 6) Future user-first rule boundary

- User-first identity consolidation may be introduced later.
- Any user-first conversion must be explicit and cannot silently mutate current guest participant chain.

### 7) Frozen helper/reconcile boundary

- Existing helper/reconcile boundary remains stable unless explicitly changed by dedicated migration design.
- No implicit helper rewrites in routine feature deliveries.

## Failure Strategy Baseline

- 0-hit fallback lookup: fail fast with explicit error
- Ambiguous fallback lookup: fail fast with explicit error
- Missing system actor config for decline: fail fast in server path

## Governance Notes

- These semantics are baseline constraints for future migrations and RPC changes.
- Changes to these invariants require synchronized updates to this file and related authority docs.
