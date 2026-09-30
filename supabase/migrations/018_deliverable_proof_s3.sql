-- 018 Deliverable proof images: S3 migration (schema-compatible, no data migration)
--
-- deliverables.proof_image_urls now holds a MIXED array of two entry formats:
--
--   'https://<ref>.supabase.co/storage/v1/object/public/deliverable-proofs/...'
--       -> legacy, written before the S3 migration. Rendered verbatim.
--   's3://deals/<partnership_id>/<deliverable_id>/<uuid>.<ext>'
--       -> new. An S3 object KEY, presigned at render time.
--
-- Never store a presigned URL in this column: it expires. Store the key.
--
-- Parsing and classification live in lib/deals/deliverableProof.ts
-- (parseProofImageRefs / isValidProofKey). Reads are always dual-mode, so the
-- PROOF_STORAGE_DRIVER flag only affects where NEW submissions are written.

comment on column public.deliverables.proof_image_urls is
  'Mixed array of proof image refs: legacy Supabase public URLs (https://...) and S3 object keys (s3://deals/...). Parsed by parseProofImageRefs in lib/deals/deliverableProof.ts. Never store presigned URLs here - they expire.';

-- Intentionally NOT done here:
--   * no backfill of Supabase objects into S3 (the reader handles both formats, and a
--     backfill is the only step that could destroy working demo data)
--   * no change to the deliverable-proofs bucket or its public-read policy from 016 -
--     removing it would break every already-submitted proof
--   * no column rename (proof_image_urls now holds refs, not only URLs). A rename would
--     be its own add / dual-write / backfill / drop migration.

notify pgrst, 'reload schema';
