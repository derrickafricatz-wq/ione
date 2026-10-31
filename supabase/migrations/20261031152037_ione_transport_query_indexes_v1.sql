create index if not exists ione_transport_jobs_driver_profile_idx
  on public.ione_transport_jobs(driver_id);
create index if not exists ione_transport_messages_sender_created_idx
  on public.ione_transport_messages(sender_user_id, created_at desc);
