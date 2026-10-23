-- Private audit log for transactional SMS sent by the Sokoni Edge Function.
-- Only the service role can access this table; phone numbers and provider responses are private.
create table if not exists public.ione_sokoni_sms_log (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  event_type text not null,
  recipient_phone text not null,
  provider_message_id text,
  status text not null default 'pending'
    check (status in ('pending','queued','sent','delivered','failed','skipped')),
  error_message text,
  provider_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ione_sokoni_sms_log_created_at_idx
  on public.ione_sokoni_sms_log (created_at desc);

alter table public.ione_sokoni_sms_log enable row level security;
revoke all on table public.ione_sokoni_sms_log from public, anon, authenticated;
grant all on table public.ione_sokoni_sms_log to service_role;
