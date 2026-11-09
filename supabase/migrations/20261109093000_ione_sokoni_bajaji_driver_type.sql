-- Add Bajaji as a first-class Sokoni driver type while preserving all existing Boda Boda records.
alter table public.ione_sokoni_rider_applications
  add column if not exists vehicle_type text not null default 'boda'
    check (vehicle_type in ('boda','bajaji'));

alter table public.ione_sokoni_riders
  add column if not exists vehicle_type text not null default 'boda'
    check (vehicle_type in ('boda','bajaji'));

comment on column public.ione_sokoni_rider_applications.motorcycle_plate is
  'Vehicle registration number for the applicant: motorcycle for Boda Boda or Bajaji registration for Bajaji.';
