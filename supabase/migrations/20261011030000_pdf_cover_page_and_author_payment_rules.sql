alter table public.heavens_books
  add column if not exists pdf_cover_page boolean not null default false;
