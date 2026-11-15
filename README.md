# Soil Passport CMS
Standalone corporate CMS for Soil Passport Ltd. Separate from the DSPX application and database.
- `docs/ARCHITECTURE.md` — decisions, security model, phased plan, what has and has not been tested
- `docs/SETUP.md` — Supabase + admin app setup
- `supabase/migrations/` — schema, RLS, seed roles/permissions
- `supabase/functions/` — Edge Functions (`invite-user`)
- `supabase/tests/rls.test.mjs` — policy tests (run with `npm i @electric-sql/pglite` then `node rls.test.mjs`; paths inside assume this repo layout)
- `admin/` — React + TypeScript + Tailwind admin app
