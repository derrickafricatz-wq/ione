create table if not exists public.ione_manual_subscription_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.ione_upload_customers(id) on delete restrict,
  user_id uuid not null,
  plan_id text not null references public.ione_subscription_plans(id) on update cascade on delete restrict,
  plan_name text not null,
  plan_days integer not null check (plan_days > 0),
  amount numeric not null check (amount >= 0),
  currency text not null default 'TZS',
  request_mode text not null default 'publish' check (request_mode in ('publish','renew')),
  billboard_id uuid null references public.afrilink_billboards(id) on delete set null,
  brand_name text null,
  terms_accepted boolean not null default false check (terms_accepted = true),
  terms_version text not null default 'ione-manual-subscription-v1',
  status text not null default 'pending' check (status in ('pending','processing','approved','rejected')),
  subscription_id uuid null references public.ione_upload_subscriptions(id) on delete set null,
  approved_at timestamptz null,
  approved_by text null,
  admin_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ione_manual_subscription_requests_status_created_idx
  on public.ione_manual_subscription_requests(status, created_at desc);
create unique index if not exists ione_manual_subscription_requests_one_open_per_customer_idx
  on public.ione_manual_subscription_requests(customer_id)
  where status in ('pending','processing');
create index if not exists ione_manual_subscription_requests_customer_idx
  on public.ione_manual_subscription_requests(customer_id, created_at desc);

alter table public.ione_manual_subscription_requests enable row level security;
revoke all on public.ione_manual_subscription_requests from anon, authenticated;
grant all on public.ione_manual_subscription_requests to service_role;
