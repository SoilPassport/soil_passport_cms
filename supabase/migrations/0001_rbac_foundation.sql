-- Soil Passport CMS — migration 0001: identity, RBAC, audit, settings
-- Dedicated Supabase project. Do NOT connect to the DSPX database.
create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  full_name text,
  job_title text,
  avatar_url text,
  status text not null default 'active' check (status in ('active','suspended','invited')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- ---------- roles / permissions ----------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  requires_mfa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_roles_updated before update on public.roles for each row execute function public.set_updated_at();

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,            -- e.g. articles.publish
  module text not null,                -- e.g. articles
  description text
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index on public.user_roles(role_id);

-- ---------- helper functions (SECURITY DEFINER, fixed search_path) ----------
create or replace function public.is_active_user(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.status = 'active');
$$;

create or replace function public.has_permission(perm text, uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select (uid = auth.uid() or auth.uid() is null)   -- callers may only ask about themselves (service role: any)
     and public.is_active_user(uid) and (
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = uid and r.key = 'super_admin'
    )
    or exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = uid and p.key = perm
    )
  );
$$;

-- MFA: true when session is aal2, or the user's roles do not require MFA
create or replace function public.mfa_satisfied(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
      or not exists (
        select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
        where ur.user_id = uid and r.requires_mfa
      );
$$;

-- Single gate used by every admin policy: active + permission + MFA where required
create or replace function public.can(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_permission(perm) and public.mfa_satisfied();
$$;

-- Auto-create profile on sign-up (status 'invited' until a Super Admin activates + assigns a role)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, status)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''), 'invited')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- audit log (append-only) ----------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  action text not null,                -- e.g. article.publish, user.suspend
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  ip inet,
  user_agent text
);
create index on public.audit_logs(occurred_at desc);
create index on public.audit_logs(actor_id);
create index on public.audit_logs(entity_type, entity_id);

create or replace function public.write_audit(p_action text, p_entity_type text default null, p_entity_id text default null, p_details jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'write_audit requires an authenticated user'; end if;
  insert into public.audit_logs(actor_id, actor_email, action, entity_type, entity_id, details)
  select auth.uid(), (select email from public.profiles where id = auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_details,'{}');
end $$;

create or replace function public.audit_no_mutation() returns trigger language plpgsql as $$
begin raise exception 'audit_logs is append-only'; end $$;
create trigger trg_audit_immutable before update or delete on public.audit_logs for each row execute function public.audit_no_mutation();

-- ---------- settings (NO SECRETS here) ----------
create table public.system_settings (
  key text primary key,
  category text not null check (category in ('general','website','storage','crm','email','events','security')),
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,   -- readable by the public website (e.g. social links)
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
-- Non-secret integration state only. Secrets live in Supabase Vault / Edge Function secrets.
create table public.integration_settings (
  provider text primary key check (provider in ('r2','hubspot','email','calendly','zoom','teams','eventbrite','turnstile')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,       -- non-secret: bucket name, sender name, portal id...
  secret_configured boolean not null default false, -- flag only; value never stored here
  last_checked_at timestamptz,
  last_status text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;
alter table public.integration_settings enable row level security;

create policy profiles_self_read on public.profiles for select using (id = auth.uid());
create policy profiles_admin_read on public.profiles for select using (public.can('users.view'));
create policy profiles_admin_write on public.profiles for update using (public.can('users.manage')) with check (public.can('users.manage'));
-- users may edit only their own display fields (status/email are protected by the trigger below)
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.protect_profile_fields() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- only restrict signed-in end users; service role / SQL editor (auth.uid() is null) may bootstrap
  if auth.uid() is not null and not public.can('users.manage') then
    new.status := old.status; new.email := old.email;
  end if;
  return new;
end $$;
create trigger trg_profiles_protect before update on public.profiles for each row execute function public.protect_profile_fields();

create policy roles_read on public.roles for select using (public.is_active_user());
create policy roles_write on public.roles for all using (public.can('roles.manage')) with check (public.can('roles.manage'));
create policy perms_read on public.permissions for select using (public.is_active_user());
create policy role_perms_read on public.role_permissions for select using (public.is_active_user());
create policy role_perms_write on public.role_permissions for all using (public.can('roles.manage')) with check (public.can('roles.manage'));
create policy user_roles_self_read on public.user_roles for select using (user_id = auth.uid());
create policy user_roles_admin_read on public.user_roles for select using (public.can('users.view'));
create policy user_roles_write on public.user_roles for all using (public.can('users.manage')) with check (public.can('users.manage'));

create policy audit_read on public.audit_logs for select using (public.can('audit.view'));
-- no insert/update/delete policies: writes only via write_audit() or service role

create policy settings_public_read on public.system_settings for select using (is_public);
create policy settings_admin_read on public.system_settings for select using (public.can('settings.view'));
create policy settings_admin_write on public.system_settings for all using (public.can('settings.manage')) with check (public.can('settings.manage'));
create policy integ_read on public.integration_settings for select using (public.can('integrations.view'));
create policy integ_write on public.integration_settings for all using (public.can('integrations.manage')) with check (public.can('integrations.manage'));

-- Prevent removal/demotion of the last active Super Admin
create or replace function public.guard_last_super_admin() returns trigger language plpgsql security definer set search_path = public as $$
declare sa uuid; remaining int;
begin
  select id into sa from public.roles where key='super_admin';
  if (tg_op='DELETE' and old.role_id = sa) then
    select count(*) into remaining from public.user_roles ur join public.profiles p on p.id=ur.user_id
      where ur.role_id=sa and p.status='active' and ur.user_id <> old.user_id;
    if remaining = 0 then raise exception 'Cannot remove the last active Super Admin'; end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_guard_last_sa before delete on public.user_roles for each row execute function public.guard_last_super_admin();

-- Function privileges: nothing executable by anon unless explicitly granted.
revoke execute on function public.write_audit(text,text,text,jsonb) from public, anon;
grant execute on function public.write_audit(text,text,text,jsonb) to authenticated;
