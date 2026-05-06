# PlayerHoods DB Legacy Inventory

Last updated: 2026-05-05

## Purpose

This document lists legacy / deprecated database objects that may still exist in schema, generated types, seed data, SQL fixtures, or historical migrations.

Prelaunch rule:
Do not delete legacy DB objects just for cleanliness. First remove active business references, document the canonical replacements, then plan cleanup after launch stability.

## Legacy Objects

### venue_identities
Status: Deprecated / legacy
Canonical replacement: `venue_user_relationships`
Current usage classification:
- Active business usage: no
- Type-only usage: yes
- Migration-only usage: yes
Notes:
- Current app code reads venue membership from `venue_user_relationships`.
- `venue_identities` still appears in generated Supabase types, historical migrations, baseline snapshots, seed SQL, and older design docs.
- Keep for now. Do not use in new business code.

### rpc_venue_members_discovery
Status: Deprecated / legacy
Canonical replacement: `rpc_venue_people_discovery_v2`
Current usage classification:
- Active business usage: no
- Type-only usage: yes
- Migration-only usage: yes
Notes:
- Current app wrapper `getVenueMembersDiscovery` calls `rpc_venue_people_discovery_v2`.
- Old RPC remains in generated types and historical SQL.
- Keep for now. Do not use in new business code.

### profiles.middle_name
Status: Legacy profile field
Canonical replacement: none / not currently used
Current usage classification:
- Active business usage: no
- Type-only usage: yes
- Migration-only usage: yes
Notes:
- Present in generated profile types and historical schema only.
- No active UI / action / service usage was found in `src/`.

### profiles.level
Status: Deprecated
Canonical replacement: `user_sport_profiles.level` / sport-aware profile path
Current usage classification:
- Active business usage: no
- Type-only usage: yes
- Migration-only usage: yes
Notes:
- Current UI level display is sourced from sport-specific profile records, not the old profile-level field.
- The profile-level `level` residue remains in generated types and historical schema snapshots.

### profiles.plays_singles
Status: Deprecated
Canonical replacement: `user_sports` / `user_sport_profiles`
Current usage classification:
- Active business usage: no
- Type-only usage: yes
- Migration-only usage: yes
Notes:
- No active business code in `src/` reads this field.
- Sport and format preferences should stay sport-aware.

### profiles.plays_doubles
Status: Deprecated
Canonical replacement: `user_sports` / `user_sport_profiles`
Current usage classification:
- Active business usage: no
- Type-only usage: yes
- Migration-only usage: yes
Notes:
- No active business code in `src/` reads this field.
- Sport and format preferences should stay sport-aware.

### profiles.secondary_venue_ids
Status: Deprecated
Canonical replacement: `venue_user_relationships`
Current usage classification:
- Active business usage: no
- Type-only usage: yes
- Migration-only usage: yes
Notes:
- Multi-venue relationships are handled through relationship rows now.
- The legacy array field remains in generated types and historical schema only.

### profiles.show_in_venue_member_discovery
Status: Deprecated
Canonical replacement: `venue_user_relationships.visible_in_venue_member_discovery`
Current usage classification:
- Active business usage: no
- Type-only usage: yes
- Migration-only usage: yes
Notes:
- This field was previously forwarded by `updateProfile`, but active business code has been migrated away from that profile-level path.
- Current venue discovery visibility should be relation-specific via `venue_user_relationships`.
- The old field remains in generated types and historical migrations for compatibility.

### matches.court_ids
Status: Deprecated
Canonical replacement: `match_courts`
Current usage classification:
- Active business usage: no
- Type-only usage: yes
- Migration-only usage: yes
Notes:
- Current app code uses `match_courts`.
- `matches.court_ids` still appears in generated types, historical schema, and SQL regression fixtures.
- Keep for now because old SQL fixtures and baseline snapshots still mention it.

## Related Legacy Helpers

### setVenueIdentityPreferences / rpc_venue_identity_set_preferences
Status: Legacy helper path
Canonical replacement:
- `setVenueRelationshipMemberDiscovery`
- `rpc_venue_relationship_set_member_discovery`
Notes:
- This helper remains in code for compatibility but should not be used in new business paths.

## Registered User Discovery Naming

For registered-user discovery and search flows, use:
- Exact Email / Phone Search
- Email / Phone Search
- `searchable_by_email_or_phone` at the app/service layer when introducing new non-schema-facing names

Do not introduce new product-facing registered-user discovery names that overlap with Contact Player terminology.

Reason:
- Contact Player is a separate existing system and should not be confused with registered-user discovery.
- Legacy database field / RPC names may still retain older wording internally for compatibility, but new product-facing code and docs should prefer email/phone wording.

## Cleanup Policy

Do not drop these objects before launch unless there is a confirmed production-blocking conflict.

Cleanup may be planned after:
1. staging/production backup exists
2. active business usage is zero
3. canonical path is stable
4. rollback plan exists
5. append-only cleanup migration is prepared and reviewed
