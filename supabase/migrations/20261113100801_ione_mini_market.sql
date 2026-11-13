-- Mini Market: isolated shop registration, product catalogue and customer-order workflow.
-- Existing Mama Sokoni vendors, payments, products and orders remain unchanged.
create table if not exists public.ione_mini_market_vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  business_name text not null check (char_length(trim(business_name)) between 2 and 120),
  phone_number text not null,
  location_text text not null default '',
  profile_photo_path text,
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  paid_until timestamptz,
  is_open boolean not null default true,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ione_mini_market_payment_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.ione_mini_market_vendors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  phone_number text not null,
  amount_tzs integer not null default 1000 check (amount_tzs = 1000),
  period_days integer not null default 30 check (period_days = 30),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ione_mini_market_one_pending_payment_per_user
  on public.ione_mini_market_payment_requests(user_id) where status = 'pending';
create index if not exists ione_mini_market_payment_requests_pending_idx
  on public.ione_mini_market_payment_requests(status, created_at);
create table if not exists public.ione_mini_market_products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.ione_mini_market_vendors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_name text not null check (char_length(trim(item_name)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 600),
  category text not null default 'Mahitaji ya nyumbani' check (char_length(category) between 2 and 60),
  price_tzs integer not null check (price_tzs > 0),
  unit_name text not null default 'kipande' check (char_length(unit_name) between 2 and 30),
  photo_path text,
  available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ione_mini_market_menu_vendor_idx
  on public.ione_mini_market_products(vendor_id, available, sort_order, created_at desc);
create table if not exists public.ione_mini_market_orders (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.ione_mini_market_vendors(id) on delete restrict,
  seller_user_id uuid not null references auth.users(id) on delete restrict,
  buyer_user_id uuid not null references auth.users(id) on delete restrict,
  buyer_name text not null check (char_length(trim(buyer_name)) between 2 and 120),
  buyer_phone text not null,
  buyer_note text not null default '' check (char_length(buyer_note) <= 600),
  fulfillment_method text not null default 'pickup' check (fulfillment_method in ('pickup','delivery')),
  delivery_address text,
  status text not null default 'new' check (status in ('new','accepted','preparing','ready','completed','rejected')),
  total_tzs bigint not null check (total_tzs > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ione_mini_market_orders_seller_idx
  on public.ione_mini_market_orders(seller_user_id, created_at desc);
create index if not exists ione_mini_market_orders_buyer_idx
  on public.ione_mini_market_orders(buyer_user_id, created_at desc);
create table if not exists public.ione_mini_market_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ione_mini_market_orders(id) on delete cascade,
  product_id uuid references public.ione_mini_market_products(id) on delete set null,
  item_name text not null,
  unit_name text not null,
  quantity integer not null check (quantity between 1 and 1000),
  unit_price_tzs integer not null check (unit_price_tzs > 0),
  total_tzs bigint not null check (total_tzs > 0),
  created_at timestamptz not null default now()
);
create index if not exists ione_mini_market_order_items_order_idx
  on public.ione_mini_market_order_items(order_id, created_at);

alter table public.ione_mini_market_vendors enable row level security;
alter table public.ione_mini_market_payment_requests enable row level security;
alter table public.ione_mini_market_products enable row level security;
alter table public.ione_mini_market_orders enable row level security;
alter table public.ione_mini_market_order_items enable row level security;
revoke all on public.ione_mini_market_vendors, public.ione_mini_market_payment_requests,
  public.ione_mini_market_products, public.ione_mini_market_orders,
  public.ione_mini_market_order_items from anon, authenticated;
grant all on public.ione_mini_market_vendors, public.ione_mini_market_payment_requests,
  public.ione_mini_market_products, public.ione_mini_market_orders,
  public.ione_mini_market_order_items to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('ione-mini-market-products','ione-mini-market-products',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];
