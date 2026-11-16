// The list of settings a Super Admin can manage, and how each is validated. Pure (no Deno APIs).
export type Kind = 'text' | 'url' | 'email' | 'number' | 'select' | 'origins';
export interface Def { key: string; group: string; label: string; help?: string; secret?: boolean; kind: Kind; options?: string[]; placeholder?: string; min?: number; section?: string }
export const GROUPS: { key: string; label: string; help: string }[] = [
  { key: 'email', label: 'Email sending', help: 'How the system sends email: enquiry replies, reminders, approval alerts, access links and newsletters. Choose Resend (API key) or your own SMTP server.' },
  { key: 'crm', label: 'HubSpot', help: 'Contacts, notes and deals are pushed to HubSpot from a private app token.' },
  { key: 'eventbrite', label: 'Eventbrite', help: 'Connection details for Eventbrite. Events can already link to an Eventbrite page as an external registration. The details saved here are used by the connection test; importing events and attendees is not built yet.' },
  { key: 'storage', label: 'Cloudflare R2 (media buckets)', help: 'Where uploaded images, videos and documents are kept. Enter the Cloudflare account ID, an R2 API token key pair, and the bucket names. The private bucket holds restricted documents. After saving, the uploads and downloads use the new details within about 30 seconds.' },
  { key: 'security', label: 'Forms, links and background jobs', help: 'Spam protection for website forms, signing of email links, and the secret that protects the scheduled-jobs endpoint.' },
  { key: 'website', label: 'Website and admin addresses', help: 'Which web addresses may call the system and where links in emails point.' },
];
export const DEFS: Def[] = [
  { key: 'EMAIL_PROVIDER', group: 'email', section: 'Sender', label: 'Email provider', kind: 'select', options: ['resend', 'smtp'], help: 'Resend uses its web API. SMTP uses your own mail server.' },
  { key: 'EMAIL_FROM', group: 'email', label: 'From address', kind: 'email', placeholder: 'Soil Passport <hello@soilpassport.com>', help: 'Must be an address your provider is allowed to send from.' },
  { key: 'EMAIL_REPLY_TO', group: 'email', label: 'Reply-to address (optional)', kind: 'email', placeholder: 'hello@soilpassport.com', help: 'Where replies go if different from the From address.' },
  { key: 'RESEND_API_KEY', group: 'email', section: 'Resend (web API)', label: 'Resend API key', kind: 'text', secret: true, placeholder: 're_…' },
  { key: 'SMTP_HOST', group: 'email', section: 'Your own email server (SMTP, outgoing mail)', label: 'SMTP server', kind: 'text', placeholder: 'smtp.example.com' },
  { key: 'SMTP_PORT', group: 'email', label: 'SMTP port', kind: 'number', placeholder: '465', help: 'Usually 465 (SSL) or 587 (STARTTLS). Cloud hosts often block some SMTP ports; if the test fails with a connection error, try 465 or use Resend.' },
  { key: 'SMTP_SECURE', group: 'email', label: 'SMTP security', kind: 'select', options: ['ssl', 'starttls'], help: 'SSL = connection is encrypted from the start (port 465). STARTTLS upgrades it (port 587).' },
  { key: 'SMTP_USER', group: 'email', label: 'SMTP username', kind: 'text' },
  { key: 'SMTP_PASSWORD', group: 'email', label: 'SMTP password', kind: 'text', secret: true },
  { key: 'HUBSPOT_ACCESS_TOKEN', group: 'crm', label: 'Private app access token', kind: 'text', secret: true, placeholder: 'pat-…', help: 'HubSpot → Settings → Integrations → Private Apps. Scopes: contacts read/write, and deals read/write if you use deals.' },
  { key: 'HUBSPOT_DEAL_PIPELINE', group: 'crm', label: 'Deal pipeline ID', kind: 'text', help: 'Leave empty to disable deals.' },
  { key: 'HUBSPOT_DEAL_STAGE', group: 'crm', label: 'Deal stage ID', kind: 'text' },
  { key: 'HUBSPOT_DEAL_KINDS', group: 'crm', label: 'Create deals for', kind: 'text', placeholder: 'investment', help: 'Comma separated: investment, partnership, contact, demo.' },
  { key: 'EVENTBRITE_PRIVATE_TOKEN', group: 'eventbrite', label: 'Private token', kind: 'text', secret: true, help: 'Eventbrite → Account settings → Developer links → API keys → Private token.' },
  { key: 'EVENTBRITE_ORGANIZATION_ID', group: 'eventbrite', label: 'Organization ID', kind: 'text', placeholder: 'digits only', help: 'Shown in the Eventbrite API response for your organization. The connection test lists the organizations your token can see.' },
  { key: 'R2_ACCOUNT_ID', group: 'storage', label: 'Cloudflare account ID', kind: 'text', placeholder: '32 characters' },
  { key: 'R2_ACCESS_KEY_ID', group: 'storage', label: 'R2 access key ID', kind: 'text', secret: true },
  { key: 'R2_SECRET_ACCESS_KEY', group: 'storage', label: 'R2 secret access key', kind: 'text', secret: true },
  { key: 'R2_BUCKET', group: 'storage', label: 'Public bucket name', kind: 'text', placeholder: 'soilpassport-media' },
  { key: 'R2_PUBLIC_BASE_URL', group: 'storage', label: 'Public files address', kind: 'url', placeholder: 'https://media.soilpassport.com' },
  { key: 'R2_ENDPOINT', group: 'storage', label: 'Custom R2 endpoint (optional)', kind: 'url', placeholder: 'https://<account>.eu.r2.cloudflarestorage.com', help: 'Leave empty normally. Only for buckets created with an EU or FedRAMP jurisdiction, where Cloudflare gives a different address.' },
  { key: 'R2_PRIVATE_BUCKET', group: 'storage', label: 'Private bucket name', kind: 'text', placeholder: 'soilpassport-private', help: 'For restricted documents. Must have public access turned off.' },
  { key: 'TURNSTILE_SECRET_KEY', group: 'security', label: 'Turnstile secret key', kind: 'text', secret: true, help: 'The matching public site key is set in the website file assets/cms-config.js.' },
  { key: 'IP_HASH_SALT', group: 'security', label: 'Signing secret', kind: 'text', secret: true, help: 'A long random string (16+ characters). Hashes visitor IPs and signs unsubscribe links. Changing it breaks unsubscribe links in emails already sent.' },
  { key: 'CRON_SECRET', group: 'security', label: 'Scheduled jobs secret', kind: 'text', secret: true, help: '24+ characters. Must match the CRON_SECRET in GitHub (or in your pg_cron job).' },
  { key: 'PUBLIC_SITE_ORIGINS', group: 'website', label: 'Website addresses', kind: 'origins', placeholder: 'https://soilpassport.com, https://www.soilpassport.com', help: 'Websites allowed to submit forms and send page views. Comma separated.' },
  { key: 'ALLOWED_ORIGIN', group: 'website', label: 'Admin address', kind: 'origins', placeholder: 'https://cms.soilpassport.com', help: 'The admin site allowed to call the system from a browser.' },
  { key: 'ADMIN_URL', group: 'website', label: 'Admin address for email links', kind: 'url', placeholder: 'https://cms.soilpassport.com' },
];
export const BOOTSTRAP_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CONFIG_ENCRYPTION_KEY'];
export const defOf = (k: string) => DEFS.find(d => d.key === k);

const CTRL = /[\u0000-\u001f\u007f]/;
export function validateValue(key: string, raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const d = defOf(key); if (!d) return { ok: false, error: `Unknown setting ${key}.` };
  if (typeof raw !== 'string') return { ok: false, error: `${d.label}: enter text.` };
  const v = raw.trim(); const bad = (m: string) => ({ ok: false as const, error: `${d.label}: ${m}` });
  if (!v) return bad('value is empty. Use Clear to remove a setting.');
  if (v.length > 500) return bad('too long.'); if (CTRL.test(v)) return bad('contains control characters.');
  const httpsUrl = (s: string) => { try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password && !!u.hostname; } catch { return false; } };
  if (d.kind === 'url') { if (!httpsUrl(v)) return bad('enter a full https:// address.'); return { ok: true, value: v.replace(/\/+$/, '') }; }
  if (d.kind === 'origins') {
    const parts = v.split(',').map(s => s.trim()).filter(Boolean);
    for (const p of parts) { if (!httpsUrl(p)) return bad(`"${p}" is not an https:// address.`); const u = new URL(p); if (u.pathname !== '/' || u.search || u.hash) return bad(`"${p}" must be just the site address, with no path.`); }
    if (!parts.length) return bad('enter at least one address.');
    if (key === 'ALLOWED_ORIGIN' && parts.length > 1) return bad('enter one address.');
    return { ok: true, value: parts.map(p => new URL(p).origin).join(',') };
  }
  if (d.kind === 'email') { const m = /^(?:[^<>\r\n"]{1,100}\s)?<?([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)>?$/.exec(v); if (!m || (v.includes('<') !== v.includes('>'))) return bad('enter an address like hello@example.com or Name <hello@example.com>.'); return { ok: true, value: v }; }
  if (d.kind === 'number') { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 65535) return bad('enter a port between 1 and 65535.'); return { ok: true, value: String(n) }; }
  if (d.kind === 'select') { const s = v.toLowerCase(); if (!d.options!.includes(s)) return bad(`choose one of: ${d.options!.join(', ')}.`); return { ok: true, value: s }; }
  // text with per-key rules
  if (key === 'R2_ACCOUNT_ID' && !/^[a-f0-9]{32}$/i.test(v)) return bad('should be 32 letters and numbers (a-f, 0-9).');
  if ((key === 'R2_BUCKET' || key === 'R2_PRIVATE_BUCKET') && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(v)) return bad('use lowercase letters, numbers and hyphens (3 to 63 characters).');
  if (key === 'EVENTBRITE_ORGANIZATION_ID' && !/^\d{4,20}$/.test(v)) return bad('digits only.');
  if (key === 'SMTP_HOST' && !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(v)) return bad('enter a server name such as smtp.example.com.');
  if (key === 'IP_HASH_SALT' && v.length < 16) return bad('use at least 16 characters.');
  if (key === 'CRON_SECRET' && v.length < 24) return bad('use at least 24 characters.');
  if (key === 'HUBSPOT_DEAL_KINDS') { const ks = v.split(',').map(s => s.trim().toLowerCase()).filter(Boolean); if (!ks.length || ks.some(k => !['investment', 'partnership', 'contact', 'demo'].includes(k))) return bad('use: investment, partnership, contact, demo.'); return { ok: true, value: ks.join(',') }; }
  if (/\s/.test(v) && (d.secret || key.endsWith('_ID') || key.includes('PIPELINE') || key.includes('STAGE'))) return bad('must not contain spaces.');
  return { ok: true, value: v };
}
export const hintOf = (v: string) => v.length >= 16 ? '••••' + v.slice(-4) : '••••';
