# PlayerHoods Prelaunch Verification Matrix - 2026-05

Purpose: freeze a launch-readiness checklist for the current PlayerHoods flows and record the checks that were runnable locally on 2026-05-12/13.

Scope: onboarding, Hoods, contact players, linked contacts, groups, match invite/admission, notifications/inbox, and production-like local runtime.

## Automated Checks Executed

| Check | Status | Exact command / reproduction steps | Notes |
|---|---|---|---|
| TypeScript compile | Pass | `npx tsc --noEmit` | Passed after fixing HoodsPanel prop/filter typing caught by Next build. |
| SQL regression suite | Blocked | `npm run verify:sql` | Docker Desktop daemon is not running: cannot connect to `dockerDesktopLinuxEngine`. |
| Clean production build | Pass | `npm run build:clean` | Passed. Next build compiled all app routes. |
| Production-like local restart | Pass | `npm run restart:prod` | Passed. Server restarted on `http://localhost:3000`. |
| Local production home HTTP smoke | Pass | `Invoke-WebRequest -UseBasicParsing http://localhost:3000/` | Returned `200 OK`. |
| Local production login HTTP smoke | Pass | `Invoke-WebRequest -UseBasicParsing http://localhost:3000/login` | Returned `200 OK`. |
| Legacy admission script | Blocked | `npm run test:v1.3` | `package.json` references missing `scripts/test_v1_3_admission.mjs`. |

## Verification Matrix

| Area | Scenario | Status | Exact reproduction steps | Affected files | DB migration needed? | Production verification pending? |
|---|---|---|---|---|---|---|
| New user onboarding | Legal agreement gate | Pending manual | 1. Create a fresh test user. 2. Sign in at `/login`. 3. Confirm user must accept legal terms before dashboard access. 4. Refresh and verify accepted state persists. | `src/app/onboarding/*`, `src/app/dashboard/*`, `src/lib/api/identities.ts` | No new migration from this check. Requires existing onboarding/legal schema. | Yes |
| New user onboarding | Profile completion | Pending manual | 1. Fresh user signs in. 2. Complete display name, sport, location/city. 3. Save. 4. Verify `/dashboard` loads with profile data and no phone default value. | `src/app/onboarding/profile/*`, `src/app/dashboard/ProfilePanel.tsx`, `src/app/profile/*` | No | Yes |
| New user onboarding | Venue relationship | Pending manual | 1. Open Profile/Venues. 2. Search a venue. 3. Save as member/primary. 4. Verify saved venue shows sport badge and `venue_user_relationships` path is reflected in UI. | `src/app/dashboard/VenuesPanel.tsx`, `src/lib/api/identities.ts`, `src/lib/api/venues.ts` | No | Yes |
| New user onboarding | Identity link review | Pending manual | 1. Seed or use a contact record matching the new user's email/phone. 2. Sign in as that user. 3. Confirm identity link review appears. 4. Accept and verify linked match/contact history appears under registered identity. | `src/app/components/IdentityLinkReviewCard.tsx`, `src/lib/api/identity-links.ts`, `src/app/matches/[matchId]/*` | No new migration. Requires identity link RPCs already applied. | Yes |
| Exact Email / Phone Search | Direct save allowed | Pending manual | 1. User A enables Exact Email / Phone Search. 2. User B searches exact normalized email or phone in Hoods Discover/Search People. 3. Verify registered user card appears without exposing email/phone. 4. Save directly. | `src/app/dashboard/HoodsPanel.tsx`, `src/lib/api/discovery.ts`, `src/lib/api/save-requests.ts` | No new migration. Requires save request/search RPCs applied. | Yes |
| Exact Email / Phone Search | Privacy disabled | Pending manual | 1. User A disables contact-info-based saving. 2. User B searches exact email/phone. 3. Verify no private contact info is exposed. 4. Verify only possible match / Send Save Request is available. | `src/app/dashboard/HoodsPanel.tsx`, `src/lib/api/discovery.ts`, `src/lib/api/save-requests.ts` | No | Yes |
| Exact Email / Phone Search | No result | Pending manual | 1. Search a non-existent email/phone. 2. Verify no result state and no private information leakage. | `src/app/dashboard/HoodsPanel.tsx`, `src/lib/api/discovery.ts` | No | Yes |
| Exact Email / Phone Search | Same-club exact display-name weak match | Pending manual | 1. Put User A and User B in the same venue/club. 2. Search exact display name when direct exact contact save is not available. 3. Verify weak possible match surfaces only as Save Request / limited preview. 4. Verify no auto-save/link/merge. | `src/app/dashboard/HoodsPanel.tsx`, `src/lib/api/discovery.ts`, `src/lib/api/save-requests.ts` | No | Yes |
| Contact Player | Create contact | Pending manual | 1. Open Dashboard > Hoods > Add My Contact. 2. Enter name/email/phone. 3. Save. 4. Verify card appears in Saved/Contacts. | `src/app/dashboard/HoodsPanel.tsx`, `src/lib/api/roster.ts`, `src/lib/api/play-network.ts` | No | Yes |
| Contact Player | Save contact | Pending manual | 1. Find a shared/group contact in Hoods. 2. Star/save it. 3. Verify `person_relationships` saved state and Saved > Contact section. | `src/app/dashboard/HoodsPanel.tsx`, `src/app/components/SaveContactPlayerButton.tsx`, `src/lib/api/play-network.ts` | No | Yes |
| Contact Player | Add to group | Pending manual | 1. Open a group as active member. 2. Members > Add people > Shared Contact. 3. Choose an unlinked contact. 4. Verify it appears under Shared Contacts, not Members. | `src/app/groups/[groupId]/AddGroupMemberPanel.tsx`, `src/app/groups/[groupId]/page.tsx`, `src/lib/api/groups.ts` | No | Yes |
| Contact Player | Invite to match | Pending manual | 1. Open Hoods contact card menu. 2. Invite to an open match. 3. Verify contact/person invite is created and queued notification can be processed. | `src/app/dashboard/HoodsPanel.tsx`, `src/app/matches/[matchId]/MatchManagePanel.tsx`, `src/lib/api/matches.ts` | No | Yes |
| Linked Contact | Link review accept | Pending manual | 1. Seed a contact identity link candidate. 2. Open matching user account. 3. Accept link review. 4. Verify contact card becomes Linked and registered profile identity is preferred. | `src/app/components/IdentityLinkReviewCard.tsx`, `src/lib/api/identity-links.ts`, `src/app/dashboard/HoodsPanel.tsx` | No | Yes |
| Linked Contact | Keep separate | Pending manual | 1. Seed a contact identity link candidate. 2. Choose Keep separate. 3. Verify candidate disappears and contact history is not linked to user identity. | `src/app/components/IdentityLinkReviewCard.tsx`, `src/lib/api/identity-links.ts` | No | Yes |
| Linked Contact | Owner notification | Pending manual | 1. Accept a link for a contact that another owner saved. 2. Open owner Inbox. 3. Verify owner receives identity link notice without private details. | `src/app/dashboard/InboxPanel.tsx`, `src/lib/api/notifications.ts`, `src/lib/api/identity-links.ts` | No | Yes |
| Linked Contact | Future invite uses registered user path | Pending manual | 1. Save a contact, link it to a registered user. 2. From Hoods invite that linked card to an open match. 3. Verify wrapper returns/creates registered-user participant rather than guest-only participant. | `src/app/dashboard/HoodsPanel.tsx`, `src/app/matches/[matchId]/MatchManagePanel.tsx`, `src/lib/api/matches.ts` | No. Requires `rpc_match_invite_contact_person` migration already applied. | Yes |
| Hoods | In My Hood | Pending manual | 1. Open Dashboard > Hoods. 2. Verify one card per real person where possible. 3. Verify default card density is avatar + display name + star + more. | `src/app/dashboard/HoodsPanel.tsx` | No | Yes |
| Hoods | Discover | Pending manual | 1. Switch to Discover. 2. Check Club Members, City Players, Search People. 3. Save a result and verify it returns to Hood/Saved. | `src/app/dashboard/HoodsPanel.tsx`, `src/lib/api/discovery.ts`, `src/lib/api/play-network.ts` | No | Yes |
| Hoods | Saved | Pending manual | 1. Filter Saved. 2. Verify registered/linked saved players first. 3. Verify lower Contact section for contact records. | `src/app/dashboard/HoodsPanel.tsx` | No | Yes |
| Hoods | Contact | Pending manual | 1. Filter Contacts. 2. Verify owner contact records and shared contacts appear as compact cards. 3. Open drawer for private details. | `src/app/dashboard/HoodsPanel.tsx` | No | Yes |
| Hoods | From Shared Group | Pending manual | 1. Filter From Groups. 2. Verify registered group members and shared group contacts are included. 3. Verify group info is in detail/more, not persistent tag walls. | `src/app/dashboard/HoodsPanel.tsx` | No | Yes |
| Hoods | Linked badge | Pending manual | 1. Use linked contact fixture. 2. Verify one compact card with Linked badge. 3. Open drawer and verify explanation text. | `src/app/dashboard/HoodsPanel.tsx` | No | Yes |
| Hoods | Filters | Pending manual | 1. Click All, Saved, Contacts, Linked, Club, From Groups. 2. Verify each filter scopes within the same Hoods page and does not create source-specific pages. | `src/app/dashboard/HoodsPanel.tsx` | No | Yes |
| Groups | Add member allowed | Pending manual | 1. Open a group as active member. 2. Add an eligible registered player. 3. Verify direct add or request behavior follows policy. | `src/app/groups/[groupId]/AddGroupMemberPanel.tsx`, `src/lib/api/groups.ts` | No | Yes |
| Groups | Add member denied | Pending manual | 1. Try adding a user outside allowed scope. 2. Verify denied/not allowed response. | `src/app/groups/[groupId]/AddGroupMemberPanel.tsx`, `src/lib/api/groups.ts` | No | Yes |
| Groups | Already member | Pending manual | 1. Try adding an existing group member. 2. Verify Already a member feedback. | `src/app/groups/[groupId]/AddGroupMemberPanel.tsx`, `src/lib/api/groups.ts` | No | Yes |
| Groups | Pending request | Pending manual | 1. Add a player requiring approval. 2. Verify pending request response and no duplicate active member. | `src/app/groups/[groupId]/AddGroupMemberPanel.tsx`, `src/lib/api/groups.ts` | No | Yes |
| Match | Invite People | Pending manual | 1. Create/open active match. 2. Open Invite People. 3. Select registered player and contact/linked contact. 4. Apply. | `src/app/matches/[matchId]/MatchManagePanel.tsx`, `src/lib/api/matches.ts` | No | Yes |
| Match | Invite Groups | Pending manual | 1. Open active match as organizer. 2. Invite a group. 3. Verify group invite appears and notifications queue. | `src/app/matches/[matchId]/MatchManagePanel.tsx`, `src/lib/api/matches.ts`, `src/lib/api/groups.ts` | No | Yes |
| Match | Visible to Groups | Pending manual | 1. Add users/groups to Visible to Groups. 2. Verify scope controls request visibility without direct invite. | `src/app/matches/[matchId]/MatchManagePanel.tsx`, `src/lib/api/matches.ts` | No | Yes |
| Match | Accept Invite | Pending manual | 1. Invite test user to match. 2. Sign in as invited user. 3. Accept. 4. Verify participant confirmed/pending approval as expected. | `src/app/matches/[matchId]/MatchActions.tsx`, `src/lib/api/matches.ts` | No | Yes |
| Match | Request to Join | Pending manual | 1. Make match visible to a group/city scope. 2. Sign in as eligible non-invited user. 3. Request to join. 4. Verify organizer sees request. | `src/app/matches/[matchId]/MatchActions.tsx`, `src/lib/api/matches.ts` | No | Yes |
| Match | Withdraw | Pending manual | 1. Confirm or request as participant. 2. Withdraw. 3. Verify participant removed and reason flow if applicable. | `src/app/matches/[matchId]/MatchActions.tsx`, `src/app/matches/[matchId]/MatchManagePanel.tsx`, `src/lib/api/matches.ts` | No | Yes |
| Match | Remove | Pending manual | 1. Organizer opens Remove mode. 2. Remove confirmed/pending participant. 3. Verify participant removed and roster recalculates. | `src/app/matches/[matchId]/MatchManagePanel.tsx`, `src/lib/api/matches.ts` | No | Yes |
| Notifications / Inbox | Save request | Pending manual | 1. Send Save Request from privacy-safe possible match. 2. Target opens Inbox. 3. Allow/Decline. 4. Verify relationship or repeat-rate-limit state. | `src/app/dashboard/InboxPanel.tsx`, `src/lib/api/save-requests.ts`, `src/lib/api/notifications.ts` | No new migration. Requires save request migration applied. | Yes |
| Notifications / Inbox | Identity link owner notice | Pending manual | 1. Link contact to registered user. 2. Owner opens Inbox. 3. Verify notice is consolidated/privacy-safe. | `src/app/dashboard/InboxPanel.tsx`, `src/lib/api/identity-links.ts`, `src/lib/api/notifications.ts` | No | Yes |
| Notifications / Inbox | Match invite | Pending manual | 1. Invite registered user/contact to match. 2. Process deliveries if needed. 3. Verify Inbox item and email/SMS template copy says invited, not nominated. | `src/app/dashboard/InboxPanel.tsx`, `src/lib/email/templates.ts`, `src/lib/notifications/*`, `src/lib/api/matches.ts` | No | Yes |
| Production-like local runtime | Clean build | Pass | `npm run build:clean` | `scripts/build-clean.ps1`, app routes | No | No for local; yes for production site |
| Production-like local runtime | Restart production server | Pass | `npm run restart:prod`; then open `http://localhost:3000` | `scripts/restart-prod.ps1`, `scripts/start-prod.ps1` | No | No for local; yes for production site |
| Production-like local runtime | HTTP smoke | Pass | `Invoke-WebRequest -UseBasicParsing http://localhost:3000/`; `Invoke-WebRequest -UseBasicParsing http://localhost:3000/login` | `src/app/page.tsx`, `src/app/login/*` | No | No for local; yes for production site |

## Current Blockers Before Full Prelaunch Signoff

1. Docker Desktop must be running for `npm run verify:sql`.
2. `npm run test:v1.3` points to missing `scripts/test_v1_3_admission.mjs`; either restore the script or remove/replace the package script.
3. Manual/production verification is still pending for all DB-backed user journeys above.
4. Remote Supabase must be confirmed to include the save request, identity link, contact person invite wrapper, group contact v2, and venue people discovery migrations before production signoff.

## Notes From This Verification Pass

- The first `npm run restart:prod` attempt failed on a Hoods filter type mismatch. It was fixed in `src/app/dashboard/HoodsPanel.tsx`.
- The second `npm run restart:prod` attempt failed because `DashboardShell` passed screenshot-import props while `HoodsPanel` props did not declare them. It was fixed by restoring optional prop typings in `src/app/dashboard/HoodsPanel.tsx`.
- No new database migration was created for this matrix.
- Production website verification remains pending.
