-- I|ONE SMART ADS paid campaigns, uploads, and Authority-controlled activation.
alter table public.ione_smart_ads_campaigns
  add column if not exists plan_code text not null default 'weekly',
  add column if not exists price_tzs integer not null default 2000,
  add column if not exists duration_days integer not null default 7,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_reference text not null default '',
  add column if not exists media_type text not null default 'image';

alter table public.ione_smart_ads_campaigns
  drop constraint if exists ione_smart_ads_plan_code_check,
  add constraint ione_smart_ads_plan_code_check check (plan_code in ('weekly','monthly','quarterly')),
  drop constraint if exists ione_smart_ads_price_check,
  add constraint ione_smart_ads_price_check check (
    (plan_code = 'weekly' and price_tzs = 2000 and duration_days = 7) or
    (plan_code = 'monthly' and price_tzs = 5000 and duration_days = 30) or
    (plan_code = 'quarterly' and price_tzs = 10000 and duration_days = 90)
  ),
  drop constraint if exists ione_smart_ads_payment_status_check,
  add constraint ione_smart_ads_payment_status_check check (payment_status in ('pending','verified','rejected')),
  drop constraint if exists ione_smart_ads_media_type_check,
  add constraint ione_smart_ads_media_type_check check (media_type in ('image','video'));

update public.ione_smart_ads_campaigns
set payment_status = 'verified'
where status = 'approved' and payment_status = 'pending';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ione-smart-ads', 'ione-smart-ads', true, 52428800,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "I1 Smart Ads owner upload" on storage.objects;
create policy "I1 Smart Ads owner upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'ione-smart-ads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "I1 Smart Ads owner update" on storage.objects;
create policy "I1 Smart Ads owner update"
on storage.objects for update to authenticated
using (bucket_id = 'ione-smart-ads' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'ione-smart-ads' and (storage.foldername(name))[1] = auth.uid()::text);

create index if not exists ione_smart_ads_owner_recent_idx
on public.ione_smart_ads_campaigns(owner_id, created_at desc);