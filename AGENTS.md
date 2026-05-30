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
