-- I|ONE production security hardening.
-- These five functions now use an explicit search_path; function bodies and logic are unchanged.
ALTER FUNCTION public.afrilink_chapchap_touch_updated_at() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.get_available_seats(text, text, date) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.generate_ticket_number() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.afrilink_set_inquiry_updated_at() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.generate_trip_seats(uuid) SET search_path = pg_catalog, public, pg_temp;

-- These SECURITY DEFINER routines are trigger functions, not client RPC endpoints.
-- Existing triggers remain enabled; preserve owner and service_role access.
REVOKE EXECUTE ON FUNCTION public.afrilink_billboard_item_owner_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ione_guard_author_package_publish() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ione_record_author_earning() FROM PUBLIC, anon, authenticated;
