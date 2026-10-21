-- Harden search_path for remaining SECURITY DEFINER trigger/maintenance functions.
-- Existing triggers remain enabled; this changes function resolution only.
ALTER FUNCTION public.afrilink_billboard_item_owner_guard()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.ione_guard_author_package_publish()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.ione_record_author_earning()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.afrilink_purge_expired_messages()
  SET search_path = pg_catalog, public, pg_temp;
