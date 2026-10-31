alter table public.ione_transport_drivers
  add column if not exists return_online_after_job boolean not null default true,
  add column if not exists last_seen_at timestamptz not null default now();

create table if not exists public.ione_transport_jobs (
  id uuid primary key default gen_random_uuid(),
  passenger_user_id uuid not null references auth.users(id) on delete cascade,
  driver_id uuid not null references public.ione_transport_drivers(id) on delete restrict,
  driver_user_id uuid not null references auth.users(id) on delete restrict,
  service_type text not null check (service_type in ('taxi','special_hire','shuttle','bus')),
  passenger_name text not null check (char_length(btrim(passenger_name)) between 2 and 120),
  passenger_phone text not null check (passenger_phone ~ '^255[67][0-9]{8}$'),
  pickup_location text not null check (char_length(btrim(pickup_location)) between 2 and 240),
  destination text not null check (char_length(btrim(destination)) between 2 and 240),
  passenger_count smallint not null check (passenger_count between 1 and 60),
  notes text not null default '' check (char_length(notes) <= 600),
  status text not null default 'requested' check (status in ('requested','accepted','in_progress','completed','cancelled','declined')),
  driver_note text not null default '' check (char_length(driver_note) <= 600),
  cancel_reason text not null default '' check (char_length(cancel_reason) <= 300),
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists ione_transport_jobs_driver_status_idx on public.ione_transport_jobs(driver_user_id,status,requested_at desc);
create index if not exists ione_transport_jobs_passenger_idx on public.ione_transport_jobs(passenger_user_id,requested_at desc);
create unique index if not exists ione_transport_one_open_job_per_passenger on public.ione_transport_jobs(passenger_user_id) where status in ('requested','accepted','in_progress');

create table if not exists public.ione_transport_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ione_transport_jobs(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists ione_transport_messages_job_created_idx on public.ione_transport_messages(job_id,created_at asc);

alter table public.ione_transport_jobs enable row level security;
alter table public.ione_transport_messages enable row level security;
revoke all on table public.ione_transport_jobs from anon,authenticated;
revoke all on table public.ione_transport_messages from anon,authenticated;
grant all on table public.ione_transport_jobs to service_role;
grant all on table public.ione_transport_messages to service_role;

create or replace function public.ione_transport_claim_job(p_job_id uuid,p_driver_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_driver public.ione_transport_drivers%rowtype; v_job public.ione_transport_jobs%rowtype;
begin
 select * into v_driver from public.ione_transport_drivers where user_id=p_driver_user_id and verification_status='approved' for update;
 if not found then return jsonb_build_object('success',false,'error','Verified driver profile not found.'); end if;
 if v_driver.availability<>'active' then return jsonb_build_object('success',false,'error','You must be ACTIVE and not already carrying a passenger to accept a job.'); end if;
 select * into v_job from public.ione_transport_jobs where id=p_job_id and driver_user_id=p_driver_user_id for update;
 if not found or v_job.status<>'requested' then return jsonb_build_object('success',false,'error','This request is no longer available.'); end if;
 update public.ione_transport_jobs set status='accepted',accepted_at=now(),updated_at=now() where id=p_job_id and status='requested';
 if not found then return jsonb_build_object('success',false,'error','Another request was accepted first.'); end if;
 update public.ione_transport_drivers set availability='busy',return_online_after_job=true,last_seen_at=now(),updated_at=now() where id=v_driver.id and availability='active';
 if not found then
   update public.ione_transport_jobs set status='requested',accepted_at=null,updated_at=now() where id=p_job_id and status='accepted';
   return jsonb_build_object('success',false,'error','Your availability changed. Refresh and try again.');
 end if;
 update public.ione_transport_jobs set status='declined',driver_note='Driver accepted another trip.',updated_at=now() where driver_user_id=p_driver_user_id and id<>p_job_id and status='requested';
 return jsonb_build_object('success',true,'job_id',p_job_id,'availability','busy');
end; $$;

create or replace function public.ione_transport_set_availability(p_driver_user_id uuid,p_availability text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_driver public.ione_transport_drivers%rowtype;
begin
 if p_availability not in ('active','offline') then return jsonb_build_object('success',false,'error','Choose ACTIVE or OFFLINE.'); end if;
 select * into v_driver from public.ione_transport_drivers where user_id=p_driver_user_id and verification_status='approved' for update;
 if not found then return jsonb_build_object('success',false,'error','Verified driver profile not found.'); end if;
 if v_driver.availability='busy' then
   update public.ione_transport_drivers set return_online_after_job=(p_availability='active'),last_seen_at=now(),updated_at=now() where id=v_driver.id;
   return jsonb_build_object('success',true,'availability','busy','return_online_after_job',p_availability='active');
 end if;
 update public.ione_transport_drivers set availability=p_availability,return_online_after_job=true,last_seen_at=now(),updated_at=now() where id=v_driver.id;
 if p_availability='offline' then
   update public.ione_transport_jobs set status='declined',driver_note='Driver is now offline.',updated_at=now() where driver_user_id=p_driver_user_id and status='requested';
 end if;
 return jsonb_build_object('success',true,'availability',p_availability);
end; $$;

create or replace function public.ione_transport_transition_job(p_job_id uuid,p_actor_user_id uuid,p_action text,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_job public.ione_transport_jobs%rowtype;
begin
 select * into v_job from public.ione_transport_jobs where id=p_job_id for update;
 if not found then return jsonb_build_object('success',false,'error','Trip not found.'); end if;
 if p_action='start' then
   if p_actor_user_id<>v_job.driver_user_id or v_job.status<>'accepted' then return jsonb_build_object('success',false,'error','Only the assigned driver can start an accepted trip.'); end if;
   update public.ione_transport_jobs set status='in_progress',started_at=now(),updated_at=now() where id=p_job_id and status='accepted';
   return jsonb_build_object('success',true,'status','in_progress');
 elsif p_action='complete' then
   if p_actor_user_id<>v_job.driver_user_id or v_job.status<>'in_progress' then return jsonb_build_object('success',false,'error','Only the assigned driver can complete a trip that has started.'); end if;
   update public.ione_transport_jobs set status='completed',completed_at=now(),updated_at=now() where id=p_job_id and status='in_progress';
   update public.ione_transport_drivers set availability=case when return_online_after_job then 'active' else 'offline' end,return_online_after_job=true,last_seen_at=now(),updated_at=now() where user_id=v_job.driver_user_id and availability='busy';
   return jsonb_build_object('success',true,'status','completed');
 elsif p_action='cancel' then
   if p_actor_user_id not in (v_job.passenger_user_id,v_job.driver_user_id) or v_job.status not in ('requested','accepted','in_progress') then return jsonb_build_object('success',false,'error','This trip cannot be cancelled by this account.'); end if;
   update public.ione_transport_jobs set status='cancelled',cancel_reason=left(coalesce(p_reason,''),300),updated_at=now() where id=p_job_id and status in ('requested','accepted','in_progress');
   update public.ione_transport_drivers set availability=case when return_online_after_job then 'active' else 'offline' end,return_online_after_job=true,last_seen_at=now(),updated_at=now() where user_id=v_job.driver_user_id and availability='busy';
   return jsonb_build_object('success',true,'status','cancelled');
 end if;
 return jsonb_build_object('success',false,'error','Unknown trip action.');
end; $$;
revoke all on function public.ione_transport_claim_job(uuid,uuid) from public,anon,authenticated;
revoke all on function public.ione_transport_set_availability(uuid,text) from public,anon,authenticated;
revoke all on function public.ione_transport_transition_job(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ione_transport_claim_job(uuid,uuid) to service_role;
grant execute on function public.ione_transport_set_availability(uuid,text) to service_role;
grant execute on function public.ione_transport_transition_job(uuid,uuid,text,text) to service_role;
