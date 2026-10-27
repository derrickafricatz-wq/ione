alter table public.ione_smart_ads_campaigns
  add column if not exists marketing_billboard_id uuid null
  references public.afrilink_billboards(id) on delete set null;

create table if not exists public.ione_smart_ads_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ione_smart_ads_campaigns(id) on delete cascade,
  creative_url text not null,
  media_type text not null check (media_type in ('image','video')),
  media_duration_seconds integer not null default 0 check (media_duration_seconds >= 0 and (media_type <> 'video' or media_duration_seconds <= 120)),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint ione_smart_ads_creatives_media_duration_check
    check ((media_type = 'image' and media_duration_seconds = 0) or media_type = 'video')
);

create index if not exists ione_smart_ads_creatives_campaign_order_idx
  on public.ione_smart_ads_creatives(campaign_id, sort_order, created_at);

alter table public.ione_smart_ads_creatives enable row level security;
revoke all on public.ione_smart_ads_creatives from anon, authenticated;
grant all on public.ione_smart_ads_creatives to service_role;