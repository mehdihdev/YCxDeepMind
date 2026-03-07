-- Forge RDE team workspace schema
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.team_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.team_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_workspaces(id) on delete cascade,
  title text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  assignee_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.team_artifacts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_workspaces(id) on delete cascade,
  type text not null check (type in ('plan', 'run', 'fix')),
  title text not null,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_team_members_user_id on public.team_members(user_id);
create index if not exists idx_team_tasks_team_id on public.team_tasks(team_id, created_at desc);
create index if not exists idx_team_artifacts_team_id on public.team_artifacts(team_id, created_at desc);
