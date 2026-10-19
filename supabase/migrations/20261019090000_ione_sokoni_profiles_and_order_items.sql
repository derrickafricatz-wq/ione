-- Additive Sokoni seller profile/presence and multi-item orders.
-- Existing single-product orders remain valid; new grouped orders use order_items.
alter table public.ione_sokoni_vendors
  add column if not exists profile_photo_path text,
  add column if not exists is_at_market boolean not null default false,
  add column if not exists presence_updated_at timestamptz;

alter table public.ione_sokoni_orders
  add column if not exists order_group_id uuid;

create index if not exists ione_sokoni_orders_group_idx
  on public.ione_sokoni_orders (order_group_id)
  where order_group_id is not null;

create table if not exists public.ione_sokoni_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ione_sokoni_orders(id) on delete cascade,
  product_id uuid not null,
  product_name text not null,
  unit_name text not null,
  quantity numeric not null check (quantity > 0),
  unit_price_tzs integer not null check (unit_price_tzs >= 0),
  total_tzs numeric not null check (total_tzs >= 0),
  created_at timestamptz not null default now()
);

create index if not exists ione_sokoni_order_items_order_idx
  on public.ione_sokoni_order_items (order_id, created_at);

alter table public.ione_sokoni_order_items enable row level security;
revoke all on public.ione_sokoni_order_items from anon, authenticated;
grant all on public.ione_sokoni_order_items to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ione-sokoni-vendor-profiles', 'ione-sokoni-vendor-profiles', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

comment on column public.ione_sokoni_vendors.profile_photo_path is 'Private storage path for the seller profile photo.';
comment on column public.ione_sokoni_vendors.is_at_market is 'Seller presence toggle, independent of subscription status and product stock.';
comment on column public.ione_sokoni_orders.order_group_id is 'Groups order lines created from one buyer submission; legacy single-item orders may remain null.';
