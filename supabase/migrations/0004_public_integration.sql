-- Migration 0004: lets the public website read published content, adds image URL fields, re-applies API grants.
-- Safe to run more than once.

-- Image URLs (the R2 media library arrives in Phase 3; until then admins paste an image URL)
alter table public.articles      add column if not exists featured_image_url text;
alter table public.articles      add column if not exists og_image_url text;
alter table public.website_pages add column if not exists og_image_url text;
alter table public.events        add column if not exists banner_url text;

-- Scheduled content goes live automatically once its publish time has passed (no cron needed).
drop policy if exists articles_public on public.articles;
create policy articles_public on public.articles for select using (
  (status = 'published' and (published_at is null or published_at <= now()))
  or (status = 'scheduled' and publish_at is not null and publish_at <= now()));

drop policy if exists pages_public on public.website_pages;
create policy pages_public on public.website_pages for select using (
  visibility = 'public' and (
    (status = 'published' and (published_at is null or published_at <= now()))
    or (status = 'scheduled' and publish_at is not null and publish_at <= now())));

drop policy if exists events_public on public.events;
create policy events_public on public.events for select using (
  status in ('published','completed') and not is_investor_event);

-- Author name shown publicly without exposing profiles
-- (articles.author_display_name is a plain column already.)

-- Announcement banner lives in system_settings (key = 'announcement', is_public = true)
-- Public can read only rows flagged is_public (policy settings_public_read already exists).

-- API privileges: the Data API role needs explicit grants on new Supabase projects. RLS still decides access.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant select on public.website_pages, public.articles, public.article_categories, public.article_tags,
  public.events, public.event_speakers, public.galleries, public.gallery_items,
  public.roadmap_items, public.media_assets, public.documents, public.system_settings to anon;

-- Publishing guard: only restrict signed-in end users. The SQL editor and service role (auth.uid() is null) may bootstrap/seed.
create or replace function public.guard_publish_transition() returns trigger language plpgsql security definer set search_path = public as $$
declare module text := tg_argv[0];
begin
  if auth.uid() is null then return new; end if;
  if new.status in ('published','scheduled') and (tg_op='INSERT' or old.status is distinct from new.status) then
    if not public.can(module||'.publish') then raise exception 'Not permitted to publish/schedule % content', module; end if;
  elsif new.status = 'approved' and (tg_op='INSERT' or old.status is distinct from new.status) then
    if not public.can(module||'.approve') then raise exception 'Not permitted to approve % content', module; end if;
  end if;
  return new;
end $$;

-- Speaker photo by URL (until the R2 media library exists in Phase 3)
alter table public.event_speakers add column if not exists photo_url text;
