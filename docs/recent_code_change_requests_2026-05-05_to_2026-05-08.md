# Recent Code Change Requests

Date range: 2026-05-05 to 2026-05-08

This document summarizes code-related change requests inferred from recent commits, migrations, release logs, and local project artifacts. It consolidates work across multiple conversations as represented in the repository history. It does not include private chat text that was not reflected in code, commits, migrations, or repository documents.

## Executive Summary

Over the last three days, the submitted code work clustered around these product and engineering needs:

1. Prepare PlayerHoods 1.1 for launch with clearer onboarding, legal acceptance, profile completeness, venue/club relationship setup, and production documentation.
2. Make Contact Player registration safer and more explicit through identity-link review, verified email/phone matching, historical data preservation, and registered-user invite preference.
3. Improve Hoods/Saved/Contacts behavior so registered users, linked contacts, saved players, group contacts, and invite candidates resolve through more canonical identity paths.
4. Tighten group membership permissions, especially preventing overly broad group member add flows.
5. Stabilize production-like local runtime, chunk recovery, cache behavior, build/restart scripts, and deployment verification.
6. Add release governance and production change logging so GitHub, deployment, and Supabase Remote state are not conflated.

## Requirement Themes

### 1. Launch Readiness and 1.1 Snapshot

Request intent:

- Prepare a 1.1 branch snapshot and prelaunch baseline.
- Add authoritative documentation for identity model, canonical DB paths, legacy inventory, and prelaunch schema policy.
- Add terms/privacy pages and legal agreement UI.
- Expand profile onboarding and dashboard profile editing so users can complete required identity/profile fields.
- Seed and improve venue/location data, especially Halton-area venues and venue metadata.

Representative commits:

- `c1dcb55` - Prepare 1.1 branch snapshot
- `7ece046` - Polish contact flows and deployment readiness

Representative files:

- `docs/identity_model.md`
- `docs/db_canonical_paths.md`
- `docs/db_legacy_inventory.md`
- `docs/prelaunch_schema_policy.md`
- `src/app/terms/page.tsx`
- `src/app/privacy/page.tsx`
- `src/app/onboarding/profile/*`
- `src/app/onboarding/next-steps/*`
- `supabase/migrations/20260430163000_seed_halton_venues_and_metadata.sql`
- `supabase/migrations/20260504183000_unified_onboarding_legal_agreement.sql`

### 2. Onboarding Completion, Legal Agreement, and Venue Relationship Fixes

Request intent:

- Make onboarding next-step completion reliable.
- Ensure legal agreement and profile completion can be persisted through RPCs.
- Fix venue/club relationship enum/type mismatches.
- Improve email verification redirect and post-login routing.
- Add an onboarding identity-link review step so contact-link decisions happen explicitly.

Representative commits:

- `5dec459` - Fix onboarding next-step completion
- `a182f37` - Fix onboarding venue relations and email verify redirect

Representative files:

- `src/app/onboarding/next-steps/actions.ts`
- `src/app/onboarding/next-steps/page.tsx`
- `src/app/onboarding/next-steps/OnboardingIdentityLinkStep.tsx`
- `src/app/(auth)/login/page.tsx`
- `src/app/auth/callback/route.ts`
- `supabase/migrations/20260506120500_complete_onboarding_legal_agreement_rpc.sql`
- `supabase/migrations/20260507190000_complete_onboarding_next_step_rpc.sql`
- `supabase/migrations/20260507153000_fix_onboarding_venue_relationship_types.sql`

### 3. Contact Player Registration and Identity Link Review

Request intent:

- When a Contact Player registers, do not silently merge/claim old contact records.
- First link guest participant rows for match visibility by verified email or phone.
- Require explicit review acceptance before creating contact identity links.
- Allow users to keep a suspected contact identity separate.
- Preserve historical contact notes, match history, and guest participant rows.
- Notify original contact owners when their contact becomes a registered PlayerHoods account.
- Save the newly registered user into original owners' invite circle/Hood.

Representative commits:

- `c1dcb55` - Prepare 1.1 branch snapshot
- `7ece046` - Polish contact flows and deployment readiness
- `bc36051` - Sync local changes

Representative files:

- `src/app/components/IdentityLinkReviewCard.tsx`
- `src/lib/api/identity-links.ts`
- `src/lib/api/matches.ts`
- `supabase/migrations/20260505183000_user_verified_email_identity.sql`
- `supabase/migrations/20260505203000_identity_link_review_flow.sql`
- `supabase/migrations/20260505213000_identity_link_owner_notifications.sql`
- `supabase/migrations/20260505221000_contact_record_soft_archive.sql`
- `supabase/migrations/20260506134500_match_accept_invite_identity_links.sql`
- `supabase/migrations/20260508110000_contact_invite_link_review_full_chain.sql`

Current behavior captured by code:

- Login/reconcile links matching guest participant rows for match visibility.
- Contact identity link requires explicit accept.
- Accept creates `contact` and `guest_participant` identity links.
- Accept soft-archives some owner-private `contact_records`.
- Keep separate records a review decision and avoids link creation.

### 4. Linked Contact Should Prefer Registered User Path

Request intent:

- Once a Contact Player is linked to a registered account, future invitations should prefer the registered-user path.
- Match invite flows should route linked guest/contact identities toward the registered user when possible.
- Contact player resolution should expose `linked_user_id` and `resolution_state`.
- Match detail and Hoods UI should render linked identity more clearly.

Representative commits:

- `7ece046` - Polish contact flows and deployment readiness
- `bc36051` - Sync local changes
- `aaf05fa` - Release contact link person-scope identity

Representative files:

- `src/app/dashboard/HoodsPanel.tsx`
- `src/app/groups/[groupId]/page.tsx`
- `src/lib/api/groups.ts`
- `src/lib/api/hoods.ts`
- `src/lib/api/matches.ts`
- `supabase/migrations/20260505224500_linked_guest_invite_prefers_user_path.sql`
- `supabase/migrations/20260506143000_linked_contact_match_visibility.sql`
- `supabase/migrations/20260507101500_contact_resolution_prefers_linked_user.sql`
- `supabase/migrations/20260508162000_identity_link_person_scope_active_identity.sql`

Important open clarification:

- The current implementation preserves and may still display linked contact records in Contacts depending on owner, guest, and UI path.
- A follow-up product decision is needed on whether linked contacts should disappear from Contacts entirely and only show as registered users.

### 5. Contact Record Soft Archive and Person-Scoped Linking

Request intent:

- Avoid deleting original contact records.
- Add soft archive fields for historical retention.
- Record why a contact was replaced and which registered user replaced it.
- Move from single-`guest_id` thinking toward canonical `person_id` scope.
- Use v2 lookup/list RPCs so linked contacts can render registered-user identity while preserving historical contact rows.

Representative commits:

- `7ece046` - Polish contact flows and deployment readiness
- `aaf05fa` - Release contact link person-scope identity

Representative files:

- `supabase/migrations/20260505221000_contact_record_soft_archive.sql`
- `supabase/migrations/20260508162000_identity_link_person_scope_active_identity.sql`
- `src/lib/api/groups.ts`
- `src/lib/api/hoods.ts`
- `src/lib/types/database.ts`

Open risk:

- If one real registered user maps to multiple historical guest/contact rows, archive behavior must be person-scoped to prevent duplicate active contact cards.

### 6. Saved Players, Invite Circle, Discovery, and Hoods

Request intent:

- Expand Saved/Hood behavior beyond a flat invite circle.
- Support registered player discovery scopes by venue/city/group/saved relationships.
- Preserve privacy distinctions between discoverability and invite permission.
- Add or refine Save Player, Save Contact Player, and Saved/Contacts/Hoods UI behavior.
- Keep My Contact, Linked, From Group, and Starred provenance visible where useful.

Representative commits:

- `c1dcb55` - Prepare 1.1 branch snapshot
- `7ece046` - Polish contact flows and deployment readiness

Representative files:

- `src/app/dashboard/HoodsPanel.tsx`
- `src/app/dashboard/InviteCirclePanel.tsx`
- `src/app/profile/DiscoveryAndInvitesSection.tsx`
- `src/lib/api/discovery.ts`
- `src/lib/api/play-network.ts`
- `supabase/migrations/20260504120000_registered_player_discovery_scopes.sql`
- `supabase/migrations/20260504153000_onboarding_completion_and_relation_discovery.sql`

### 7. Match Invite, Request Scope, and Linked Guest Handling

Request intent:

- Keep match invite/request/admission behavior aligned with canonical admission rules.
- Prefer registered user path for linked guest/contact invites.
- Improve match creation and management UI around invite candidates, request scope, saved players, contact players, and groups.
- Preserve historical match participant rows while allowing identity-linked users to act on relevant invites.

Representative commits:

- `c1dcb55` - Prepare 1.1 branch snapshot
- `7ece046` - Polish contact flows and deployment readiness
- `a182f37` - Fix onboarding venue relations and email verify redirect
- `bc36051` - Sync local changes

Representative files:

- `src/app/matches/CreateMatchInline.tsx`
- `src/app/matches/[matchId]/MatchManagePanel.tsx`
- `src/app/matches/[matchId]/MatchDetailPageView.tsx`
- `src/lib/api/matches.ts`
- `supabase/migrations/20260505224500_linked_guest_invite_prefers_user_path.sql`
- `supabase/migrations/20260506134500_match_accept_invite_identity_links.sql`

### 8. Group Member Add Scope and Legacy RPC Cleanup

Request intent:

- Confirm whether group invite member scope matches match invite scope.
- Identify that `rpc_group_add_member` was too broad.
- Restrict group add/member initiation to people the actor has a relationship with:
  - saved registered player,
  - linked saved contact or my contact,
  - shared group user.
- Mark older `rpc_group_invite_user` as legacy/deprecated to prevent accidental use.

Representative commit:

- `bc36051` - Sync local changes

Representative files:

- `src/lib/api/groups.ts`
- `src/app/groups/[groupId]/AddGroupMemberPanel.tsx`
- `src/app/groups/[groupId]/InviteUserForm.tsx`
- `src/app/groups/new/NewGroupForm.tsx`
- `supabase/migrations/20260508143000_restrict_group_add_member_scope.sql`
- `supabase/migrations/20260508144500_mark_legacy_group_invite_user_rpc.sql`

Current behavior captured by code:

- Frontend calls `rpc_group_add_member`.
- `rpc_group_add_member` now checks saved/contact/shared-group relationship before creating a group join request or direct add.
- `rpc_group_invite_user` remains present but is documented as legacy/deprecated.

### 9. Production-Like Runtime, Deployment Readiness, and Cache Recovery

Request intent:

- Make local production testing reliable with clean build and restart scripts.
- Avoid mixing development and production Next.js build artifacts.
- Recover gracefully from stale chunks or build mismatches.
- Add runtime metadata route and build refresh guard.
- Stop global auto-refresh loops that caused disruptive refresh behavior.

Representative commits:

- `7ece046` - Polish contact flows and deployment readiness
- `d51b758` - Stop global auto-refresh loops
- `c7dd99f` - Fix local prod restart scripts

Representative files:

- `docs/P0_Operations_Runbook.md`
- `scripts/build-clean.ps1`
- `scripts/start-prod.ps1`
- `scripts/restart-prod.ps1`
- `src/app/components/BuildRefreshGuard.tsx`
- `src/app/components/ChunkRecovery.tsx`
- `src/app/api/runtime/route.ts`
- `src/app/layout.tsx`
- `next.config.js`

### 10. Email, Notifications, and Invitation Communication

Request intent:

- Improve invitation emails and notification rendering.
- Add owner notifications when identity links are accepted.
- Keep invitation actions explicit on invitation pages.
- Ensure contact owner messages say historical notes and match history are preserved.

Representative commits:

- `7ece046` - Polish contact flows and deployment readiness
- `bc36051` - Sync local changes

Representative files:

- `src/lib/email/render-email-layout.ts`
- `src/lib/email/templates.ts`
- `src/lib/notifications/channels/email/render-invitation-email.ts`
- `src/lib/api/notifications.ts`
- `src/app/invitations/[id]/invitation-actions.ts`
- `src/app/invitations/[id]/page.tsx`
- `supabase/migrations/20260505213000_identity_link_owner_notifications.sql`

### 11. Release Governance and Production Change Tracking

Request intent:

- Add a durable distinction between local code, GitHub, Vercel Production, Supabase Local, and Supabase Remote.
- Require production-related changes to be recorded in a production change log.
- Require structural releases to document migration details, verification, rollback, known risks, and unknowns.
- Avoid claiming a change is production deployed unless deployment and DB state are verified.

Representative commits:

- `0aa52e4` - Add release governance baseline docs
- `5b5b680` - Expand release governance templates
- `aaf05fa` - Release contact link person-scope identity

Representative files:

- `docs/00_RELEASE_GOVERNANCE.md`
- `docs/00_PRODUCTION_CHANGE_LOG.md`
- `docs/01_authority/00_AUTHORITATIVE_INDEX.md`

## Commit Timeline

| Date | Commit | Request Summary |
|---|---|---|
| 2026-05-05 | `c1dcb55` | Prepare 1.1 branch snapshot: docs, legal, onboarding, profile, discovery, venues, identity-link foundation. |
| 2026-05-07 | `7ece046` | Polish contact flows and deployment readiness: Contact Player link/soft archive, production runbook/scripts, runtime recovery, email/notification polish. |
| 2026-05-07 | `d51b758` | Stop global auto-refresh loops and reduce disruptive stale-build refresh behavior. |
| 2026-05-07 | `a182f37` | Fix onboarding venue relations, email verify redirect, and add identity-link step to onboarding. |
| 2026-05-07 | `c7dd99f` | Fix local production restart scripts. |
| 2026-05-08 | `5dec459` | Fix onboarding next-step completion with supporting RPC/type updates. |
| 2026-05-08 | `bc36051` | Sync local changes: contact invite full chain, group add member scope restriction, legacy group invite RPC comment, and related UI/API adjustments. |
| 2026-05-08 | `0aa52e4` | Add baseline release governance and production change log docs. |
| 2026-05-08 | `5b5b680` | Expand release governance templates and authoritative index. |
| 2026-05-08 | `aaf05fa` | Release contact link person-scope active identity behavior and change-log record. |

## Current Open or Follow-Up Requests

These are implied by recent conversation and code state but may need explicit product decisions:

1. Linked Contact display policy:
   - Should a registered linked Contact Player disappear from Contacts entirely?
   - Or should they remain in Contacts with a Linked badge and registered-user invite path?

2. Contact archive scope:
   - Current code has moved toward person-scope behavior, but duplicate historical guest/contact rows should be audited.
   - Desired rule likely needs to be: once accepted, archive all active contact records for the same canonical person where appropriate, not only one guest row.

3. Group member add scope:
   - The database now restricts `rpc_group_add_member`.
   - UI candidate lists should be checked to ensure they match the same backend relationship rule and do not show users who will be rejected.

4. Production verification:
   - Login page reachability was checked.
   - Full core-flow smoke test still needs test accounts and scripted/recorded verification.

5. Repository hygiene:
   - Some generated/runtime files were committed in `bc36051`.
   - Future governance says local runtime logs should not be treated as product changes.

## Notes on Evidence

Primary evidence used:

- `git log --since="3 days ago"`
- commit file lists and stats
- Supabase migration filenames and contents
- `docs/00_PRODUCTION_CHANGE_LOG.md`
- `docs/00_RELEASE_GOVERNANCE.md`

This summary intentionally describes user-facing/code-change requirements rather than every low-level file edit.
