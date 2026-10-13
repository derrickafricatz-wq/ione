create table if not exists public.ione_authority_auth_attempts (
  attempt_key text primary key,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.ione_authority_sessions (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

alter table public.ione_authority_auth_attempts enable row level security;
alter table public.ione_authority_sessions enable row level security;

revoke all on public.ione_authority_auth_attempts from anon, authenticated;
revoke all on public.ione_authority_sessions from anon, authenticated;

create index if not exists ione_authority_sessions_expires_at_idx
  on public.ione_authority_sessions (expires_at);
