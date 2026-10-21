-- This SECURITY DEFINER function deletes expired inquiry messages and is not user-facing.
-- Keep server-side service_role access; remove direct client RPC access.
REVOKE EXECUTE ON FUNCTION public.afrilink_purge_expired_messages() FROM PUBLIC, anon, authenticated;
