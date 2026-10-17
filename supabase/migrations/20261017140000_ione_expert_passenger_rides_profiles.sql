-- I|ONE Sokoni passenger rides, public rider profiles, and I|ONE Expert moderation.
alter table public.ione_sokoni_rider_applications add column if not exists profile_path text;
alter table public.ione_sokoni_riders add column if not exists profile_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ione-sokoni-rider-profiles', 'ione-sokoni-rider-profiles', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.ione_sokoni_passenger_trips (
  id uuid primary key default gen_random_uuid(),
  passenger_user_id uuid not null references auth.users(id) on delete cascade,
  passenger_name text not null,
  passenger_phone text not null,
  pickup_area text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  destination_area text not null,
  destination_lat double precision,
  destination_lng double precision,
  passenger_note text not null default '',
  rider_id uuid references public.ione_sokoni_riders(id) on delete set null,
  status text not null default 'requested' check (status in ('requested','accepted','fare_proposed','fare_countered','fare_agreed','picked_up','completed','cancelled')),
  proposed_fare_tzs integer,
  fare_proposed_by text check (fare_proposed_by in ('rider','passenger')),
  fare_agreed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists ione_sokoni_passenger_trips_open_idx on public.ione_sokoni_passenger_trips(status, created_at desc);
create index if not exists ione_sokoni_passenger_trips_passenger_idx on public.ione_sokoni_passenger_trips(passenger_user_id, created_at desc);
create index if not exists ione_sokoni_passenger_trips_rider_idx on public.ione_sokoni_passenger_trips(rider_id, created_at desc);
alter table public.ione_sokoni_passenger_trips enable row level security;

create table if not exists public.ione_expert_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  phone_number text not null,
  specialty text not null,
  experience text not null default '',
  credential_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  admin_note text not null default '',
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ione_expert_one_pending_application on public.ione_expert_applications(user_id) where status = 'pending';
create table if not exists public.ione_experts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  phone_number text not null,
  specialty text not null,
  experience text not null default '',
  status text not null default 'approved' check (status in ('approved','suspended')),
  approved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ione_expert_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  title text not null,
  details text not null,
  category text not null default 'General',
  area_name text not null default '',
  status text not null default 'open' check (status in ('open','answered','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ione_expert_questions_feed_idx on public.ione_expert_questions(status, created_at desc);
create table if not exists public.ione_expert_replies (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.ione_expert_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('expert','authority','community')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists ione_expert_replies_question_idx on public.ione_expert_replies(question_id, created_at asc);
create table if not exists public.ione_expert_advice (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Official advice',
  body text not null,
  published boolean not null default true,
  created_by text not null default 'Authority Press',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ione_expert_applications enable row level security;
alter table public.ione_experts enable row level security;
alter table public.ione_expert_questions enable row level security;
alter table public.ione_expert_replies enable row level security;
alter table public.ione_expert_advice enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ione-expert-credentials', 'ione-expert-credentials', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "I1 experts upload own credential" on storage.objects;
create policy "I1 experts upload own credential" on storage.objects for insert to authenticated
with check (bucket_id = 'ione-expert-credentials' and (storage.foldername(name))[1] = auth.uid()::text);
