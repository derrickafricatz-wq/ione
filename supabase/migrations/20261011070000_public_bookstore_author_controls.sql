alter table public.heavens_books
  add column if not exists payment_required boolean not null default true;

create index if not exists heavens_books_author_created_idx
  on public.heavens_books (author_id, created_at desc);

drop policy if exists "Heavens Books - authors can delete their books" on public.heavens_books;
create policy "Heavens Books - authors can delete their books"
on public.heavens_books for delete to authenticated
using (author_id = auth.uid());
