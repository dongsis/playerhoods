# Release and Branch Safety Rules

This project has had dirty production deployments before. Do not assume production, `main`, and local worktrees are aligned.

These rules are mandatory for Codex work in this repository.

## Before Editing Any Code

Codex must report:

- Current branch.
- Current HEAD.
- `git status --short`.
- `origin/main` HEAD.
- Active `release/*`, `fix/*`, or `codex/*` branches.
- Whether there is an active release branch.
- Proposed base branch.
- Proposed working branch.
- Whether the task depends on pending fixes.
- Whether the task touches Supabase migrations.
- Whether deployment or migration apply is requested.

Codex must run and report:

```sh
git branch --show-current
git rev-parse HEAD
git status --short
git rev-parse origin/main
git branch --list "release/*" "fix/*" "codex/*"
```

If possible, Codex must also report the latest Vercel production deployment id and whether that deployment was dirty or clean.

Do not edit until the base branch is clear.

## Required First Response For Coding Tasks

For any coding task, start with:

```text
Current branch:
Current HEAD:
Worktree status:
origin/main:
Active release branch:
Proposed base:
Proposed working branch:
Depends on pending fixes:
Touches migrations:
Risk:
Awaiting approval before edits:
```

## Base Branch Rules

Codex must identify the intended base before editing:

- Production hotfix: use the latest production-tested release branch, or latest `origin/main` only if production is known clean.
- Normal fix: use latest `release/current` if an active release exists; otherwise use latest `origin/main`.
- Dependent fix: use the branch or commit containing the prerequisite fix.

If the user asks for a fix without specifying a branch, Codex must stop and ask, or propose the safest base branch before editing.

If the task depends on another pending fix, branch from the prerequisite fix branch or from the latest `release/current` containing that fix.

## Branch Rules

Do not work directly on `main` when:

- The worktree is dirty.
- Production was deployed from a dirty worktree.
- There is an active `release/current` or `release/integration-*` branch.
- The change is part of a multi-fix release.
- The user has not specified the intended base.

Use:

- `fix/<short-task-name>` for isolated parallel fixes.
- `release/current` for the active release candidate.
- `release/integration-YYYYMMDD` for consolidating multiple fixes.

Codex must never create unrelated Vercel projects from a release worktree.

## Dirty Worktree Rules

If uncommitted changes exist, classify them before editing:

- Intended fix.
- Unrelated pending fix.
- Generated/noise artifact.
- Supabase migration.
- Unknown/risky.

Do not overwrite, revert, or mix unrelated dirty changes unless explicitly instructed.

Do not mix unrelated dirty changes into a commit.

## Commit Rules

Each fix must be committed separately with a clear message.

Do not create large mixed commits unless the user explicitly approves.

## Autonomous Draft PR Work Rules

After an issue plan is approved, Codex may keep working without additional user approval only when all of these are true:

- The work stays inside the approved issue scope.
- The work stays on the approved issue branch.
- The pull request remains Draft.
- No production deployment is performed.
- No Supabase Remote migration is applied.
- No real SMS, email, or external provider traffic is triggered.
- No destructive migration, data deletion, table drop, column drop, or RPC drop is introduced.
- Product behavior is not expanded beyond the approved plan.

While those conditions hold, Codex may:

- Edit implementation files within approved scope.
- Add or update tests.
- Add append-only local migrations only when the approved issue explicitly requires DB work and migration governance is satisfied.
- Run local checks, build, typecheck, lint, SQL regression, and targeted tests.
- Investigate and fix build, typecheck, lint, SQL regression, test, and CI failures caused by the approved change.
- Push commits to the working branch.
- Update the Draft PR description.
- Comment progress on the issue or PR.
- Keep iterating in the Draft PR until required checks pass or a stop condition is reached.

Codex must not ask the user after every CI failure when the failure is within approved scope and the PR is still Draft.

Codex must stop and ask for explicit approval before:

- Marking a PR Ready for Review.
- Merging a PR.
- Deploying to production.
- Applying Supabase Remote migrations.
- Sending real SMS, email, or provider traffic.
- Closing a core issue.
- Expanding product scope or changing approved product rules.
- Deleting data.
- Dropping tables, columns, RPCs, or other DB objects.
- Rewriting historical migrations.

Codex must also stop when:

- Product behavior is ambiguous.
- The issue scope needs expansion.
- A migration is destructive or not clearly append-only.
- A CI failure appears unrelated and fixing it would broaden scope.
- Real provider credentials or production data would be involved.
- The PR is ready to leave Draft.

## Required Draft PR Lifecycle

For approved autonomous implementation work:

1. Open a Draft PR.
2. Keep pushing scoped fixes while the PR remains Draft.
3. Do not ask the user after every CI failure.
4. When all required checks pass, post a Ready Packet.
5. Ask permission before marking the PR Ready for Review.

Ready Packet format:

```text
Issue / PR:
Branch:
Scope completed:
Runtime behavior changed:
Migration changed:
Remote migration applied:
Deploy performed:
Checks:
Remaining risks:
Decision requested:
```

Use the Ready Packet to separate facts from decisions. Do not imply that GitHub, Vercel Production, Supabase Remote, or production validation are the same state.

## Environment Impact Report

For production-related, release, deployment, migration, notification, SMS, email, or external-provider work, final reports must include an Environment Impact Report:

```text
Environment Impact Report
- GitHub branch / PR:
- Vercel Preview:
- Vercel Production:
- Supabase Local:
- Supabase Remote:
- Migrations changed:
- Remote migrations applied:
- Real SMS/email/provider traffic:
- Production smoke:
```

If a field was not touched or not verified, say so explicitly. Do not infer Supabase Remote state from local migration files. Do not infer production deployment from a GitHub commit or merged PR.

## Deployment Rules

Never deploy production from a dirty worktree.

Preview deploy only from a clean branch unless explicitly doing a throwaway diagnostic preview.

Production deploy requires:

1. Clean working tree.
2. Build passed.
3. Preview deployment passed.
4. Smoke test passed.
5. Explicit user approval.

Always report:

- Deployment URL.
- Deployment id.
- Commit hash.
- Clean/dirty state.
- Build result.
- Warnings/errors.

Do not deploy unless the user explicitly requests deployment.

Do not push `main`.

## Supabase Rules

Never apply remote Supabase migrations without explicit approval.

Before applying migrations, report:

- Local migration list.
- Remote migration list.
- Pending migrations.
- Whether migrations are index-only, schema-changing, function-changing, or behavior-changing.
- Whether code depends on them.
- Safe apply order.
- Rollback or forward-fix plan.

Separate index-only migrations from schema/function/behavior migrations.

If migration order matters, stop and report before applying.

Never rely on dirty production state as source of truth.
