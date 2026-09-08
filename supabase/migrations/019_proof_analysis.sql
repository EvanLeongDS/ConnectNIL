-- 019 Automated proof analysis (additive, no backfill)
--
-- Results of the S3 -> Lambda -> Rekognition pipeline are written back through
-- app/api/internal/proof-processed. Two columns:
--
--   proof_analysis    jsonb, keyed by the proof object KEY (the same 's3://' key stored
--                     in proof_image_urls, minus the prefix). One entry per image:
--                     moderation labels, generated thumbnail key, OCR lines, and the
--                     brand-mention verdict. Shape + parser live in
--                     lib/deals/proofAnalysis.ts (parseProofAnalysis).
--
--   proof_review_flag text, a rollup for cheap filtering: 'flagged' | 'clean' | 'pending'.
--                     'pending' is the honest default -- it means "no analysis yet",
--                     which is what every proof submitted before this pipeline existed
--                     is. It must never read as an all-clear.
--
-- Deliberately NOT done here:
--   * no backfill of existing proofs (legacy Supabase-hosted proofs never pass through
--     S3 at all, so there is no event to replay for them; they stay 'pending')
--   * no NOT NULL on proof_review_flag -- rows predating this migration are legitimately
--     unanalysed, and a default of 'pending' says so without a table rewrite
--   * no constraint tying proof_analysis keys to proof_image_urls entries; a rejected
--     proof clears the images and the stale analysis is simply ignored by the reader

alter table public.deliverables
  add column if not exists proof_analysis jsonb not null default '{}'::jsonb,
  add column if not exists proof_review_flag text not null default 'pending';

alter table public.deliverables
  drop constraint if exists deliverables_proof_review_flag_check;

alter table public.deliverables
  add constraint deliverables_proof_review_flag_check
  check (proof_review_flag in ('flagged', 'clean', 'pending'));

comment on column public.deliverables.proof_analysis is
  'Automated proof analysis keyed by S3 object key: moderation labels, thumbnail key, OCR text, brand-mention verdict. Written by app/api/internal/proof-processed from the Rekognition pipeline. Parsed by parseProofAnalysis in lib/deals/proofAnalysis.ts.';

comment on column public.deliverables.proof_review_flag is
  'Rollup of proof_analysis: flagged | clean | pending. pending means not yet analysed (including every proof predating the pipeline) - it is not an all-clear.';

-- Brand reviewers filter their queue by "needs a closer look".
create index if not exists deliverables_proof_review_flag_idx
  on public.deliverables (proof_review_flag)
  where proof_review_flag = 'flagged';

notify pgrst, 'reload schema';
