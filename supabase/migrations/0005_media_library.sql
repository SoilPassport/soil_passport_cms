-- Migration 0005: media library support (Cloudflare R2), videos, public document access. Safe to run more than once.

-- Videos: an uploaded file (media asset) or an external YouTube/Vimeo link.
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  source text not null check (source in ('upload','youtube','vimeo')),
  asset_id uuid references public.media_assets(id) on delete restrict,
  external_url text,
  thumbnail_url text,
  sort_order int not null default 0,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((source = 'upload' and asset_id is not null) or (source <> 'upload' and external_url is not null))
);
drop trigger if exists trg_videos_upd on public.videos;
create trigger trg_videos_upd before update on public.videos for each row execute function public.set_updated_at();
alter table public.videos enable row level security;

drop policy if exists videos_public on public.videos;
create policy videos_public on public.videos for select using (status = 'published');
drop policy if exists videos_adm_read on public.videos;
create policy videos_adm_read on public.videos for select using (public.can('media.view'));
drop policy if exists videos_adm_ins on public.videos;
create policy videos_adm_ins on public.videos for insert with check (public.can('media.edit'));
drop policy if exists videos_adm_upd on public.videos;
create policy videos_adm_upd on public.videos for update using (public.can('media.edit')) with check (public.can('media.edit'));
drop policy if exists videos_adm_del on public.videos;
create policy videos_adm_del on public.videos for delete using (public.can('media.delete'));

-- Publishing needs the publish permission (galleries: gallery.publish, videos: media.publish).
drop trigger if exists trg_guard_galleries on public.galleries;
create trigger trg_guard_galleries before insert or update on public.galleries for each row execute function public.guard_publish_transition('gallery');
drop trigger if exists trg_guard_videos on public.videos;
create trigger trg_guard_videos before insert or update on public.videos for each row execute function public.guard_publish_transition('media');

-- Public downloads: the current version of a published, public document is readable by the website.
drop policy if exists docver_public on public.document_versions;
create policy docver_public on public.document_versions for select using (exists (
  select 1 from public.documents d where d.id = document_id and d.status = 'published' and d.access_level = 'public'
    and (d.expires_at is null or d.expires_at > now())));

-- Only files in the PUBLIC bucket are supported for now, so internal/investor documents cannot be published until a private bucket exists.
create or replace function public.documents_public_only_until_private_bucket() returns trigger language plpgsql as $$
begin
  if new.status = 'published' and new.access_level <> 'public' then
    raise exception 'Only public documents can be published until a private storage bucket is configured';
  end if;
  return new;
end $$;
drop trigger if exists trg_docs_public_only on public.documents;
create trigger trg_docs_public_only before insert or update on public.documents for each row execute function public.documents_public_only_until_private_bucket();

-- Grants (new Supabase projects need them explicitly; RLS still decides access)
grant select, insert, update, delete on public.videos to authenticated;
grant select on public.videos, public.document_versions to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
