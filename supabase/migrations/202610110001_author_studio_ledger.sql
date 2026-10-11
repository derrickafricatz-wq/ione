-- I|ONE Author Studio package, confirmed-sales ledger and payout audit.
-- Stage this migration for review; do not apply to production until the feature branch is tested.
create table if not exists public.author_studio_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  phone text not null check (length(regexp_replace(phone, '\\D', '', 'g')) between 9 and 15),
  payout_network text not null default 'AIRTEL_MONEY'
    check (payout_network in ('AIRTEL_MONEY','MPESA','TIGOPESA','HALOPESA','OTHER')),
  package_status text not null default 'pending_payment'
    check (package_status in ('pending_payment','active','locked','suspended')),
  package_price_tzs integer not null default 10000 check (package_price_tzs = 10000),
  package_book_limit integer not null default 3 check (package_book_limit = 3),
  published_books_used integer not null default 0 check (published_books_used between 0 and 3),
  package_paid_at timestamptz,
  package_unlocked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.author_studio_package_requests (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.author_studio_profiles(id) on delete restrict,
  user_id uuid not null,
  amount_tzs integer not null default 10000 check (amount_tzs = 10000),
  merchant_name text not null default 'DERRICK KIPAJI OF AFRIKA & CO',
  merchant_number text not null default '140001788',
  payment_network text not null default 'Airtel Money',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  terms_version text not null default '2026-10',
  terms_accepted_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists author_studio_package_requests_status_created_idx
  on public.author_studio_package_requests(status, created_at desc);
create table if not exists public.author_studio_sales (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.book_orders(id) on delete restrict,
  book_id uuid not null references public.heavens_books(id) on delete restrict,
  author_id uuid not null references public.author_studio_profiles(id) on delete restrict,
  gross_tzs numeric(14,2) not null check (gross_tzs >= 0),
  billonpay_fee_tzs numeric(14,2) not null check (billonpay_fee_tzs >= 0),
  platform_fee_tzs numeric(14,2) not null check (platform_fee_tzs >= 0),
  author_net_tzs numeric(14,2) not null check (author_net_tzs >= 0),
  payment_reference text,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists author_studio_sales_author_confirmed_idx
  on public.author_studio_sales(author_id, confirmed_at desc);
create table if not exists public.author_studio_payouts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.author_studio_profiles(id) on delete restrict,
  amount_tzs numeric(14,2) not null check (amount_tzs > 0),
  payout_phone text not null,
  payout_network text not null,
  recipient_name text,
  provider_reference text,
  idempotency_key text not null unique,
  provider_fee_tzs numeric(14,2) not null default 0 check (provider_fee_tzs >= 0),
  status text not null default 'initiated'
    check (status in ('initiated','pending','processing','completed','failed','reversed')),
  early_payout_reason text,
  initiated_by text not null,
  provider_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists author_studio_payouts_author_created_idx
  on public.author_studio_payouts(author_id, created_at desc);

alter table public.author_studio_profiles enable row level security;
alter table public.author_studio_package_requests enable row level security;
alter table public.author_studio_sales enable row level security;
alter table public.author_studio_payouts enable row level security;
-- No client-role policies are intentionally added. Read/write is through the
-- authenticated Edge Function using service-role access and explicit ownership checks.

create or replace function public.author_studio_record_confirmed_sale()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare
  v_book public.heavens_books%rowtype;
  v_author public.author_studio_profiles%rowtype;
  v_gross numeric(14,2);
begin
  if lower(coalesce(new.status,'')) not in ('paid','completed','received') then
    return new;
  end if;
  if tg_op = 'UPDATE' and lower(coalesce(old.status,'')) in ('paid','completed','received') then
    return new;
  end if;
  select * into v_book from public.heavens_books where id = new.book_id;
  if not found or v_book.author_id is null then return new; end if;
  select * into v_author from public.author_studio_profiles where user_id = v_book.author_id;
  if not found then return new; end if;
  v_gross := greatest(0, coalesce(new.amount,0));
  insert into public.author_studio_sales
    (order_id,book_id,author_id,gross_tzs,billonpay_fee_tzs,platform_fee_tzs,author_net_tzs,payment_reference,confirmed_at)
  values
    (new.id,v_book.id,v_author.id,v_gross,round(v_gross*0.03,2),round(v_gross*0.02,2),v_gross-round(v_gross*0.03,2)-round(v_gross*0.02,2),new.blmpay_reference,coalesce(new.paid_at,now()))
  on conflict (order_id) do nothing;
  return new;
end;
$$;
drop trigger if exists author_studio_confirmed_sale on public.book_orders;
create trigger author_studio_confirmed_sale
after insert or update of status on public.book_orders
for each row execute function public.author_studio_record_confirmed_sale();

create or replace function public.author_studio_sync_published_count()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare
  v_author_id uuid;
  v_count integer;
begin
  v_author_id := coalesce(new.author_id, old.author_id);
  if v_author_id is null then return coalesce(new,old); end if;
  select count(*) into v_count from public.heavens_books
    where author_id = v_author_id and active = true;
  update public.author_studio_profiles
    set published_books_used = least(v_count,3),
        package_status = case
          when package_status = 'active' and v_count >= 3 then 'locked'
          when package_status = 'locked' and v_count < 3 then 'active'
          else package_status end,
        updated_at = now()
    where user_id = v_author_id and package_status in ('active','locked');
  return coalesce(new,old);
end;
$$;
drop trigger if exists author_studio_published_count on public.heavens_books;
create trigger author_studio_published_count
after insert or update of active, author_id or delete on public.heavens_books
for each row execute function public.author_studio_sync_published_count();
