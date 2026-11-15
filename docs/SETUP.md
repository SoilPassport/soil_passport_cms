# Setup — Phase 1

## 1. Create a dedicated Supabase project
New project for Soil Passport Ltd only (separate from DSPX). Keep separate projects for dev / staging / production.

## 2. Apply migrations (in order)
Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`, or paste `0001`, `0002`, `0003` into the SQL editor in order.

## 3. Auth settings (Dashboard → Authentication)
- Disable public sign-ups (invite-only).
- Enable **MFA (TOTP)**.
- Site URL = `https://cms.soilpassport.com`; add it to Redirect URLs.
- Set a strong password policy; configure an SMTP provider for invites/reset emails.

## 4. Create the first Super Admin
1. Authentication → Users → *Add user* (email + password).
2. In the SQL editor (this runs as service role, so the profile trigger allows it):
```sql
update public.profiles set status='active', full_name='<Your name>' where email='<your email>';
insert into public.user_roles(user_id, role_id)
select p.id, r.id from public.profiles p, public.roles r where p.email='<your email>' and r.key='super_admin';
```
3. Sign in at the CMS; you will be asked to enrol an authenticator app (MFA is required for Super Admin).

## 5. Deploy the invite function
```
supabase functions deploy invite-user
supabase secrets set ALLOWED_ORIGIN=https://cms.soilpassport.com ADMIN_URL=https://cms.soilpassport.com
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions by Supabase. **Never** put the service-role key in `admin/.env`.

## 6. Build and upload the admin app
```
cd admin && cp .env.example .env     # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install && npm run build
```
Upload the contents of `admin/dist/` (including `.htaccess`) to the document root of `cms.soilpassport.com` in cPanel. Put the subdomain behind Cloudflare (WAF on, SSL Full strict).

### Build on GitHub instead of your computer
1. Repo -> Settings -> Secrets and variables -> Actions -> New repository secret. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon key only; never the service-role key).
2. Repo -> Actions -> "Build admin app" -> Run workflow.
3. When it finishes, download the `cms-admin-dist` artifact (a zip), unzip it, and upload the contents to the cms subdomain's document root.

## 7. Verification checklist (do these before relying on it)
- [ ] Sign in with the Super Admin; MFA enrolment works; dashboard loads without errors.
- [ ] Invite a Contributor; they can sign in but see only the menu items their role allows.
- [ ] As the Contributor, trying to read Investment Enquiries returns nothing.
- [ ] Suspend a user; they can no longer sign in to the CMS.
- [ ] Roles page: toggling a permission writes an audit entry.
- [ ] Run `supabase/tests/rls.test.mjs` equivalents against your project, or review policies in the SQL editor.

## 8. Backups
Enable Supabase daily backups (Pro plan) or schedule `pg_dump` to storage you control; test a restore into a scratch project before production.
