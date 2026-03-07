# Forge RDE (Merged Baseline)

Electron desktop shell + local Forge API server.

This baseline merges core pieces from:
- `forge-server`: account auth + GitHub repo access flow
- `rde-env`: repository analysis style endpoint for project context

## Quick Start

```bash
npm install --cache .npm-cache
cp .env.example .env
npm run dev
```

## Run Against solusforge.com

```bash
npm run dev:remote
```

Or set `FORGE_REMOTE_URL=https://solusforge.com` in `.env` and run `npm run dev`.

## Required Env

Set these in `.env`:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SESSION_SECRET`
- `SESSION_TTL_DAYS` (default 30)
- `SUPABASE_SERVICE_ROLE_KEY` (needed to persist/hydrate GitHub provider tokens like `forge-server`)

For GitHub repos through Supabase OAuth, ensure your Supabase GitHub provider is configured and provider tokens are enabled.

Local login sessions are persisted on disk at:
- `~/.forge-rde/sessions`

## What Works Now

- Desktop app boots a local Express server and loads it in Electron.
- Optional remote mode: loads `FORGE_REMOTE_URL` directly (skips local server boot).
- Email/password login via Supabase (`/api/auth/login`).
- GitHub OAuth connect (`/api/auth/github/connect`) + callback handling.
- Pull authenticated GitHub repositories (`/api/github/repos`).
- RDE-style repository scan endpoint (`/api/rde/analyze`) for quick file/type stats.
- Team workspace endpoints/UI: create/join/switch team, members, tasks, runs, fixes.

## Team DB Setup

Run the SQL in:
- `supabase/team_workspace_schema.sql`

This creates:
- `team_workspaces`
- `team_members`
- `team_tasks`
- `team_artifacts`

Team workspace features are Supabase-only. If those tables are missing, team APIs will return a setup error until the schema is applied.
