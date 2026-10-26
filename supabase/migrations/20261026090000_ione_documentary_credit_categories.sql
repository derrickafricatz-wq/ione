-- I|ONE documentary creator credit and category filters. Additive only.
ALTER TABLE public.ione_documentaries
  ADD COLUMN IF NOT EXISTS documented_by text NOT NULL DEFAULT '';

ALTER TABLE public.ione_documentaries
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General';

ALTER TABLE public.ione_documentaries
  DROP CONSTRAINT IF EXISTS ione_documentaries_category_allowed;

ALTER TABLE public.ione_documentaries
  ADD CONSTRAINT ione_documentaries_category_allowed
  CHECK (category IN (
    'Culture', 'Education', 'History', 'Nature', 'Science & Technology',
    'Society', 'Business', 'Faith & Beliefs', 'Other', 'General'
  ));
