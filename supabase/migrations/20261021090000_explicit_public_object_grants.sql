-- I|ONE: opt in to Supabase's explicit-grants model for public objects.
-- Review branch only: do not apply to production until all future migrations
-- and application access paths have been audited and tested.
-- These defaults affect future objects created by postgres in public only.
-- Existing object grants, RLS policies, rows, and application data are unchanged.
-- Every new public table/function/sequence must explicitly grant the minimum
-- privileges needed by its intended clients in the same feature migration.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
