-- Harden SECURITY DEFINER public RPCs.
-- chapchap_public_publish_v2 remains callable by anon/authenticated because it is
-- the public marketplace publishing path; keep its existing access while fixing
-- its search_path. Referral token creation is performed by the authenticated
-- ione-gift-support Edge Function using service_role, so direct client RPC access
-- is unnecessary and is revoked.
ALTER FUNCTION public.chapchap_public_publish_v2(text,text,text,jsonb,text,bigint,text,text,text,text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.ione_claim_referral_token(uuid,text,text)
  SET search_path = pg_catalog, public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.ione_claim_referral_token(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
