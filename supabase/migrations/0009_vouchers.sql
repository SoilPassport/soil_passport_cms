-- Migration 0009: voucher / coupon codes for event registration. Safe to run more than once. Run after 0008.
-- Codes are checked and counted by the system. No payment is taken here: the benefit (for example "20% off") is shown to the
-- registrant and stored on their registration so your team, or Eventbrite, can honour it.
create table if not exists public.voucher_codes (
  id uuid primary key default gen_random_uuid(),
  code citext not null unique check (code ~ '^[A-Za-z0-9_-]{3,32}$'),
  description text,
  benefit_type text not null default 'access' check (benefit_type in ('access','percent_off','amount_off','free_place')),
  benefit_value numeric(10,2) check (benefit_value is null or benefit_value > 0),
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  event_id uuid references public.events(id) on delete cascade,          -- null = valid for any event with native registration
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  valid_from timestamptz, valid_until timestamptz,
  active boolean not null default true,
  redeemed_count int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (benefit_type <> 'percent_off' or (benefit_value is not null and benefit_value <= 100)),
  check (benefit_type <> 'amount_off' or benefit_value is not null),
  check (valid_until is null or valid_from is null or valid_until > valid_from)
);
create index if not exists voucher_codes_event_idx on public.voucher_codes (event_id);
drop trigger if exists trg_voucher_upd on public.voucher_codes;
create trigger trg_voucher_upd before update on public.voucher_codes for each row execute function public.set_updated_at();

create or replace function public.guard_voucher() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.code := upper(new.code::text);
  if tg_op = 'INSERT' and auth.uid() is not null then new.redeemed_count := 0; end if;
  if tg_op = 'UPDATE' and auth.uid() is not null then new.redeemed_count := old.redeemed_count; end if;   -- only the redeem function may change the count
  return new;
end $$;
drop trigger if exists trg_guard_voucher on public.voucher_codes;
create trigger trg_guard_voucher before insert or update on public.voucher_codes for each row execute function public.guard_voucher();

alter table public.events add column if not exists require_voucher boolean not null default false;
alter table public.event_registrations add column if not exists voucher_id uuid references public.voucher_codes(id) on delete set null;
alter table public.event_registrations add column if not exists voucher_code text;
alter table public.event_registrations add column if not exists benefit_text text;

alter table public.voucher_codes enable row level security;
drop policy if exists voucher_read on public.voucher_codes; drop policy if exists voucher_ins on public.voucher_codes; drop policy if exists voucher_upd on public.voucher_codes; drop policy if exists voucher_del on public.voucher_codes;
create policy voucher_read on public.voucher_codes for select using (public.can('events.view'));
create policy voucher_ins on public.voucher_codes for insert with check (public.can('events.edit'));
create policy voucher_upd on public.voucher_codes for update using (public.can('events.edit')) with check (public.can('events.edit'));
create policy voucher_del on public.voucher_codes for delete using (public.can('events.delete') and redeemed_count = 0);
revoke all on public.voucher_codes from anon;
grant select, insert, update, delete on public.voucher_codes to authenticated;
grant all on public.voucher_codes to service_role;

-- Human text for a benefit
create or replace function public.voucher_benefit_text(v public.voucher_codes) returns text language sql immutable as $$
  select case v.benefit_type
    when 'free_place' then 'Free place'
    when 'percent_off' then trim(trailing '.' from trim(trailing '0' from v.benefit_value::text)) || '% off'
    when 'amount_off' then case v.currency when 'GBP' then '£' when 'USD' then '$' when 'EUR' then '€' else v.currency || ' ' end || v.benefit_value::text || ' off'
    else 'Voucher accepted' end
$$;

-- Why a code cannot be used right now (null = fine). Internal helper.
create or replace function public.voucher_problem(v public.voucher_codes, p_event uuid, p_email text) returns text language sql stable security definer set search_path = public as $$
  select case
    when v.id is null then 'invalid'
    when not v.active then 'invalid'
    when v.event_id is not null and v.event_id <> p_event then 'invalid'
    when v.valid_from is not null and v.valid_from > now() then 'invalid'
    when v.valid_until is not null and v.valid_until < now() then 'invalid'
    when v.max_redemptions is not null and v.redeemed_count >= v.max_redemptions then 'invalid'
    when exists (select 1 from public.event_registrations r where r.voucher_id = v.id and lower(r.email::text) = lower(p_email) and r.status <> 'cancelled') then 'invalid'
    else null end
$$;
-- Read-only check, used before a registration is saved. Returns the benefit text when valid, null otherwise.
create or replace function public.check_voucher(p_code text, p_event uuid, p_email text) returns text language plpgsql stable security definer set search_path = public as $$
declare v public.voucher_codes;
begin
  select * into v from public.voucher_codes where code = p_code::citext;
  if public.voucher_problem(v, p_event, p_email) is not null then return null; end if;   -- no row => v.id is null => 'invalid'
  return public.voucher_benefit_text(v);
end $$;
-- Atomic redemption (row is locked, so two people cannot take the last use). Raises when the code is no longer usable.
create or replace function public.redeem_voucher(p_code text, p_event uuid, p_email text, p_registration uuid) returns text language plpgsql security definer set search_path = public as $$
declare v public.voucher_codes; b text;
begin
  select * into v from public.voucher_codes where code = p_code::citext for update;
  if public.voucher_problem(v, p_event, p_email) is not null then raise exception 'Voucher not valid'; end if;
  b := public.voucher_benefit_text(v);
  update public.voucher_codes set redeemed_count = redeemed_count + 1 where id = v.id;
  update public.event_registrations set voucher_id = v.id, voucher_code = v.code::text, benefit_text = b where id = p_registration;
  return b;
end $$;
revoke all on function public.voucher_problem(public.voucher_codes, uuid, text), public.check_voucher(text, uuid, text), public.redeem_voucher(text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.voucher_problem(public.voucher_codes, uuid, text), public.check_voucher(text, uuid, text), public.redeem_voucher(text, uuid, text, uuid) to service_role;

-- Cancelling a registration gives the use back
create or replace function public.release_voucher() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and new.voucher_id is not null then
    update public.voucher_codes set redeemed_count = greatest(0, redeemed_count - 1) where id = new.voucher_id;
    new.voucher_id := null;   -- the code text stays on the registration for the record
  end if;
  return new;
end $$;
drop trigger if exists trg_release_voucher on public.event_registrations;
create trigger trg_release_voucher before update on public.event_registrations for each row execute function public.release_voucher();

-- The website needs to know whether a code is required
drop function if exists public.event_availability(text);
create function public.event_availability(p_slug text) returns table (open boolean, spots_left int, require_voucher boolean)
language sql stable security definer set search_path = public as $$
  select (e.registration_mode = 'native' and e.status = 'published' and not e.is_investor_event
          and (e.registration_closes_at is null or e.registration_closes_at > now())
          and (e.max_attendees is null or (select count(*) from event_registrations r where r.event_id = e.id and r.status <> 'cancelled') < e.max_attendees)),
         case when e.max_attendees is null then null else greatest(0, e.max_attendees - (select count(*)::int from event_registrations r where r.event_id = e.id and r.status <> 'cancelled')) end,
         e.require_voucher
  from events e where e.slug = p_slug
$$;
grant execute on function public.event_availability(text) to anon, authenticated;
