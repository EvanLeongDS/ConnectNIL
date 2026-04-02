-- Optional Twitter / Snapchat handles and follower counts for athletes
alter table public.athlete_profiles
  add column if not exists twitter_handle    text,
  add column if not exists snapchat_handle   text,
  add column if not exists twitter_followers int,
  add column if not exists snapchat_followers int;

notify pgrst, 'reload schema';
