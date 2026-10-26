-- Explicitly deny direct client access. The Edge Function is the only application access path.
create policy "Deny direct client access to SMART ADS campaigns"
  on public.ione_smart_ads_campaigns
  for all to anon, authenticated
  using (false) with check (false);
create policy "Deny direct client access to SMART ADS events"
  on public.ione_smart_ads_events
  for all to anon, authenticated
  using (false) with check (false);
