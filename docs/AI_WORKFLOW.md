# PlayerHoods AI Workflow

This document defines the default AI-assisted development workflow for PlayerHoods. It is intended to keep product decisions, engineering execution, GitHub audit trails, and production gates clear.

## Role Model

- Owner/user: final approval authority for scope, merge, production, migrations, and provider traffic.
- ChatGPT: product, architecture, risk, and issue-scope reviewer.
- Codex: engineering executor operating inside approved scope.
- GitHub issue/PR: shared audit surface for decisions, diffs, validation, and release status.

## Authorization Levels

- L1: Advice, planning, issue drafting, and risk review only.
- L2: Codex may implement within approved scope, commit, push, and open a Draft PR from a clean isolated worktree.
- L3: Ready-for-review gate after required validations pass or blocked validations are explicitly accepted.
- L4: Merge gate requiring explicit owner approval.
- L5: Production gate requiring explicit owner approval for Supabase Remote, Vercel Production, production validation, and notification/email/SMS delivery.

## Default Codex Autonomy

After issue scope is approved, Codex may:

- create a clean worktree from latest `origin/main`;
- create a dedicated branch;
- implement within the approved issue scope;
- run local validation;
- commit scoped changes;
- push the working branch;
- open a Draft PR.

Codex must keep the PR diff limited to approved files and must not include unrelated dirty files.

## Mandatory Stop Points

Codex must stop and ask before:

- working directly on `main`;
- pulling, rebasing, or merging inside a dirty worktree;
- destructive cleanup, stash, reset, or force deletion;
- lifecycle enum or check-constraint changes;
- exposing PII or broadening access to PII;
- expanding product scope;
- applying Supabase Remote migrations;
- deploying to production;
- running production notification, email, or SMS delivery;
- merging a PR;
- marking a Draft PR ready while required validation is blocked.

## Required Start Report

At task start, Codex should report:

- issue number and title;
- worktree path;
- branch name;
- base commit;
- latest `origin/main` commit;
- `git status`;
- expected changed areas;
- conflict risk with open PRs;
- validation plan.

## Required Pre-Commit Report

Before commit, Codex should report:

- changed files;
- validation results;
- blocked validations;
- PII assessment;
- confirmation that no unrelated dirty files are included;
- confirmation that old dirty worktrees were not touched.

## Required PR Report

After opening a PR, Codex should report:

- issue link;
- branch;
- commit hash;
- changed files;
- validation results;
- blocked validation caveats;
- environment impact report.

## Production Gate

Codex must never merge, deploy, apply Supabase Remote migrations, run production validation, or run production notification/email/SMS delivery without explicit owner approval.

Production and release state must be reported separately:

- GitHub merge state;
- Vercel Preview state;
- Vercel Production state;
- Supabase Local state;
- Supabase Remote state;
- production verification state;
- notification/email/SMS provider traffic state.

Do not infer production status from a merged PR or a preview deployment.
