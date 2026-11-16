-- I|ONE Live Class foundation.
-- Isolated schema for recorded training, scheduled broadcasts, enrollment and attendance.
-- All writes are performed by the dedicated Edge Function using the service role.
create table if not exists public.ione_live_classes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  description text not null default '' check (char_length(description) <= 4000),
  category text not null default 'General' check (char_length(category) <= 80),
  instructor_name text not null default '' check (char_length(instructor_name) <= 120),
  class_type text not null check (class_type in ('recorded','live_broadcast','interactive')),
  status text not null default 'draft' check (status in ('draft','published','suspended','archived')),
  price_tzs bigint not null default 0 check (price_tzs >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 21600),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  record_replay boolean not null default true,
  media_uid text,
  live_input_uid text,
  stream_status text not null default 'not_configured'
    check (stream_status in ('not_configured','upload_pending','processing','ready','live_input_ready','live','ended','failed')),
  cover_image_url text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ione_live_recorded_max_one_hour
    check (class_type <> 'recorded' or duration_seconds is null or duration_seconds <= 3600),
  constraint ione_live_schedule_order
    check (scheduled_end is null or scheduled_start is null or scheduled_end > scheduled_start)
);

create index if not exists ione_live_classes_public_schedule_idx
  on public.ione_live_classes (status, scheduled_start asc, created_at desc);
create index if not exists ione_live_classes_type_status_idx
  on public.ione_live_classes (class_type, status);

create table if not exists public.ione_live_class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.ione_live_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_tzs bigint not null check (amount_tzs >= 0),
  currency text not null default 'TZS' check (currency = 'TZS'),
  payment_provider text,
  payment_reference text,
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','failed','refunded')),
  paid_at timestamptz,
  access_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, user_id)
);
create index if not exists ione_live_enrollments_user_class_idx
  on public.ione_live_class_enrollments (user_id, class_id, payment_status);
create unique index if not exists ione_live_enrollments_provider_reference_uidx
  on public.ione_live_class_enrollments (payment_provider, payment_reference)
  where payment_reference is not null;

create table if not exists public.ione_live_class_attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.ione_live_classes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  attendance_source text not null default 'web'
    check (attendance_source in ('web','mobile','instructor')),
  created_at timestamptz not null default now(),
  constraint ione_live_attendance_time_order check (left_at is null or left_at >= joined_at)
);
create index if not exists ione_live_attendance_class_joined_idx
  on public.ione_live_class_attendance (class_id, joined_at desc);

create or replace function public.ione_live_class_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists ione_live_classes_touch_updated_at on public.ione_live_classes;
create trigger ione_live_classes_touch_updated_at
before update on public.ione_live_classes
for each row execute function public.ione_live_class_touch_updated_at();
drop trigger if exists ione_live_enrollments_touch_updated_at on public.ione_live_class_enrollments;
create trigger ione_live_enrollments_touch_updated_at
before update on public.ione_live_class_enrollments
for each row execute function public.ione_live_class_touch_updated_at();

alter table public.ione_live_classes enable row level security;
alter table public.ione_live_class_enrollments enable row level security;
alter table public.ione_live_class_attendance enable row level security;

-- No browser role receives table write access or direct enrollment/attendance reads.
-- The Edge Function enforces Authority sessions, payment status and playback access.
revoke all on public.ione_live_classes from anon, authenticated;
revoke all on public.ione_live_class_enrollments from anon, authenticated;
revoke all on public.ione_live_class_attendance from anon, authenticated;
