# Production Change Log

This document is the authoritative record of PlayerHoods production-related changes.

It tracks GitHub commits, Vercel Production deployments, Supabase Remote migrations, production verification status, and rollback notes.

Use this log to answer:

- Whether a feature or fix has reached production
- Whether GitHub, Vercel Production, and Supabase Remote are aligned
- Which migrations have been applied to Supabase Remote
- What was verified in production
- How to rollback or investigate a production issue

Do not record secrets, tokens, passwords, service-role keys, or private user data in this document.

## Status Definitions

- Draft: local changes only, not committed.
- GitHub only: committed to GitHub, not confirmed deployed.
- Production deployed: Vercel Production is running this commit.
- DB remote applied: related Supabase migration has been applied to Remote.
- Production aligned: GitHub main, Vercel Production, and Supabase Remote are aligned for this change.
- Verified: production smoke test passed.
- Rolled back: change was reverted or disabled.

If a status cannot be confirmed, write `Unknown`. Do not infer.

## Logging Rules

1. Every patch, mini release, and structural release must have a Change ID.
2. Every record must include:
   - Date
   - Change ID
   - Release Type
   - Summary
   - GitHub commit hash
   - Migration file, if any
   - Vercel Production status
   - Supabase Remote status
   - Production verification status
   - Current status
   - Rollback method
3. If any item cannot be confirmed, write `Unknown`; do not guess.
4. Do not call a GitHub commit production deployed unless Vercel Production was confirmed.
5. Do not call a created migration Supabase Remote applied unless remote migration state was confirmed.
6. Do not call login-page reachability full production verification.
7. Structural Releases require a detailed block with migration, remote apply status, Vercel deployment status, online verification steps, rollback, and known risks.
8. Local runtime logs are not product changes and should not be recorded as product releases.

## Change Log

| Date | Change ID | Type | Summary | Commit | Migration | Vercel Prod | Supabase Remote | Production Verified | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-05-08 | baseline-2026-05-08-bc36051 | Baseline | Production baseline confirmed | bc3605189be29fc432747f6ad728161140e90827 | Up to 20260508144500_mark_legacy_group_invite_user_rpc.sql | Yes | Yes | Login page only | Production aligned, smoke test pending | GitHub main, Vercel Production, and Supabase Remote aligned. |
| 2026-05-08 | docs-release-governance-baseline-2026-05-08 | Patch | Added release governance and production change log documents | 0aa52e4579927ca9c85c09b9ad0f70483d8fdecf | None | Unknown | N/A | Not verified | GitHub only | Documentation-only governance patch. No deploy or remote migration apply performed by Codex. |
| 2026-05-08 | docs-release-governance-template-2026-05-08 | Patch | Expanded governance docs into authoritative rule and fact-record templates | Unknown | None | Unknown | N/A | Not verified | GitHub only after push | Documentation-only governance patch. Commit hash is reported in the task final report because a commit cannot self-reference its own final hash. |
| 2026-05-08 | SR-20260508-contact-link-person-scope | Structural Release | Link accept and active Contact/Hoods UI move linked contacts to registered-user identity by person scope | Unknown | 20260508162000_identity_link_person_scope_active_identity.sql | Unknown | Not applied at write time | Not verified | Draft before commit | Structural release record created before commit/deploy/apply. Final commit/deploy/apply/test status must be reconciled after rollout. |

## 2026-05-08 - baseline-2026-05-08-bc36051

**Type:** Production Baseline  
**Commit:** `bc3605189be29fc432747f6ad728161140e90827`  
**Migration:** `20260508144500_mark_legacy_group_invite_user_rpc.sql`  
**Status:** Production aligned, smoke test pending

### Summary

Production was reconciled against GitHub main, Vercel Production, and Supabase Remote.

Current GitHub main committed content was aligned with Vercel Production and Supabase Remote. Local worktree changes were not part of this production baseline.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| GitHub main | `bc3605189be29fc432747f6ad728161140e90827` | `git ls-remote origin refs/heads/main` |
| Vercel Production | `bc3605189be29fc432747f6ad728161140e90827` | GitHub Deployments success from `vercel[bot]` |
| Supabase Remote | `20260508144500_mark_legacy_group_invite_user_rpc.sql` | `supabase migration list --linked` |
| Production website | Reachable | `/login` returned 200 |
| Full smoke test | Not verified | No production test-account core-flow execution |

### Notes

Local worktree still contained uncommitted contact/link/person-scope changes and local runtime logs. These were not part of production.

### Rollback

N/A. This entry records a baseline; it does not introduce a production change.

## 2026-05-08 - docs-release-governance-baseline-2026-05-08

**Type:** Patch  
**Commit:** `0aa52e4579927ca9c85c09b9ad0f70483d8fdecf`  
**Migration:** None  
**Status:** GitHub only

### Summary

Added release governance documentation and the initial production change log.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| Local | Docs created and committed | Git commit `0aa52e4` |
| GitHub main | `0aa52e4579927ca9c85c09b9ad0f70483d8fdecf` | Push to `origin/main` |
| Vercel Preview | Unknown | Not checked |
| Vercel Production | Unknown | No production deployment performed by Codex |
| Supabase Local | No change | Documentation-only change |
| Supabase Remote | N/A | No migration |
| Production verification | Not verified | Documentation-only change; no production smoke test performed |

### Notes

This patch did not deploy Vercel Production and did not apply Supabase Remote migrations.

### Rollback

Revert commit `0aa52e4579927ca9c85c09b9ad0f70483d8fdecf`.

## 2026-05-08 - docs-release-governance-template-2026-05-08

**Type:** Patch  
**Commit:** Unknown  
**Migration:** None  
**Status:** GitHub only after push

### Summary

Expanded the release governance and production change log documents into the recommended long-term structure:

- `00_RELEASE_GOVERNANCE.md` is the rules document.
- `00_PRODUCTION_CHANGE_LOG.md` is the factual release record.
- Structural Releases require detailed change-log blocks.
- Unknown states must be recorded as `Unknown`.
- GitHub commits, Vercel Production deployment, and Supabase Remote migration state must not be conflated.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| Local | Docs updated | Local diff |
| GitHub main | Unknown at write time | Commit hash is produced after this document content is finalized |
| Vercel Preview | No change | Documentation-only change |
| Vercel Production | No change | No deployment performed by Codex |
| Supabase Local | No change | Documentation-only change |
| Supabase Remote | N/A | No migration |
| Production verification | Not verified | Documentation-only change; no production smoke test performed |

### Notes

This patch does not deploy Vercel Production and does not apply Supabase Remote migrations.

### Rollback

Revert the GitHub commit reported in the final task report for `docs-release-governance-template-2026-05-08`.

## 2026-05-08 - SR-20260508-contact-link-person-scope

**Type:** Structural Release  
**Commit:** Unknown  
**Migration:** `20260508162000_identity_link_person_scope_active_identity.sql`  
**Status:** Draft before commit

### Summary

This release changes the Contact Player link-accept path and active Contact/Hoods rendering so that a linked Contact Player is treated as the registered user's active identity while preserving historical contact data.

The intended behavior is:

- Link accept runs by canonical `person_id`, not only by one `guest_id`.
- Active owner-private contact records for the linked person are soft archived.
- Historical contact records, invitations, notes, and match participation rows are preserved.
- Contact owners and saved users are mapped toward the registered-user invite path.
- Contact owners, saved users, and group/Hood keepers receive notifications.
- Hoods and group contact UI can render the registered PlayerHoods profile for linked contacts.
- Link does not grant Match Proxy, group member, limited member, or keeper permissions.

### Files

| Area | Files |
|---|---|
| Migration | `supabase/migrations/20260508162000_identity_link_person_scope_active_identity.sql` |
| Hoods UI | `src/app/dashboard/HoodsPanel.tsx` |
| Group UI | `src/app/groups/[groupId]/page.tsx` |
| API clients | `src/lib/api/groups.ts`, `src/lib/api/hoods.ts` |
| Types | `src/lib/types/database.ts` |

### Migration Details

| Item | Status |
|---|---|
| Destructive migration | No |
| Drops tables/columns/RPCs | No |
| Deletes historical rows | No |
| Creates/replaces RPCs | Yes |
| Soft archives active contact records during link accept | Yes |
| Applies automatically on migration apply | Function definitions only; business data changes occur when `rpc_identity_link_accept` is executed |

New/changed RPC behavior:

- `rpc_identity_link_accept(uuid)` becomes person-scoped for active contact compatibility rows.
- `rpc_contact_player_resolution()` resolves linked state through `people.linked_user_id` or accepted contact identity links.
- `rpc_contact_player_lookup_v2(uuid[])` returns `linked_user_id`.
- `rpc_group_contact_list_v2(uuid)` returns `linked_user_id`.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| Local | Draft | Local diff reviewed |
| GitHub main | Unknown | Not committed at record-write time |
| Vercel Preview | Unknown | Not deployed at record-write time |
| Vercel Production | Unknown | Not deployed at record-write time |
| Supabase Local | Pending rehearsal | Build/reset not yet recorded in this entry at write time |
| Supabase Remote | Not applied at write time | `20260508162000...` not yet applied remotely |
| Production verification | Not verified | Online tests not yet executed |

### Online Verification Plan

Minimum smoke:

1. Open `https://www.playerhoods.com/login` and confirm HTTP 200.
2. Log in with test account A, test account B, and a keeper account.
3. Create or use a Contact Player where multiple owner/saved/group contact paths point to the same canonical person.
4. Complete link accept as the corresponding registered user.
5. Verify the contact owner receives a notification.
6. Verify the saved user receives a notification.
7. Verify the Hood/Group keeper receives a notification.
8. Verify Contacts/Hoods active UI does not duplicate Contact card and Registered User card.
9. Verify old contact phone/email/notes are not shown as primary registered profile information.
10. Verify historical invitation, notes, and match participation remain accessible.
11. Verify the linked user did not automatically receive Match Proxy or group/member permissions.
12. Verify future invitation path uses the registered-user path.

### Known Risks

- If a registered user already has a separate `people.linked_user_id` row, the contact person cannot also claim the same `linked_user_id` because of the unique partial index. The release relies on accepted `identity_links` and v2 lookup RPCs to render the registered-user identity in that case.
- Notification fanout depends on existing relationship/contact/group-contact rows being correctly tied to the canonical `person_id`.
- Full production verification requires real test accounts and may require seeded or pre-existing multi-owner contact data.

### Rollback

Code rollback:

- Revert the structural release commit.
- Redeploy the previous known-good production commit.

Database rollback:

- Add a follow-up rollback migration restoring the previous RPC definitions for `rpc_identity_link_accept` and `rpc_contact_player_resolution`, and stop frontend usage of `rpc_contact_player_lookup_v2` / `rpc_group_contact_list_v2`.
- Do not drop v2 RPCs until frontend has been rolled back.
- For business writes already produced by link accept, repair by scoped data fix:
  - restore mistakenly archived `contact_records` by clearing `archived_at`, `archive_reason`, and `replaced_by_user_id` for the affected person/time window;
  - remove or mark erroneous notifications;
  - remove erroneous `user_invite_circle` or `person_relationships` rows only after scoped audit.
