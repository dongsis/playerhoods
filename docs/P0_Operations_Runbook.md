# P0 Operations Runbook

This project now follows a stricter P0 rule set for local development and production-like testing.

## Database rule

- Database changes are made **locally first**
- Remote/cloud migrations are pushed **only when explicitly requested**

## Local app runtime

Use the production build for shared browser testing:

- `npm run build:clean`
- `npm run start:prod`

For a full local reset and restart:

- `npm run restart:prod`

Avoid mixing `next dev` and `next start` during multi-user or multi-browser testing. It causes stale HTML/chunk mismatches.

Build directories:

- Production uses standard `.next`
- Development uses `.next-dev`

## If users see a white screen or giant logo

Symptoms usually mean the browser still has old HTML while the server now serves a newer build.

Recovery steps:

1. Close all PlayerHoods tabs
2. Reopen `http://localhost:3000/login`
3. If needed, hard refresh with `Ctrl+Shift+R`
4. If still broken, clear the `localhost:3000` site cache

## Google login rule

For local Google OAuth testing, use:

- `http://localhost:3000/login`

Do not mix:

- `127.0.0.1`
- `192.168.x.x`

## Auth / page caching

Protected pages and login pages now return `no-store` headers to reduce stale HTML reuse after rebuilds.
