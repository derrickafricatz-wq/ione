alter table public.heavens_books
  add column if not exists book_insight_2 text not null default '',
  add column if not exists book_insight_3 text not null default '';

comment on column public.heavens_books.book_insight_2 is 'Optional second rotating Explore book insight.';
comment on column public.heavens_books.book_insight_3 is 'Optional third rotating Explore book insight.';
