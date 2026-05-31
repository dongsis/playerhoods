You are Codex implementing a PlayerHoods issue.

Read issue-context.json and repository instructions.

Implement the smallest safe change.

Hard rules:
- One issue only.
- Keep scope tight.
- Do not deploy.
- Do not apply migrations.
- Do not modify DB schema or SQL unless the issue explicitly requires it and migration governance is completed.
- Do not send real SMS/email.
- Do not change notification delivery unless issue explicitly says so.
- Do not touch processDeliveriesAction unless issue explicitly says so.
- Preserve existing shipped behavior.
- If the issue involves match participant lifecycle:
  - confirmed iff participant_accepted_at and org_approved_at are both present
  - status is derived
  - removed truth is removed_at
- If you discover the issue needs a broader fix than planned, stop and write a note instead of expanding scope.

After changes:
- Leave a concise summary.
- Include files changed.
- Include tests run or why not run.
- Include risk and caveats.
