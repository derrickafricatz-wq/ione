-- I|ONE documentary public comments with seven-day expiry.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE TABLE IF NOT EXISTS public.ione_documentary_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documentary_id uuid NOT NULL REFERENCES public.ione_documentaries(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 40),
  comment_text text NOT NULL CHECK (char_length(comment_text) BETWEEN 2 AND 1000),
  author_hash text NOT NULL CHECK (author_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT ione_documentary_comments_expiry_check CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days' + interval '1 minute')
);

CREATE INDEX IF NOT EXISTS ione_documentary_comments_public_idx
  ON public.ione_documentary_comments (documentary_id, expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS ione_documentary_comments_author_rate_idx
  ON public.ione_documentary_comments (author_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS ione_documentary_comments_expiry_idx
  ON public.ione_documentary_comments (expires_at);

ALTER TABLE public.ione_documentary_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ione_documentary_comments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.ione_documentary_comments TO service_role;

DO $$
DECLARE existing_job bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO existing_job FROM cron.job WHERE jobname = 'ione-documentary-comment-expiry';
    IF existing_job IS NOT NULL THEN PERFORM cron.unschedule(existing_job); END IF;
    PERFORM cron.schedule(
      'ione-documentary-comment-expiry',
      '17 3 * * *',
      $job$DELETE FROM public.ione_documentary_comments WHERE expires_at <= now();$job$
    );
  END IF;
END $$;
