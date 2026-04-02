-- Brand contact phone + optional website and social links
alter table public.brand_profiles
  add column if not exists phone text,
  add column if not exists website_url text,
  add column if not exists social_instagram text,
  add column if not exists social_x text,
  add column if not exists social_linkedin text;

notify pgrst, 'reload schema';
