# Issue: Unify Add Players Panel and Refresh Match State After Apply Changes

## Summary

The Create Match players panel and the post-create Add More Players panel should feel like one shared Add Players system. The current UI has the right three-column direction, but creation and post-create flows still differ in visual language, summary behavior, selected states, and Apply Changes completion behavior.

After Apply Changes succeeds, the editing panel should close, pending additions should clear, canonical match detail data should refresh, and the main match detail view should immediately show the updated lineup, invited/waiting players, and open-to-join state.

## Current Problems

- Create-time player selection and post-create Add More Players use similar concepts but inconsistent copy and visual treatment.
- Section labels feel too technical: `ADD BY`, `SELECT TARGET`, `SUMMARY`.
- Add My Contact occupies too much visual space and is not consistently placed.
- Selected player rows are visually heavy in places, especially thick black outlines or pill-like selected states.
- Contact players can collapse into tiny avatar-only rows, making them look unclear or non-selectable.
- Invite and Open to Join are not explained clearly enough.
- Summary can show internal-looking values such as `User 32ff6f` instead of user-facing copy like `1 open spot`.
- Pending changes are useful, but after a successful apply the panel can remain open and the upper match state does not clearly refresh.
- Apply Changes does not feel final or trustworthy when the user remains inside the editing workflow.

## Desired Shared Layout

Keep the three-column structure:

```text
Add by              Choose players              Summary
Invite              Player/contact list          Confirmed
Open to Join        Add My Contact               Invited
                                             Open to join
                                             Pending changes
```

Rename section labels:

- `ADD BY` -> `Add by`
- `SELECT TARGET` -> `Choose players`
- `SUMMARY` -> `Summary`

Use title case or sentence case rather than spaced all-caps.

## Create Match Version

Use this copy:

- Title: `Players`
- Subtitle: `Choose players to invite, or open spots for others to join.`
- Counter: `Players needed: 4`

When players are selected, show dynamic progress:

- `1 more needed`
- or `3 of 4 selected`

During creation, do not overemphasize a confirmed lineup because the match has not been formed yet.

Summary should mainly show:

- Invited players
- Open spots

Bottom action should remain context-aware:

- `Continue` if this is an intermediate step
- `Create Match` if this is the final step

## Post-Create Add More Players Version

Use this copy:

- Title: `Need more players?`
- Subtitle: `3 spots are open. Invite players, add a contact, or open spots to join.`

When the panel is collapsed:

```text
Need more players?
3 spots are open.
[Add More Players]
Set Teams available after 4 confirmed players.
```

If Set Teams is visible before enough confirmed players exist:

- Make it disabled or very secondary.
- Show helper text: `Need 4 confirmed players to set doubles teams.`

Avoid showing Add More Players and Set Teams as equal primary actions when the lineup is not ready.

If no spots are open:

- Do not prominently show `Need more players?`
- Show `Lineup is full.`
- If teams can now be set, enable Set Teams.

## Add By Column

Keep two choices:

- Invite
- Open to Join

When Invite is selected, show this helper in the middle column:

```text
Invite specific players
Choose saved players or contacts to invite directly.
```

When Open to Join is selected, show:

```text
Open spots to join
Let eligible players request or join open spots.
```

This should clarify:

- Invite = choose specific players or contacts directly.
- Open to Join = open spots for eligible players to request or join.

## Choose Players Column

Use consistent selectable rows for saved players, contact players, and invited candidates.

Selected state:

- Light blue background
- Blue border
- Checkmark on the right
- No thick black outline

Unselected state:

- White or subtle light row
- Subtle border
- Name plus optional badge

Contact players must remain readable:

```text
a
Contact
```

or:

```text
a [Contact]
```

Do not render contact players as tiny circle-only objects.

## Add My Contact Placement

Make Add My Contact an auxiliary action, not a large repeated prompt.

Preferred placement in Choose players:

```text
Need someone not listed?
+ Add My Contact
```

Keep this compact. The overall panel is already about adding players, so avoid a large nested `Need more players?` box inside the middle column.

## Summary Column

Use clearer, user-facing sections:

```text
Summary

Confirmed
beau
3 spots left

Invited
nan289

Open to join
1 open spot

Pending changes
Invite dongsisi
Undo
```

Do not show internal-looking IDs such as:

```text
User 32ff6f
```

If the row represents open-to-join capacity, show:

```text
1 open spot
```

If it represents a player, show the player's display name.

If there are no pending changes:

```text
No changes selected yet.
```

## Apply Changes Success Behavior

When the user clicks Apply Changes and the mutation succeeds:

- Close/collapse the Add More Players panel.
- Clear pending additions.
- Refresh/revalidate match detail data from the server.
- Re-render lineup, waiting list, invited list, and open-to-join summary from the latest server state.
- Show a subtle temporary success message:
  - `Changes applied.`
  - or `Invitations updated.`

Do not leave the user inside the editing panel after a successful apply.

The collapsed card should then show the current match state, for example:

```text
Need more players?
2 more spots are open.
[Add More Players]
Need 4 confirmed players to set doubles teams.
```

## Apply Changes Loading and Error Behavior

While Apply Changes is running:

- Disable Apply Changes.
- Disable Cancel.
- Show `Applying...`.
- Prevent double-submit.

If Apply Changes fails:

- Keep the panel open.
- Keep pending additions visible.
- Show inline error near the bottom:

```text
Couldn't apply changes. Please try again.
```

- Do not clear pending additions on failure.

## Data Source Requirement

Do not rely only on optimistic local state after apply.

After a successful mutation:

- Revalidate/refetch the match detail data.
- Let the UI reflect canonical server state.
- Ensure pending additions move into actual invited/waiting/open-to-join sections only after the server confirms them.

## Suggested Implementation Plan

1. Audit the existing add-player surfaces:
   - `src/app/matches/CreateMatchInline.tsx`
   - `src/app/matches/[matchId]/MatchManagePanel.tsx`
   - `src/app/matches/[matchId]/MatchToolsSection.tsx`
   - `src/app/matches/[matchId]/MatchDetailPageView.tsx`
   - `src/app/matches/[matchId]/ParticipantGroups.tsx`

2. Define a shared Add Players UI model:
   - Mode: create vs post-create.
   - Add method: invite vs open-to-join/request.
   - Candidates: saved users, contact players, groups if still supported.
   - Pending changes: invite adds, open-to-join adds, removals if applicable.
   - Summary sections: confirmed, invited, open-to-join, pending changes.

3. Normalize copy and labels:
   - `Add by`
   - `Choose players`
   - `Summary`
   - `Apply Changes`
   - `No changes selected yet.`
   - `Lineup is full.`

4. Normalize selectable row styling:
   - Replace heavy selected outlines with light blue selected rows and right-side checkmarks.
   - Ensure contact players render as full readable rows.
   - Add small `Contact` badges where helpful.

5. Move Add My Contact into a compact auxiliary area in Choose players:
   - `Need someone not listed?`
   - `+ Add My Contact`

6. Clean up Summary:
   - Remove internal-looking IDs from open-to-join display.
   - Render open capacity as `1 open spot`, `2 open spots`, etc.
   - Keep Pending changes prominent but compact.

7. Fix post-create apply flow:
   - Add an `onApplied` callback from `MatchManagePanel` to `MatchToolsSection`.
   - On success, clear pending local state, close the invite panel, show a temporary success message, dispatch existing live-refresh event if needed, and call `router.refresh()`.
   - Keep the panel open and pending state intact on failure.

8. Confirm canonical refresh:
   - Ensure server actions or client API calls revalidate `/matches/[matchId]` and `/matches`.
   - Confirm upper sections re-render from refreshed loader/view-model data, not from stale local assumptions.

9. Add regression coverage where practical:
   - Unit/component coverage for summary formatting if available.
   - E2E or Playwright flow for selecting a player, applying changes, seeing the panel close, and seeing the invited/waiting section update.
   - Error-state test or mocked failure path to verify pending changes remain visible.

10. Visual QA:
    - Verify create-time panel and post-create panel at desktop and narrow widths.
    - Verify selected rows, contact rows, Add My Contact placement, Summary sections, disabled Set Teams, loading state, success state, and failure state.

## Acceptance Criteria

- Create Match and post-create Add More Players use the same section labels and visual logic.
- Invite and Open to Join have clear helper copy.
- Add My Contact is compact and consistently placed in Choose players.
- Selected player rows use light blue background, blue border, and a right-side checkmark.
- Contact players are readable full rows, not tiny circle-only objects.
- Summary does not show internal-looking IDs for open-to-join spots.
- Pending changes show selected additions and allow Undo.
- Apply Changes is disabled while applying and shows `Applying...`.
- On successful Apply Changes, the panel closes, pending additions clear, canonical match detail data refreshes, and a subtle success message appears.
- On failed Apply Changes, the panel stays open, pending additions remain, and an inline error appears.
- If the lineup is full, the collapsed card says `Lineup is full.` and enables Set Teams when enough players are confirmed.

