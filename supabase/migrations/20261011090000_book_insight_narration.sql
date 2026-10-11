-- I|ONE Book Insight & Narration
-- Additive only: existing book/PDF/payment fields and policies remain unchanged.
alter table public.heavens_books
  add column if not exists author_name text,
  add column if not exists book_insight text,
  add column if not exists narration_path text,
  add column if not exists narration_published_at timestamptz;

create table if not exists public.book_narration_requests (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.heavens_books(id) on delete cascade,
  author_id uuid not null,
  author_name text not null default '',
  book_title text not null default '',
  book_insight text not null default '',
  status text not null default 'requested'
    check (status in ('requested','in_review','needs_author','recording','published','rejected')),
  authority_notes text,
  audio_path text,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint book_narration_requests_book_id_unique unique (book_id)
);

alter table public.book_narration_requests enable row level security;

-- Authors can see only their own request. All inserts/updates and audio publication
-- are mediated by the Edge Function; there is intentionally no client write policy.
create policy "Authors can read their own narration requests"
  on public.book_narration_requests
  for select
  to authenticated
  using ((select auth.uid()) = author_id);

grant select on public.book_narration_requests to authenticated;

create index if not exists book_narration_requests_status_requested_at_idx
  on public.book_narration_requests(status, requested_at desc);

comment on column public.heavens_books.author_name is 'Author credit displayed in Explore.';
comment on column public.heavens_books.book_insight is 'Short author-written preview shown in Explore.';
comment on column public.heavens_books.narration_path is 'Storage path for Authority Press-published narration audio.';
