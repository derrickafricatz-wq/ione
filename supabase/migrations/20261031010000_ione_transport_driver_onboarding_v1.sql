create table if not exists public.ione_transport_driver_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  driver_name text not null check (char_length(btrim(driver_name)) between 2 and 120),
  phone_number text not null check (phone_number ~ '^255[67][0-9]{8}$'),
  email text not null default '' check (char_length(email) <= 254),
  service_types text[] not null check (
    cardinality(service_types) between 1 and 4
    and service_types <@ array['taxi','special_hire','shuttle','bus']::text[]
  ),
  operating_area text not null default 'Arusha Region' check (char_length(operating_area) between 2 and 120),
  vehicle_make_model text not null check (char_length(btrim(vehicle_make_model)) between 2 and 120),
  vehicle_registration text not null check (char_length(btrim(vehicle_registration)) between 2 and 30),
  vehicle_color text not null default '' check (char_length(vehicle_color) <= 40),
  passenger_capacity smallint not null check (passenger_capacity between 1 and 60),
  licence_number text not null check (char_length(btrim(licence_number)) between 2 and 80),
  profile_photo_path text,
  licence_document_path text not null,
  vehicle_photo_path text,
  status text not null default 'pending' check (status in ('pending','processing','approved','rejected')),
  admin_note text not null default '' check (char_length(admin_note) <= 600),
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ione_transport_one_pending_application_per_user
  on public.ione_transport_driver_applications(user_id) where status in ('pending','processing');
create index if not exists ione_transport_applications_status_created_idx
  on public.ione_transport_driver_applications(status, created_at desc);

create table if not exists public.ione_transport_drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  application_id uuid not null unique references public.ione_transport_driver_applications(id) on delete restrict,
  driver_name text not null,
  phone_number text not null,
  service_types text[] not null,
  operating_area text not null default 'Arusha Region',
  vehicle_make_model text not null,
  vehicle_registration text not null,
  vehicle_color text not null default '',
  passenger_capacity smallint not null,
  profile_photo_path text,
  verification_status text not null default 'approved' check (verification_status in ('approved','suspended')),
  availability text not null default 'offline' check (availability in ('offline','active','busy')),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ione_transport_drivers_area_availability_idx
  on public.ione_transport_drivers(operating_area, availability, verification_status);

alter table public.ione_transport_driver_applications enable row level security;
alter table public.ione_transport_drivers enable row level security;
revoke all on table public.ione_transport_driver_applications from anon, authenticated;
revoke all on table public.ione_transport_drivers from anon, authenticated;
grant all on table public.ione_transport_driver_applications to service_role;
grant all on table public.ione_transport_drivers to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ione-transport-documents',
  'ione-transport-documents',
  false,
  1048576,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 1048576,
    allowed_mime_types = excluded.allowed_mime_types;
