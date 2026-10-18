-- Allow the rider to notify the passenger that they are ready to pick them up.
-- This state occurs after the fare is agreed and before the rider marks pickup.
alter table public.ione_sokoni_passenger_trips
  drop constraint if exists ione_sokoni_passenger_trips_status_check;

alter table public.ione_sokoni_passenger_trips
  add constraint ione_sokoni_passenger_trips_status_check
  check (status = any (array[
    'requested',
    'accepted',
    'fare_proposed',
    'fare_countered',
    'fare_agreed',
    'rider_ready',
    'picked_up',
    'completed',
    'cancelled'
  ]::text[]));
