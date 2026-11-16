-- Migration 0010: give the server-side role (service_role) explicit access to the public schema.
-- Newer Supabase projects do not grant it automatically. Without this, Edge Functions fail on the
-- older tables (media_assets, enquiries, event_registrations, audit_logs, crm jobs, ...) with
-- "permission denied" even though service_role bypasses row level security.
-- service_role is used only by server code (Edge Functions), never by the browser. Safe to run more than once.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
