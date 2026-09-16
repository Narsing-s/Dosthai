-- Dosthai cloud persistence blueprint.
-- Provider-neutral PostgreSQL schema; apply through your chosen migration system.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null default 'New conversation',
  model text,
  pinned boolean not null default false,
  archived boolean not null default false,
  folder text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_updated_idx on conversations(user_id, updated_at desc);
create index if not exists conversations_user_folder_idx on conversations(user_id, folder);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('system','user','assistant','tool')),
  content text not null,
  model text,
  parent_message_id uuid references messages(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx on messages(conversation_id, created_at);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  name text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  storage_key text not null,
  extracted_text text,
  created_at timestamptz not null default now()
);
create index if not exists files_user_created_idx on files(user_id, created_at desc);

create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  content text not null,
  source_message_id uuid references messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists memories_user_kind_idx on memories(user_id, kind);

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  model text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  tool_name text,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_user_created_idx on usage_events(user_id, created_at desc);

create table if not exists share_links (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  token text unique not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists share_links_token_idx on share_links(token);
