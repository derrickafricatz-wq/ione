-- I|ONE SMART ADS v1: isolated campaign and measurement storage.
create table if not exists public.ione_smart_ads_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  advertiser_name text not null,
  contact_phone text not null,
  title text not null,
  description text not null default '',
  creative_url text not null,
  destination_url text not null,
  city text not null default 'Tanzania',
  objective text not null default 'website' check (objective in ('website','contact','awareness')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','paused','ended')),
  review_note text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ione_smart_ads_campaign_dates check (ends_at > starts_at),
  constraint ione_smart_ads_title_length check (char_length(title) between 3 and 100),
  constraint ione_smart_ads_description_length check (char_length(description) <= 800),
  constraint ione_smart_ads_advertiser_length check (char_length(advertiser_name) between 2 and 100),
  constraint ione_smart_ads_phone_length check (char_length(contact_phone) between 5 and 40),
  constraint ione_smart_ads_creative_url_length check (char_length(creative_url) <= 2048),
  constraint ione_smart_ads_destination_url_length check (char_length(destination_url) <= 2048)
);
create index if not exists ione_smart_ads_campaigns_status_dates_idx on public.ione_smart_ads_campaigns(status, starts_at, ends_at);
create index if not exists ione_smart_ads_campaigns_owner_created_idx on public.ione_smart_ads_campaigns(owner_id, created_at desc);
create table if not exists public.ione_smart_ads_events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.ione_smart_ads_campaigns(id) on delete cascade,
  event_type text not null check (event_type in ('impression','click','contact','conversion')),
  event_key text not null,
  created_at timestamptz not null default now(),
  constraint ione_smart_ads_event_key_length check (char_length(event_key) between 8 and 100),
  unique (campaign_id, event_type, event_key)
);
create index if not exists ione_smart_ads_events_campaign_created_idx on public.ione_smart_ads_events(campaign_id, created_at desc);
create index if not exists ione_smart_ads_events_type_created_idx on public.ione_smart_ads_events(event_type, created_at desc);
alter table public.ione_smart_ads_campaigns enable row level security;
alter table public.ione_smart_ads_events enable row level security;
revoke all on public.ione_smart_ads_campaigns from public, anon, authenticated;
revoke all on public.ione_smart_ads_events from public, anon, authenticated;
grant all on public.ione_smart_ads_campaigns to service_role;
grant all on public.ione_smart_ads_events to service_role;
grant usage, select on sequence public.ione_smart_ads_events_id_seq to service_role;
