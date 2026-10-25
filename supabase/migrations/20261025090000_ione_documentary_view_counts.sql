-- I|ONE documentary view counts. Additive only; existing content is preserved.
ALTER TABLE public.ione_documentaries ADD COLUMN IF NOT EXISTS view_count bigint NOT NULL DEFAULT 0;
ALTER TABLE public.ione_documentaries DROP CONSTRAINT IF EXISTS ione_documentaries_view_count_nonnegative;
ALTER TABLE public.ione_documentaries ADD CONSTRAINT ione_documentaries_view_count_nonnegative CHECK (view_count >= 0);

CREATE TABLE IF NOT EXISTS public.ione_documentary_view_keys (
  documentary_id uuid NOT NULL REFERENCES public.ione_documentaries(id) ON DELETE CASCADE,
  viewer_hash text NOT NULL CHECK (viewer_hash ~ '^[0-9a-f]{64}$'),
  last_counted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (documentary_id, viewer_hash)
);
ALTER TABLE public.ione_documentary_view_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ione_documentary_view_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ione_documentary_view_keys TO service_role;

CREATE OR REPLACE FUNCTION public.record_ione_documentary_view(p_documentary_id uuid, p_viewer_hash text)
RETURNS TABLE(counted boolean, view_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_counted boolean := false; v_count bigint;
BEGIN
  IF p_viewer_hash IS NULL OR p_viewer_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid viewer hash'; END IF;
  SELECT d.view_count INTO v_count FROM public.ione_documentaries AS d WHERE d.id=p_documentary_id AND d.published=true;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.ione_documentary_view_keys AS existing(documentary_id,viewer_hash,last_counted_at)
  VALUES (p_documentary_id,p_viewer_hash,clock_timestamp())
  ON CONFLICT (documentary_id,viewer_hash) DO UPDATE
    SET last_counted_at=clock_timestamp()
    WHERE existing.last_counted_at <= clock_timestamp()-interval '30 minutes'
  RETURNING true INTO v_counted;
  v_counted := COALESCE(v_counted,false);
  IF v_counted THEN
    UPDATE public.ione_documentaries AS d SET view_count=d.view_count+1
    WHERE d.id=p_documentary_id AND d.published=true RETURNING d.view_count INTO v_count;
  ELSE
    SELECT d.view_count INTO v_count FROM public.ione_documentaries AS d WHERE d.id=p_documentary_id AND d.published=true;
  END IF;
  RETURN QUERY SELECT v_counted,v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_ione_documentary_view(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ione_documentary_view(uuid,text) TO service_role;
