-- Allow delivery requests to be dispatched immediately after order acceptance even when pickup GPS has not been saved.
-- Riders can call Mama Sokoni to confirm the exact pickup location.
alter table public.ione_sokoni_deliveries
  alter column pickup_lat drop not null,
  alter column pickup_lng drop not null;
