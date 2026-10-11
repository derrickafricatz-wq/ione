create table if not exists public.ione_author_earnings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.book_orders(id) on delete restrict,
  book_id uuid not null references public.heavens_books(id) on delete restrict,
  author_id uuid not null,
  sale_amount_tzs bigint not null check (sale_amount_tzs > 0),
  author_share_tzs bigint not null check (author_share_tzs >= 0),
  provider_fee_share_tzs bigint not null check (provider_fee_share_tzs >= 0),
  platform_share_tzs bigint not null check (platform_share_tzs >= 0),
  status text not null default 'pending' check (status in ('pending','available','processing','paid','held')),
  payout_id uuid,
  earned_at timestamptz not null default now(),
  available_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (author_share_tzs + provider_fee_share_tzs + platform_share_tzs = sale_amount_tzs)
);
create index if not exists ione_author_earnings_author_status_idx on public.ione_author_earnings(author_id,status,available_at);
create table if not exists public.ione_author_payouts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  author_name text not null,
  recipient_phone text not null,
  recipient_network text not null,
  amount_tzs bigint not null check (amount_tzs > 0),
  provider_fee_tzs bigint not null default 0 check (provider_fee_tzs >= 0),
  total_debit_tzs bigint not null check (total_debit_tzs >= amount_tzs),
  payout_reference text unique,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','completed','failed','reversed')),
  payout_reason text not null default 'monthly',
  requested_by text not null,
  provider_response jsonb,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (payout_reason in ('monthly','urgent_exception'))
);
alter table public.ione_author_earnings add column if not exists payout_id uuid references public.ione_author_payouts(id);
alter table public.ione_author_earnings enable row level security;
alter table public.ione_author_payouts enable row level security;
revoke all on public.ione_author_earnings from anon, authenticated;
revoke all on public.ione_author_payouts from anon, authenticated;

create or replace function public.ione_record_author_earning()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_book public.heavens_books%rowtype;
  v_amount bigint;
  v_author bigint;
  v_provider bigint;
  v_platform bigint;
begin
  if lower(coalesce(new.status,'')) not in ('paid','completed') then return new; end if;
  if lower(coalesce(old.status,'')) in ('paid','completed') then return new; end if;
  select * into v_book from public.heavens_books where id = new.book_id;
  if not found or v_book.author_id is null then return new; end if;
  v_amount := round(new.amount)::bigint;
  if v_amount <= 0 then return new; end if;
  v_author := floor(v_amount * 0.95)::bigint;
  v_provider := floor(v_amount * 0.03)::bigint;
  v_platform := v_amount - v_author - v_provider;
  insert into public.ione_author_earnings
    (order_id,book_id,author_id,sale_amount_tzs,author_share_tzs,provider_fee_share_tzs,platform_share_tzs,status,earned_at,available_at)
  values
    (new.id,new.book_id,v_book.author_id,v_amount,v_author,v_provider,v_platform,'pending',coalesce(new.paid_at,now()),date_trunc('month',coalesce(new.paid_at,now())) + interval '1 month')
  on conflict (order_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_ione_record_author_earning on public.book_orders;
create trigger trg_ione_record_author_earning after update of status on public.book_orders for each row execute function public.ione_record_author_earning();

insert into public.ione_author_earnings
  (order_id,book_id,author_id,sale_amount_tzs,author_share_tzs,provider_fee_share_tzs,platform_share_tzs,status,earned_at,available_at)
select o.id,o.book_id,b.author_id,round(o.amount)::bigint,
       floor(round(o.amount)::numeric * 0.95)::bigint,
       floor(round(o.amount)::numeric * 0.03)::bigint,
       round(o.amount)::bigint - floor(round(o.amount)::numeric * 0.95)::bigint - floor(round(o.amount)::numeric * 0.03)::bigint,
       'pending',coalesce(o.paid_at,o.created_at),
       date_trunc('month',coalesce(o.paid_at,o.created_at)) + interval '1 month'
from public.book_orders o join public.heavens_books b on b.id=o.book_id
where lower(coalesce(o.status,'')) in ('paid','completed') and b.author_id is not null and o.amount > 0
on conflict (order_id) do nothing;
