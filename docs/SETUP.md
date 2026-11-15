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

---

## Phase 3: Media library on Cloudflare R2

The media library (images, videos, PDFs and Office files) stores files in Cloudflare R2. The browser never sees the R2 keys: the `media-r2` Edge Function checks the user's permission, creates a short-lived upload address, and records the file after checking it really arrived. **This has not been tested against a live R2 bucket yet.** Run the checklist at the end after setting up.

### 1. Run the database migration
Supabase → SQL Editor → run `supabase/migrations/0005_media_library.sql` (after 0004).

### 2. Create the bucket (Cloudflare)
1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket**, name it `soilpassport-media`.
2. Bucket → **Settings → Custom Domains → Add**: `media.soilpassport.com` (this is the public address of your files; the domain must be on Cloudflare DNS). For a quick test you can instead enable the `r2.dev` public URL, but use the custom domain for production.
3. Bucket → **Settings → CORS policy → Add**, paste:
```json
[{
  "AllowedOrigins": ["https://cms.soilpassport.com"],
  "AllowedMethods": ["PUT", "GET", "HEAD"],
  "AllowedHeaders": ["Content-Type"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}]
```

### 3. Create an API token
R2 → **Manage R2 API Tokens → Create API token** → permission **Object Read & Write**, limited to the `soilpassport-media` bucket. Copy the **Access Key ID**, **Secret Access Key**, and your **Account ID** (shown on the R2 overview page). The secret is shown only once.

### 4. Give the keys to Supabase (never to GitHub or the website)
Supabase → **Edge Functions → Secrets** (or Project Settings → Edge Functions) → add:

| Name | Value |
|---|---|
| `R2_ACCOUNT_ID` | your Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | the access key ID |
| `R2_SECRET_ACCESS_KEY` | the secret access key |
| `R2_BUCKET` | `soilpassport-media` |
| `R2_PUBLIC_BASE_URL` | `https://media.soilpassport.com` |
| `ALLOWED_ORIGIN` | `https://cms.soilpassport.com` |

### 5. Deploy the functions
GitHub repo → Settings → Secrets → add `SUPABASE_ACCESS_TOKEN` (Supabase → Account → Access Tokens) and `SUPABASE_PROJECT_REF` (e.g. `luototmqgoqrhdhtyicy`). Then Actions → **Deploy Supabase functions** → Run workflow. This deploys `invite-user` and `media-r2`.

### 6. Rebuild the admin app
Actions → **Build admin app** → Run workflow, then upload the new `dist` files to the `cms.soilpassport.com` folder as before.

### Verification checklist
- [ ] Media Library → Upload a small JPG → it appears in the grid and opens at `https://media.soilpassport.com/uploads/…`.
- [ ] Uploading the same file again says it already exists (duplicate check).
- [ ] A `.exe` or `.svg` file is refused; a file over its size limit is refused (10 MB images, 150 MB video, 30 MB documents).
- [ ] An Editor can upload but cannot delete; a Content Manager can delete.
- [ ] Deleting a file that an article, page, event, album, video or document uses is refused with a message.
- [ ] Article → Featured image → Choose → picks from the library; Preview shows it.
- [ ] Publish an album, a video and a document and check gallery.html, videos.html and downloads.html on soilpassport.com.
- [ ] Browser developer tools → Network: no request sends the R2 secret; uploads go to `…r2.cloudflarestorage.com` with a signed address.

### Limits of this phase
- Only **public** files are supported. Restricted, internal and investor-only documents are blocked from publishing until a private bucket and signed downloads are added.
- SVG uploads are not allowed (they can contain scripts).
- Download counts are not tracked yet.
- Usage checks for delete look for the file address in articles, events, pages, speakers, videos, albums and document versions; other places (such as a link pasted into a rich-text article body) are not checked.
