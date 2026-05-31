Implemented the smallest safe #22 change in [MatchManagePanel.tsx](/home/runner/work/playerhoods/playerhoods/src/app/matches/[matchId]/MatchManagePanel.tsx:643).

Changes:
- Added a defensive `isApplying` guard to prevent double-submit.
- Disabled the confirmation modal Cancel/Back button while applying.
- Updated the clean pending state copy to `No changes selected yet.`

Preserved:
- Existing success refresh/collapse flow: dashboard refresh event, `router.refresh()`, `onApplied()`.
- Existing pending clear behavior after success.
- Existing failure behavior.
- `processDeliveriesAction().catch(() => {})` only for invite additions.
- No migrations, no deployment, no notification delivery changes.

Verification:
- `git diff --check` passed.
- `npm run build` could not run because dependencies are not installed in this workspace: `next: not found`.
- I attempted to commit the fix separately, but `.git` is read-only in this environment: `Unable to create .../.git/index.lock`.

Files changed:
- `src/app/matches/[matchId]/MatchManagePanel.tsx`

Risk/caveats:
- Low code risk; this is UI-state guarding and copy only.
- Manual disposable-data validation is still needed for the full invite/apply/refresh flow because the build could not run locally.