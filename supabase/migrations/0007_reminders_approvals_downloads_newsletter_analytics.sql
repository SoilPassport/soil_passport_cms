-- Migration 0007: event reminders, approval notifications, private downloads + counts, newsletter campaigns, analytics.
-- Safe to run more than once. Run after 0006.

-- ---------- new permissions ----------
insert into public.permissions (key,module,description) values
 ('newsletter.send','newsletter','Send newsletter campaigns'),
 ('documents.grant','documents','Give people access to restricted documents')
on conflict do nothing;
insert into public.role_permissions(role_id, permission_id)
 select r.id, p.id from public.roles r join public.permissions p on p.key in ('newsletter.send','documents.grant') where r.key = 'admin'
on conflict do nothing;

-- ---------- email templates ----------
alter table public.email_templates drop constraint if exists email_templates_key_check;
alter table public.email_templates add constraint email_templates_key_check
  check (key in ('contact_ack','investment_ack','partnership_ack','event_confirmation','event_reminder','internal_enquiry','content_approval','account','newsletter_confirm','document_access'));
insert into public.email_templates (key, subject, body_html, body_text) values
 ('event_reminder', 'Reminder: {{event_title}} starts soon', '<p>Hello {{name}},</p><p>This is a reminder that <strong>{{event_title}}</strong> takes place on {{event_date}}.</p><p>Details: {{event_url}}</p><p>If you can no longer attend, no action is needed.</p><p>Soil Passport</p>', null),
 ('content_approval', '{{headline}}: {{title}}', '<p>{{headline}}</p><p><strong>{{title}}</strong> ({{entity}})</p><p>{{detail}}</p><p>Open the admin: {{admin_url}}</p>', null),
 ('document_access', 'Access to {{document_title}}', '<p>Hello {{name}},</p><p>You have been given access to <strong>{{document_title}}</strong> from Soil Passport.</p><p>Download link (valid until {{expires}}, up to {{max_downloads}} downloads):<br>{{download_link}}</p><p>Please do not forward this link.</p>', null)
on conflict (key) do nothing;
insert into public.notification_settings (key, enabled, recipients) values ('content_approval', true, '{}') on conflict (key) do nothing;

-- ---------- event reminders ----------
alter table public.events add column if not exists reminder_hours int check (reminder_hours is null or (reminder_hours between 1 and 168));
create table if not exists public.event_reminders_sent (
  registration_id uuid not null references public.event_registrations(id) on delete cascade,
  sent_at timestamptz not null default now(), status text not null check (status in ('sent','failed','skipped')), error text,
  primary key (registration_id)
);
alter table public.event_reminders_sent enable row level security;
revoke all on public.event_reminders_sent from anon, authenticated;
drop policy if exists event_reminders_read on public.event_reminders_sent;
create policy event_reminders_read on public.event_reminders_sent for select using (public.can('registrations.view'));
grant select on public.event_reminders_sent to authenticated;

-- ---------- approval notification queue ----------
create table if not exists public.notification_queue (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('review_requested','review_result')),
  module text not null, entity_type text not null, entity_id uuid not null, title text,
  from_status text, to_status text, actor_id uuid, owner_id uuid,
  status text not null default 'pending' check (status in ('pending','sent','skipped','failed')), error text,
  created_at timestamptz not null default now(), processed_at timestamp with time zone
);
create index if not exists notification_queue_pending on public.notification_queue (status, created_at);
alter table public.notification_queue enable row level security;
revoke all on public.notification_queue from anon, authenticated;

create or replace function public.queue_status_notification() returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); k text;
begin
  if tg_op <> 'UPDATE' or new.status is not distinct from old.status then return new; end if;
  if new.status = 'pending_review' then k := 'review_requested';
  elsif old.status = 'pending_review' and new.status in ('approved','published','draft','scheduled') then k := 'review_result';
  else return new; end if;
  insert into public.notification_queue (kind, module, entity_type, entity_id, title, from_status, to_status, actor_id, owner_id)
  values (k, tg_argv[0], tg_table_name, new.id, left(coalesce(j->>'title',''), 200), old.status, new.status, auth.uid(), nullif(j->>'created_by','')::uuid);
  return new;
end $$;
do $$ declare r record; begin
  for r in select * from (values ('articles','articles'),('website_pages','pages'),('events','events'),('documents','documents')) as x(tbl,module) loop
    execute format('drop trigger if exists trg_notify_status on public.%I', r.tbl);
    execute format('create trigger trg_notify_status after update on public.%I for each row execute function public.queue_status_notification(%L)', r.tbl, r.module);
  end loop; end $$;

-- Active staff who hold <module>.approve (directly via a role; super_admin counts as holding every permission)
create or replace function public.approver_emails(p_module text) returns text[] language sql security definer set search_path = public stable as $$
  select coalesce(array_agg(distinct p.email::text), '{}') from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  join public.roles r on r.id = ur.role_id
  where p.status = 'active' and (r.key = 'super_admin' or exists (
    select 1 from public.role_permissions rp join public.permissions pm on pm.id = rp.permission_id where rp.role_id = r.id and pm.key = p_module || '.approve'));
$$;
revoke all on function public.approver_emails(text) from public, anon, authenticated;

-- ---------- private / restricted documents + download counts ----------
drop trigger if exists trg_docs_public_only on public.documents;  -- restricted documents may now be published (they are never exposed to the public)
-- A public document must not point at a private file
create or replace function public.docs_public_needs_public_asset() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.access_level = 'public' and new.current_version_id is not null and exists (
    select 1 from public.document_versions v join public.media_assets m on m.id = v.asset_id where v.id = new.current_version_id and m.visibility <> 'public') then
    raise exception 'A public document must use a public file';
  end if;
  return new;
end $$;
drop trigger if exists trg_docs_public_asset on public.documents;
create trigger trg_docs_public_asset before insert or update on public.documents for each row execute function public.docs_public_needs_public_asset();
-- Changing the access level of a document that already has versions: check the file visibility matches (restricted -> private)
create or replace function public.docs_restricted_needs_private_asset() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.access_level <> 'public' and new.current_version_id is not null and exists (
    select 1 from public.document_versions v join public.media_assets m on m.id = v.asset_id where v.id = new.current_version_id and m.visibility <> 'private') then
    raise exception 'Restricted documents must use a private file. Upload the file again as private.';
  end if;
  return new;
end $$;
drop trigger if exists trg_docs_private_asset on public.documents;
create trigger trg_docs_private_asset before insert or update on public.documents for each row execute function public.docs_restricted_needs_private_asset();

drop index if exists public.media_assets_checksum_uq;
create unique index if not exists media_assets_checksum_vis_uq on public.media_assets(checksum_sha256, visibility) where checksum_sha256 is not null and status='active';

create table if not exists public.document_access_grants (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  email citext not null, token_hash text not null unique,
  expires_at timestamptz not null, max_downloads int not null default 3 check (max_downloads between 1 and 50), downloads int not null default 0,
  revoked_at timestamptz, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
alter table public.document_access_grants enable row level security;
drop policy if exists grants_read on public.document_access_grants;
create policy grants_read on public.document_access_grants for select using (public.can('documents.grant'));
drop policy if exists grants_revoke on public.document_access_grants;
create policy grants_revoke on public.document_access_grants for update using (public.can('documents.grant')) with check (public.can('documents.grant'));
revoke all on public.document_access_grants from anon, authenticated;
grant select on public.document_access_grants to authenticated;
grant update (revoked_at) on public.document_access_grants to authenticated;

alter table public.document_downloads add column if not exists grant_id uuid references public.document_access_grants(id) on delete set null;
alter table public.document_downloads add column if not exists email text;
create index if not exists document_downloads_doc_idx on public.document_downloads (document_id, downloaded_at desc);
drop policy if exists docdl_read on public.document_downloads;
create policy docdl_read on public.document_downloads for select using (public.can('documents.view'));
grant select on public.document_downloads to authenticated;

-- Atomic count + log. Service role only (called by the doc-download function).
create or replace function public.record_download(p_doc uuid, p_ip_hash text, p_grant uuid, p_email text) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.document_downloads (document_id, ip_hash, grant_id, email) values (p_doc, p_ip_hash, p_grant, p_email);
  update public.documents set download_count = download_count + 1 where id = p_doc;
  if p_grant is not null then update public.document_access_grants set downloads = downloads + 1 where id = p_grant; end if;
end $$;
revoke all on function public.record_download(uuid, text, uuid, text) from public, anon, authenticated;

-- ---------- newsletter campaigns ----------
create table if not exists public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (length(subject) between 1 and 200), preheader text, body_html text not null default '',
  status text not null default 'draft' check (status in ('draft','sending','sent','cancelled')),
  recipients_total int not null default 0, sent_count int not null default 0, failed_count int not null default 0,
  started_at timestamptz, finished_at timestamptz, started_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger trg_campaigns_upd before update on public.newsletter_campaigns for each row execute function public.set_updated_at();
create table if not exists public.newsletter_deliveries (
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','failed')), error text, sent_at timestamptz,
  primary key (campaign_id, subscriber_id)
);
create index if not exists newsletter_deliveries_pending on public.newsletter_deliveries (campaign_id, status);
alter table public.newsletter_campaigns enable row level security;
alter table public.newsletter_deliveries enable row level security;
drop policy if exists camp_read on public.newsletter_campaigns; drop policy if exists camp_ins on public.newsletter_campaigns; drop policy if exists camp_upd on public.newsletter_campaigns; drop policy if exists camp_del on public.newsletter_campaigns;
create policy camp_read on public.newsletter_campaigns for select using (public.can('newsletter.view'));
create policy camp_ins on public.newsletter_campaigns for insert with check (public.can('newsletter.edit'));
create policy camp_upd on public.newsletter_campaigns for update using (public.can('newsletter.edit')) with check (public.can('newsletter.edit'));
create policy camp_del on public.newsletter_campaigns for delete using (public.can('newsletter.delete') and status = 'draft');
drop policy if exists deliv_read on public.newsletter_deliveries;
create policy deliv_read on public.newsletter_deliveries for select using (public.can('newsletter.view'));
revoke all on public.newsletter_campaigns, public.newsletter_deliveries from anon, authenticated;
grant select, insert, update, delete on public.newsletter_campaigns to authenticated;
grant select on public.newsletter_deliveries to authenticated;
-- Only the send function (service role, no auth.uid) may move a campaign into sending/sent, and a sent campaign is frozen.
create or replace function public.guard_campaign() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' and new.status <> 'draft' then raise exception 'Campaigns start as drafts'; end if;
    if tg_op = 'UPDATE' then
      if old.status <> 'draft' then raise exception 'Only draft campaigns can be edited'; end if;
      if new.status <> 'draft' then raise exception 'Use the Send action to send a campaign'; end if;
      new.recipients_total := old.recipients_total; new.sent_count := old.sent_count; new.failed_count := old.failed_count;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_campaign on public.newsletter_campaigns;
create trigger trg_guard_campaign before insert or update on public.newsletter_campaigns for each row execute function public.guard_campaign();

-- ---------- first-party, cookie-free analytics ----------
create table if not exists public.analytics_pageviews (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(), day date not null default (now() at time zone 'utc')::date,
  path text not null, referrer_host text, utm_source text, device text, country text, visitor_hash text not null
);
create index if not exists analytics_pv_day on public.analytics_pageviews (day);
create index if not exists analytics_pv_path on public.analytics_pageviews (day, path);
alter table public.analytics_pageviews enable row level security;
revoke all on public.analytics_pageviews from anon, authenticated;

create or replace function public.analytics_summary(p_from date, p_to date) returns jsonb language plpgsql security definer set search_path = public stable as $$
declare r jsonb;
begin
  if not public.can('reports.view') then raise exception 'Not allowed'; end if;
  if p_to - p_from > 400 then raise exception 'Range too large'; end if;
  select jsonb_build_object(
    'views', (select count(*) from analytics_pageviews where day between p_from and p_to),
    'visitors', (select count(distinct visitor_hash) from analytics_pageviews where day between p_from and p_to),
    'daily', coalesce((select jsonb_agg(d order by d->>'day') from (select jsonb_build_object('day', day, 'views', count(*), 'visitors', count(distinct visitor_hash)) d from analytics_pageviews where day between p_from and p_to group by day) x), '[]'),
    'pages', coalesce((select jsonb_agg(d) from (select jsonb_build_object('path', path, 'views', count(*), 'visitors', count(distinct visitor_hash)) d from analytics_pageviews where day between p_from and p_to group by path order by count(*) desc limit 20) x), '[]'),
    'referrers', coalesce((select jsonb_agg(d) from (select jsonb_build_object('name', coalesce(referrer_host, utm_source, 'Direct'), 'views', count(*)) d from analytics_pageviews where day between p_from and p_to group by coalesce(referrer_host, utm_source, 'Direct') order by count(*) desc limit 10) x), '[]'),
    'devices', coalesce((select jsonb_agg(d) from (select jsonb_build_object('name', coalesce(device,'unknown'), 'views', count(*)) d from analytics_pageviews where day between p_from and p_to group by device order by count(*) desc) x), '[]'),
    'countries', coalesce((select jsonb_agg(d) from (select jsonb_build_object('name', coalesce(country,'unknown'), 'views', count(*)) d from analytics_pageviews where day between p_from and p_to group by country order by count(*) desc limit 10) x), '[]')
  ) into r;
  return r;
end $$;
revoke all on function public.analytics_summary(date, date) from public, anon;
grant execute on function public.analytics_summary(date, date) to authenticated;
create or replace function public.analytics_purge() returns int language sql security definer set search_path = public as $$
  with d as (delete from public.analytics_pageviews where day < (now() at time zone 'utc')::date - 400 returning 1) select count(*)::int from d;
$$;
revoke all on function public.analytics_purge() from public, anon, authenticated;

-- ---------- grants for service role (explicit, as with earlier migrations) ----------
grant all on public.notification_queue, public.event_reminders_sent, public.analytics_pageviews, public.newsletter_deliveries, public.newsletter_campaigns, public.document_access_grants, public.document_downloads to service_role;
