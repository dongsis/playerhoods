# Contact Player Canonicalization — Unified Orchestration Flow Design

**Date:** 2026-03-11  
**Status:** Design only — no implementation  
**Constraint:** Do not modify `apply_participant_*`, `match_participant_reconcile_status`, `rpc_match_accept_email_invitation`, identity_links, canonical rules, migrations, or any existing function definitions.

---

## 1. Flow Name Candidates

| Candidate | Rationale |
|-----------|------------|
| **`canonicalize_participant_for_registered_user`** | Emphasizes outcome: one canonical row per real person per match |
| **`settle_contact_player_to_user_participant`** | Domain language: "settle" = resolve duplicate state into single canonical |
| **`orchestrate_guest_to_user_canonicalization`** | Explicit about orchestration role and guest→user direction |
| **`participant_canonicalization_settlement`** | Generic; leaves room for future non-guest cases |

**Recommended:** `canonicalize_participant_for_registered_user` — clearest about the domain action and outcome.

---

## 2. Recommended Conceptual Model

### 2.1 Domain Action (Not a Helper)

This flow is a **domain action** at the orchestration layer. It is not:

- A low-level write helper (admission, acceptance, exit)
- A single-step predicate or selector
- A side effect of another flow

It is:

- A **settlement** of the state "one real person × one match" into exactly one active canonical participant row
- A **coordinator** that sequences multiple existing helpers and writes in a defined order
- A **single entry point** for all paths that need to resolve guest+user duplicates into canonical form

### 2.2 Why Orchestration, Not "Each Module Does a Bit"

| Approach | Problem |
|----------|---------|
| **identity_links only** | Links guest to user; does not touch `match_participants` |
| **email accept only** | Creates user row; may not see or retire guest row |
| **participant row creation only** | Assumes single-row context; no cross-row logic |
| **UI guessing** | UI cannot reliably decide which row to show or retire |

**Orchestration:** One flow owns the full chain: identify → decide canonical → retire guest → ensure user row → audit. No module "does a bit" in isolation; all call this flow.

---

## 3. Input / Output Model

### 3.1 Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `p_match_id` | uuid | Yes | Match in which to canonicalize |
| `p_user_id` | uuid | Yes | Registered user (auth.uid() or identified contact) |
| `p_actor_id` | uuid | Yes | Who triggered (user self, system, or delegate) |
| `p_actor_context` | text | No | `'self'` \| `'email_accept'` \| `'identity_reconcile'` \| `'repair_job'` \| `'system'` |
| `p_email` | text | No | Optional hint for matching guest (e.g. from invitation); used when identity_links not yet present |

### 3.2 Output

| Field | Type | Description |
|-------|------|-------------|
| `canonical_participant_id` | uuid | The single active participant row for this person in this match |
| `retired_guest_participant_ids` | uuid[] | Guest rows that were retired (superseded) |
| `result_type` | text | `'already_canonical'` \| `'canonicalized'` \| `'no_action'` \| `'error'` |
| `notes` | text | Human-readable summary for audit/debug |

### 3.3 Result Types

| result_type | Meaning |
|-------------|---------|
| `already_canonical` | User row exists and no active duplicate rows; already in ideal state |
| `canonicalized` | Guest row(s) retired; user row created or reused; settlement complete |
| `no_action` | Insufficient evidence to canonicalize, or no relevant participant rows found; flow did not need to act |
| `error` | Precondition failed, permission denied, or invariant violation |

---

## 4. Step-by-Step Orchestration Design

### 4.1 Step Chain (High Level)

```
1. Resolve identity & gather candidate rows
2. Detect duplicate active rows (guest + user)
3. Decide canonical row (user row canonical)
4. Retire guest row(s)
5. Ensure user row exists (create or reuse)
6a. Reconcile modified rows
6b. Record settlement audit
7. Return canonical result
```

**Write ordering:** The exact ordering of steps 4 and 5 is implementation-dependent. As long as the flow is transactionally safe and ends with a single active canonical row, an implementation may: retire guest first then ensure user row; ensure user row first then retire guest; or perform both within a single transactional unit. This design does not prescribe one order as the only correct one.

### 4.2 Step Detail

| Step | Responsibility | Calls Existing Helper? | Rationale |
|------|----------------|------------------------|------------|
| **1. Resolve identity & gather candidates** | Find all `match_participants` for this match that belong to the same real person (guest via email/identity_links, user via user_id) | No | Orchestration-specific: cross-row lookup by email + identity_links + user_id. Helpers assume single-row context. |
| **2. Detect duplicate active rows** | Check if both guest row(s) and user row exist with `removed_at IS NULL` | No | Pure read + predicate. Not a write helper. |
| **3. Decide canonical row** | Apply rule: user row canonical; guest row(s) to retire | No | Policy decision. Helpers do not make this choice. |
| **4. Retire guest row(s)** | For each active guest row: set `removed_at`, `removed_by`, `removal_note`; insert `superseded_by_registered_user` action | **Maybe** `apply_participant_exit` with `exit_kind='supersede'` **or** dedicated retire helper | **Design constraint:** This round does **not** modify `apply_participant_exit`. So: orchestration calls a **future** `retire_guest_superseded`-style helper (not yet implemented). Orchestration defines *what* to call, not *how* it works. |
| **5. Ensure user row exists** | If no user row: create via admission. If user row exists (including re-entry): ensure it is active | **Yes** `apply_participant_admission` (for create/re-entry) | Admission helper does exactly this: INSERT or UPDATE removed row. Orchestration only decides *when* to call it and with what params. |
| **6a. Reconcile modified rows** | For each modified row: `match_participant_reconcile_status` | **Yes** `match_participant_reconcile_status` | Reconcile is the single authority for status derivation. Orchestration invokes it; does not replace it. |
| **6b. Record settlement audit** | Ensure action log complete; record settlement trace (e.g. `superseded_by_registered_user` action_type) | Future action_type or audit table | Audit is domain settlement trace; distinct from reconcile (status derivation). Enables future `superseded_by_registered_user` and similar. |
| **7. Return canonical result** | Build output struct | No | Pure response construction. |

### 4.3 Why Orchestration Sits Above Helpers

| Helper | Scope | Orchestration Role |
|--------|-------|--------------------|
| `apply_participant_admission` | Single admission write (fresh or re-entry) | Orchestration calls it when user row must be created or re-activated. Does **not** extend it to "also retire guest." |
| `apply_participant_acceptance` | Single acceptance write | Orchestration does **not** call it here. Canonicalization is about row identity, not acceptance state. |
| `apply_participant_exit` | Single exit write | Orchestration may eventually call a retire helper. This round: design only; retire helper is a **future** artifact. |
| `match_participant_reconcile_status` | Single-row status derivation | Orchestration calls it for each modified row. Does **not** add cross-row logic to reconcile. |

**Principle:** Orchestration sequences and coordinates. Helpers remain single-responsibility. No "stuffing" canonicalization into admission, acceptance, or exit.

---

## 5. Relationship to Existing System Layers

### 5.1 Email Invitation Accept

| Current | Future (Design Only) |
|---------|----------------------|
| `rpc_match_accept_email_invitation` creates user row; may not retire guest | Before or after creating user row, **invoke** orchestration flow with `p_actor_context='email_accept'`. Orchestration performs full settlement. |

**Integration point:** Email accept becomes an **entry point** that triggers orchestration. Orchestration is the single authority for "same person, one row." This design does **not** specify whether the call is inline, pre-step, or post-step; only that email accept should **delegate** to this flow rather than implement its own partial logic.

### 5.2 Identity Reconcile Flows

| Flow | Role |
|------|------|
| `rpc_reconcile_identity_guest_participants` | Creates identity_links. Does **not** modify match_participants. |
| `rpc_reconcile_identity_after_magic_link` | Same. |

**Integration point:** After identity_links are created, a **separate** trigger (e.g. login hook, scheduled job, or explicit "settle" call) may invoke orchestration for each (match_id, user_id) where a link was established. Orchestration uses identity_links as input to step 1; it does **not** live inside reconcile.

### 5.3 Participant Display / Duplicate Visibility

| Current | With Orchestration |
|---------|---------------------|
| UI may see duplicate rows (guest + user) | Orchestration ensures only one active row per person. Display logic can assume "active = canonical" once orchestration has run. |

**Note:** Orchestration does **not** change display logic. It changes the data so that display no longer needs to "guess" which row to show.

### 5.4 Future Historical Repair Job

| Job | Role |
|-----|------|
| Repair / backfill job | Iterates over (match_id, user_id) pairs with known duplicates; invokes orchestration for each. Dry-run mode: steps 1–3 only, no writes. |

Orchestration is **reusable** by repair tooling. Same flow, different entry point.

---

## 6. Implementation-Layer Comparison (Design Only)

### 6.1 Option 1: Dedicated Orchestration RPC / DB Function

| Dimension | Assessment |
|------------|------------|
| **Consistency** | High. Single transaction; all steps in one DB session. |
| **Transactional** | High. Natural fit for PostgreSQL transaction. |
| **Testability** | High. Can unit-test via SQL; no network. |
| **Intrusiveness** | Medium. New RPC/function; callers must be updated to use it. |
| **Future as primary** | Strong. Single source of truth; all entry points call it. |

### 6.2 Option 2: Service-Layer Orchestration

| Dimension | Assessment |
|------------|------------|
| **Consistency** | Medium. Depends on service transaction boundaries; may span multiple DB calls. |
| **Transactional** | Medium. Need explicit transaction management. |
| **Testability** | Medium. Requires service-layer test harness. |
| **Intrusiveness** | Low. Can wrap existing RPCs without changing them. |
| **Future as primary** | Medium. Good for gradual adoption; may duplicate logic if not careful. |

### 6.3 Option 3: Background Job / Repair-Oriented

| Dimension | Assessment |
|------------|------------|
| **Consistency** | Medium. Async; eventual consistency. |
| **Transactional** | Medium. Job runs in transaction; timing may lag. |
| **Testability** | Medium. Job runner + mock queue. |
| **Intrusiveness** | Low for historical repair; not suitable as primary for real-time flows (e.g. email accept). |
| **Future as primary** | Weak for real-time. Strong for batch repair. |

### 6.4 Summary

| Option | Best For |
|--------|---------|
| **1. DB function / RPC** | Primary implementation. Single entry point; all real-time flows call it. |
| **2. Service layer** | Gradual migration; wrapping existing RPCs before DB refactor. |
| **3. Background job** | Historical repair; dry-run audit; one-off cleanup. |

**Recommendation (design only):** Option 1 as the **target** primary implementation. Option 3 for repair tooling. Option 2 as a bridge if needed.

---

## 7. Recommended Phased Adoption Plan

| Level | Scope | Deliverable | No Implementation |
|-------|-------|--------------|-------------------|
| **L1** | Flow definition & docs | This document; update `Match_Participant_Lifecycle_Canonical` with "Canonicalization Settlement" section; update `00_AUTHORITATIVE_INDEX` to reference it | ✓ |
| **L2** | Dry-run audit | Read-only script: steps 1–3 only. Output: (1) which (match_id, user_id) have dual active rows; (2) which guest rows are stale confirmed; (3) which guest rows would be retired if canonicalized. **Delivered:** `tests/v161/L2_canonicalization_dry_run_audit.sql`, `docs/fixes/L2_Canonicalization_Dry_Run_Audit_Report.md` | ✓ |
| **L3** | Historical repair tooling | Script or admin RPC that invokes orchestration for each duplicate pair. Optional dry-run mode | ✓ |
| **L4** | Entry-point integration | Wire email accept and (optionally) identity reconcile to call orchestration. Orchestration implementation (RPC or internal function) | ✓ |
| **L5** | Full enforcement | All paths that can produce guest+user duplicate go through orchestration; no bypass | ✓ |

**Conservative order:** L1 → L2 → L3 → L4 → L5. Do not skip L2; audit informs L3 scope.

---

## 8. Explicit Non-Goals

| Non-Goal | Reason |
|----------|--------|
| Modify `apply_participant_admission` | It does admission only. Canonicalization is orchestration. |
| Modify `apply_participant_acceptance` | Acceptance is orthogonal to row identity settlement. |
| Modify `apply_participant_exit` | Exit semantics stay pure. Retire is a **future** helper or exit_kind extension. |
| Modify `match_participant_reconcile_status` | Reconcile stays single-row. |
| Modify `rpc_match_accept_email_invitation` | This round: design only. Integration is a future step. |
| Modify identity_links logic | Identity_links remain read-only for this flow; orchestration consumes them. |
| Change canonical row rule | User row canonical, guest retire — already decided. |
| Write migrations | Design only. |
| Implement any code | Design only. |

---

## 9. Boundary with Existing Helpers (Explicit)

| Helper | Continues To Do | Orchestration Does |
|--------|-----------------|---------------------|
| `apply_participant_admission` | Admission write only (INSERT or re-entry UPDATE) | Calls it when user row must exist; does not extend it |
| `apply_participant_acceptance` | Acceptance write only | Does not call it in canonicalization flow |
| `apply_participant_exit` | Exit write only (remove, withdraw) | Does not call it; retire uses future `retire_guest_superseded`-style helper |
| `match_participant_reconcile_status` | Single-row status derivation | Calls it for each modified row; does not add cross-row logic |

**Orchestration responsibility:** Cross-module canonicalization settlement. It **coordinates**; it does **not** replace or extend helpers.

**Scope boundary:** Canonicalization resolves row identity and active-row uniqueness only; it does **not** itself decide participant acceptance or organizer approval semantics.

---

## 10. Summary

| Item | Conclusion |
|------|------------|
| **Flow name** | `canonicalize_participant_for_registered_user` |
| **Domain role** | Settlement: one real person × one match → one active canonical row |
| **Scope boundary** | Resolves row identity and active-row uniqueness only; does **not** decide participant acceptance or organizer approval |
| **Input** | match_id, user_id, actor_id, actor_context, optional email |
| **Output** | canonical_participant_id, retired_guest_ids, result_type, notes |
| **Steps** | 1) Gather candidates 2) Detect duplicates 3) Decide canonical 4) Retire guest 5) Ensure user row 6a) Reconcile 6b) Record audit 7) Return |
| **Helper usage** | Call `apply_participant_admission` for user row; call `match_participant_reconcile_status`; call future retire helper. Do not modify helpers. |
| **Implementation target** | Dedicated DB function / RPC as primary; background job for repair |
| **Adoption** | L1 docs → L2 dry-run → L3 repair → L4 entry integration → L5 full enforcement |
| **Non-goals** | No changes to existing helpers, RPCs, identity_links, migrations, or code in this round |
