-- Preserve the legal archive's required distinction between judgments, deeds,
-- circulars, decisions, judicial principles, precedents, and catalog/index
-- artifacts.  `blog_index` is an archival classification only; client search
-- admission does not include it as an independent legal authority.
ALTER TABLE public.legal_documents
  DROP CONSTRAINT IF EXISTS legal_documents_type_check;

ALTER TABLE public.legal_documents
  ADD CONSTRAINT legal_documents_type_check
  CHECK (document_type IN (
    'judgment',
    'deed',
    'circular',
    'decision',
    'principle',
    'precedent',
    'blog_index'
  ));
