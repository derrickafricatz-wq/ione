-- Expand the i1 Transport service catalogue to include Bajaji without changing existing drivers or trips.
alter table public.ione_transport_driver_applications
  drop constraint if exists ione_transport_driver_applications_service_types_check;

alter table public.ione_transport_driver_applications
  add constraint ione_transport_driver_applications_service_types_check
  check (
    cardinality(service_types) between 1 and 5
    and service_types <@ array['taxi','special_hire','shuttle','bus','bajaji']::text[]
  );

alter table public.ione_transport_jobs
  drop constraint if exists ione_transport_jobs_service_type_check;

alter table public.ione_transport_jobs
  add constraint ione_transport_jobs_service_type_check
  check (service_type in ('taxi','special_hire','shuttle','bus','bajaji'));
