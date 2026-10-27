alter table public.ione_smart_ads_campaigns
  drop constraint if exists ione_smart_ads_placement_check;
alter table public.ione_smart_ads_campaigns
  add constraint ione_smart_ads_placement_check
  check (placement in ('all','smart_ads','explore','book_reader','documentary','expert','sokoni'));
