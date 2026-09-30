-- 021 Athlete profile photos (additive, no backfill)
--
-- athlete_profiles.photo_key holds an S3 object KEY, never a URL:
--
--   'athletes/<athleteId>/<uuid>.<ext>'
--
-- Stored WITHOUT the 's3://' prefix that deliverables.proof_image_urls uses. That column
-- is a mixed array carrying two historical formats and needs the marker to tell them
-- apart; this column has exactly one format and no legacy rows, so the marker would be
-- dead weight on every read. Shape + validation live in lib/athletes/photo.ts.
--
-- Never store a presigned URL here -- it expires. The key is presigned at render time by
-- presignAthletePhotoDownload() in lib/aws/s3.ts.
--
-- The `athletes/` prefix is deliberately OUTSIDE the `deals/` prefix that triggers the
-- proof-analysis Lambda (infra/lib/proof-pipeline-stack.ts filters on `deals/`), so an
-- avatar upload fires no Lambda, costs no Rekognition, and produces no thumbnail.
--
-- Visibility is NOT enforced here. athlete_profiles RLS stays self-only
-- (`auth.uid() = id`), and every cross-role read goes through createServiceClient() behind
-- an explicit relationship check in lib/athletes/visibility.ts. Adding a broad cross-role
-- SELECT policy was considered and rejected: these are personal photos of college
-- athletes, and a policy wide enough for the roster and deal views would also expose the
-- whole profile row -- phone number included -- to every onboarded brand.
--
-- Deliberately NOT done here:
--   * no NOT NULL / no default -- a photo is optional, and every row predating this
--     migration legitimately has none
--   * no backfill from profiles.avatar_url (populated by handle_new_user() from OAuth
--     metadata and read by no application code; it is unproven, not a source of truth)
--   * no change to the `avatars` Supabase storage bucket from 001 -- this feature stores
--     in S3, per the requirement that photos live in AWS

alter table public.athlete_profiles
  add column if not exists photo_key text;

-- A row may only ever point at an object under ITS OWN athletes/<id>/ prefix.
--
-- This is not belt-and-braces over the route handlers: the onboarding route writes this
-- table through createServiceClient(), which bypasses RLS entirely, so RLS could not
-- enforce it even if a policy existed. A CHECK constraint is NOT bypassed by the service
-- role, which makes "athlete A's row can only reference athlete A's photo" an invariant of
-- the database rather than a convention two route handlers happen to follow.
--
-- Legal as a non-constant pattern because id::text, || and ~ (textregexeq) are all
-- IMMUTABLE. Validation is instant and cannot fail on deploy: every existing row has
-- photo_key NULL, and NULL passes a CHECK.
--
-- Keep this regex in sync with PHOTO_KEY_RE in lib/athletes/photo.ts.
alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_photo_key_check;

alter table public.athlete_profiles
  add constraint athlete_profiles_photo_key_check
  check (
    photo_key is null
    or photo_key ~ (
      '^athletes/' || id::text ||
      '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|png|webp)$'
    )
  );

comment on column public.athlete_profiles.photo_key is
  'S3 object key for the athlete profile photo: athletes/<athleteId>/<uuid>.<ext>. No s3:// prefix. Presigned at render time - never store a presigned URL here, it expires. Parsed by lib/athletes/photo.ts.';

notify pgrst, 'reload schema';
