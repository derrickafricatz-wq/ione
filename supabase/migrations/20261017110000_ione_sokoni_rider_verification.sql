-- Private Boda Yangu identity checks. Existing reviewed applications are preserved;
-- the new fields remain nullable only so older records do not need to be fabricated.
alter table public.ione_sokoni_rider_applications
  add column if not exists identity_document_type text null
    check (identity_document_type is null or identity_document_type in ('driving_license','national_id','rider_group_id')),
  add column if not exists identity_document_path text null,
  add column if not exists motorcycle_plate text null,
  add column if not exists rider_group_name text null,
  add column if not exists chairman_phone text null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ione-sokoni-rider-documents',
  'ione-sokoni-rider-documents',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

-- Applicants can upload/delete only files under their own user-id folder.
-- There is intentionally no client SELECT policy; Authority reads documents using short-lived signed URLs.
create policy "Sokoni riders upload own verification documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ione-sokoni-rider-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Sokoni riders remove own failed verification uploads"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ione-sokoni-rider-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
