# Soil Passport CMS — Architecture & Phased Plan

Status: **Phase 1 (Foundation) delivered.** Phases 2–6 not started. Nothing here has been run against a live Supabase / R2 / HubSpot account yet.

## 1. Repository review
The existing website (`soilpassport.com`) is a **static HTML/CSS/JS site** (28 pages, `assets/style.css`, `assets/app.js`), uploaded to cPanel as a zip. There is no React/Next.js code, no package manager, and no backend. Its contact and partner forms point at placeholder Supabase endpoints (`CONTACT_FORM_ENDPOINT`, `SUPABASE_ANON_KEY` in `app.js`) that are **not yet configured**.
Nothing in the existing site is modified by this work. The CMS is a separate project in `cms/`.

## 2. Hosting check (Namecheap Stellar)
Namecheap documents Node.js app hosting on its shared plans via cPanel ("Setup Node.js App"), but shared hosting limits CPU/RAM/processes, and a persistent Next.js server is a poor fit. The CMS needs no server of its own because Supabase (database, auth, Edge Functions) does the backend work.
**Decision: Option B** — static React (Vite) SPA built to `dist/` and uploaded to `cms.soilpassport.com`, with Supabase Edge Functions for every privileged operation. Option A (Next.js on a Node host) stays possible later because the data layer is entirely Supabase. *Verify the Node/runtime limits on your actual Stellar plan before any move to Option A.*

## 3. Stack as built
| Layer | Choice |
|---|---|
| Admin UI | React 18 + TypeScript + Tailwind CSS (Vite) |
| Auth | Supabase Auth, email+password, TOTP MFA |
| Data | Dedicated Supabase PostgreSQL, Row Level Security on every table |
| Privileged logic | Supabase Edge Functions (Deno/TypeScript), service-role key only as a function secret |
| Files (Phase 3) | Cloudflare R2 via presigned URLs from an Edge Function |
| CRM / email (Phase 5) | HubSpot API / adapter-based email provider, queued from Supabase |
No Python. No link to the DSPX database, users or credentials.

## 4. Security model
- **Authorisation lives in the database.** Every admin policy calls `public.can('<module>.<action>')` = active profile + role permission + MFA satisfied (aal2 when any of the user's roles requires MFA). UI checks only hide menu items.
- Super Admin bypasses permission lookup but not MFA. The last active Super Admin cannot be removed.
- Contributors/Editors cannot set `approved`/`scheduled`/`published` — enforced by trigger `guard_publish_transition`.
- Public site can read only: published pages/articles/events/galleries, public active media, public published documents, approved public roadmap items. **Enquiries, registrations, profiles, audit, settings and private documents have no public policy.**
- Public form submissions will go through Edge Functions (Turnstile + rate limit), stored first in Supabase and then synced to HubSpot from `crm_sync_jobs` (no lost submissions).
- Restricted/internal/investor-only document versions must reference a **private** media asset (trigger).
- `audit_logs` is append-only (trigger); entries only via `write_audit()` (authenticated) or service role.
- Secrets never in tables: `integration_settings` holds non-secret config plus a `secret_configured` flag; secrets go in Edge Function secrets / Supabase Vault.

## 5. Database
`supabase/migrations/0001` identity/RBAC/audit/settings · `0002` content, events, media, documents, enquiries, CRM queue, roadmap, email · `0003` seed of the 6 system roles and permission keys (system configuration only; no company or mock content).
Differences from your suggested table list: `enquiries` is a shared parent with `contact_enquiries`, `investment_enquiries`, `partnership_enquiries` child tables; added `workflow_events` (approval trail), `document_downloads`, `enquiry_notes`, `event_resources`, `article_tag_map`, `article_related`.

## 6. Phased plan
| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | Supabase schema + RLS, auth, MFA, admin shell (24-item nav), dashboard, users, roles/permissions, audit log, invite function | **Done, partly verified** (see below) |
| 2 Core CMS | Pages + blocks, articles + editor, approval workflow, revisions, SEO, sitemap/robots, public read API | Next |
| 3 Media & documents | R2 presigned upload, library, dedupe, usage tracking, gallery, video, documents + versions | |
| 4 Business modules | Events/registrations/CSV, investment/partnership/contact enquiries, newsletter, roadmap | |
| 5 Integrations | HubSpot sync worker + retry, email adapter + templates, Turnstile, Calendly/Eventbrite/Zoom/Teams | |
| 6 Security & deploy | Audit, load/access/backup tests, reports, CI, production rollout | |

## 7. Phase 1 verification
**Tested:** the three migrations execute cleanly on PostgreSQL (PGlite) with a stand-in `auth` schema; `supabase/tests/rls.test.mjs` confirms: MFA gate (aal1 denied, aal2 allowed), investor-relations sees only investment enquiries, contributor can draft but cannot publish or read enquiries, anon sees no drafts/enquiries/profiles, audit log immutable, last Super Admin protected, anon cannot write audit entries, users cannot probe others' permissions. The admin app typechecks and builds.
**Not tested (needs your Supabase project):** real Supabase Auth/MFA flow, the `invite-user` Edge Function, Supabase-specific grants, browser behaviour against live data.
