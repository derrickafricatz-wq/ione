-- Atomically limit initial Sokoni integration to five one-segment trial SMS attempts.
-- Increase this quota only after Derrick explicitly approves paid SMS.
create table if not exists public.ione_sokoni_sms_quota (
  id boolean primary key default true check (id = true),
  remaining_credits integer not null default 5 check (remaining_credits >= 0),
  updated_at timestamptz not null default now()
);

insert into public.ione_sokoni_sms_quota (id, remaining_credits)
values (true, 5)
on conflict (id) do nothing;

alter table public.ione_sokoni_sms_quota enable row level security;
revoke all on table public.ione_sokoni_sms_quota from public, anon, authenticated;
grant all on table public.ione_sokoni_sms_quota to service_role;

create or replace function public.reserve_ione_sokoni_sms_credit()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved boolean := false;
begin
  update public.ione_sokoni_sms_quota
     set remaining_credits = remaining_credits - 1,
         updated_at = now()
   where id = true and remaining_credits > 0;
  reserved := found;
  return reserved;
end;
$$;

revoke all on function public.reserve_ione_sokoni_sms_credit() from public, anon, authenticated;
grant execute on function public.reserve_ione_sokoni_sms_credit() to service_role;
