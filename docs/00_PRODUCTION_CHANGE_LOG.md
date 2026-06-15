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

## 2026-06-15 - PR-204-hood-discover-group-navigation

**Type:** Patch
**Code Commits:** PR #204 merged via `4335b0fd90baf72aca1e79b534959c20514e3c24`. Final PR head before merge: `8a7caf4983873238cc5de7a8bd68c8b15b5128ec`.
**Migration:** None
**Status:** Production deployed / code aligned; production smoke partial; Supabase Remote no change.

### Summary

Updates Hoods Discover so Club Members and City Players render all available groups at once instead of filtering to only one selected group. Club Members now shows venue chips based on the viewer's venue memberships and renders grouped venue sections below. City Players shows play-city chips and renders grouped city sections below. Chips act as smooth jump links with active state only; clicking a chip does not hide other groups.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally and in GitHub PR check | `git diff --check`; `npx tsc --noEmit`; `npm run build`; GitHub Build and typecheck check |
| Conflict scan | Passed | PR #204 conflict scan reported low risk; no configured high-conflict areas touched |
| Vercel Preview | Passed | Vercel Preview for PR #204 reached Ready |
| Local browser QA | Passed | Disposable `.test` QA account on `localhost:3003` verified Club Members venue chips/sections and City Players city chips/sections; chip clicks updated active state and did not hide other groups |
| Vercel Production | Deployed successfully | GitHub Deployment `5070694233` for merge commit `4335b0fd90baf72aca1e79b534959c20514e3c24` reached `success`; deployment URL `https://playerhoods-codex-cdjekjz74-nancys-projects-128e326c.vercel.app` |
| Supabase Remote | No change | No migration added or applied |
| Real SMS/email/provider traffic | Not sent | Validation used a disposable `.test` QA account locally only; no production notification, email, SMS, or provider delivery was triggered |
| Production verification | Partial / blocked | Light production smoke workflow #27574905002 passed login page reachability, but reported BLOCKED because the repo has no `npm run smoke:production` script. Per release governance, login reachability alone is not full production verification. |

### Rollback

- Code rollback: revert PR #204 and redeploy the previous production commit.
- Database rollback: none required because this patch has no migration or backend contract change.
- Provider rollback: none; no invite/email/SMS/notification provider configuration or traffic changed.

### Notes

- No DB migration.
- No Supabase Remote action.
- No notification, email, SMS, reminder, or provider behavior change.
- The Codex PR review workflow failed because the action reported quota exceeded; this was not a code or build failure. Required Build/typecheck, Vercel Preview, and conflict scan checks passed before merge.
- Production core Hoods Discover browser validation remains pending because only light reachability smoke was run on production.

## 2026-06-07 - MR-20260607-match-board-upcoming-sections

**Type:** Patch
**Code Commits:** PR #148 merged via `cba2c7c`. Final PR head before merge: `35dcfaa`.
**Migration:** None
**Status:** Production deployed / smoke verified; Supabase Remote no change.

### Summary

Reorganizes the dashboard Match Board Upcoming tab into Action Needed, My Matches, and Looking for Players without a separate Today Alerts section. Same-day urgent needs-player warnings and time conflicts are shown inline on the relevant My Matches card with a leading status icon and warning accent. Compact rows use tighter list density with reduced row-to-row gaps, preserve the full date/time, move mobile actions below match content, and hide zero-count Looking for Players sections without adding notification, email, SMS, DB, or Calendar behavior changes.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally | `git diff --check`; `npx tsc --noEmit`; `npm run build` |
| Manual Match Board visual check | Passed locally | Browser DOM QA at `http://localhost:3005/dashboard` verified no Today Alerts section, hidden zero-count Looking for Players section, no visible time range or row overflow, mobile Action Needed at ~82px, mobile My Matches rows at ~64px, and tighter row-to-row gaps |
| Production deployment | Success / smoke verified | Deployment `4966446756` for merge commit `cba2c7c` completed at `2026-06-07T17:37:52Z`; URL: `https://playerhoods-codex-qu8oz2r1b-nancys-projects-128e326c.vercel.app`. Later production deployment `26f90a3` succeeded at `2026-06-07T17:41:28Z` and superseded it while retaining PR #148 changes. |
| Supabase Remote | No change | No migration added or applied |
| Real SMS/email/provider traffic | Not sent | No invite/email/SMS/notification provider traffic is part of this branch |
| Production verification | Passed | Owner reported production smoke completed on `2026-06-08`. |

### Rollback

- Code rollback: revert the Match Board Upcoming tab patch and redeploy the previous production commit.
- Database rollback: none required because this patch has no migration or backend contract change.
- Provider rollback: none; no invite/email/SMS/notification provider configuration or traffic changed.

### Notes

- No DB migration.
- No Supabase Remote action.
- No Today Alerts section or `No urgent alerts today` placeholder.
- No zero-count Looking for Players section in Upcoming.
- Compact Match Board rows are list-like, not large promotional cards.
- No Calendar redesign.
- No notification, email, SMS, reminder, or provider behavior change.
- `Not this time` uses the existing in-app invitation decline/withdraw path for pending invitation responses only.

## 2026-06-07 - MR-20260607-dashboard-selected-match-roster-normalization

**Type:** Patch
**Code Commits:** PR #137 merged at `dc5cb04157ef36b373aaf9fdb7b234245a554e89`. Final PR head before merge: `5251b20c7f1906d05cd9a723a459ca99834ced97`.
**Migration:** None
**Status:** Production deployed / code aligned; production smoke pending; Supabase Remote no change.

### Summary

Fixes dashboard selected-match detail normalization so non-host participant/requester views do not show a lower confirmed player count than the Match Board. Confirmed players visible on the Match Board are used as the floor for the embedded Match Detail view, without exposing pending/waiting/private host-management rows.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally and in GitHub PR check | `git diff --check`; `npx tsc --noEmit`; `npm run build`; GitHub Build and typecheck check |
| Vercel Preview | Passed; owner visual review accepted | Owner visual review accepted on Vercel Preview for PR #137 |
| Vercel Production | Deployed successfully | GitHub Deployment `4962397761` for merge commit `dc5cb04157ef36b373aaf9fdb7b234245a554e89` reached `success`; deployment URL `https://playerhoods-codex-73mugf12z-nancys-projects-128e326c.vercel.app` |
| Supabase Remote | No change | No migration added or applied |
| Real SMS/email/provider traffic | Not sent | No invite/email/SMS/notification provider traffic was sent by Codex validation |
| Production verification | Pending | Owner visual review accepted on Vercel Preview; production smoke pending |

### Rollback

- Code rollback: revert PR #137 and redeploy previous production commit.
- Database rollback: none required because this patch has no migration or backend contract change.
- Provider rollback: none; no invite/email/SMS/notification provider configuration or traffic changed.

### Notes

- No DB migration.
- No backend contract change.
- No Supabase Remote action.
- No provider traffic.
- No Add Players change.
- No roster action behavior change.
- PR #137 fixed dashboard selected-match detail normalization so non-host participant/requester views no longer show a lower confirmed player count than the Match Board.
- Production smoke has not been run.
- This patch targets the dashboard selected-match detail path and does not claim to change all direct match-detail entry paths.

## 2026-06-06 - MR-20260606-mobile-roster-row-actions

**Type:** Patch
**Code Commits:** PR #130 merged at `6347088274ef6a4dd758340500045a8b8aeb856c`. Final PR head before merge: `53bd3945a068487c5eb27409267b07070974baab`.
**Migration:** None
**Status:** Production deployed / code aligned; production smoke pending; Supabase Remote no change.

### Summary

Adds a mobile roster row action sheet for existing participant actions, including Remove from Lineup, Cancel Invite, Add to Lineup, Not This Time, Remove from Waitlist, and existing self withdraw/cancel actions, using existing APIs and lifecycle behavior.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally and in GitHub PR check | `git diff --check`; `npx tsc --noEmit`; `npm run build`; GitHub Build and typecheck check |
| Vercel Preview | Passed; owner visual review accepted | Owner visual review accepted on Vercel Preview for PR #130 |
| Vercel Production | Deployed successfully | GitHub Deployment `4961894318` for merge commit `6347088274ef6a4dd758340500045a8b8aeb856c` reached `success`; deployment URL `https://playerhoods-codex-1mv3f1hmk-nancys-projects-128e326c.vercel.app` |
| Supabase Remote | No change | No migration added or applied |
| Real SMS/email/provider traffic | Not sent | Visual testing opened action sheets only and did not execute remove/cancel/approve/withdraw actions |
| Production verification | Pending | Owner visual review accepted on Vercel Preview; production smoke pending |

### Rollback

- Code rollback: revert PR #130 and redeploy previous production commit.
- Database rollback: none required because this patch has no migration or backend contract change.
- Provider rollback: none; no invite/email/SMS/notification provider configuration or traffic changed.

### Notes

- No DB migration.
- No backend contract change.
- No Supabase Remote action.
- No Add Players change.
- No Contact Player rule change.
- No lifecycle semantic change.
- No provider traffic during validation.
- Visual testing opened action sheets only and did not execute remove/cancel/approve/withdraw actions.
- PR #130 added mobile roster row action sheet using existing participant actions.
- Safe production smoke was not run because it was not explicitly approved.

## 2026-06-06 - MR-20260606-add-players-mobile-labels-polish

**Type:** Patch
**Code Commits:** PR #118 merged at `d9ef92c06dbf2ad414f2932b96bd8fd32bb9cf2e`. Final PR head before merge: `ee895a5ba56c97b44ce06913cac333f70db9a695`.
**Migration:** None
**Status:** Production deployed / code aligned; production smoke pending; Supabase Remote no change.

### Summary

Polishes Add Players method labels and layout across Existing Match Add More Players and Create Match Step 2. Updates visible copy to `Post to Board` / `Share Link`, widens mobile method buttons, keeps mobile search and filter on one row, removes the `People` filter, clarifies Board visibility with `Visible to`, moves Share Link copy feedback into the Share Link section, and prevents raw fallback labels such as `User e70ae6`.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally and in GitHub PR check | `git diff --check`; `npx tsc --noEmit`; `npm run build`; GitHub Build and typecheck check |
| Vercel Preview | Passed; owner visual review accepted | Preview deployed from PR #118 head; owner accepted visual review on Vercel Preview before merge |
| Vercel Production | Deployed successfully | GitHub Deployment `4959665952` for merge commit `d9ef92c06dbf2ad414f2932b96bd8fd32bb9cf2e` reached `success`; deployment URL `https://playerhoods-codex-eljp61ni8-nancys-projects-128e326c.vercel.app` |
| Supabase Remote | No change | No migration added or applied |
| Real SMS/email/provider traffic | Not sent | No invite/email/SMS/notification provider traffic was sent by Codex validation |
| Production verification | Pending | Owner visual review accepted on Vercel Preview; production smoke pending |

### Rollback

- Code rollback: revert PR #118 and redeploy the previous production commit.
- Database rollback: none required because this patch has no migration or backend contract change.
- Provider rollback: none; no invite/email/SMS/notification provider configuration or traffic changed.

### Notes

- No DB migration.
- No backend contract change.
- No Supabase Remote action.
- No production smoke was run or claimed in this entry.
- No share-link / magic-link / Request-a-Spot backend behavior change.
- No Contact Player rule change.
- No roster/lineup management change.
- No invite/email/SMS/notification provider traffic.
- PR #118 polished Add Players mobile/desktop labels and layout after #113, including `Post to Board` / `Share Link` labels, mobile method button sizing, Share Link feedback placement, filter wording, `Visible to` copy, and safe display-name fallback.

## 2026-06-05 - SR-20260605-scoped-form-match-delivery-drain

**Type:** Structural Release
**Code Commits:** PR #112 merged at `22e4db39ad238a316742ab1f0331a0430dfed56e`. Final PR head before merge: `d571d81e6e22de91e7364247233cd85a1970358b`.
**Migration:** `supabase/migrations/20260605184500_scoped_confirmed_lineup_delivery_drain.sql` applied to Supabase Remote before merge.
**Status:** Production aligned / limited reachability verification complete; full scoped notification delivery smoke and unauthenticated public join verification email delivery verification pending.

### Summary

- Adds scoped `confirmed_lineup` notification delivery drain after Form Match.
- Adds a service-role-only scoped claimant RPC for queued `confirmed_lineup` notification deliveries belonging to one match.
- Updates manual Form Match confirmation to process only the newly queued current-match `confirmed_lineup` deliveries through the existing notification worker path.
- Does not enable the generic queued-delivery drain and does not claim unrelated notification backlog.
- Does not add request-created, host-action, approval, public signup, or public `/join/[token]` notifications.
- Does not change Contact Player, public signup verification email, PR #98, or PR #104 behavior.
- Known issue: unauthenticated public join verification email delivery returned `email-delivery-unavailable` in manual testing; this release does not fix or verify that path.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally | `npx tsc --noEmit`; `npm run build` |
| Static guards | Partially blocked locally | `node scripts/check-issue58-reminder-drain.mjs` passed. `npm run verify:build` failed in existing `check-issue55-reminder-cron.mjs` copy guard: Create Match reminder copy must say `day before at 5:00 PM`; unrelated to scoped drain files |
| Diff whitespace | Passed locally | `git diff --check`, with Windows LF-to-CRLF warnings only |
| SQL regression | Passed in GitHub; blocked locally | GitHub SQL Regression Check passed for PR #112 latest head. New suite `test_runner_scoped_confirmed_lineup_drain` covers scoped claiming and non-claiming boundaries. Local `npm run verify:sql` could not connect to Docker Desktop Linux engine / local Supabase container |
| Supabase Remote | Applied | `npx supabase db push --linked --yes` applied only `20260605184500_scoped_confirmed_lineup_delivery_drain.sql`; `npx supabase migration list --linked` showed `20260605184500 | 20260605184500 | 2026-06-05 18:45:00` |
| Vercel Production | Deployed | GitHub Deployment `4952404344` for merge commit `22e4db39ad238a316742ab1f0331a0430dfed56e` reached `success`; Vercel deployment URL `https://playerhoods-codex-nxq95aype-nancys-projects-128e326c.vercel.app` |
| Real SMS/email/provider traffic | Not sent by Codex | No provider sends, production drains, real emails, SMS, or notifications |
| Production verification | Limited reachability smoke passed; notification smoke pending | `https://www.playerhoods.com/`, `https://www.playerhoods.com/login`, and the Vercel deployment URL returned HTTP 200. Full Form Match / scoped notification smoke was not run because no safe production match and safe recipients were approved |
| Public join email verification | Known issue / not verified | Unauthenticated `/join/[token]` verification email returned `email-delivery-unavailable` in manual testing. Registered-user public join path is separate and remains OK. Do not mark public Open to Join email delivery or full `/join` flow as verified until follow-up provider/env audit passes |

### Rollback

- Code rollback: revert the PR merge commit if merged.
- Database rollback: follow-up migration revoking and dropping `public.rpc_get_queued_confirmed_lineup_deliveries_for_match(uuid, integer)`.
- Operational rollback: disable the Form Match scoped drain call by reverting the server action change; do not run any broad queue drain unless separately approved.
- Provider rollback: none; no provider configuration changed.

## 2026-06-05 - MR-20260605-shared-add-players-picker

**Type:** Mini Release
**Code Commits:** PR #113 merged at `e5d5e1e459001fe376ec7c501ba38814dfce0b62`. Final PR head before merge: `085d3df37877d84f95825cbd03554d5683088fff`.
**Migration:** None
**Status:** Production deployed / owner safe smoke completed with no blocking issue observed; Supabase Remote no change.

### Summary

Introduces shared Add Players picker across Create Match Step 2 and Existing Match Add More Players with Invite / Post Player Call / Share a Link methods, chip-based candidate selection, and no backend behavior changes.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally and in GitHub PR check | `git diff --check`; `npx tsc --noEmit`; `npm run build`; GitHub Build and typecheck check |
| Vercel Preview | Passed; owner visual review accepted | Preview deployed from PR #113 head; owner accepted visual review on Vercel Preview before merge |
| Vercel Production | Deployed successfully | GitHub Deployment `4954439621` for merge commit `e5d5e1e459001fe376ec7c501ba38814dfce0b62` reached `success`; deployment URL `https://playerhoods-codex-69d491wu7-nancys-projects-128e326c.vercel.app` |
| Supabase Remote | No change | No migration added or applied |
| Real SMS/email/provider traffic | Not sent | No invite/email/SMS/notification provider traffic was sent by Codex validation |
| Production verification | Owner safe smoke completed; no blocking issue observed | Owner visual review accepted on Vercel Preview; owner safe production smoke completed without reporting a blocking issue. This entry does not mark the release fully verified |

### Rollback

- Code rollback: revert PR #113 and redeploy the previous production commit.
- Database rollback: none required because this release has no migration or backend contract change.
- Provider rollback: none; no invite/email/SMS/notification provider configuration or traffic changed.

### Notes

- No DB migration.
- No backend contract change.
- No Supabase Remote action.
- No share-link / magic-link / Request-a-Spot backend behavior change.
- No Contact Player in Player Call targets.
- No invite/email/SMS/notification provider traffic.
- Owner safe production smoke completed; no blocking issue observed. This is not a full QA verification.
- Codex PR review failed due quota infrastructure limits, not a code failure.

## 2026-06-05 - DB-20260605-public-join-registered-request

**Type:** Structural Release
**Code Commits:** PR #106 merged at `1bad9af794c7941486ca7462cb2131a984db0a53`. Final PR head before merge: `4f601a1a06b89c3e86d639acd835a62e12621686`.
**Migration:** `supabase/migrations/20260605153000_logged_in_public_join_request.sql` applied to Supabase Remote before merge.
**Status:** Production aligned / limited verification complete; full scoped `/join/[token]` smoke pending safe production token and registered test session.

### Summary

- Added authenticated-only public-token request RPC for logged-in registered users opening `/join/[token]`.
- The new RPC resolves the existing Open to Join token, rejects anonymous callers and hosts, and writes through `apply_participant_admission(..., 'requested')`.
- Logged-in users on `/join/[token]` no longer see name/email entry or email verification; they see match details and must explicitly click `Request a Spot`.
- Existing unauthenticated public signup verification and Contact Player public flow are unchanged.
- Added SQL regression coverage for token authorization outside normal scope, anonymous rejection, organizer rejection, idempotency, user-based participant rows, pending host action, and unchanged public signup coverage.
- Types note: `src/lib/types/database.ts` was manually updated because this repository currently has no typegen command/script and appears to maintain this file as an app-level database interface. This is a policy tension with `docs/prelaunch_schema_policy.md`; follow-up should add a proper Supabase typegen workflow and regenerate types rather than relying on silent manual edits.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally | `npx tsc --noEmit`; `npm run build` |
| Diff whitespace | Passed locally | `git diff --check`, with Windows LF-to-CRLF warnings only |
| SQL regression | Passed in GitHub; blocked locally | GitHub SQL Regression Check passed for PR #106. Local `npm run verify:sql` could not connect to Docker Desktop Linux engine / local Supabase container |
| Supabase Remote | Applied | `npx supabase db push --linked --yes` applied only `20260605153000_logged_in_public_join_request.sql`; `npx supabase migration list --linked` showed `20260605153000 | 20260605153000 | 2026-06-05 15:30:00` |
| Real SMS/email/provider traffic | Not sent by Codex | No provider sends, queue drains, real emails, SMS, public signup creation, or notification mutation smoke |
| Vercel Production | Deployed | GitHub Deployment `4949919115` for merge commit `1bad9af794c7941486ca7462cb2131a984db0a53` reached `success`; Vercel deployment URL `https://playerhoods-codex-mw6p06yep-nancys-projects-128e326c.vercel.app` |
| Production verification | Limited smoke passed; scoped join smoke pending | `https://www.playerhoods.com/` and `https://www.playerhoods.com/login` returned HTTP 200 from Vercel. Full logged-out/logged-in `/join/[token]` smoke was not run because no safe production Open to Join token and registered test-user session were available |

### Rollback

- Code rollback: revert merge commit `1bad9af794c7941486ca7462cb2131a984db0a53`.
- Database rollback: follow-up migration dropping/revoking `public.rpc_public_match_registered_request_join(uuid)`.
- App rollback: restore previous `/join/[token]` behavior so all public join requests use the unauthenticated name/email verification flow.
- Provider rollback: none; no email/SMS/provider configuration changed.

## 2026-06-04 - STRUCTURAL-20260604-join-link-request-a-spot-v2

**Type:** Structural Release
**Code Commits:** PR #101 merged at `7c551aadd568f0d19f61e6edd796d61fc7f683e8`. Final PR head before merge: `7df41ecb88736753219d33fd99803c0aaef04fae`.
**Migration:** None
**Status:** Production deployed / code aligned; full production shared-link browser/email smoke pending; no Supabase Remote change

### Summary

PR #101 updates the player-facing Join by Shared Link flow to the revised v2 `Request a spot` copy and one-click email verification behavior:

- Public join-link page uses `Request a spot` language and collects Name plus Email only.
- After submit, the player sees `Check your email` with match context and inbox/spam/junk/safe-sender guidance.
- Verification email subject/body now use `Verify your email to request a spot` language.
- Verification link GET is non-mutating and renders a lightweight finishing page with match context.
- The finishing page automatically POSTs to finalize the pending request, then redirects to `Request sent`; no second user decision is required.
- The `Request sent` state performs a read-only backend confirmation that the signup was finalized and has an active participant before rendering success.
- If JavaScript is unavailable, a fallback `Finish request` button can submit the same idempotent POST.
- Success copy includes `We'll email you when the host responds.`
- Focused repeated-verification SQL regression coverage was added.
- No Host-management copy, MatchToolsSection, MatchManagePanel, Post Player Call, Hood player-call behavior, DB schema, Supabase migration, SMS, marketing campaign, or provider configuration changed.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally and in GitHub PR check | `npx tsc --noEmit`; `npm run build`; GitHub Build and typecheck check |
| Diff whitespace | Passed locally | `git diff --check`, with Windows LF-to-CRLF warnings only |
| SQL regression | Passed in GitHub; not run locally | GitHub SQL regression check passed for PR #101 and covers repeated verification idempotency. Local SQL runner was not executed because Docker Desktop Linux engine was unavailable. |
| Vercel Preview | Passed deploy; smoke not run | Preview deploy passed before merge; no real email/browser smoke was run |
| Vercel Production | Deployed | Vercel auto-deploy for merge commit `7c551aadd568f0d19f61e6edd796d61fc7f683e8` completed successfully: `https://vercel.com/nancys-projects-128e326c/playerhoods-codex/2yK8VKuvsYSESvPeQT5PTPGkhKD8` |
| Supabase Remote | Not changed | No migration added or applied |
| Real SMS/email/provider traffic | Not sent by Codex | No production smoke, provider send, queue drain, or notification/email/SMS delivery was run |
| Production smoke | Not run | Full shared-link browser/email smoke still needs a safe join link and disposable inbox |

### Post-Merge Status

1. PR #101 merged to `main` at merge commit `7c551aadd568f0d19f61e6edd796d61fc7f683e8`.
2. Vercel auto-deploy for the merge commit completed successfully.
3. No Supabase migration was added or applied.
4. No production smoke was run and no real email delivery was triggered by Codex.
5. Remaining before full verification: run controlled production smoke with a fresh join link and disposable inbox; do not reuse exposed tokenized links.

### Rollback

- Code rollback: revert merge commit `7c551aadd568f0d19f61e6edd796d61fc7f683e8` or redeploy the previous Vercel Production commit.
- Database rollback: none required because this patch has no migration or remote Supabase change.
- Provider rollback: none performed by Codex; no provider configuration was changed.
- Do not run production notification/email/SMS drains during rollback unless separately approved.

### Known Risks

- Local SQL regression was not run because Docker Desktop Linux engine was unavailable; GitHub SQL regression passed.
- Full real end-to-end shared-link browser/email smoke still needs a safe public join link and disposable test email to verify the production email click path without exposing tokens or PII.

## 2026-06-04 - UI-20260604-issue96-public-signup-pending-polish

**Type:** UI Polish
**Code Commits:** PR #97 implementation commit `5a5a4f944ec6757576c851ea06b87f86aff0af58`; final PR head and merge commit pending
**Migration:** None
**Status:** GitHub PR / Vercel Preview only; not merged; no Vercel Production deploy by Codex; no Supabase Remote change; production not verified

### Summary

PR #97 fixes Issue #96 by polishing the production-facing public signup pending UI after email verification:

- Public signup verification success page now uses friendlier `Request sent` copy.
- Removed user-facing status badges from the verification success page.
- Removed `Email verified` and `Pending approval` badges from the host pending request row.
- Host can still see the request and use Add to Lineup through the existing lifecycle.
- This is UI display/copy only.
- No DB schema, Supabase migration, RPC, RLS, email/SMS, notification delivery, marketing opt-in, or lifecycle behavior changed.
- No raw email, phone, marketing consent, token, or hash exposure was added.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally and in GitHub PR check | `npx.cmd tsc --noEmit`; `npm run build`; GitHub Build and typecheck check |
| Diff whitespace | Passed locally | `git diff --check`, with Windows LF-to-CRLF warnings only |
| SQL regression | Not applicable | No DB migration, grant, RLS, or SQL test surface changed |
| Vercel Preview | Passed | Preview only; no production deployment performed by Codex |
| Supabase Remote | Not changed | No migration added or applied |
| Real SMS/email/provider traffic | Not sent by Codex | No production smoke, provider send, queue drain, or notification/email/SMS delivery was run |
| Production verification | Not verified | Requires owner-approved merge, Vercel Production auto-deploy, and continued controlled public signup smoke |

### Release Order

1. Merge PR #97 only after owner approval and green review/check gates.
2. Let Vercel Production auto-deploy the merge commit.
3. Continue controlled public signup production smoke with a fresh signup and newly generated verification email.
4. Confirm:
   - Public signup verification email is delivered through the production provider.
   - Verification link opens.
   - POST confirmation creates a pending public signup request.
   - Verification success page shows the friendly `Request sent` copy.
   - Host pending request row does not show `Email verified` or `Pending approval` badges.
   - Host can add the player through the existing Add to Lineup lifecycle.
   - Phone-only path remains blocked with SMS-coming-next copy.
   - No SMS, marketing email, unrelated provider traffic, or queue drain occurs.

### Rollback

- Code rollback: revert the PR #97 merge commit or redeploy the previous Vercel Production commit.
- Database rollback: none required because this UI polish has no migration or remote Supabase change.
- Provider rollback: none performed by Codex; no provider configuration was changed.
- Do not run production notification/email/SMS drains during rollback unless separately approved.

### Known Risks

- This PR does not mark the public signup flow fully validated in production.
- Production smoke remains required after merge/deploy and must not reuse previously exposed verification links or tokens.

## 2026-06-04 - HOTFIX-20260604-issue94-public-signup-verify-link-404

**Type:** Hotfix
**Code Commits:** PR #95 implementation commit `8f5872b3b46cb55af25e6bc006a3a4e29fa95591`; final PR head and merge commit pending
**Migration:** None
**Status:** GitHub PR / Vercel Preview only; not merged; no Vercel Production deploy by Codex; no Supabase Remote change; production not verified

### Summary

This hotfix addresses the Issue #94 public signup verification-link 404 found during controlled production smoke after PR #77 and PR #93:

- Public signup submit reached the verification-email step and the production provider delivered the email.
- Opening the verification email link returned a Next.js 404 before POST confirmation.
- Safe diagnosis showed the App Router route was deployed and middleware passed `/join/[token]/verify`.
- The failing link shape used `?signup=...&token=...`, where the verification query parameter name collided with the dynamic public signup route token.
- New verification emails now use `verification_token=...` for the email verification secret.
- The verify page and POST action keep `publicToken`, `signupId`, and `verificationToken` separate.
- The verify page keeps a best-effort legacy `token` query fallback for already-sent emails if the value is safely available from `searchParams`.
- Missing or malformed verification input now renders a safe invalid-verification state instead of a raw 404.
- GET render remains non-mutating; participant creation still requires explicit POST confirmation.
- No DB schema, grants, RLS, email provider config, notification drain, SMS, or marketing behavior changes are included.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally at PR stage | `npx.cmd tsc --noEmit`; `npm run build` |
| Diff whitespace | Passed locally at PR stage | `git diff --check`, with Windows LF-to-CRLF warnings only |
| SQL regression | Not applicable | No DB migration, grant, RLS, or SQL test surface changed |
| Vercel Preview | Pending PR validation | Preview only; no production deployment performed by Codex |
| Supabase Remote | Not changed | No migration added or applied |
| Real SMS/email/provider traffic | Not sent by Codex | No production smoke, provider send, queue drain, or notification/email/SMS delivery was run by this hotfix |
| Production verification | Not verified | Requires owner-approved merge, Vercel Production auto-deploy, and a fresh controlled public signup smoke using a new verification email |

### Release Order

1. Merge PR #95 for Issue #94 only after owner approval and green review/check gates.
2. Let Vercel Production auto-deploy the merge commit.
3. Rerun controlled public signup production smoke from a fresh signup and a newly generated verification email. Do not reuse any previously exposed verification link or token.
4. Confirm:
   - Anonymous user opens public signup link.
   - Name plus email signup starts verification.
   - Actual verification email is delivered through the production provider.
   - The new verification link opens a safe confirmation page.
   - POST confirmation creates a pending public signup request.
   - Host sees the pending public signup without raw email/phone.
   - Host can add the player through the existing lifecycle.
   - Phone-only path remains blocked with SMS-coming-next copy.

### Rollback

- Code rollback: revert the PR #95 merge commit or redeploy the previous Vercel Production commit.
- Database rollback: none required because this hotfix has no migration or remote Supabase change.
- Provider rollback: none performed by Codex; no provider configuration was changed.
- Do not run production notification/email/SMS drains during rollback unless separately approved.

### Known Risks

- Already-sent verification emails using `token=...` have a best-effort fallback, but any tokenized URL exposed in screenshots or chat should not be reused as final smoke evidence.
- Production smoke must use a newly generated verification email and must not report raw signup ids, verification tokens, raw emails, phone numbers, or full verification links.

## 2026-06-03 - HOTFIX-20260603-issue92-public-signup-start-failure

**Type:** Hotfix
**Code Commits:** PR #93 implementation commits `b544d551d95c62e26dcd7d589b2fef5c48080b23` and `fb11f3f2dbaffb997b572a43cdd1526ab07f07f7`; final PR head and merge commit pending
**Migration:** None
**Status:** GitHub PR / Vercel Preview only; not merged; no Vercel Production deploy by Codex; no Supabase Remote change; production not verified

### Summary

This hotfix improves the production-facing public match signup start path after Issue #92 smoke found the anonymous name plus email submit showing the generic signup failure before any verification email was delivered:

- Splits public signup start failures into stage-specific service client, RPC start, email delivery disabled, email send/template/runtime, delivery-result audit, and unexpected payload paths.
- Keeps the service-role public signup RPC path server-only.
- Shows explicit verification-email failure copy when verification email delivery is unavailable or fails.
- Prevents non-critical delivery-result/audit recording failures after a successful verification email send from becoming a generic signup failure.
- Records email/template/runtime delivery failures as `failed` with safe internal error codes instead of `skipped` / `delivery_disabled`.
- Keeps public signup action logs allowlisted and PII-safe: no raw email, phone, verification token/link, email hash, marketing consent details, provider payloads, arbitrary serialized errors, or raw error messages are logged by the action.
- Confirms the marketing opt-in checkbox remains unchecked by default and only records opt-in when explicitly checked.
- Does not change DB schema, grants, RLS, match lifecycle semantics, SMS, notification drains, or provider configuration.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally and in GitHub PR check | `npx.cmd tsc --noEmit`; `npm run build`; GitHub Build and typecheck check |
| Diff whitespace | Passed locally | `git diff --check`, with Windows LF-to-CRLF warnings only |
| SQL regression | Not applicable | No DB migration, grant, RLS, or SQL test surface changed |
| Vercel Preview | Passed | Preview only; no production deployment performed by Codex |
| Supabase Remote | Not changed | No migration added or applied |
| Real SMS/email/provider traffic | Not sent by Codex | No production smoke, provider send, queue drain, or notification/email/SMS delivery was run |
| Production verification | Not verified | Requires owner-approved merge, Vercel Production auto-deploy, and controlled #77/#92 public signup smoke |

### Release Order

1. Merge PR #93 only after owner approval and green review/check gates.
2. Let Vercel Production auto-deploy the merge commit.
3. Rerun controlled public signup production smoke:
   - Host can create/copy a public signup link.
   - Anonymous user can open the link.
   - Name plus email signup starts verification.
   - The actual verification email is delivered through the configured production email provider.
   - Verification link opens and POST confirmation creates a pending public signup request.
   - Host sees the pending public signup without raw email/phone.
   - Phone-only path remains blocked with SMS-coming-next copy.
4. Do not mark smoke passed unless the verification email is actually received through the production provider. Queue/audit row creation alone is not enough.
5. Do not manually drain unrelated production notification/email/SMS queues during smoke.

### Rollback

- Code rollback: revert the PR #93 merge commit or redeploy the previous Vercel Production commit.
- Database rollback: none required because this hotfix has no migration or remote Supabase change.
- Provider rollback: none performed by Codex; no provider configuration was changed.
- Do not run production notification/email/SMS drains during rollback unless separately approved.

### Known Risks

- This hotfix improves diagnostics and failure handling for plausible public signup start failure paths; it does not by itself prove the confirmed production root cause.
- If Vercel is missing or misconfigures `SUPABASE_SERVICE_ROLE_KEY`, the fix remains a Vercel environment correction, not a code workaround.
- Production smoke must still verify actual public signup verification email delivery through the configured production email provider after merge/deploy.

## 2026-06-03 - SECURITY-20260603-issue87-verified-email-view-access

**Type:** Security Hotfix
**Code Commit:** PR #87 branch head; final merge commit pending
**Migration:** `20260603020000_issue87_verified_email_view_security.sql`
**Status:** GitHub PR only; not merged; no Vercel Production deploy; Supabase Remote not applied; production not verified

### Summary

This security hotfix addresses the Supabase Advisor critical finding for `public.v_user_verified_emails`:

- `public.v_user_verified_emails` is a normal public-schema view derived partly from `auth.users.email`.
- Direct `anon` and `authenticated` access is revoked in the migration.
- A caller-scoped `rpc_my_verified_emails()` RPC returns only the current authenticated user's verified email rows.
- Dashboard loading becomes RPC-first with a temporary server-side fallback to the existing view for the merge-before-migration window.
- No `auth.users` rows are modified, no data is backfilled or deleted, and no provider traffic is touched.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Pending PR validation | `npx tsc --noEmit`; `npm run build` required before merge |
| Diff whitespace | Pending PR validation | `git diff --check` required before merge |
| SQL regression | Pending GitHub PR check | Issue #87 runner verifies view grants and caller-scoped RPC behavior |
| Vercel Preview | PR-stage only | Preview only; no production deployment performed by this entry |
| Supabase Remote | Not applied | Migration requires separate owner L5 approval |
| Real SMS/email/provider traffic | Not sent | This patch does not touch delivery code |
| Production verification | Not verified | Requires owner-approved merge/deploy, remote migration apply, and dashboard smoke |

### Release Order

1. Merge #87 app code after owner approval so production can use RPC-first behavior with a temporary server-side fallback.
2. Let Vercel Production auto-deploy the merge commit.
3. At explicit L5 gate, apply the Supabase Remote migration.
4. Confirm `anon` and `authenticated` cannot select `public.v_user_verified_emails`.
5. Confirm authenticated dashboard loading works through `rpc_my_verified_emails()`.
6. Confirm Supabase Advisor critical issue is resolved or reduced.
7. Resume #77 Phase B only after this security hotfix is complete.

### Rollback

- Before Supabase Remote migration apply: revert the app change or redeploy the previous production commit.
- After Supabase Remote migration apply: use a forward-only migration to restore a safe compatible read path if needed. Do not restore broad public view access except as an explicitly approved emergency rollback.
- Do not run production notification/email/SMS drains during rollback.

### Known Risks

- The remote migration must not be applied before production app code has the RPC-first/fallback path unless a separate no-downtime plan is approved.
- The temporary fallback should stop being used after the remote migration because direct `authenticated` view access is revoked.

## 2026-06-03 - PATCH-20260603-remove-onboarding-intro-carousel

**Type:** Patch
**Code Commit:** GitHub PR #86 branch `codex/remove-onboarding-intro-carousel`; functional commit `78b33991d5e35d01cd66a9663eccf3637e52a225`
**Migration:** None
**Status:** GitHub PR / Vercel Preview only; not merged; no Vercel Production deploy; no Supabase Remote change

### Summary

This patch removes the repeated post-login onboarding intro carousel as a required step before profile setup:

- New or incomplete users with incomplete profile setup are routed directly to `/onboarding/profile`.
- Users with completed profile/legal gates but incomplete next-step review are routed to `/onboarding/next-steps`.
- Completed users continue to their requested `next` path, normally `/dashboard`.
- `/onboarding/intro` is retained as a compatibility redirect only.
- Homepage hero carousel and dashboard marketing content are unchanged.
- No DB, migration, notification, email, SMS, delivery worker, or drain behavior is changed.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally | `npm run verify:build`; `npx tsc --noEmit` |
| Diff whitespace | Passed locally | `git diff --check`, with Windows LF-to-CRLF warnings only |
| Homepage hero carousel | Not code-touched | No homepage carousel logic or slide content changes |
| Supabase Remote | Not applied | No migration or remote DB action |
| Real SMS/email/provider traffic | Not sent | No notification/email/SMS code or drains touched |
| Production verification | Not verified | Requires owner-approved merge/deploy and smoke validation |

### Rollback

- Revert the eventual PR/commit for this patch to restore `/onboarding/intro` as the post-login profile setup entry.
- No database rollback is required because no migration or Supabase Remote change is included.

### Known Risks

- This is a production-visible routing change; manual smoke should verify fresh, incomplete, and completed user routing after deployment.
- Historical users with `onboarding_completed = true` but missing legal timestamps remain gated by the existing legal/profile routing behavior.

## 2026-06-02 - STRUCTURAL-20260602-issue76-public-match-signup

**Type:** Structural Release
**Code Commit:** PR #77 branch head; final merge commit pending
**Migrations:** `20260602193000_issue76_public_match_signup.sql`; `20260603161348_issue76_public_signup_rpc_grant_hardening.sql`
**Status:** GitHub PR / Vercel Preview only; app not merged; no Vercel Production deploy; base Supabase Remote migration and system actor config applied; corrective grant-hardening migration pending; production not verified

### Summary

This structural release adds the Issue #76 public match signup link flow:

- Hosts can create/copy an Open to Join public match signup link.
- Public signup requires name plus email for the active V1 verification channel; phone is optional metadata only.
- Email verification must complete before a match participant is created.
- Verified public signups create or reuse a system-level ownerless Contact Player/person identity and create a pending `requested` match participant.
- Organizer approval remains required before the participant enters the confirmed lineup.
- Host-facing metadata stays PII-safe: display name, public signup source, email verified flag, and pending/participant status only.
- Raw email, phone, marketing consent, token, and hash values are not exposed to host/public UI.
- Marketing opt-in may be captured, but marketing campaign sending is not part of this release.
- SMS/phone verification remains deferred to follow-up Issue #79.
- Public signup verification email provider sends are gated to Vercel Production or explicit `PUBLIC_MATCH_SIGNUP_VERIFICATION_EMAIL_DELIVERY` enablement; preview/local attempts record skipped delivery audit only.
- Production smoke must prove the verification email is actually delivered by the configured production email provider. Queue/audit row creation alone is not enough.
- Public signup compatibility/audit rows use a restricted configured system actor; the organizer is never used as fallback owner for public signup Contact Player rows.
- The corrective grant-hardening migration revokes default/PUBLIC and `anon` execute from host/authenticated-only public signup RPCs while preserving the public context RPC and service-only mutation RPC boundaries.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally and in GitHub PR check | `npx tsc --noEmit`; `npm run build`; GitHub Build and typecheck check |
| Diff whitespace | Passed locally | `git diff --check` |
| SQL regression | Passed in GitHub PR check | Local `npm run verify:sql` remains blocked when Docker/Supabase local is unavailable; GitHub SQL regression is the completed SQL evidence |
| Vercel Preview | PR-stage only | Preview only; no production deployment performed by this entry |
| Supabase Remote base migration | Applied | `20260602193000_issue76_public_match_signup.sql` was applied remotely before app merge at the approved L5 gate |
| Supabase Remote config | Written | `public.public_match_signup_config.system_actor_user_id` points to the approved production system actor |
| Supabase Remote corrective migration | Pending | `20260603161348_issue76_public_signup_rpc_grant_hardening.sql` must be applied before merging PR #77 |
| Real SMS/email/provider traffic | Not sent by Codex | No production drain or provider delivery may run without owner approval; production smoke must use only the approved public signup verification email path |
| Production verification | Not verified | Requires owner-approved corrective migration apply, PR merge, production deployment, and smoke verification |

### Release Order

Current production DB state before PR #77 merge:

- `20260602193000_issue76_public_match_signup.sql` has already been applied to Supabase Remote.
- `public.public_match_signup_config.system_actor_user_id` has already been written to the approved production system actor.
- `20260603161348_issue76_public_signup_rpc_grant_hardening.sql` is still pending remote apply and must be applied before PR #77 merge.

Remaining release order:

1. At explicit L5 approval, apply `20260603161348_issue76_public_signup_rpc_grant_hardening.sql` to Supabase Remote.
2. Rerun live RPC grant verification and confirm:
   - `rpc_public_match_signup_context(uuid)`: `anon`, `authenticated`, and `service_role` can execute.
   - `rpc_public_match_signup_link_get_or_create(uuid)`: `anon` cannot execute; `authenticated` and `service_role` can execute.
   - `rpc_public_match_signup_participant_metadata(uuid)`: `anon` cannot execute; `authenticated` and `service_role` can execute.
   - `rpc_public_match_signup_start(uuid, text, text, text, boolean)`: only `service_role` can execute.
   - `rpc_public_match_signup_verify(uuid, uuid, text)`: only `service_role` can execute.
   - `rpc_public_match_signup_record_delivery_result(uuid, text, text)`: only `service_role` can execute.
3. Run the production config preflight query confirming config exists, the configured actor id is present, and the actor exists in `auth.users`.
4. Merge PR #77 only after the corrective migration, grant verification, and config preflight pass.
5. Confirm Vercel Production is serving the merge commit and has email provider configuration available for verification delivery.
6. Run production smoke:
   - Host can create/copy a public signup link.
   - Anonymous user can open the public signup link.
   - Name plus email signup starts verification.
   - Verification email is actually delivered by the configured production email provider.
   - Verification link opens.
   - POST confirmation creates a pending request.
   - Host sees the pending public signup without raw email/phone.
   - Host uses Add to Lineup through the existing lifecycle.
   - Phone-only path remains blocked with SMS-coming-next copy.
7. Do not mark production smoke passed unless the actual public signup verification email is delivered through the production provider. Queue creation alone is not enough. Do not manually drain unrelated production notification/email queues.

### Production Preflight

Run after the corrective grant-hardening migration is applied and before PR #77 merge:

```sql
select
  cfg.system_actor_user_id as configured_actor_id,
  exists (
    select 1
    from auth.users u
    where u.id = cfg.system_actor_user_id
  ) as system_actor_exists
from public.public_match_signup_config cfg
where cfg.singleton_key = true;
```

Expected result: exactly one row and `system_actor_exists = true`.

### Rollback

- Before PR #77 merge: do not deploy app code; if the corrective grant-hardening migration apply fails, leave the app unmerged and use a follow-up forward migration to repair the grant state.
- After PR #77 merge but before successful production smoke: disable public signup link usage and revert or patch app code as needed, then redeploy the previous production commit if required.
- After Supabase Remote migration apply: use a forward-only migration/feature disable path to stop public signup usage or repair grants; do not edit already-applied migrations.
- Do not delete legacy schema objects as rollback.
- Do not run production notification/email/SMS drains during rollback unless separately approved.

### Known Risks

- App code calls new public signup RPCs, so production code and Supabase Remote schema must be released in a coordinated gate.
- Verification fails closed until the restricted `public_match_signup_config` row points to a real Supabase Auth system actor. This is intentional and must be preflighted before merge.
- The grant-hardening migration is required even though the base public signup migration and config are already remote; skipping it leaves host/authenticated-only RPCs executable by `anon`.
- Verification email delivery uses a direct provider-send path from the server action when production-gated. Production smoke must prove delivery through that provider path and must not run broad production notification/email drains.
- Local SQL verification may remain blocked when Docker Desktop / Supabase local is unavailable; rely on GitHub SQL regression before review approval.

## 2026-06-02 - PATCH-20260602-issue72-host-exit-visibility

**Type:** Patch
**Code Commit:** PR #75 branch head; final merge commit pending
**Migration:** `20260602170000_issue72_host_exit_visibility_notifications.sql`
**Status:** GitHub PR / Vercel Preview only; not merged; no Vercel Production deploy; no Supabase Remote change

### Summary

This patch improves host visibility when an active formed match loses a canonically confirmed lineup participant:

- Keeps match lifecycle/status semantics unchanged; matches remain Game On/Formed when the lineup becomes short.
- Adds host-only lineup-short warnings on match list/detail read models for active matches only.
- Enriches host Inbox removal notifications with participant display name, exit time, match snapshot, and canonical confirmed count.
- Updates the participant-removal notification trigger to notify the organizer with `host_lineup_short_after_formed` only when an active formed match becomes short after losing a participant with both `participant_accepted_at` and `org_approved_at` set.
- Preserves legacy non-host `delegate_target_removed` wording/semantics and removed-user notification paths.
- Adds Issue #72 SQL regression coverage for canonical confirmation, host-vs-delegator notification separation, active-match suppression, pre-formation suppression, duplicate normal-path notification prevention, and Contact Player display-name resolver behavior.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally at PR stage | `npx tsc --noEmit`; `npm run build` |
| Diff whitespace | Passed locally at PR stage | `git diff --check`, with Windows LF-to-CRLF warnings only |
| SQL regression | Pending GitHub PR check; blocked locally if Docker is unavailable | GitHub SQL regression required after push; local `npm run verify:sql` depends on Docker/Supabase local availability |
| Vercel Preview | PR-stage | Preview only; no production deployment performed by this PR |
| Supabase Remote | Not applied | Migration is committed for review only; owner approval required before remote apply |
| Real SMS/email/provider traffic | Not sent | This patch does not touch SMS/email drains or provider sends |
| Production verification | Not verified | Requires owner-approved merge/deploy and Supabase Remote migration apply |

### Rollback

- Code rollback: revert the PR #75 merge commit or follow up with a targeted revert of the Issue #72 UI/read-model changes.
- Database rollback: forward-only migration restoring the previous `trg_notify_delegator_on_mp_change()` behavior if needed.
- No production rollback has been performed because this entry is PR/Preview stage only.

### Known Risks

- Local SQL verification can remain blocked when Docker Desktop / Supabase local is unavailable; rely on GitHub SQL regression before review approval.
- The organizer notification is designed for the normal lifecycle path where `removed_at` is written once. A future non-normal write that changes a non-null `removed_at` timestamp again could create another host removal notification.

## 2026-06-02 - DBFIX-20260602-issue73-sms-out-disambiguation

**Type:** Patch
**Code Commit:** PR #74 branch head; final merge commit pending
**Migration:** `20260602120000_issue73_sms_out_disambiguation.sql`
**Status:** GitHub PR review only; not merged; no Vercel Production deploy; Supabase Remote not applied; production not verified

### Summary

This patch fixes Issue #73 SMS `OUT` no-code disambiguation:

- Bare `OUT` now lists active withdraw-eligible matches only.
- Bare `OUT` excludes pending invites that require `YES {code}` or `NO {code}`.
- Bare `OUT` multi-candidate copy says `matches`, not `invites`.
- Bare `YES` and bare `NO` continue to list pending invite candidates only.
- Coded `OUT {code}` behavior is preserved, including pending-code guidance to use `YES` or `NO`.
- Existing 4-6 character active codes and newer 2-character active codes remain supported.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| GitHub PR | Pending | PR #74 is Ready for Review; not merged |
| Build/typecheck | Passed in GitHub | PR #74 Build and typecheck check passed |
| SQL regression | Passed in GitHub | PR #74 SQL regression check passed, including `test_runner_issue73_sms_out_disambiguation` |
| Codex PR review | Needs changes at entry creation time | Review requested this production change log entry |
| Vercel Preview | Passed | PR #74 preview deployment reported Ready |
| Vercel Production | Not deployed | No production deployment performed |
| Supabase Remote | Not applied | Remote migration apply requires separate owner approval |
| Production verification | Not verified | No production validation performed |
| Real SMS/email/provider traffic | Not sent | No drain or provider path called |

### Current Status

- GitHub: PR #74 only; not merged into `main`.
- Vercel Production: not deployed.
- Supabase Remote: migration not applied.
- Production rollout: not started.
- Production verification: not verified.

### Rollback

- Before merge or remote migration: close PR #74 or revert the PR branch commit.
- After merge but before Supabase Remote migration: revert PR #74 and redeploy the previous production commit if it was deployed.
- After Supabase Remote migration apply: apply a follow-up forward migration restoring the previous `rpc_sms_reply_handle(text, text)` behavior, then revert/redeploy compatible code if needed.

### Known Risks

- Supabase Remote migration and production validation remain owner-gated.
- No production users are affected until the PR is merged, deployed if needed, and the Supabase Remote migration is explicitly applied.

## 2026-06-01 - SCHED-20260601-issue55-reminder-cron

**Type:** Mini Release
**Code Commit:** Draft PR branch head; final merge commit pending
**Migration:** `20260602003000_issue55_daily_reminder_cron.sql`
**Status:** GitHub Draft PR only; not merged; no Vercel Production deploy; no Supabase Remote change

### Summary

This patch wires Vercel Cron to the #58 reminder-only notification drain path and narrows reminder eligibility to a daily day-before sweep:

- Adds `vercel.json` with one cron entry for `/api/notifications/drain-reminders`.
- Uses a Hobby-compatible daily schedule: `0 21 * * *` (21:00 UTC, around 5:00 PM in Ontario during summer time).
- Adds `GET /api/notifications/drain-reminders` for Vercel Cron, protected by `CRON_SECRET`.
- Preserves manual `POST /api/notifications/drain-reminders` with `NOTIFICATION_DRAIN_SECRET`.
- Does not schedule or modify the generic `/api/notifications/drain` route.
- Updates reminder eligibility so only tomorrow's formed matches with confirmed participants are eligible.
- Skips same-day, past, unformed, pending, declined, withdrawn, removed, and non-reminder deliveries.
- Updates Create Match reminder copy for the day-before 5:00 PM model.
- Adds a static guard to verify the cron target stays reminder-only.
- Adds rollout notes in `docs/ISSUE55_REMINDER_CRON_ROLLOUT.md`.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed locally | `npm run verify:build` |
| SQL regression | Blocked locally; CI required | `npm run verify:sql` could not connect to local Docker daemon |
| SQL runner syntax | Passed locally | `node --check scripts/run-sql-regressions.mjs` |
| Static cron guard | Passed locally | `node scripts/check-issue55-reminder-cron.mjs` |
| #58 reminder guard | Passed locally | `node scripts/check-issue58-reminder-drain.mjs` |
| Generic drain not scheduled | Passed | Static guard and `vercel.json` review |
| Vercel Production | Not deployed | No production deployment performed by this PR |
| Supabase Remote | Not changed | Migration is local/GitHub only until owner-approved remote apply |
| Real SMS/email/provider traffic | Not sent | Do not call drain endpoints during PR validation |
| Production verification | Not verified | Requires owner-approved merge/deploy and first-cron observation |

### Rollback

- Fast operational disable: remove or rotate `CRON_SECRET`, or disable Cron Jobs in Vercel.
- Code rollback: revert the cron wiring commit or remove `vercel.json` in a follow-up PR.
- Database rollback: forward-only migration restoring the prior reminder eligibility functions if needed.

### Known Risks

- Vercel Cron uses `GET` and `CRON_SECRET`; production must set `CRON_SECRET` before the cron can authenticate.
- Vercel Cron scheduling is UTC and Hobby cron is daily / not minute-precise.
- Scheduled jobs can cause real day-before reminder sends after deployment if due reminder candidates exist.
- Owner approval is required before merge, production deployment, and first-cron observation.

## 2026-06-01 - PATCH-20260601-create-match-invite-copy

**Type:** Patch
**Code Commit:** PR #59 branch head; final merge commit pending
**Migration:** None
**Status:** GitHub PR only; not merged; no Vercel Production deploy; no Supabase Remote change

### Summary

This patch clarifies Create Match invite selection wording so selected invitees are not described using lineup-capacity wording.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build/typecheck | Passed | `npm run build:clean` |
| Lint | Not completed | `next lint` prompted for ESLint setup; no config changes created |
| Preview visual check | Auth-blocked | `/matches` redirects to login without a safe authenticated session |
| Vercel Production | Not deployed | No production deployment performed by this PR |
| Supabase Remote | Not changed | No migration or remote database change |

### Safety

- Copy-only UI change.
- No match capacity, invitation, notification, or backend logic changed.
- No database, Supabase, middleware, delivery, or `processDeliveriesAction` code changed.

## 2026-06-01 - GOV-20260601-autonomous-draft-pr-rules

**Type:** Governance
**Code Commit:** Unknown - final merge commit pending
**Migration:** None
**Status:** GitHub PR only; not merged; no deploy; no Supabase Remote change

### Summary

This governance patch defines Codex autonomous Draft PR work rules:

- Allows Codex to continue scoped CI/build/typecheck/lint/SQL/test fixes inside an approved Draft PR without asking after every failure.
- Defines hard stop gates for Ready for Review, merge, deploy, Supabase Remote migrations, real provider traffic, destructive DB work, product scope expansion, and approved product rule changes.
- Adds Ready Packet and Environment Impact Report sections to the PR template.
- Records that Codex workflow labels for auto-fix, human-decision, product-blocked, secrets-blocked, and ready-for-review-request states are managed as GitHub metadata outside the repository diff.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Local diff check | Passed | `git diff --check origin/main...HEAD` |
| Runtime behavior | Not changed | Governance-only docs/template changes |
| Supabase Remote | Not applied | No migration in this PR |
| Vercel Production | Not deployed | No production deploy performed |
| Production verification | Not applicable | Governance-only change; no production runtime behavior changed |

### Rollback

- Revert the governance commit or apply a follow-up governance patch restoring the previous AGENTS and PR template wording.
- No database rollback is required.
- No Vercel Production rollback is required.

### Known Risks

- PR #49 also adds `.github/pull_request_template.md`; merge sequencing or manual conflict resolution is required before both PRs can land.

## 2026-06-01 - DBFIX-20260601-issue48-sms-rsvp-one-code

**Type:** Structural DB/SMS hotfix
**Code Commit:** PR #52 branch head; final merge commit pending
**Migration:** `20260531120000_issue48_one_sms_code_one_pending_anchor.sql`
**Status:** GitHub PR only; not merged; no Vercel Production deploy; Supabase Remote not applied

### Summary

This hotfix addresses Issue #48 SMS RSVP code and invitation-anchor duplication risk:

- Enforces one active unconsumed SMS RSVP code per match participant.
- Keeps SMS code purpose as metadata/history instead of splitting active RSVP codes by invite, confirmed lineup, reminder, or critical update.
- Enforces one pending `email_invitations` anchor per match participant while preserving historical accepted, declined, expired, and canceled invitation rows.
- Reuses stable non-canceled contact invitation anchors in notification payloads instead of silently creating a fresh pending anchor after an accepted, declined, or expired result.
- Restores invitation RPC guards for organizer ownership, active matches, non-removed participant anchors, and ambiguous contact matches.
- Preserves the legacy 5-argument `rpc_email_invitation_create` signature as a compatibility wrapper around the guarded implementation.
- Renames and revokes the previous 6-argument `rpc_email_invitation_create` implementation, then recreates the same external 6-argument signature without default arguments so legacy 5-argument calls resolve unambiguously; both external signatures remain available after migration.
- Guards explicit SMS RSVP codes so `YES`, `NO`, and `OUT` do not mutate non-active matches.
- Updates post-formation critical update SMS copy to use `OUT` only and keeps cancellation SMS non-actionable.
- Adds `docs/PR52_REMOTE_MIGRATION_APPLY_PLAN.md` with duplicate-cleanup checks, post-apply verification SQL, and forward-only rollback guidance.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| SQL Regression Check | Pending | Must pass in CI before merge |
| Full SQL suite | Pending | Must pass before merge |
| Issue #48 runner | Pending | Must pass before merge |
| SMS copy guard | Pending | Must pass before merge |
| Build/typecheck | Pending | Must pass before merge |
| Codex PR review | Pending | Must be PASS or PASS_WITH_CAVEAT before merge |
| Remote apply plan | Added | `docs/PR52_REMOTE_MIGRATION_APPLY_PLAN.md`; not executed |
| Vercel Production | Not deployed | No production deployment performed by this PR |
| Supabase Remote | Not applied | Remote migration apply requires explicit owner approval |
| Real SMS/email/provider traffic | Not sent | Regression work must not call real providers |
| Production verification | Not verified | Requires post-merge, post-remote-apply controlled validation |

### Rollback

- Database rollback must be forward-only via a follow-up migration restoring prior function definitions or relaxing new indexes if required.
- Data cleanup is not perfectly reversible from database state alone because superseded SMS codes are consumed and duplicate pending anchors are canceled with metadata.
- Code rollback alone is insufficient after remote migration apply; Supabase Remote state must be handled explicitly.

### Known Risks

- Supabase Remote apply must happen in a controlled window with invite/SMS mutation traffic quiet to avoid concurrent rows between cleanup and unique-index creation.
- Twilio/carrier validation is separate from this SQL-focused hotfix.
- GitHub merge, Vercel Production deployment, Supabase Remote migration apply, and production verification are separate states and must not be inferred from each other.

## 2026-05-25 - PATCH-20260525-contact-notification-public-links

**Type:** Patch
**Code Commit:** `5fbb8eb`
**Migration:** `20260525170500_contact_notifications_public_invitation_links.sql`
**Status:** Vercel Production deployed; Supabase Remote applied

### Summary

This patch fixes contact/player-card email CTA links so unregistered recipients open public invitation pages instead of protected match pages:

- Updates `notification_match_payload` to create or reuse an `email_invitations.match_participant_id` anchor for guest/contact participants before rendering notification links.
- Updates `notification_magic_link_for_participant` to keep using invitation anchors after an invitation is accepted or declined, avoiding fallback to `/matches/:id`.
- Adds validation RPC `rpc_validate_contact_notification_public_links`.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build | Passed | `npm run build` |
| Remote Supabase | Passed | `supabase db push`; `supabase migration list` shows `20260525170500` applied remotely |
| Vercel Production | Passed | Deployment `https://playerhoods-codex-ihaa6p28f-nancys-projects-128e326c.vercel.app` reported Ready and aliases include `https://www.playerhoods.com` |

### Rollback

- Restore the previous definitions of `notification_match_payload` and `notification_magic_link_for_participant` from the prior migration.

## 2026-05-25 - PATCH-20260525-ready-to-form-copy-polish

**Type:** Patch
**Code Commit:** Local workspace deployment; GitHub commit pending
**Migration:** None
**Status:** Vercel Production deployed

### Summary

This patch softens and shortens the ready-to-form match detail copy:

- Changes the primary ready CTA from `Form Match & Notify` to `Form Match`.
- Adds helper copy: `Forming the match will notify confirmed players.`
- Simplifies the confirmed section heading to `Ready Lineup · 4 players` instead of combining `4 / 4` and `Full`.
- Changes the full-lineup waiting helper to `Not counted toward this match yet.`
- Updates the tools card copy to `Set teams now, or invite backup players if you want options.`
- Avoids showing both `You` and `Host` badges on the host's own participant row.
- Softens the `Host-confirmed` badge color.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Type check | Passed | `npx tsc --noEmit` |
| Build | Passed | `npm run build` locally and Vercel production build |
| Vercel Production | Passed | Deployment `https://playerhoods-codex-8w1tbt2i1-nancys-projects-128e326c.vercel.app` reported Ready and aliases include `https://www.playerhoods.com` |
| Production login smoke | Passed | `https://www.playerhoods.com/login` returned HTTP 200 |

### Rollback

- Redeploy the previous known-good Vercel Production deployment.

## 2026-05-25 - PATCH-20260525-ready-to-form-lineup-state

**Type:** Patch
**Code Commit:** Local workspace deployment; GitHub commit pending
**Migration:** None
**Status:** Vercel Production deployed

### Summary

This patch refines the ready-to-form and formed match detail states:

- Renames host ready state from `Ready to confirm` / `Confirm and Notify` to `Ready to Form` / `Form Match & Notify`.
- Shows `Match Formed` and `Players have been notified.` after the match is formed instead of keeping the ready-to-form CTA.
- Changes players card labels by stage: `Lineup so far`, `Ready Lineup`, and `Confirmed Lineup`.
- Uses `4 / 4` plus a softer `Full` badge instead of `Lineup Full`.
- Adds a helper for waiting invites under a full lineup: `Not counted toward the formed match yet.`
- Hides `Players Who Want to Join` when there are no join requests.
- Reorders bottom actions so `Set Teams` is primary when full, while `Add More Players` becomes secondary; formed matches show `Message Players` and `Set Teams`.
- Aligns Match Board formed state with the same `match.formed_at` source used by the main match page.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Type check | Passed | `npx tsc --noEmit` |
| Build | Passed | `npm run build` locally and Vercel production build |
| Vercel Production | Passed | Deployment `https://playerhoods-codex-7ouvwkrwf-nancys-projects-128e326c.vercel.app` reported Ready and aliases include `https://www.playerhoods.com` |
| Production login smoke | Passed | `https://www.playerhoods.com/login` returned HTTP 200 |

### Rollback

- Redeploy the previous known-good Vercel Production deployment.

## 2026-05-25 - PATCH-20260525-invite-response-register-nudge

**Type:** Patch
**Code Commit:** Local workspace deployment; GitHub commit pending
**Migration:** None
**Status:** Vercel Production deployed

### Summary

This patch lightly encourages invited contacts/guests to register without blocking the response flow:

- Keeps the primary email action as `Respond to Invitation`.
- Keeps `No account is required to respond.` directly under the primary CTA.
- Adds a secondary `New to PlayerHoods?` registration card below the response CTA and above Notification Note.
- Adds the same lightweight registration prompt to the unauthenticated invitation response page.
- Simplifies the Notification Note copy to important updates only.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Type check | Passed | `npx tsc --noEmit` |
| Build | Passed | `npm run build` locally and Vercel production build |
| Vercel Production | Passed | Deployment `https://playerhoods-codex-15646wfct-nancys-projects-128e326c.vercel.app` reported Ready and aliases include `https://www.playerhoods.com` |
| Production login smoke | Passed | `https://www.playerhoods.com/login` returned HTTP 200 |

### Rollback

- Redeploy the previous known-good Vercel Production deployment.

## 2026-05-25 - PATCH-20260525-contact-player-owned-name-overlay

**Type:** Patch
**Code Commit:** Local workspace deployment; GitHub commit pending
**Migration:** None
**Status:** Vercel Production deployed

### Summary

This patch fixes Contact Player name display in match participant rows:

- When the current user owns the Contact Player, match list/detail name resolution now prefers the caller-owned contact display name.
- Prevents a private contact such as `nanaw` from rendering as a stale canonical person name such as `riverhot` while the detail drawer shows the owned contact correctly.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Type check | Passed | `npx tsc --noEmit` |
| Build | Passed | `npm run build` locally and Vercel production build |
| Vercel Production | Passed | Deployment `https://playerhoods-codex-79i27hygr-nancys-projects-128e326c.vercel.app` reported Ready and aliases include `https://www.playerhoods.com` |
| Production login smoke | Passed | `https://www.playerhoods.com/login` returned HTTP 200 |

### Rollback

- Redeploy the previous known-good Vercel Production deployment.

## 2026-05-25 - MR-20260525-host-offline-confirm-existing-participants

**Type:** Mini Release
**Code Commit:** Local workspace deployment; GitHub commit pending
**Migration:** `20260525101500_host_confirm_existing_participants_offline.sql`
**Status:** Supabase Remote and Vercel Production deployed

### Summary

This mini release extends host-managed offline confirmation to existing match participants:

- Adds organizer-only `rpc_match_host_confirm_participant_offline(uuid)` for pending or waiting-list participants already in the match.
- Records explicit host-managed audit fields instead of pretending the player self-confirmed.
- Queues the existing `host_managed_confirmation` SMS/email notification when the participant has a reachable channel.
- Adds a guarded `Mark Confirmed Offline` action in participant menus with confirmation copy.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| GitHub main | Pending | Local workspace deployment; no commit created in this task |
| Vercel Production | Ready | Deployment `https://playerhoods-codex-4sny0np1d-nancys-projects-128e326c.vercel.app` reported Ready and aliases include `https://www.playerhoods.com` |
| Supabase Remote | Applied | `npx supabase db push --linked --yes` applied migration `20260525101500` |

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Type check | Passed | `npx tsc --noEmit` |
| Build | Passed | `npm run build` locally and Vercel production build |
| Remote DB migration | Passed | `npx supabase migration list --linked` shows `20260525101500` in Local and Remote |
| Vercel Production | Passed | `vercel inspect` reported deployment Ready |
| Production login smoke | Passed | `https://www.playerhoods.com/login` returned HTTP 200 |
| Authenticated host-confirm flow | Not run | Production test-account core-flow verification was not run |

### Rollback

- Redeploy the previous known-good Vercel Production deployment.
- Apply a forward migration that drops `rpc_match_host_confirm_participant_offline(uuid)` if the new RPC must be removed.

## 2026-05-20 - MR-20260520-onboarding-venue-search-scroll

**Type:** Mini Release
**Code Commit:** Pending at write time
**Migration:** None
**Status:** Pending Vercel Production deployment

### Summary

This mini release fixes onboarding profile venue selection:

- Loads venue options through paginated API reads instead of the old single Supabase page.
- Allows venue search to match normalized name, abbreviation, city, province, country, and location text.
- Lets typed name searches include venues even when the venue city field is missing or incomplete.
- Changes the venue results panel from an absolute overlay to an in-flow scrollable panel so users can scroll to the end.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build | Passed | `npm run verify:build` |

### Rollback

- Revert the release commit and redeploy the previous known-good production commit.

## 2026-05-20 - MR-20260520-hood-card-bookmark-polish

**Type:** Mini Release
**Code Commit:** `fd1af91`
**Migration:** None
**Status:** GitHub and Vercel Production deployed

### Summary

This mini release polishes Hood player cards:

- Lets player names use the available card width instead of being constrained by the old narrow card cap.
- Replaces placeholder save glyphs with bookmark icons.
- Shows saved players with a tennis-colored filled bookmark.
- Shows unsaved/requestable players with a gray bookmark.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build | Passed | `npm run verify:build` |

### Rollback

- Revert the release commit and redeploy the previous known-good production commit.

## 2026-05-20 - MR-20260520-smart-import-rpc-overload-cleanup

**Type:** Mini Release
**Code Commit:** `994d999`
**Migration:** `20260520160000_drop_ambiguous_match_rpc_overloads.sql`
**Status:** GitHub, Supabase Remote, and Vercel Production deployed

### Summary

This mini release ships the Smart Import simplification and SQL regression cleanup:

- Converts Smart Import into a single state-based flow: Import contacts, auto extract, review extracted contacts, save selected.
- Removes the separate Extract Contacts action and duplicate file/preview sections.
- Hides Windows/Mac screenshot instructions behind help.
- Replaces red parse failures with a friendly retry/manual-add state.
- Drops ambiguous legacy one-argument match participant RPC overloads while keeping canonical two-argument signatures.
- Updates SQL regression coverage for the Privacy / Invite / Formation MVP expectations.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| GitHub main | `994d999` | Pushed to `origin/main` |
| Vercel Preview | Not deployed | Not used for this mini release |
| Vercel Production | Ready | Deployment `https://playerhoods-codex-1ewmv86ec-nancys-projects-128e326c.vercel.app` reported Ready and aliases include `https://www.playerhoods.com` |
| Supabase Local | Applied | Local SQL regression runners passed against local Supabase |
| Supabase Remote | Applied | `npx.cmd supabase db push --linked --yes` applied migration `20260520160000` |

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build | Passed | `npm run verify:build` |
| SQL regression | Passed | `npm run verify:sql` returned all runners passing, 107/107 total |
| Remote DB migration | Passed | `npx.cmd supabase migration list --linked` shows `20260520160000` in Local and Remote |
| Vercel Production | Passed | `vercel inspect` reported deployment Ready |
| Production login smoke | Passed | `https://playerhoods-codex.vercel.app/login` and `https://www.playerhoods.com/login` returned HTTP 200 |
| Authenticated Smart Import flow | Not run | Production test-account credentials were not used in this deployment task |

### Rollback

- Revert code commit `994d999` and redeploy the previous known-good production commit.
- If the RPC overload cleanup must be reverted, apply a forward migration restoring the legacy one-argument overloads only after confirming the ambiguity risk is acceptable.

## 2026-05-14 - MR-20260514-starter-card-match-flow

**Type:** Mini Release
**Code Commit:** `4af80bf`
**Migration:** None
**Status:** GitHub and Vercel Production deployed

### Summary

This mini release ships the current dashboard/contact/match UX polish:

- Moves the first-Hood starter card from Hoods to Matches, directly above Match Board.
- Adds starter-card dismiss behavior backed by localStorage.
- Makes `Start a Match` expand the inline Create Match form on the Matches page.
- Keeps Hoods responsible for starter progress reporting without rendering the starter card there.
- Includes the pending Add My Contact and Create Match visual/density refinements already present in local source.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| Local code | Modified | Dashboard/Hoods/Matches/CreateMatchInline source updated locally |
| GitHub main | `4af80bf` | Pushed to `origin/main` |
| Vercel Preview | Not deployed | Not used for this mini release |
| Vercel Production | Ready | Deployment `https://playerhoods-codex-87tmnhat0-nancys-projects-128e326c.vercel.app` reported Ready |
| Supabase Local | N/A | No database migration in this release |
| Supabase Remote | N/A | No database migration in this release |

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| TypeScript | Passed | `npx tsc --noEmit` |
| Build | Passed | `npm run build` |
| Static diff check | Passed | `git diff --check` on changed source files |
| Production login smoke | Passed | `https://playerhoods-codex.vercel.app/login` and `https://www.playerhoods.com/login` returned HTTP 200 |
| Authenticated production flow | Not run | Production test-account credentials were not used in this deployment task |

### Rollback

- Revert code commit `4af80bf` and redeploy the previous known-good production commit.
- No Supabase rollback is needed because this release has no migration.

## 2026-05-12 - SR-20260512-linked-contact-permission-boundary-p5

**Type:** Structural Release
**Commit:** `7b338b1`
**Migration:** `20260512173000_linked_contact_permission_boundary_p5.sql`
**Status:** GitHub, Supabase Remote, and Vercel Production deployed

### Summary

Phase 5 tightens linked Contact / registered-user permission boundaries:

- Replaces `handle_contact_claimed` so explicit identity link accept remains an identity bridge, not a permission upgrade.
- Keeps claim audit, owner-private contact soft archive, saved-player visibility migration, group contact provenance, notifications, and People you may know suggestions.
- Stops future automatic `group_members` creation from ContactClaimed.
- Stops future historical match participant mutation/merge/replacement from ContactClaimed.
- Preserves `group_contacts` as Shared Contacts and preserves historical match participant rows.
- Does not create Match Proxy bindings or group/admin authority from linked identity state.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| Local code | Modified | P5 migration and canonical docs updated locally |
| GitHub main | `7b338b1` | Pushed to `origin/main` |
| Vercel Preview | Not deployed | Not used for this structural release |
| Vercel Production | Ready | Deployment `https://playerhoods-codex-5gklzgyap-nancys-projects-128e326c.vercel.app` reported Ready |
| Supabase Local | Not applied | Local Supabase was not run for this phase |
| Supabase Remote | Applied | Migration `20260512173000` appears in both Local and Remote migration list |

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build | Passed | `npm.cmd run build` |
| Static diff check | Passed | `git diff --check` on P5 files |
| Remote DB migration | Passed | `npx.cmd supabase db push --linked --yes` applied migration `20260512173000` |
| Remote DB validation | Partial | `handle_contact_claimed_exists` and proxy-boundary checks returned `ok=true`; `historical_auto_group_members_from_claims` found 2 pre-existing rows |

### Residual Risk

Remote validation found 2 historical `group_members` rows with `join_method = 'contact_claimed'`. They were created by pre-P5 behavior. This release does not delete or rewrite those rows without explicit cleanup approval.

### Rollback

Code rollback:

- Revert the P5 commit after it is pushed.

Database rollback:

- Prefer forward migration to restore the previous `handle_contact_claimed` behavior only if product decides to re-enable automatic group membership and match participant mutation.

## 2026-05-12 - SR-20260512-contact-person-match-invite-p4

**Type:** Structural Release
**Commit:** `548be57`
**Migration:** `20260512160306_contact_person_match_invite_wrapper.sql`
**Status:** GitHub, Supabase Remote, and Vercel Production deployed

### Summary

Phase 4 adds a person-first Contact Player match invite path:

- Adds `rpc_match_contact_person_targets`, returning only person-level invite cards: `person_id`, display name, avatar, source, invite eligibility, and sorting metadata.
- Adds `rpc_match_invite_contact_person`, which validates match invite authority and trusted Contact Player exposure, then resolves registered-user or private invitation-channel delivery internally.
- Keeps legacy `guest_id` paths available for compatibility, while moving the match detail invite UI to `person_id`.
- Prevents new match invite UI from depending on `guest_id`, `contact_record_id`, phone, email, or private channel details.
- Prefers a confirmed linked registered-user path where available without granting proxy, group member, admin, or contact-detail authority.
- Updates canonical docs for Contact Player match invite wrappers.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| Local code | Modified | P4 API, match invite UI wiring, migration, and docs updated locally |
| GitHub main | `548be57` | Pushed to `origin/main` |
| Vercel Preview | Not deployed | Not used for this structural release |
| Vercel Production | Ready | Deployment `https://playerhoods-codex-2ynsebn1w-nancys-projects-128e326c.vercel.app` reported Ready |
| Supabase Local | Not applied | Local Supabase was not run for this phase |
| Supabase Remote | Applied | Migration `20260512160306` appears in both Local and Remote migration list |

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build | Passed | `npm.cmd run build` |
| Static diff check | Passed | `git diff --check` on P4 files |
| Remote DB migration | Passed | `npx.cmd supabase db push --linked --yes` applied migration `20260512160306` |
| Remote DB validation | Passed | `rpc_validate_contact_person_match_invite_p4()` returned both checks `ok=true` |
| Vercel Production | Passed | Latest code deployment reported Ready |

### Rollback

Code rollback:

- Revert commit `548be57`.

Database rollback:

- Prefer forward migration to revoke/drop `rpc_match_contact_person_targets`, `rpc_match_invite_contact_person`, and `rpc_validate_contact_person_match_invite_p4` if rollback is required.
- Existing legacy `guest_id` invite RPCs remain intact.

## 2026-05-12 - MR-20260512-group-shared-contacts-ui

**Type:** Mini Release
**Commit:** `b5c7c10`
**Migration:** None
**Status:** GitHub and Vercel Production deployed

### Summary

Phase 3 aligns the group detail UI with the canonical Contact Player model:

- Splits group people display into `Members` and `Shared Contacts`.
- Keeps Contact Players in `group_contacts`; the UI no longer presents them as full group members.
- Adds product copy that Shared Contacts can be saved and invited where available, are not group members, and private contact details stay hidden.
- Renames the add panel language from contact-as-member wording to `Shared Contact`.
- Lets group members save Shared Contacts to Hood through the existing `rpc_contact_player_save` path, while hiding Save when already saved or when the Shared Contact is the viewer's own person.
- Updates the Contact Player canonical spec to state that group Contact Player inclusion must not create `group_members` rows.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| Local code | Modified | Group detail UI and canonical spec updated locally |
| GitHub main | `b5c7c10` | Pushed to `origin/main` |
| Vercel Preview | Not deployed | Not used for this mini release |
| Vercel Production | Ready | Deployment `https://playerhoods-codex-cxlqo4tb7-nancys-projects-128e326c.vercel.app` reported Ready |
| Supabase Local | No change | No migration in this phase |
| Supabase Remote | No change | Existing `group_contacts`, `rpc_group_contact_list_v2`, and `rpc_contact_player_save` verified |

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build | Passed | `npm.cmd run build` |
| Static diff check | Passed | `git diff --check` on P3 files |
| Remote DB dependency check | Passed | `group_contacts`, `rpc_group_contact_list_v2`, and `rpc_contact_player_save` all exist |
| Vercel Production | Passed | Latest deployment reported Ready |

### Rollback

Code rollback:

- Revert commit `b5c7c10`.
- No Supabase rollback is required because this phase has no schema or RPC migration.

## 2026-05-12 - MR-20260512-contact-intro-share-inbox-card

**Type:** Mini Release
**Commit:** `514dd72`
**Migration:** None
**Status:** GitHub and Vercel Production deployed

### Summary

Phase 2 of Contact Intro Share adds the first Inbox UI surface:

- Adds a small typed API wrapper for `rpc_contact_intro_share_list`, `rpc_contact_intro_share_accept_or_save`, and `rpc_contact_intro_share_dismiss`.
- Renders pending inbound Intro Shares as dedicated Inbox cards instead of generic notification rows.
- Uses product copy:
  - "Nancy shared Linda's Intro with you."
  - "Save Linda to your Hood so you can invite them to matches."
  - "Contact details stay private."
- Adds actions:
  - Save to Hood
  - Dismiss
- Keeps this as lightweight Inbox/notification behavior only. No full chat implementation and no match invite wrapper in this phase.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| Local code | Modified | Inbox card and API wrapper added locally |
| GitHub main | `514dd72` | Pushed to `origin/main` |
| Vercel Preview | Not deployed | Not used for this mini release |
| Vercel Production | Ready | Deployment `https://playerhoods-codex-h6r4zfhh3-nancys-projects-128e326c.vercel.app` reported Ready |
| Supabase Local | No change | No migration in this phase |
| Supabase Remote | No change | Uses Phase 1 RPCs already applied |

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build | Passed | `npm.cmd run build` |
| Static diff check | Passed | `git diff --check` on P2 files |
| Vercel Production | Passed | Latest deployment reported Ready |

### Rollback

Code rollback:

- Revert commit `514dd72` and redeploy the previous known-good production commit.

Database rollback:

- No database rollback required for Phase 2.

## 2026-05-12 - SR-20260512-contact-intro-share-phase1

**Type:** Structural Release
**Commit:** `7d2313a1b817cff8c731bde0b65c1e25421578c2`
**Migration:** `20260512123000_contact_intro_shares_phase1.sql`
**Status:** GitHub, Vercel Production, and Supabase Remote applied for Phase 1 backend foundation

### Summary

Phase 1 of the Contact Player / Intro Share structural release adds the database foundation for direct user-to-user Intro sharing:

- Adds `contact_intro_shares` as the canonical Direct Intro Share audit/exposure table.
- Adds RLS so only sender and recipient can select share records.
- Adds RPCs to create, list, save/accept, dismiss, and revoke Intro shares.
- Adds `person_relationships.source_intro_share_id` as optional provenance for saved relationships created from Intro shares.
- Adds direct Intro Share as a save eligibility source without exposing private contact record data.
- Keeps existing `guest_id` compatibility paths intact and does not change match invite behavior in this phase.

### Product Decisions Captured

- Contact Player remains a system-level limited person node.
- Sharing means sharing a person's Intro / `person_id`, not private `contact_records`.
- Direct Intro Share grants trusted exposure sufficient for Save to Hood only.
- Group Contacts remain separate from Group Members.
- Linked Contact / linked user state remains identity bridge only, not a permission upgrade.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| Local code | Modified | New append-only migration and canonical docs updated locally |
| GitHub main | `7d2313a1b817cff8c731bde0b65c1e25421578c2` | Pushed to `origin/main` |
| Vercel Preview | Not deployed | Pending |
| Vercel Production | Ready | Deployment `https://playerhoods-codex-ch845ydcf-nancys-projects-128e326c.vercel.app` reported Ready |
| Supabase Local | Not applied | Docker Desktop / local Supabase unavailable; local lint/apply blocked |
| Supabase Remote | Applied | `supabase db push --linked --yes`; migration list shows `20260512123000` on Remote |

### Migration Details

The migration is append-only. It creates `contact_intro_shares`, adds a nullable provenance column to `person_relationships`, and defines RPCs for Phase 1. It does not rewrite historical migrations, does not delete legacy objects, and does not remove or globally replace existing `guest_id` paths.

### Validation Plan

- Run SQL/static migration validation locally when Docker Desktop / local Supabase is available.
- Apply to Local Supabase before remote promotion when feasible.
- Execute `rpc_validate_contact_intro_shares()` and confirm:
  - no duplicate pending Intro shares
  - saving an Intro does not copy private contact records
  - Intro share notifications remain deduped
- Add Phase 2 UI tests when Inbox card work begins.

### Verification Evidence

| Check | Status | Evidence |
|---|---|---|
| Build | Passed | `npm.cmd run build` |
| Static diff check | Passed | `git diff --check` on migration/docs |
| Remote migration dry-run | Passed | Only `20260512123000_contact_intro_shares_phase1.sql` would be pushed |
| Remote migration apply | Passed | `supabase db push --linked --yes` applied migration |
| Remote validation RPC | Passed | `rpc_validate_contact_intro_shares()` returned all `ok = true` |

### Rollback

Database rollback must be append-only:

- Add a follow-up migration that revokes/grants blocks as needed, drops or disables the new RPCs, and prevents new writes to `contact_intro_shares`.
- Do not drop the table until data audit confirms no production dependency.
- Code rollback is not required for Phase 1 unless application code starts calling these RPCs.

### Known Risks

- Phase 1 creates backend capability before the Inbox UI is aligned.
- Existing notification UI will render unknown `contact_intro_share` kind generically until Phase 2.
- Full person-id invite wrappers are intentionally deferred to Phase 4.

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
| 2026-06-05 | MR-20260605-create-match-players-step2-simplify | Mini Release | Simplifies Create Match Step 2 Players UI into Invite / Post Player Call modes. | 17e2e53d3c9bc070fa6e1853f768ca728e5d9d62 | None | Deployed successfully | No change | Owner visual review accepted; safe production create-flow smoke passed without match creation | Production deployed / verified for safe create-flow smoke | PR #104 head before merge: 1beca7152bf443a2ef65274ff298f730bd75ce9f. Vercel Production deployment succeeded for merge commit. Smoke covered /matches load, Create Match open, and Step 2 Players showing Invite / Post Player Call. No final Create Match submission was performed. No invite/email/SMS/notification traffic was sent. Rollback: Revert PR #104 and redeploy previous production commit. Codex PR review failed due to GitHub Action quota, not code failure. |
| 2026-05-10 | DB-20260510-group-recommended-level-range | Patch | Added optional Shared Group recommended level range fields and create/update UI support | Unknown | 20260510102000_add_group_recommended_level_range.sql | Unknown | Unknown | Not verified | Draft | Local schema/UI change only. Stores ranges such as 3.0-4.0 as numeric min/max; not used as a hard admission gate. Roll back with a follow-up migration dropping the columns/RPC params and by reverting app changes. |
| 2026-05-09 | DBFIX-20260509-onboarding-legal-gate | Patch | Enforces legal agreement as a required onboarding completion gate in UI, middleware, and RPCs | Unknown | 20260509201000_enforce_onboarding_legal_gate.sql | Unknown | Unknown | Not verified | Draft | Local drift correction. No historical legal timestamps are backfilled; affected completed users must accept legal terms on next protected-page access. Roll back with a follow-up migration restoring previous RPC bodies and by reverting the frontend/middleware changes. |
| 2026-05-08 | baseline-2026-05-08-bc36051 | Baseline | Production baseline confirmed | bc3605189be29fc432747f6ad728161140e90827 | Up to 20260508144500_mark_legacy_group_invite_user_rpc.sql | Yes | Yes | Login page only | Production aligned, smoke test pending | GitHub main, Vercel Production, and Supabase Remote aligned. |
| 2026-05-08 | docs-release-governance-baseline-2026-05-08 | Patch | Added release governance and production change log documents | 0aa52e4579927ca9c85c09b9ad0f70483d8fdecf | None | Unknown | N/A | Not verified | GitHub only | Documentation-only governance patch. No deploy or remote migration apply performed by Codex. |
| 2026-05-08 | docs-release-governance-template-2026-05-08 | Patch | Expanded governance docs into authoritative rule and fact-record templates | Unknown | None | Unknown | N/A | Not verified | GitHub only after push | Documentation-only governance patch. Commit hash is reported in the task final report because a commit cannot self-reference its own final hash. |
| 2026-05-08 | SR-20260508-contact-link-person-scope | Structural Release | Link accept and active Contact/Hoods UI move linked contacts to registered-user identity by person scope | aaf05faf988d9a409274575b9591a92c6bd2e6f9 | 20260508162000_identity_link_person_scope_active_identity.sql | Yes | Yes | Login page only; core flows not verified | Production aligned, full smoke test pending | Vercel Production deployed SR commit and Supabase Remote applied migration. Full contact/link flow requires test accounts and fixture data. |
| 2026-05-09 | MR-20260509-login-identity-link-polish | Mini Release | Polished login page presentation, compressed identity-link review copy, and returned inline identity-link action errors instead of throwing | 91f9f6e9ca165642bc9b7e25e269f18b71c42750 | None | Yes | No change | Login/dashboard smoke passed | Production aligned for code; changelog follow-up pending deploy | Vercel deployment `4629225098` succeeded for product commit. Roll back by reverting the GitHub commit and redeploying the previous Vercel production commit. |
| 2026-05-09 | DBFIX-20260509-identity-link-notification-null-casts | Patch | Fixed `rpc_identity_link_accept` notification inserts by casting null match references to uuid | 087a8748a76bc1496a2718dbac859d109e002d10 | 20260509053000_fix_identity_link_notification_null_casts.sql | Yes | Yes | RPC rollback-transaction smoke passed; dashboard browser smoke showed no candidate on alternate test account | Production aligned for DB fix | Remote migration was applied immediately to unblock production Identity Link accept. Roll back with a follow-up migration restoring the previous RPC definition or reverting this migration's function body. |
| 2026-05-09 | DBFIX-20260509-profile-update-rpc-compatibility | Patch | Removed ambiguous legacy `rpc_profile_update` overload and fixed profile-save date/name handling for production RPC calls | Unknown | 20260509061000_drop_legacy_profile_update_overload.sql; 20260509062000_fix_profile_update_availability_until_date.sql; 20260509063000_fix_profile_update_empty_names.sql | Unknown | Yes | RPC rollback-transaction smoke passed with production screenshot-like payload | DB remote applied, GitHub/Vercel confirmation pending | Remote migrations were applied immediately to unblock production Profile Settings save. Roll back with follow-up migrations restoring the previous RPC overload/function body, then redeploy compatible application code if needed. |

## 2026-05-09 - DBFIX-20260509-profile-update-rpc-compatibility

**Type:** Patch  
**Commit:** Unknown  
**Migration:** `20260509061000_drop_legacy_profile_update_overload.sql`; `20260509062000_fix_profile_update_availability_until_date.sql`; `20260509063000_fix_profile_update_empty_names.sql`  
**Status:** DB remote applied, GitHub/Vercel confirmation pending

### Summary

Fixed production Profile Settings save failures caused by remote `rpc_profile_update` incompatibilities:

- Removed the legacy shorter `rpc_profile_update` overload so PostgREST can choose the canonical named-argument RPC.
- Corrected `availability_until` assignment to store a date value instead of text.
- Kept blank first and last names as empty strings instead of writing null into not-null profile columns.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| GitHub main | Pending | Commit hash is produced after this document content is finalized |
| Vercel Production | Unknown | To be confirmed after GitHub push |
| Supabase Remote | Applied | Remote migration list includes all three profile-update migrations |
| Production verification | RPC smoke passed | Rollback-transaction call using screenshot-like Profile Settings payload completed without error |

### Notes

This patch is database-only. It does not include the current uncommitted dashboard/profile UI worktree changes.

### Rollback

Apply a follow-up migration restoring the previous `rpc_profile_update` function body and, only if required by older deployed code, the legacy shorter overload. If a Vercel deployment has already consumed this migration set, redeploy the last compatible production commit after the rollback migration is confirmed remote-applied.

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

## 2026-05-09 - DBFIX-20260509-identity-link-notification-null-casts

**Type:** Patch  
**Commit:** `087a8748a76bc1496a2718dbac859d109e002d10`  
**Migration:** `20260509053000_fix_identity_link_notification_null_casts.sql`  
**Status:** Production aligned for DB fix

### Summary

Production Identity Link accept failed when `rpc_identity_link_accept(uuid)` attempted to insert owner/saved/keeper notifications with bare `null` values for `match_id` and `match_participant_id`. PostgreSQL inferred those `null` values as text inside `INSERT ... SELECT`, causing a uuid type error before the link could complete.

The migration recreates the current Identity Link RPC definitions and casts notification match references as `null::uuid`.

### Environment Status

| Area | Status | Evidence |
|---|---|---|
| Local | SQL migration applied locally | `psql ... -f supabase/migrations/20260509053000_fix_identity_link_notification_null_casts.sql` |
| GitHub main | `2d082758d9277655dff7ff6c0494c857176498e1` | Migration commit and changelog commit pushed to `origin/main` |
| Vercel Preview | Unknown | Not checked |
| Vercel Production | `2d082758d9277655dff7ff6c0494c857176498e1` | GitHub deployment `4629353824`; status `success`; environment `Production` |
| Supabase Local | Applied | Local psql apply succeeded |
| Supabase Remote | Applied | `supabase db push`; `supabase migration list --linked` shows `20260509053000` on Remote |
| Production verification | RPC smoke passed | Same production user/candidate RPC call returned `ok: true` inside a rollback transaction; alternate production dashboard smoke had no remaining candidate to click |

### Rollback

Database rollback:

- Add a follow-up migration restoring the previous `rpc_identity_link_accept(uuid)` function body from `20260508162000_identity_link_person_scope_active_identity.sql`, or replace only the notification insert casts with the previous bare `null` expressions.
- No data repair is required for the failed attempts because the original transaction aborted before link writes completed.

Code rollback:

- No application code rollback is required for this DB-only fix.

### Known Risks

- The rollback-transaction smoke confirms the RPC can complete, but it does not leave a persistent link. A browser retest with an account that still has an Identity Link candidate is still needed to confirm the UI path removes the card after success.
