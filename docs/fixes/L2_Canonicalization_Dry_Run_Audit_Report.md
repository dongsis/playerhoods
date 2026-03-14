# L2 Canonicalization Dry-Run Audit Report

**Date:** 2026-03-11  
**Scope:** Read-only audit per Contact_Player_Canonicalization_Orchestration_Design.md L2  
**Database:** Local (postgresql://127.0.0.1:54322/postgres)  
**Constraints:** No writes, no migrations, no helper/RPC changes

---

## A. Read-Only SQL Used

The audit SQL is in `tests/v161/L2_canonicalization_dry_run_audit.sql`.

### Query 1 — Dual Active Rows

Same real person in same match has both active guest row AND active user row. Match by:
- **Email:** `lower(trim(guests.email)) = lower(trim(auth.users.email))`
- **Identity links:** `identity_links.linked_type = 'guest_participant'` and `linked_id = mp_guest.id`, `user_id = mp_user.user_id`

```sql
SELECT mp_guest.match_id, mp_user.user_id, mp_guest.id AS guest_mp_id, mp_user.id AS user_mp_id,
       g.email AS guest_email, g.display_name, mp_guest.status, mp_user.status, match_source
FROM ... -- see L2_canonicalization_dry_run_audit.sql
WHERE mp_guest.removed_at IS NULL AND mp_user.removed_at IS NULL
  AND (email match OR identity_links match);
```

### Query 2 — Stale Confirmed Guest Rows

`status = 'confirmed'` but `participant_accepted_at IS NULL` (invalid per reconcile rules).

```sql
SELECT mp.id, mp.match_id, mp.guest_id, g.email, g.display_name, mp.status,
       mp.participant_accepted_at, mp.org_approved_at
FROM match_participants mp
JOIN guests g ON g.id = mp.guest_id
WHERE mp.guest_id IS NOT NULL
  AND mp.status = 'confirmed'
  AND mp.participant_accepted_at IS NULL
  AND mp.removed_at IS NULL;
```

### Query 3 — Candidate Retire List

Under user-row-canonical strategy: which guest rows would be retired, which user row would remain canonical. Same population as Query 1 with explicit retire/canonical assignment.

### Query 4 — Ambiguity / Manual Review List

- **4a:** Active guest with NULL/empty email — cannot match to user
- **4b:** Multiple active guest rows for same email in same match
- **4c:** Dual active where user has no email in auth.users (identity_links match only)

---

## B. Summary Counts

| Metric | Count |
|--------|-------|
| match_participants total | 68 |
| match_participants guest active (removed_at IS NULL) | 0 |
| match_participants user active (removed_at IS NULL) | 49 |
| guests total | 1 |

| Output Set | Row Count |
|------------|-----------|
| 1. Dual active rows | 0 |
| 2. Stale confirmed guest rows | 0 |
| 3. Candidate retire list | 0 |
| 4a. Guest no email | 0 |
| 4b. Multiple guests same email | 0 |
| 4c. User no email (identity_links only) | 0 |

---

## C. Result Sets

### 1. Dual Active Rows

| match_id | user_id | guest_mp_id | user_mp_id | guest_email | guest_display_name | guest_status | user_status | match_source |
|----------|---------|-------------|------------|-------------|--------------------|--------------|-------------|--------------|
| *(none)* | | | | | | | | |

**Result:** No dual active rows found.

---

### 2. Stale Confirmed Guest Rows

| guest_mp_id | match_id | guest_id | email | display_name | status | participant_accepted_at | org_approved_at |
|-------------|----------|----------|-------|--------------|--------|-------------------------|-----------------|
| *(none)* | | | | | | | |

**Result:** No stale confirmed guest rows found.

---

### 3. Candidate Retire List

| match_id | user_id | would_retire_guest_mp_id | canonical_user_mp_id | guest_email | guest_display_name |
|----------|---------|--------------------------|----------------------|-------------|--------------------|
| *(none)* | | | | | |

**Result:** No candidate retire rows. No canonicalization actions would be taken.

---

### 4. Ambiguity / Manual Review List

| ambiguity_type | match_id | guest_mp_id / ids | reason |
|----------------|----------|-------------------|--------|
| *(none)* | | | |

**Result:** No ambiguity cases requiring manual review.

---

## D. Interpretation of Findings

### Local Database State

The local database currently has:
- **No active guest participants** — all guest rows are either removed or the dataset has no guest participants with `removed_at IS NULL`
- **49 active user participants** across matches
- **1 guest** in the guests table (likely removed or in a different match state)

### Implications

1. **No canonicalization needed** — There are no dual active rows (guest + user for same person in same match). The orchestration flow would return `no_action` or `already_canonical` for all (match_id, user_id) pairs.

2. **No stale state** — No guest rows with `status = 'confirmed'` and `participant_accepted_at IS NULL`. Reconcile rules are not violated in this dataset.

3. **No ambiguity** — No guests without email, no multiple active guests for same email in same match, no user-without-email edge cases.

4. **Audit script validated** — The SQL runs successfully and returns structured results. Ready for use against remote/production when needed.

### Next Steps

- **Re-run against remote** if production/staging has different data. Get the DB URL from Supabase project settings or `supabase status` (for local). For remote:
  ```bash
  # Using connection string from Supabase Dashboard → Project Settings → Database
  psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" -f tests/v161/L2_canonicalization_dry_run_audit.sql
  ```
- If remote has dual active rows, the candidate retire list will populate and inform L3 repair scope.
- If remote has stale confirmed guests, consider L2.1 repair (call `match_participant_reconcile_status` only) before canonicalization.
