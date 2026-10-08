-- BuildABot MVP schema (Supabase / Postgres)

create table if not exists parts (
  id               text primary key,
  name             text not null,
  slot             text not null,
  brand            text not null,
  description      text not null,
  price_usd_approx numeric(10,2) not null,
  pack_size        int  not null default 1,
  mass_g           int  not null,
  buy_url          text not null,
  tags             text[] not null default '{}',
  compat           jsonb not null default '{}'::jsonb,
  active           boolean not null default true,
  updated_at       timestamptz not null default now()
);
create index if not exists parts_slot_idx on parts (slot) where active;
create index if not exists parts_tags_idx on parts using gin (tags);

create table if not exists reference_designs (
  id               text primary key,
  name             text not null,
  url              text not null,
  license          text,
  summary          text not null,
  robot_type       text not null,
  drive            text,
  autonomy         text not null,
  difficulty       text not null,
  approx_cost_usd  int[] not null,
  best_for         text[] not null default '{}',
  similar_part_ids text[] not null default '{}'
);

create table if not exists projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete cascade,
  title         text not null default 'My robot',
  robot_type    text not null default 'rover',
  requirements  jsonb not null default '{}'::jsonb,  -- see Requirements in lib/compat/types.ts
  build         jsonb not null default '[]'::jsonb,  -- BuildItem[]
  last_report   jsonb,                               -- BuildReport
  guide_md      text,
  share_slug    text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists messages (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references projects (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     jsonb not null,   -- Anthropic message content blocks
  created_at  timestamptz not null default now()
);
create index if not exists messages_project_idx on messages (project_id, id);

-- Row level security: parts & designs are public read; projects/messages are per-user.
alter table parts enable row level security;
alter table reference_designs enable row level security;
alter table projects enable row level security;
alter table messages enable row level security;

create policy "parts readable" on parts for select using (true);
create policy "designs readable" on reference_designs for select using (true);

create policy "own projects" on projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Shared builds are read server-side with the service-role key (app/b/[slug]), not through a
-- public policy: a policy would expose the project id, and without login the id grants edit access.
drop policy if exists "shared projects readable" on projects;

create policy "own messages" on messages
  for all using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));
