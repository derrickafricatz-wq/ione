-- Book to PDF: private storage and metadata for uploaded bookstore PDFs.
-- Existing sermon-created books remain unchanged because pdf_path is nullable.
alter table public.heavens_books
  add column if not exists pdf_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('paid-book-pdfs', 'paid-book-pdfs', false, 52428800, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = array['application/pdf'];

drop policy if exists "Authors upload their own paid book PDFs" on storage.objects;
create policy "Authors upload their own paid book PDFs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'paid-book-pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Authors delete their own paid book PDFs" on storage.objects;
create policy "Authors delete their own paid book PDFs"
on storage.objects for delete to authenticated
using (
  bucket_id = 'paid-book-pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
