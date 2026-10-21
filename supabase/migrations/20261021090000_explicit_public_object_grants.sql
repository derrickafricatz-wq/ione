-- I|ONE: prepare for Supabase explicit-grants requirement.
-- This migration is intentionally proposed on a review branch only.
-- It changes default privileges for future objects created by postgres in public.
-- It does not alter existing object grants, RLS policies, or application data.
-- New feature migrations must explicitly grant only the required privileges.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
