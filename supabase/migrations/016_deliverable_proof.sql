-- 016 Deliverable proof (description + images) for athlete/team submissions

alter table public.deliverables
  add column if not exists proof_description text,
  add column if not exists proof_image_urls jsonb not null default '[]'::jsonb,
  add column if not exists submitted_at timestamptz;

-- Public bucket so brand/athlete can view proof URLs without signed URLs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deliverable-proofs',
  'deliverable-proofs',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can read proof images (URLs are unguessable paths)
drop policy if exists "Public read deliverable proofs" on storage.objects;
create policy "Public read deliverable proofs"
  on storage.objects for select
  using (bucket_id = 'deliverable-proofs');

-- Uploads go through the Next.js API using the Supabase service role (bypasses storage RLS).

notify pgrst, 'reload schema';
