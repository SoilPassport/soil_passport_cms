-- Migration 0003: seed SYSTEM configuration only (roles + permission keys). No company data, no mock content.
insert into public.roles (key,name,description,is_system,requires_mfa) values
 ('super_admin','Super Admin','Full system access',true,true),
 ('content_manager','Content Manager','Manage all website content; approve and publish',true,true),
 ('editor','Editor','Create/edit articles and pages, manage media, submit for approval',true,true),
 ('contributor','Contributor','Create draft articles, upload media, submit for review. Cannot publish',true,false),
 ('event_manager','Event Manager','Manage events, webinars and registrations',true,true),
 ('investor_relations','Investor Relations','Investment enquiries and follow-ups only',true,true)
on conflict (key) do nothing;

insert into public.permissions (key,module,description) select m||'.'||a, m, initcap(a)||' '||m
from unnest(array['pages','articles','events','media','gallery','documents','roadmap','seo','newsletter']) m,
     unnest(array['view','edit','delete','approve','publish']) a on conflict do nothing;
insert into public.permissions (key,module,description) values
 ('dashboard.view','dashboard','View dashboard'),
 ('registrations.view','events','View event registrations'),('registrations.manage','events','Manage registrations'),('registrations.export','events','Export registration lists'),('registrations.delete','events','Delete registrations'),
 ('enquiries.view_all','enquiries','View all enquiries'),('enquiries.manage_all','enquiries','Manage all enquiries'),('enquiries.delete','enquiries','Delete enquiries'),
 ('investment.view','investment','View investment enquiries'),('investment.manage','investment','Manage investor follow-ups'),
 ('partnerships.view','partnerships','View partnership enquiries'),('partnerships.manage','partnerships','Manage partnership enquiries'),
 ('contact.view','contact','View contact enquiries'),('contact.manage','contact','Manage contact enquiries'),
 ('crm.view','crm','View CRM sync status'),('crm.manage','crm','Retry/configure CRM sync'),
 ('email.view','email','View email configuration'),('email.edit','email','Edit email templates'),('email.delete','email','Delete templates'),
 ('users.view','users','View users'),('users.manage','users','Create/suspend/assign users'),
 ('roles.manage','users','Create roles and define permissions'),
 ('settings.view','settings','View settings'),('settings.manage','settings','Change settings'),
 ('integrations.view','settings','View integration status'),('integrations.manage','settings','Configure integrations'),
 ('storage.manage','settings','Configure storage'),
 ('audit.view','security','View audit logs'),('reports.view','reports','View reports')
on conflict do nothing;

-- role -> permission mapping (super_admin bypasses via has_permission)
create temp table _rp(role_key text, perm text);
insert into _rp select 'content_manager', key from public.permissions where module in ('pages','articles','events','media','gallery','documents','roadmap','seo','newsletter') and key not like '%.delete'
  union select 'content_manager', k from unnest(array['dashboard.view','reports.view','registrations.view','registrations.manage','registrations.export','contact.view','email.view']) k
  union select 'content_manager', module||'.delete' from (values ('articles'),('media'),('gallery')) v(module);
insert into _rp select 'editor', k from unnest(array['dashboard.view','pages.view','pages.edit','articles.view','articles.edit','media.view','media.edit','gallery.view','gallery.edit','seo.view','seo.edit','documents.view']) k;
insert into _rp select 'contributor', k from unnest(array['dashboard.view','articles.view','articles.edit','media.view','media.edit']) k;
insert into _rp select 'event_manager', k from unnest(array['dashboard.view','events.view','events.edit','events.approve','events.publish','registrations.view','registrations.manage','registrations.export','media.view','media.edit','documents.view']) k;
insert into _rp select 'investor_relations', k from unnest(array['dashboard.view','investment.view','investment.manage','crm.view']) k;
insert into public.role_permissions(role_id, permission_id)
 select r.id, p.id from _rp x join public.roles r on r.key=x.role_key join public.permissions p on p.key=x.perm on conflict do nothing;

insert into public.notification_settings(key) values ('contact'),('investment'),('partnership'),('event_registration'),('demo'),('content_approval') on conflict do nothing;
insert into public.integration_settings(provider) values ('r2'),('hubspot'),('email'),('calendly'),('zoom'),('teams'),('eventbrite'),('turnstile') on conflict do nothing;
