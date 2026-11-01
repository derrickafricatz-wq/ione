alter table public.ione_transport_drivers
  add column if not exists current_lat double precision,
  add column if not exists current_lng double precision,
  add column if not exists location_updated_at timestamptz;
alter table public.ione_transport_jobs
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision;
create table if not exists public.ione_transport_sms_log (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  job_id uuid references public.ione_transport_jobs(id) on delete set null,
  event_type text not null check (char_length(event_type) between 2 and 60),
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_phone text not null check (recipient_phone ~ '^255[67][0-9]{8}$'),
  status text not null default 'pending' check (status in ('pending','queued','failed','skipped')),
  provider_message_id text, error_message text, provider_response jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists ione_transport_sms_job_created_idx on public.ione_transport_sms_log(job_id,created_at desc);
alter table public.ione_transport_sms_log enable row level security;
revoke all on table public.ione_transport_sms_log from anon, authenticated;
grant all on table public.ione_transport_sms_log to service_role;
create index if not exists ione_transport_driver_location_idx on public.ione_transport_drivers(location_updated_at desc) where current_lat is not null and current_lng is not null;