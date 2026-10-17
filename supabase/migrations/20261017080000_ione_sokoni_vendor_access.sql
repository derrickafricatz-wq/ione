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
