alter table public.ione_smart_ads_campaigns
  add column if not exists placement text not null default 'all',
  add column if not exists daily_start_time time,
  add column if not exists daily_end_time time;

alter table public.ione_smart_ads_campaigns
  drop constraint if exists ione_smart_ads_placement_check;
alter table public.ione_smart_ads_campaigns
  add constraint ione_smart_ads_placement_check
  check (placement in ('all','smart_ads','explore','book_reader','documentary','expert'));

alter table public.ione_smart_ads_campaigns
  drop constraint if exists ione_smart_ads_daily_time_pair_check;
alter table public.ione_smart_ads_campaigns
  add constraint ione_smart_ads_daily_time_pair_check
  check ((daily_start_time is null and daily_end_time is null) or
         (daily_start_time is not null and daily_end_time is not null and daily_start_time <> daily_end_time));

create index if not exists ione_smart_ads_campaigns_placement_dates_idx
  on public.ione_smart_ads_campaigns(placement, status, starts_at, ends_at);
