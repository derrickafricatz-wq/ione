-- Dedicated delivery records for Mama Chakula orders.
-- Keeps the product-order delivery table unchanged and shares only approved Sokoni riders.
create table if not exists public.ione_mama_chakula_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.ione_mama_chakula_orders(id) on delete restrict,
  buyer_user_id uuid not null references auth.users(id) on delete restrict,
  seller_user_id uuid not null references auth.users(id) on delete restrict,
  vendor_id uuid not null references public.ione_mama_chakula_vendors(id) on delete restrict,
  rider_user_id uuid references auth.users(id) on delete set null,
  pickup_location text not null,
  dropoff_location text not null,
  status text not null default 'requested'
    check (status in ('requested','accepted','picked_up','delivered','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ione_mama_chakula_deliveries_open_idx
  on public.ione_mama_chakula_deliveries(status, created_at) where rider_user_id is null;
create index if not exists ione_mama_chakula_deliveries_rider_idx
  on public.ione_mama_chakula_deliveries(rider_user_id, status, created_at desc);
create unique index if not exists ione_mama_chakula_one_active_delivery_per_rider
  on public.ione_mama_chakula_deliveries(rider_user_id)
  where rider_user_id is not null and status in ('accepted','picked_up','delivered');
alter table public.ione_mama_chakula_deliveries enable row level security;
revoke all on public.ione_mama_chakula_deliveries from anon, authenticated;
grant all on public.ione_mama_chakula_deliveries to service_role;
