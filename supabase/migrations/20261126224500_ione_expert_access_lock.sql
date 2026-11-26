-- Authority-controlled temporary access lock for I|ONE Expert Services.
-- Existing expert applications, questions, replies, experts and advice are preserved.
create table if not exists public.ione_expert_access_control (
  singleton boolean primary key default true check (singleton = true),
  is_locked boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system'
);
alter table public.ione_expert_access_control enable row level security;
revoke all on public.ione_expert_access_control from anon, authenticated;
insert into public.ione_expert_access_control (singleton, is_locked, updated_by)
values (true, true, 'initial_books_focus')
on conflict (singleton) do nothing;
