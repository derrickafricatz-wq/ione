create table if not exists public.ione_opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  organization text not null default '' check (char_length(organization) <= 140),
  category text not null check (category in ('Jobs','Scholarships','Training','Tenders','Business')),
  location text not null default 'Tanzania' check (char_length(location) <= 120),
  summary text not null check (char_length(btrim(summary)) between 10 and 260),
  description text not null check (char_length(btrim(description)) between 10 and 6000),
  deadline date,
  official_url text not null check (char_length(official_url) <= 1000),
  contact_text text not null default '' check (char_length(contact_text) <= 500),
  status text not null default 'draft' check (status in ('draft','published','closed')),
  featured boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ione_opportunities_public_idx on public.ione_opportunities (status, featured desc, published_at desc, created_at desc);
create index if not exists ione_opportunities_deadline_idx on public.ione_opportunities (deadline);
alter table public.ione_opportunities enable row level security;
revoke all on table public.ione_opportunities from anon, authenticated;
grant all on table public.ione_opportunities to service_role;
