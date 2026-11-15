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


---

# Phases 4, 5 and 6: forms, enquiries, email, HubSpot, reports

**None of this has been tested against live Turnstile, Resend, HubSpot or deployed functions.** Work through the checklist at the end and report anything that fails.

### 1. Database
Supabase → SQL Editor → run, in order, any not yet run: `0004_public_integration.sql`, `0005_media_library.sql`, `0006_forms_email_crm.sql`.

### 2. Turnstile (spam protection)
Cloudflare dashboard → Turnstile → Add widget → hostname `soilpassport.com` (and `www.soilpassport.com`). Copy the **site key** (public) and **secret key**.
- Site key → in the website folder edit `assets/cms-config.js`: `turnstileSiteKey`. Also paste your Supabase **publishable** key into `key`.
- Secret key → Supabase secret `TURNSTILE_SECRET_KEY`.

### 3. Email (Resend)
Create an account at resend.com, add and verify the sending domain (DNS records), create an API key.

### 4. HubSpot
HubSpot → Settings → Integrations → Private Apps → Create. Scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`. Copy the access token.

### 5. Supabase secrets (Project Settings → Edge Functions → Secrets)
| Name | Value |
|---|---|
| `TURNSTILE_SECRET_KEY` | Turnstile secret key |
| `IP_HASH_SALT` | a long random string (used to hash visitor IPs and sign newsletter links) |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | e.g. `Soil Passport <hello@soilpassport.com>` (domain must be verified in Resend) |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot private app token |
| `PUBLIC_SITE_ORIGINS` | optional, comma separated, e.g. `https://soilpassport.com,https://www.soilpassport.com` |

Plus the R2 secrets from Phase 3.

### 6. Deploy and publish
1. Actions → **Deploy Supabase functions** → Run (now deploys `integrations` and `submit-form`).
2. Actions → **Build admin app** → Run, upload the new files into the `cms.soilpassport.com` folder.
3. Upload the new website zip to `soilpassport.com`.
4. In the admin: **Email Configuration** → set the staff alert recipients; send a test email. **CRM Integration** and **System Configuration** show which secrets are set.

### Verification checklist
- [ ] System Configuration shows R2, Turnstile, HubSpot, Email as "Secrets present".
- [ ] contact.html: submit a test enquiry → it appears under Contact Enquiries; the sender gets an acknowledgement; staff recipients get an alert.
- [ ] Submitting with the consent box unticked is blocked; submitting 7 times in an hour is refused.
- [ ] partner-with-us.html and investor-enquiry.html create Partnership / Investment enquiries.
- [ ] Newsletter signup on news.html sends a confirmation email; clicking the link marks the subscriber confirmed.
- [ ] A native-registration event shows a form on events.html; registering sends a confirmation and respects capacity.
- [ ] CRM Integration shows the job as synced and the contact and note exist in HubSpot. Retry works on a failed job.
- [ ] Roadmap items publish to roadmap.html only after approval by someone with roadmap.approve.
- [ ] SEO Management generates sitemap.xml/robots.txt; Reports shows counts and exports CSV.

### Limits of these phases
- Not built: event reminder emails, content-approval notification emails, restricted/private downloads, download counts, sending newsletters (subscribers are collected and exported only), HubSpot deals and custom properties, visitor analytics.
- Sitemap and robots.txt are generated for download; they are not updated automatically.
- Articles, pages and events are rendered in the browser, so search engines that do not run JavaScript will not index them.
- Secret status only shows whether values are set, not whether they are valid.


---

# Phase 7: reminders, approval emails, restricted downloads, newsletters, HubSpot deals, analytics

**Untested against live services.** Work through the checklist and report anything that fails.

### 1. Database
Supabase → SQL Editor → run `0007_reminders_approvals_downloads_newsletter_analytics.sql` (after 0006). It adds two permissions, **Send newsletter campaigns** and **Give people access to restricted documents**. They are given to the Admin role automatically; Super Admins have everything. Give them to anyone else on the Roles & Permissions page.

### 2. Private storage bucket (restricted documents)
Cloudflare → R2 → Create bucket `soilpassport-private`. Leave **public access OFF** (no r2.dev address, no custom domain).
- Settings → CORS policy: same as your public bucket (allow `PUT` from `https://cms.soilpassport.com`, allowed headers `*`).
- Your R2 API token must have **Object Read & Write** on this bucket too (edit the token, or make a new one that covers both buckets and update the R2 secrets).

### 3. New Supabase secrets
| Name | Value |
|---|---|
| `R2_PRIVATE_BUCKET` | `soilpassport-private` |
| `CRON_SECRET` | a long random string (at least 24 characters) |
| `HUBSPOT_DEAL_PIPELINE` | optional: HubSpot pipeline ID for deals |
| `HUBSPOT_DEAL_STAGE` | optional: stage ID inside that pipeline |
| `HUBSPOT_DEAL_KINDS` | optional: `investment` (default) or `investment,partnership` |
| `ADMIN_URL` | optional, default `https://cms.soilpassport.com` (used in links inside emails) |

HubSpot deals: add the scopes `crm.objects.deals.read` and `crm.objects.deals.write` to your private app. Pipeline and stage IDs are in HubSpot → Settings → Objects → Deals → Pipelines (open a pipeline; the IDs are shown in the stage settings or use the CRM API). Deals are only created when both the pipeline and stage secrets are set.

### 4. Deploy and schedule
1. Actions → **Deploy Supabase functions** → Run (deploys all functions, including `doc-download`, `track` and `scheduled`).
2. Add GitHub repository secrets `SUPABASE_PROJECT_REF` (already added) and `CRON_SECRET` (same value as the Supabase secret).
3. Actions → **Scheduled jobs** → Run workflow once and check it succeeds. It then runs every 5 minutes. (GitHub can delay these runs; for exact timing use pg_cron instead: Supabase → Database → Extensions → enable `pg_cron` and `pg_net`, then run
   `select cron.schedule('sp-scheduled', '*/5 * * * *', $$ select net.http_post(url := 'https://YOUR_REF.supabase.co/functions/v1/scheduled', headers := jsonb_build_object('x-cron-secret', 'YOUR_CRON_SECRET')) $$);`. If you use this, disable the GitHub workflow.)
4. Run **Build admin app**, upload the new files to `cms.soilpassport.com`, then upload the new website zip (paste your keys into `assets/cms-config.js` again: the zip contains placeholders).

### What each feature does
- **Event reminders.** Events with native registration have a "Reminder email" setting (for example 24 hours before). The scheduled job emails each registrant once. Edit the wording under Email Configuration → "Event reminder to registrants".
- **Review and approval emails.** When an article, page, event or document moves to *Pending review*, everyone with the matching **approve** permission (and Super Admins) is emailed. When a reviewer approves, publishes or returns it to draft, the author is emailed. Wording: "Content review and approval alert".
- **Restricted documents.** In Document Management set Access to Restricted, Investor only or Internal and upload the file with **Upload private file**. These are never listed on the website. For Restricted and Investor only, **Access links** emails a personal link that expires and has a download limit. Staff can use **Open current file**.
- **Download counts.** The website downloads page now goes through the counter, so each download is counted and shown in Document Management and under Reports.
- **Newsletter campaigns.** Newsletter → Campaigns: write, **Send test to me**, then **Send**. Only confirmed subscribers receive it, each with their own unsubscribe link. Sending runs in batches (about 40 every 5 minutes); use **Send next batch now** to go faster, or **Stop sending**.
- **HubSpot deals.** Investment enquiries (and partnership if enabled) also create a Deal linked to the contact, with the investor type and interest in the description.
- **Visitor analytics.** The website counts page views without cookies. See Reports & Analytics → Website traffic.

### Verification checklist
- [ ] System Configuration shows R2 private bucket, Scheduled jobs secret (and HubSpot deals if you set them) as present. "Run background jobs now" returns a result without errors.
- [ ] Event with native registration and a 1-hour reminder: register with your own email, set the event to start within the hour; run the jobs; the reminder arrives once, not twice.
- [ ] Submit an article for review as an Editor: approvers get an email. Approve it: the author gets an email.
- [ ] Upload a private file to a new Investor-only document, publish it, confirm it is **not** on downloads.html. Email yourself an access link: it downloads once per use and stops after the limit, after expiry, or after Withdraw.
- [ ] Download a public document from downloads.html: its download count goes up by one.
- [ ] Newsletter: **Send test to me** arrives with a working unsubscribe link. Send a real campaign to a small test list first.
- [ ] Submit a test investor enquiry: a Deal appears in HubSpot linked to the contact.
- [ ] Visit a few website pages, then Reports shows page views. With your browser's Do Not Track on, nothing is counted.

### Limits of this phase
- Reminders: one reminder per registration, at the time set on the event. No reminder when registration is external.
- Approval emails cover articles, pages, events and documents (not roadmap, galleries or videos). Approvers cannot opt out per person.
- Access links can be forwarded by the recipient, and some email security scanners open links and use up a download. A downloaded file can be shared; there is no watermarking. "Internal" documents are staff only and have no links.
- Newsletters: no open or click tracking, no segments, no scheduling for a future time, no automatic bounce handling (mark bounces manually in Subscribers). Throughput is about 480 emails per hour on the 5-minute schedule.
- HubSpot deals are created once per enquiry, with a fixed pipeline and stage. They are not updated afterwards and carry no amount.
- Analytics: page views only (no events, goals or funnels). Bots are filtered by browser name only, and anyone can send fake traffic. Country comes from the network header and may be blank. Data is kept 400 days. Privacy Policy wording was updated; have it reviewed for your own legal needs.


---

# Phase 8: Integration Settings (Super Admin), vouchers, new admin layout

**Untested against live services.**

### 1. Database
Run `0008_app_config.sql` and then `0009_vouchers.sql` in the Supabase SQL Editor.

### 2. One secret that must stay in Supabase
Supabase → Edge Functions → Secrets → add `CONFIG_ENCRYPTION_KEY`: 32 or more random characters. It encrypts every secret saved from the admin panel (API keys, passwords, tokens). **Keep a copy in a password manager.** If it is lost or changed, saved secrets cannot be read and must be entered again. The Supabase URL and service key are also provided by Supabase and are not managed in the panel.

### 3. Deploy and rebuild
Actions → **Deploy Supabase functions** (now includes `config-admin`) → **Build admin app** → upload the new files into the `cms.soilpassport.com` folder → upload the new website zip (re-paste your keys into `assets/cms-config.js`).

### 4. Using Integration Settings
Administration → **Integration Settings** (Super Admins only, and only with the MFA rule satisfied). Groups: Email sending (Resend or your own SMTP server), HubSpot, Eventbrite, Media storage (R2), Forms/links/background jobs, Website and admin addresses.
- A value saved here overrides the same setting in Supabase secrets. **Remove the saved value** falls back to the Supabase secret, if any. Changes apply within about 30 seconds.
- Secrets are write-only: once saved you only see "Saved here" and the last 4 characters of long ones. To change one, type the new value.
- Each group has test buttons (test email, HubSpot, Eventbrite, public and private R2 buckets). Save first, wait a few seconds, then test.
- Every change is written to the audit log with the setting names only, never the values.
- **SMTP:** choose provider "smtp", then server, port (465 with SSL, or 587 with STARTTLS), username, password and a From address. Cloud hosts often block some outbound SMTP ports and I could not confirm which ones Supabase allows; if the test fails with a connection error, try port 465, or use Resend.
- **Eventbrite:** the token and organization ID are stored and can be tested. Importing events or attendees from Eventbrite is not built; events still link out to an Eventbrite page as an external registration.

### 5. Voucher and coupon codes
Content → **Vouchers & Coupons**. Create a code (or press Generate), choose the benefit (access code, free place, percent off, amount off), which event it works for (or any), a maximum number of uses, and dates. On an event with registration on this website you can tick **Registration needs a voucher code** for invite-only events. The registration form on the website then shows a voucher field.
- Each email address can use a code once. Cancelling a registration gives the use back.
- Codes are validated and counted on the server. The registrant sees the benefit (for example "20% off"); it is saved on their registration, added to the HubSpot note, and available in the confirmation email as `{{benefit}}` and `{{voucher_code}}`.
- **No payment is taken.** Your team, or Eventbrite, must honour the discount. The system does not create discount codes inside Eventbrite.
- The code is checked when the form is submitted, and the message is deliberately the same whether a code is wrong, expired or used up.

### 6. New admin layout
Top menu groups (Overview, Content, Media, Enquiries, Integrations, Administration) with each group's pages and sub pages in the left sidebar, and a header and footer styled like soilpassport.com. On phones the menu opens from the header button.

### Verification checklist
- [ ] Integration Settings loads for a Super Admin and shows "Forbidden" for any other role.
- [ ] Save a non-secret setting (for example the From address); reload: the value shows with "Saved here".
- [ ] Without `CONFIG_ENCRYPTION_KEY`, saving a secret is refused with a clear message. With it, a saved secret never appears again.
- [ ] Email test sends to your address with Resend, then with SMTP.
- [ ] HubSpot, Eventbrite and R2 tests report success with valid details and a clear message with wrong ones.
- [ ] Create a code limited to 2 uses, register three different people on a native-registration event: the third is refused.
- [ ] An event that requires a code refuses registration without one.
