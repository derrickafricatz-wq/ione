-- I|ONE Sokoni is isolated from billboard and Author Studio subscriptions.
create table if not exists public.ione_sokoni_vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  vendor_name text not null check (char_length(trim(vendor_name)) between 2 and 120),
  phone_number text not null,
  status text not null default 'active' check (status in ('active','suspended')),
  paid_until timestamptz not null,
  approved_at timestamptz not null default now(),
  approved_by text not null default 'Authority Press',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ione_sokoni_vendors_status_paid_idx
  on public.ione_sokoni_vendors(status, paid_until desc);

create table if not exists public.ione_sokoni_payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  vendor_id uuid null references public.ione_sokoni_vendors(id) on delete set null,
  vendor_name text not null check (char_length(trim(vendor_name)) between 2 and 120),
  phone_number text not null,
  amount_tzs integer not null default 1000 check (amount_tzs = 1000),
  period_days integer not null default 30 check (period_days = 30),
  status text not null default 'pending' check (status in ('pending','processing','approved','rejected')),
  payment_confirmed_at timestamptz null,
  approved_at timestamptz null,
  approved_by text null,
  admin_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ione_sokoni_payment_requests_status_created_idx
  on public.ione_sokoni_payment_requests(status, created_at desc);
create index if not exists ione_sokoni_payment_requests_paid_idx
  on public.ione_sokoni_payment_requests(payment_confirmed_at desc)
  where status = 'approved';
create unique index if not exists ione_sokoni_one_pending_request_per_user_idx
  on public.ione_sokoni_payment_requests(user_id)
  where status = 'pending';

-- All reads/writes go through the isolated ione-sokoni Edge Function using service role.
alter table public.ione_sokoni_vendors enable row level security;
alter table public.ione_sokoni_payment_requests enable row level security;
revoke all on public.ione_sokoni_vendors from anon, authenticated;
revoke all on public.ione_sokoni_payment_requests from anon, authenticated;
grant all on public.ione_sokoni_vendors to service_role;
grant all on public.ione_sokoni_payment_requests to service_role;

-- Product catalogue is Sokoni-only; product images stay in a private bucket and are served with short-lived signed URLs.
create table if not exists public.ione_sokoni_products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.ione_sokoni_vendors(id) on delete cascade,
  user_id uuid not null,
  product_name text not null check (char_length(trim(product_name)) between 2 and 140),
  description text not null default '' check (char_length(description) <= 1200),
  price_tzs integer not null check (price_tzs >= 0),
  unit_name text not null default 'kipimo' check (char_length(trim(unit_name)) between 1 and 40),
  stock_quantity numeric not null default 0 check (stock_quantity >= 0),
  photo_path text null,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ione_sokoni_products_vendor_idx
  on public.ione_sokoni_products(vendor_id, available, updated_at desc);
create index if not exists ione_sokoni_products_available_idx
  on public.ione_sokoni_products(available, created_at desc);
alter table public.ione_sokoni_products enable row level security;
revoke all on public.ione_sokoni_products from anon, authenticated;
grant all on public.ione_sokoni_products to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ione-sokoni-products', 'ione-sokoni-products', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];
