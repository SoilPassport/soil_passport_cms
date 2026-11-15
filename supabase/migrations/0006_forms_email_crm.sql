-- Migration 0006: public forms, email log, CRM queue helpers, roadmap approval guard, default templates. Safe to run more than once.

-- Rate limiting for the public form gateway (service role only: RLS on, no policies, no grants)
create table if not exists public.form_rate_limits (
  id bigint generated always as identity primary key,
  ip_hash text not null, kind text not null, created_at timestamptz not null default now()
);
create index if not exists form_rate_limits_ip_idx on public.form_rate_limits (ip_hash, created_at desc);
alter table public.form_rate_limits enable row level security;
revoke all on public.form_rate_limits from anon, authenticated;

-- Email log (what was sent, skipped or failed)
create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  template_key text not null, to_email text not null,
  status text not null check (status in ('sent','failed','skipped')), error text,
  enquiry_id uuid references public.enquiries(id) on delete set null,
  registration_id uuid references public.event_registrations(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists email_log_created_idx on public.email_log (created_at desc);
alter table public.email_log enable row level security;
drop policy if exists email_log_read on public.email_log;
create policy email_log_read on public.email_log for select using (public.can('email.view'));

-- Allow a newsletter confirmation template
alter table public.email_templates drop constraint if exists email_templates_key_check;
alter table public.email_templates add constraint email_templates_key_check
  check (key in ('contact_ack','investment_ack','partnership_ack','event_confirmation','event_reminder','internal_enquiry','content_approval','account','newsletter_confirm'));

-- Default templates (editable in the admin; plain wording, no claims)
insert into public.email_templates (key, subject, body_html) values
 ('contact_ack', 'We received your message', '<p>Hello {{name}},</p><p>Thank you for contacting Soil Passport. We have received your message and a member of our team will reply as soon as we can.</p><p>Your message:</p><p>{{message}}</p><p>Soil Passport Ltd</p>'),
 ('partnership_ack', 'Thank you for your partnership enquiry', '<p>Hello {{name}},</p><p>Thank you for your interest in partnering with Soil Passport. Our team will review your application and get back to you.</p><p>Soil Passport Ltd</p>'),
 ('investment_ack', 'Thank you for your enquiry', '<p>Hello {{name}},</p><p>Thank you for your enquiry. A member of our team will be in touch.</p><p>Soil Passport Ltd</p>'),
 ('event_confirmation', 'You are registered: {{event_title}}', '<p>Hello {{name}},</p><p>You are registered for <strong>{{event_title}}</strong> on {{event_date}}.</p><p>Soil Passport Ltd</p>'),
 ('internal_enquiry', 'New {{kind}} from {{name}}', '<p>A new {{kind}} was received on the website.</p><p><strong>Name:</strong> {{name}}<br><strong>Email:</strong> {{email}}<br><strong>Organisation:</strong> {{organisation}}<br><strong>Category:</strong> {{category}}</p><p>{{message}}</p><p>Open the admin panel: {{admin_url}}</p>'),
 ('newsletter_confirm', 'Please confirm your subscription', '<p>Hello {{name}},</p><p>Please confirm your subscription to Soil Passport updates by opening this link:</p><p>{{confirm_link}}</p><p>If you did not ask for this, ignore this email. To unsubscribe at any time: {{unsubscribe_link}}</p>')
on conflict (key) do nothing;
insert into public.notification_settings (key, enabled, recipients) values ('internal_enquiry', true, '{}') on conflict (key) do nothing;

-- Roadmap: only people with roadmap.approve may approve an item
create or replace function public.guard_roadmap_approval() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.approved and (tg_op = 'INSERT' or not old.approved) and not public.can('roadmap.approve') then
    raise exception 'You do not have permission to approve roadmap items';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_roadmap on public.roadmap_items;
create trigger trg_guard_roadmap before insert or update on public.roadmap_items for each row execute function public.guard_roadmap_approval();

-- Event spots (so the website can show "full" without exposing registrations)
create or replace function public.event_availability(p_slug text) returns table (open boolean, spots_left int)
language sql stable security definer set search_path = public as $$
  select (e.registration_mode = 'native' and e.status = 'published' and not e.is_investor_event
          and (e.registration_closes_at is null or e.registration_closes_at > now())
          and (e.max_attendees is null or (select count(*) from event_registrations r where r.event_id = e.id and r.status <> 'cancelled') < e.max_attendees)),
         case when e.max_attendees is null then null else greatest(0, e.max_attendees - (select count(*)::int from event_registrations r where r.event_id = e.id and r.status <> 'cancelled')) end
  from events e where e.slug = p_slug
$$;
grant execute on function public.event_availability(text) to anon, authenticated;

-- Grants
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on public.form_rate_limits from authenticated, anon;
grant usage, select on all sequences in schema public to authenticated;
