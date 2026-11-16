-- I|ONE homepage feature showcase: Authority-managed public image slides.
alter table public.ione_app_banners
  add column if not exists feature_slides jsonb not null default '[]'::jsonb;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('ione-feature-showcase','ione-feature-showcase',true,2097152,array['image/jpeg'])
on conflict (id) do update set public=true,file_size_limit=2097152,allowed_mime_types=array['image/jpeg'];

drop policy if exists "Public can view IONE feature showcase images" on storage.objects;
create policy "Public can view IONE feature showcase images"
on storage.objects for select
to anon, authenticated
using (bucket_id='ione-feature-showcase');

-- No client insert, update or delete policy is created. Writes are performed only
-- by the Edge Function after validating an active Authority Press session.
