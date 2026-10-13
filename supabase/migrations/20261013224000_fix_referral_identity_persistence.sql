CREATE OR REPLACE FUNCTION public.ione_claim_referral_token(p_user_id uuid, p_name text, p_phone text)
RETURNS public.ione_referral_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  row public.ione_referral_tokens;
  existing public.ione_referral_tokens;
  used_today integer;
  clean_name text := left(trim(coalesce(p_name, '')), 120);
  clean_phone text := left(trim(coalesce(p_phone, '')), 30);
BEGIN
  IF nullif(clean_name, '') IS NULL OR nullif(clean_phone, '') IS NULL THEN
    RAISE EXCEPTION 'NAME_AND_PHONE_REQUIRED';
  END IF;

  UPDATE public.ione_referral_tokens
     SET referrer_name = coalesce(nullif(trim(referrer_name), ''), clean_name),
         referrer_phone = coalesce(nullif(trim(referrer_phone), ''), clean_phone),
         updated_at = now()
   WHERE referrer_user_id = p_user_id
     AND (nullif(trim(referrer_name), '') IS NULL
       OR nullif(trim(referrer_phone), '') IS NULL);

  SELECT * INTO existing
    FROM public.ione_referral_tokens
   WHERE referrer_user_id = p_user_id AND status = 'reserved'
   ORDER BY created_at DESC
   LIMIT 1;
  IF existing.id IS NOT NULL THEN RETURN existing; END IF;

  SELECT count(*) INTO used_today
    FROM public.ione_referral_tokens
   WHERE shared_at >= date_trunc('day', now())
     AND shared_at < date_trunc('day', now()) + interval '1 day';
  IF used_today >= 10 THEN RAISE EXCEPTION 'TODAY_LIMIT_REACHED'; END IF;

  INSERT INTO public.ione_referral_tokens(token, referrer_user_id, referrer_name, referrer_phone)
  VALUES ('I1-' || upper(substr(md5(random()::text || clock_timestamp()::text || p_user_id::text), 1, 10)),
          p_user_id, clean_name, clean_phone)
  RETURNING * INTO row;
  RETURN row;
END;
$function$;

-- Recover old referral identities from the same user's recorded I|ONE
-- author identity when both required values are available. Never invent data.
UPDATE public.ione_referral_tokens r
   SET referrer_name = coalesce(
         nullif(trim(r.referrer_name), ''),
         (SELECT nullif(trim(a.full_name), '') FROM public.authors a WHERE a.user_id = r.referrer_user_id LIMIT 1),
         (SELECT nullif(trim(aa.real_name), '') FROM public.ione_author_access aa WHERE aa.user_id = r.referrer_user_id LIMIT 1)
       ),
       referrer_phone = coalesce(
         nullif(trim(r.referrer_phone), ''),
         (SELECT nullif(trim(a.phone), '') FROM public.authors a WHERE a.user_id = r.referrer_user_id LIMIT 1),
         (SELECT nullif(trim(aa.phone), '') FROM public.ione_author_access aa WHERE aa.user_id = r.referrer_user_id LIMIT 1)
       ),
       updated_at = now()
 WHERE (nullif(trim(r.referrer_name), '') IS NULL OR nullif(trim(r.referrer_phone), '') IS NULL)
   AND coalesce(
         nullif(trim(r.referrer_name), ''),
         (SELECT nullif(trim(a.full_name), '') FROM public.authors a WHERE a.user_id = r.referrer_user_id LIMIT 1),
         (SELECT nullif(trim(aa.real_name), '') FROM public.ione_author_access aa WHERE aa.user_id = r.referrer_user_id LIMIT 1)
       ) IS NOT NULL
   AND coalesce(
         nullif(trim(r.referrer_phone), ''),
         (SELECT nullif(trim(a.phone), '') FROM public.authors a WHERE a.user_id = r.referrer_user_id LIMIT 1),
         (SELECT nullif(trim(aa.phone), '') FROM public.ione_author_access aa WHERE aa.user_id = r.referrer_user_id LIMIT 1)
       ) IS NOT NULL;
