alter table public.ione_opportunities
  add column if not exists logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ione-opportunity-logos',
  'ione-opportunity-logos',
  true,
  6291456,
  array['image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on column public.ione_opportunities.logo_url is
  'Public URL for the optional Authority Press-approved organization logo; stored in the ione-opportunity-logos bucket.';
