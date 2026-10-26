-- I|ONE SMART ADS media duration enforcement.
alter table public.ione_smart_ads_campaigns
  add column if not exists media_duration_seconds integer not null default 0;
alter table public.ione_smart_ads_campaigns
  drop constraint if exists ione_smart_ads_media_duration_check,
  add constraint ione_smart_ads_media_duration_check check (
    (media_type = 'image' and media_duration_seconds = 0) or
    (media_type = 'video' and media_duration_seconds between 1 and 120)
  );