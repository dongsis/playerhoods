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
| 2026-05-08 | SR-20260508-contact-link-person-scope | Structural Release | Link accept and active Contact/Hoods UI move linked contacts to registered-user identity by person scope | aaf05faf988d9a409274575b9591a92c6bd2e6f9 | 20260508162000_identity_link_person_scope_active_identity.sql | Yes | Yes | Login page only; core flows not verified | Production aligned, full smoke test pending | Vercel Production deployed SR commit and Supabase Remote applied migration. Full contact/link flow requires test accounts and fixture data. |
| 2026-05-09 | MR-20260509-login-identity-link-polish | Mini Release | Polished login page presentation, compressed identity-link review copy, and returned inline identity-link action errors instead of throwing | 91f9f6e9ca165642bc9b7e25e269f18b71c42750 | None | Yes | No change | Login/dashboard smoke passed | Production aligned for code; changelog follow-up pending deploy | Vercel deployment `4629225098` succeeded for product commit. Roll back by reverting the GitHub commit and redeploying the previous Vercel production commit. |

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
**Commit:** `aaf05faf988d9a409274575b9591a92c6bd2e6f9`  
**Migration:** `20260508162000_identity_link_person_scope_active_identity.sql`  
**Status:** Production aligned, full smoke test pending

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
| Local | Build and migration rehearsal passed | `npm.cmd run build`; `supabase db reset` |
| GitHub main | `aaf05faf988d9a409274575b9591a92c6bd2e6f9` | Pushed to `origin/main` |
| Vercel Preview | Unknown | Not checked |
| Vercel Production | `aaf05faf988d9a409274575b9591a92c6bd2e6f9` | GitHub deployment `4626931573`; commit status success |
| Supabase Local | Applied in reset rehearsal | `supabase db reset` applied `20260508162000...` |
| Supabase Remote | Applied | `supabase migration list --linked` shows `20260508162000` remote/local |
| Production verification | Login page only; core flows not verified | `https://www.playerhoods.com/login` returned HTTP 200; no production test-account core-flow execution |

### Online Verification Status

Minimum smoke:

| Step | Status | Notes |
|---|---|---|
| Open `https://www.playerhoods.com/login` and confirm HTTP 200 | Passed | HTTP 200 returned from Vercel on 2026-05-08 |
| Log in with test account A, test account B, and a keeper account | Not verified | Test credentials were not available in the task context |
| Create or use a Contact Player where multiple owner/saved/group contact paths point to the same canonical person | Not verified | Requires authenticated test accounts and fixture data |
| Complete link accept as the corresponding registered user | Not verified | Requires authenticated test accounts and fixture data |
| Verify the contact owner receives a notification | Not verified | Requires full contact/link flow |
| Verify the saved user receives a notification | Not verified | Requires full contact/link flow |
| Verify the Hood/Group keeper receives a notification | Not verified | Requires full contact/link flow |
| Verify Contacts/Hoods active UI does not duplicate Contact card and Registered User card | Not verified | Requires full contact/link flow |
| Verify old contact phone/email/notes are not shown as primary registered profile information | Not verified | Requires full contact/link flow |
| Verify historical invitation, notes, and match participation remain accessible | Not verified | Requires full contact/link flow |
| Verify the linked user did not automatically receive Match Proxy or group/member permissions | Not verified | Requires full contact/link flow |
| Verify future invitation path uses the registered-user path | Not verified | Requires full contact/link flow |

### Keep / Rollback Decision

Keep with limited verification. Build, local migration rehearsal, GitHub push, Vercel Production deployment, Supabase Remote migration apply, and login-page smoke passed. Full production core-flow verification remains pending and should be completed before marking this release `Verified`.

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

## 2026-05-09 - MR-20260509-login-identity-link-polish

**Type:** Mini Release  
**Commit:** `91f9f6e9ca165642bc9b7e25e269f18b71c42750`  
**Migration:** None  
**Status:** Production aligned for code; changelog follow-up pending deploy

### Summary

This mini release prepares the current local code for production by:

- Updating the `/login` page presentation and adding `public/login-playerhoods-hero.png`.
- Returning structured identity-link action results from dashboard, invitation, match-detail, and onboarding surfaces so failed link/keep-separate actions render inline errors instead of uncaught server-action failures.
- Compressing identity-link review copy to reduce user confusion around contact/invitation matching.
- Removing an onboarding profile recommendation callout that over-emphasized phone entry.
- Adding `docs/recent_code_change_requests_2026-05-05_to_2026-05-08.md` as a local work summary artifact.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| Local | Build passed | `npm.cmd run build` on 2026-05-09 |
| GitHub main | `91f9f6e9ca165642bc9b7e25e269f18b71c42750` | Pushed to `origin/main` |
| Vercel Preview | Unknown | Not checked |
| Vercel Production | `91f9f6e9ca165642bc9b7e25e269f18b71c42750` | GitHub deployment `4629225098`; status `success`; environment `Production` |
| Supabase Local | No change | No migration added |
| Supabase Remote | No change | `supabase migration list --linked` shows remote aligned through `20260508162000`; no new migration in this release |
| Production verification | Login/dashboard smoke passed | `/login` rendered new hero/form; production test account reached `/dashboard` without auth error |

### Migration Details

No database migration is required for this mini release. The code continues using existing identity-link APIs and RPC-backed behavior from earlier migrations.

### Online Verification Plan

Minimum production checks after Vercel deploy:

| Step | Status | Notes |
|---|---|---|
| Confirm `https://www.playerhoods.com/login` serves the new login page | Passed | HTML included `login-playerhoods-hero.png`, new Google/OR/email/password form copy, and `Sign In` CTA |
| Log in with production test account | Passed | Browser automation submitted the test account credentials |
| Confirm authenticated dashboard loads | Passed | Browser reached `https://www.playerhoods.com/dashboard`; dashboard nav and `OldChai` profile marker rendered |
| Confirm identity-link candidate action behavior | Not applicable in this smoke | The production test account did not show identity-link candidates in the dashboard smoke path |

### Rollback

Code rollback:

- Revert the GitHub commit for this mini release.
- Redeploy the previous known-good Vercel Production commit.

Database rollback:

- No database rollback required because no migration is introduced.

### Known Risks

- The Identity Link full acceptance path depends on existing production fixture data; if the production test account has no candidates, verification can only cover login/dashboard reachability and absence of regressions on the card-free path.
- Login page visual verification should include desktop and mobile viewport checks after production deploy.
