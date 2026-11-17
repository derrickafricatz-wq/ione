-- I|ONE Hospitality Spotlight: Authority-managed homepage slides and public image delivery.
alter table public.ione_app_banners
  add column if not exists hospitality_slides jsonb not null default '[]'::jsonb;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('ione-hospitality-showcase','ione-hospitality-showcase',true,2097152,array['image/jpeg'])
on conflict (id) do update set public=true,file_size_limit=2097152,allowed_mime_types=array['image/jpeg'];

drop policy if exists "Public can view IONE hospitality showcase images" on storage.objects;
create policy "Public can view IONE hospitality showcase images"
on storage.objects for select
to anon, authenticated
using (bucket_id='ione-hospitality-showcase');

-- No client insert, update or delete policy is created. All writes go through
-- ione-app-banners after validation of an active Authority Press session.
