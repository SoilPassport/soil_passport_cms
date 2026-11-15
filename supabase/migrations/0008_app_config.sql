-- Migration 0008: integration settings stored in the database, editable only by Super Admins through the config-admin function.
-- Secret values are encrypted (AES-GCM) by the function before they reach this table; the browser can never read them back.
-- Safe to run more than once.
create table if not exists public.app_config (
  key text primary key check (key ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  value text not null,                      -- plain text, or "v1.<iv>.<ciphertext>" when is_secret
  is_secret boolean not null default false,
  hint text,                                -- e.g. last 4 characters of a long secret, for the admin to recognise it
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;   -- no policies and no grants: only the service role (Edge Functions) can touch it
grant all on public.app_config to service_role;

-- True only for an active Super Admin whose session satisfies the MFA rule. Used by the config-admin function.
create or replace function public.is_super_admin() returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user() and public.mfa_satisfied() and exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = auth.uid() and r.key = 'super_admin');
$$;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
