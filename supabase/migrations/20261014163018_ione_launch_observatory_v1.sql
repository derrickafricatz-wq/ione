-- I|ONE Launch Observatory: isolated, anonymous analytics storage.
-- Direct client access is intentionally denied; the Edge Function uses service-role access.
create table if not exists public.ione_launch_visitors (
  visitor_hash text primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  first_country_code text,
  first_country_name text,
  last_country_code text,
  last_country_name text
);
create table if not exists public.ione_launch_daily_visitors (
  visitor_hash text not null references public.ione_launch_visitors(visitor_hash) on delete cascade,
  visit_date date not null,
  country_code text,
  country_name text,
  created_at timestamptz not null default now(),
  primary key (visitor_hash, visit_date)
);
create table if not exists public.ione_launch_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event_type text not null check (event_type in ('page_view','install_click','install_prompt','install_confirmed','installed_app_launch')),
  visitor_hash text not null,
  country_code text,
  country_name text,
  source text
);
create index if not exists ione_launch_events_created_at_idx on public.ione_launch_events(created_at desc);
create index if not exists ione_launch_events_type_created_idx on public.ione_launch_events(event_type, created_at desc);
create index if not exists ione_launch_events_country_type_idx on public.ione_launch_events(country_code, event_type);
create index if not exists ione_launch_daily_visitors_date_idx on public.ione_launch_daily_visitors(visit_date desc);
alter table public.ione_launch_visitors enable row level security;
alter table public.ione_launch_daily_visitors enable row level security;
alter table public.ione_launch_events enable row level security;
revoke all on public.ione_launch_visitors from public, anon, authenticated;
revoke all on public.ione_launch_daily_visitors from public, anon, authenticated;
revoke all on public.ione_launch_events from public, anon, authenticated;
grant all on public.ione_launch_visitors to service_role;
grant all on public.ione_launch_daily_visitors to service_role;
grant all on public.ione_launch_events to service_role;
grant usage, select on sequence public.ione_launch_events_id_seq to service_role;
