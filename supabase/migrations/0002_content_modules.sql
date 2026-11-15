-- Migration 0002: content, events, media, documents, enquiries, CRM queue, roadmap, email
-- ---------- shared enums as check constraints ----------
-- content status: draft | pending_review | approved | scheduled | published | archived

-- ---------- media (R2 metadata; files live in Cloudflare R2) ----------
create table public.media_folders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.media_folders(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now()
);
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.media_folders(id) on delete set null,
  category text check (category in ('corporate','product','platform_screenshots','events','webinars','research','biochar','bioenergy','team','press','marketing','other')),
  kind text not null check (kind in ('image','video','pdf','document','svg','other')),
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum_sha256 text,
  storage_bucket text not null,
  storage_key text not null,                       -- R2 object key
  visibility text not null default 'private' check (visibility in ('public','private')),
  public_url text,                                  -- only when visibility='public'
  width int, height int, duration_seconds int,
  alt_text text, caption text, description text,
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active','archived')),
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_key)
);
create unique index media_assets_checksum_uq on public.media_assets(checksum_sha256) where checksum_sha256 is not null and status='active'; -- avoid duplicate uploads
create index on public.media_assets(category); create index on public.media_assets using gin(tags);
create trigger trg_media_upd before update on public.media_assets for each row execute function public.set_updated_at();

create table public.media_usage (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_assets(id) on delete restrict,   -- restrict: cannot delete an asset in use
  entity_type text not null check (entity_type in ('page','article','event','event_speaker','gallery','gallery_item','document','roadmap_item','setting')),
  entity_id uuid not null,
  field text,
  created_at timestamptz not null default now(),
  unique (asset_id, entity_type, entity_id, field)
);
create index on public.media_usage(entity_type, entity_id);

-- ---------- pages & blocks ----------
create table public.website_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$'),
  title text not null,
  status text not null default 'draft' check (status in ('draft','pending_review','approved','scheduled','published','archived')),
  visibility text not null default 'public' check (visibility in ('public','hidden')),
  sort_order int not null default 0,
  blocks jsonb not null default '[]'::jsonb,       -- ordered section list (hero, text_image, gallery, video, stats, testimonials, cta, cards, downloads, contact_form, events, news)
  seo_title text, seo_description text, canonical_url text, og_title text, og_description text,
  og_image_id uuid references public.media_assets(id) on delete set null,
  twitter_card text default 'summary_large_image',
  noindex boolean not null default false,
  publish_at timestamptz, published_at timestamptz,
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id), published_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger trg_pages_upd before update on public.website_pages for each row execute function public.set_updated_at();

create table public.content_blocks (               -- reusable blocks shared across pages
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  block_type text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger trg_blocks_upd before update on public.content_blocks for each row execute function public.set_updated_at();

-- ---------- articles ----------
create table public.article_categories (id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null);
create table public.article_tags (id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null);
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  summary text,
  body jsonb not null default '{}'::jsonb,         -- rich-text document (editor JSON); sanitised on render
  featured_image_id uuid references public.media_assets(id) on delete set null,
  author_id uuid references public.profiles(id),
  author_display_name text,
  category_id uuid references public.article_categories(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','pending_review','approved','scheduled','published','archived')),
  assigned_reviewer uuid references public.profiles(id),
  publish_at timestamptz, published_at timestamptz,
  seo_title text, seo_description text, canonical_url text, og_image_id uuid references public.media_assets(id) on delete set null, noindex boolean not null default false,
  ai_assisted boolean not null default false,
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id), published_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.articles(status, published_at desc);
create trigger trg_articles_upd before update on public.articles for each row execute function public.set_updated_at();
create table public.article_tag_map (article_id uuid references public.articles(id) on delete cascade, tag_id uuid references public.article_tags(id) on delete cascade, primary key(article_id, tag_id));
create table public.article_related (article_id uuid references public.articles(id) on delete cascade, related_id uuid references public.articles(id) on delete cascade, primary key(article_id, related_id), check (article_id <> related_id));
create table public.article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  revision_no int not null,
  snapshot jsonb not null,
  change_note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (article_id, revision_no)
);
-- approval workflow comments/transitions (used by pages, articles, events, documents)
create table public.workflow_events (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('page','article','event','document','roadmap_item')),
  entity_id uuid not null,
  from_status text, to_status text,
  action text not null check (action in ('submit','assign_reviewer','comment','request_changes','approve','reject','schedule','publish','unpublish','archive')),
  comment text,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.workflow_events(entity_type, entity_id);

-- ---------- events ----------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null, description jsonb not null default '{}'::jsonb,
  event_type text not null check (event_type in ('public_webinar','product_demo','customer_workshop','industry_conference','physical_event','partner_event','training_session','investor_event')),
  category text,
  banner_id uuid references public.media_assets(id) on delete set null,
  starts_at timestamptz not null, ends_at timestamptz not null, timezone text not null default 'Europe/London',
  mode text not null check (mode in ('online','physical','hybrid')),
  location text,
  registration_mode text not null default 'native' check (registration_mode in ('native','external','none')),
  registration_url text, registration_provider text check (registration_provider in ('calendly','zoom','teams','eventbrite','other')),
  max_attendees int check (max_attendees is null or max_attendees > 0),
  registration_closes_at timestamptz,
  status text not null default 'draft' check (status in ('draft','pending_review','approved','scheduled','published','cancelled','completed','archived')),
  featured boolean not null default false,
  recording_url text,
  is_investor_event boolean not null default false,   -- investor content requires explicit approval
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id), approved_by uuid references public.profiles(id), published_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create trigger trg_events_upd before update on public.events for each row execute function public.set_updated_at();
create table public.event_speakers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null, title text, organisation text, bio text,
  photo_id uuid references public.media_assets(id) on delete set null, sort_order int not null default 0
);
create table public.event_resources (event_id uuid references public.events(id) on delete cascade, document_id uuid, primary key(event_id, document_id));
create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null, email citext not null, organisation text, job_title text, country text,
  interests text[] not null default '{}',
  consent boolean not null check (consent),
  consent_text text, consent_at timestamptz not null default now(),
  status text not null default 'registered' check (status in ('registered','cancelled','attended','no_show')),
  source text, created_at timestamptz not null default now(), cancelled_at timestamptz,
  unique (event_id, email)
);
create index on public.event_registrations(event_id);

-- ---------- galleries ----------
create table public.galleries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, title text not null, description text,
  collection text check (collection in ('company_events','product_demos','soil_research','farmer_engagement','field_trials','biochar_bioenergy','partnerships','conferences','corporate')),
  cover_asset_id uuid references public.media_assets(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger trg_gal_upd before update on public.galleries for each row execute function public.set_updated_at();
create table public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete restrict,
  caption text, description text, sort_order int not null default 0,
  unique (gallery_id, asset_id)
);

-- ---------- documents ----------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  slug text unique, title text not null, description text,
  category text not null check (category in ('corporate','company_profile','investor_presentation','product_brochure','technical','research_report','white_paper','case_study','certification','press_release','event_resource','policy')),
  access_level text not null default 'internal' check (access_level in ('public','restricted','internal','investor_only')),
  current_version_id uuid,
  published_at timestamptz, expires_at timestamptz,
  author_id uuid references public.profiles(id),
  tags text[] not null default '{}',
  seo_title text, seo_description text,
  status text not null default 'draft' check (status in ('draft','pending_review','approved','published','archived')),
  download_count int not null default 0,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger trg_docs_upd before update on public.documents for each row execute function public.set_updated_at();
create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_label text not null, asset_id uuid not null references public.media_assets(id) on delete restrict,
  change_note text, created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  unique (document_id, version_label)
);
alter table public.documents add constraint documents_current_version_fk foreign key (current_version_id) references public.document_versions(id) on delete set null;
alter table public.event_resources add constraint event_resources_doc_fk foreign key (document_id) references public.documents(id) on delete cascade;
create table public.document_downloads (id bigint generated always as identity primary key, document_id uuid references public.documents(id) on delete cascade, user_id uuid, ip_hash text, downloaded_at timestamptz not null default now());
-- Investor-only / internal documents must live in a PRIVATE bucket: enforced by trigger.
create or replace function public.enforce_private_for_restricted_docs() returns trigger language plpgsql security definer set search_path = public as $$
declare vis text; lvl text;
begin
  select access_level into lvl from public.documents where id = new.document_id;
  select visibility into vis from public.media_assets where id = new.asset_id;
  if lvl in ('internal','investor_only','restricted') and vis <> 'private' then
    raise exception 'Restricted documents must use a private media asset';
  end if;
  return new;
end $$;
create trigger trg_docver_private before insert or update on public.document_versions for each row execute function public.enforce_private_for_restricted_docs();

-- ---------- enquiries ----------
create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('contact','investment','partnership','event_registration','demo')),
  name text not null, email citext not null, organisation text, telephone text, country text,
  category text, message text,
  consent boolean not null check (consent), consent_at timestamptz not null default now(),
  source_page text, ip_hash text, user_agent text,
  status text not null default 'new' check (status in ('new','in_progress','awaiting_reply','closed','spam')),
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.enquiries(kind, status, created_at desc);
create trigger trg_enq_upd before update on public.enquiries for each row execute function public.set_updated_at();
create table public.contact_enquiries (enquiry_id uuid primary key references public.enquiries(id) on delete cascade,
  category text check (category in ('general','product','book_demo','technical','media','partnership','investment','events','other')));
create table public.investment_enquiries (enquiry_id uuid primary key references public.enquiries(id) on delete cascade,
  investor_type text not null check (investor_type in ('angel','venture_capital','family_office','institutional','strategic','corporate_partner','other')),
  investment_interest text, lead_category text, follow_up_status text not null default 'none' check (follow_up_status in ('none','to_contact','contacted','meeting_scheduled','closed')));
create table public.partnership_enquiries (enquiry_id uuid primary key references public.enquiries(id) on delete cascade,
  partnership_category text not null check (partnership_category in ('technology','research','academic','agronomy','farming_org','food_producer','distributor','biochar','bioenergy','investor','other')),
  website text);
create table public.enquiry_notes (id uuid primary key default gen_random_uuid(), enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  author_id uuid references public.profiles(id), note text not null, created_at timestamptz not null default now());
create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(), email citext not null unique, name text,
  consent boolean not null check (consent), consent_at timestamptz not null default now(), source text,
  status text not null default 'pending' check (status in ('pending','subscribed','unsubscribed','bounced')),
  confirmed_at timestamptz, unsubscribed_at timestamptz, created_at timestamptz not null default now()
);

-- ---------- CRM sync queue (store first, sync async) ----------
create table public.crm_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'hubspot',
  enquiry_id uuid references public.enquiries(id) on delete cascade,
  registration_id uuid references public.event_registrations(id) on delete cascade,
  workflow text not null check (workflow in ('contact','investment','partnership','event_registration','demo')),
  status text not null default 'pending' check (status in ('pending','processing','synced','failed','skipped')),
  attempts int not null default 0, next_attempt_at timestamptz not null default now(),
  hubspot_contact_id text, hubspot_deal_id text,
  last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (enquiry_id is not null or registration_id is not null)
);
create index on public.crm_sync_jobs(status, next_attempt_at);
create trigger trg_crm_upd before update on public.crm_sync_jobs for each row execute function public.set_updated_at();

-- ---------- roadmap, email ----------
create table public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, category text,
  target_date date,
  status text not null default 'planned' check (status in ('completed','in_progress','planned','under_review')),
  icon text, image_id uuid references public.media_assets(id) on delete set null,
  is_public boolean not null default false, approved boolean not null default false,
  sort_order int not null default 0,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger trg_road_upd before update on public.roadmap_items for each row execute function public.set_updated_at();
create table public.email_templates (
  key text primary key check (key in ('contact_ack','investment_ack','partnership_ack','event_confirmation','event_reminder','internal_enquiry','content_approval','account')),
  subject text not null, body_html text not null, body_text text, enabled boolean not null default true,
  updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
create table public.notification_settings (
  key text primary key, enabled boolean not null default true, recipients text[] not null default '{}', updated_at timestamptz not null default now()
);

-- ================= RLS =================
do $$ declare t text; begin
  foreach t in array array['media_folders','media_assets','media_usage','website_pages','content_blocks','article_categories','article_tags','articles','article_tag_map','article_related','article_revisions','workflow_events','events','event_speakers','event_resources','event_registrations','galleries','gallery_items','documents','document_versions','document_downloads','enquiries','contact_enquiries','investment_enquiries','partnership_enquiries','enquiry_notes','newsletter_subscribers','crm_sync_jobs','roadmap_items','email_templates','notification_settings']
  loop execute format('alter table public.%I enable row level security', t); end loop; end $$;

-- Public (anon) read: only published/approved/public rows
create policy pages_public on public.website_pages for select using (status='published' and visibility='public');
create policy articles_public on public.articles for select using (status='published' and published_at <= now());
create policy cats_public on public.article_categories for select using (true);
create policy tags_public on public.article_tags for select using (true);
create policy events_public on public.events for select using (status in ('published','completed') and not is_investor_event);
create policy speakers_public on public.event_speakers for select using (exists (select 1 from public.events e where e.id=event_id and e.status in ('published','completed') and not e.is_investor_event));
create policy galleries_public on public.galleries for select using (status='published');
create policy gallery_items_public on public.gallery_items for select using (exists (select 1 from public.galleries g where g.id=gallery_id and g.status='published'));
create policy roadmap_public on public.roadmap_items for select using (is_public and approved);
create policy media_public on public.media_assets for select using (visibility='public' and status='active');
create policy docs_public on public.documents for select using (status='published' and access_level='public' and (expires_at is null or expires_at > now()));

-- Admin policies: read / write / delete via permission keys
do $$ declare r record; begin
  for r in select * from (values
    ('website_pages','pages'),('content_blocks','pages'),
    ('articles','articles'),('article_categories','articles'),('article_tags','articles'),('article_tag_map','articles'),('article_related','articles'),('article_revisions','articles'),
    ('events','events'),('event_speakers','events'),('event_resources','events'),
    ('media_assets','media'),('media_folders','media'),('media_usage','media'),
    ('galleries','gallery'),('gallery_items','gallery'),
    ('documents','documents'),('document_versions','documents'),('document_downloads','documents'),
    ('roadmap_items','roadmap'),('email_templates','email'),('notification_settings','email'),('newsletter_subscribers','newsletter')
  ) as x(tbl, module)
  loop
    execute format('create policy %I on public.%I for select using (public.can(%L))', r.tbl||'_adm_read', r.tbl, r.module||'.view');
    execute format('create policy %I on public.%I for insert with check (public.can(%L))', r.tbl||'_adm_ins', r.tbl, r.module||'.edit');
    execute format('create policy %I on public.%I for update using (public.can(%L)) with check (public.can(%L))', r.tbl||'_adm_upd', r.tbl, r.module||'.edit', r.module||'.edit');
    execute format('create policy %I on public.%I for delete using (public.can(%L))', r.tbl||'_adm_del', r.tbl, r.module||'.delete');
  end loop; end $$;

-- Publishing is a separate permission: contributors/editors cannot set published/approved states.
create or replace function public.guard_publish_transition() returns trigger language plpgsql security definer set search_path = public as $$
declare module text := tg_argv[0];
begin
  if new.status in ('published','scheduled') and (tg_op='INSERT' or old.status is distinct from new.status) then
    if not public.can(module||'.publish') then raise exception 'Not permitted to publish/schedule % content', module; end if;
  elsif new.status = 'approved' and (tg_op='INSERT' or old.status is distinct from new.status) then
    if not public.can(module||'.approve') then raise exception 'Not permitted to approve % content', module; end if;
  end if;
  return new;
end $$;
create trigger trg_guard_pages before insert or update on public.website_pages for each row execute function public.guard_publish_transition('pages');
create trigger trg_guard_articles before insert or update on public.articles for each row execute function public.guard_publish_transition('articles');
create trigger trg_guard_events before insert or update on public.events for each row execute function public.guard_publish_transition('events');
create trigger trg_guard_docs before insert or update on public.documents for each row execute function public.guard_publish_transition('documents');

-- Workflow events: authenticated staff read/insert their own actions
create policy wf_read on public.workflow_events for select using (public.can('articles.view') or public.can('pages.view') or public.can('events.view') or public.can('documents.view'));
create policy wf_ins on public.workflow_events for insert with check (actor_id = auth.uid() and (public.can('articles.edit') or public.can('pages.edit') or public.can('events.edit') or public.can('documents.edit')));

-- Registrations / enquiries: NO public policies. Public submissions go through Edge Functions (service role) with Turnstile + rate limits.
create policy reg_read on public.event_registrations for select using (public.can('registrations.view'));
create policy reg_upd on public.event_registrations for update using (public.can('registrations.manage')) with check (public.can('registrations.manage'));
create policy reg_del on public.event_registrations for delete using (public.can('registrations.delete'));

create policy enq_read on public.enquiries for select using (
  public.can('enquiries.view_all')
  or (kind='investment' and public.can('investment.view'))
  or (kind='partnership' and public.can('partnerships.view'))
  or (kind in ('contact','demo') and public.can('contact.view')));
create policy enq_upd on public.enquiries for update using (
  public.can('enquiries.manage_all')
  or (kind='investment' and public.can('investment.manage'))
  or (kind='partnership' and public.can('partnerships.manage'))
  or (kind in ('contact','demo') and public.can('contact.manage')));
create policy enq_del on public.enquiries for delete using (public.can('enquiries.delete'));
create policy contact_child_read on public.contact_enquiries for select using (public.can('contact.view') or public.can('enquiries.view_all'));
create policy invest_child_read on public.investment_enquiries for select using (public.can('investment.view') or public.can('enquiries.view_all'));
create policy invest_child_upd on public.investment_enquiries for update using (public.can('investment.manage')) with check (public.can('investment.manage'));
create policy partner_child_read on public.partnership_enquiries for select using (public.can('partnerships.view') or public.can('enquiries.view_all'));
create policy notes_read on public.enquiry_notes for select using (exists (select 1 from public.enquiries e where e.id=enquiry_id));  -- inherits enquiries RLS
create policy notes_ins on public.enquiry_notes for insert with check (author_id = auth.uid() and exists (select 1 from public.enquiries e where e.id=enquiry_id));
create policy crm_read on public.crm_sync_jobs for select using (public.can('crm.view'));
create policy crm_upd on public.crm_sync_jobs for update using (public.can('crm.manage')) with check (public.can('crm.manage'));
