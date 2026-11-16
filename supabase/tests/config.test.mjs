// Run: node --experimental-strip-types supabase/tests/config.test.mjs
import assert from 'node:assert/strict';
import { encryptSecret, decryptSecret } from '../functions/_shared/secretbox.ts';
import { validateValue, DEFS, GROUPS, hintOf } from '../functions/_shared/config-registry.ts';
import { loadConfig, env, sourceOf, bustConfig } from '../functions/_shared/config.ts';
import { sendEmail } from '../functions/_shared/email.ts';

const MASTER = 'm'.repeat(40);
// secret box
const box = await encryptSecret('hunter2-secret', MASTER, 'SMTP_PASSWORD');
assert.ok(box.startsWith('v1.') && !box.includes('hunter2'));
assert.equal(await decryptSecret(box, MASTER, 'SMTP_PASSWORD'), 'hunter2-secret');
await assert.rejects(decryptSecret(box, 'x'.repeat(40), 'SMTP_PASSWORD'), 'wrong key must fail');
await assert.rejects(decryptSecret(box, MASTER, 'RESEND_API_KEY'), 'row swapped to another key must fail');
await assert.rejects(encryptSecret('a', 'short', 'K'), 'short master rejected');
assert.notEqual(await encryptSecret('same', MASTER, 'K'), await encryptSecret('same', MASTER, 'K'), 'random IV');

// registry sanity
assert.equal(new Set(DEFS.map(d => d.key)).size, DEFS.length);
for (const d of DEFS) assert.ok(GROUPS.some(g => g.key === d.group), d.key);
for (const k of ['RESEND_API_KEY', 'SMTP_PASSWORD', 'HUBSPOT_ACCESS_TOKEN', 'EVENTBRITE_PRIVATE_TOKEN', 'R2_SECRET_ACCESS_KEY', 'R2_ACCESS_KEY_ID', 'TURNSTILE_SECRET_KEY', 'IP_HASH_SALT', 'CRON_SECRET']) assert.ok(DEFS.find(d => d.key === k).secret, k + ' must be secret');
// validation
const v = (k, x) => validateValue(k, x);
assert.deepEqual(v('SMTP_PORT', '465'), { ok: true, value: '465' }); assert.equal(v('SMTP_PORT', '0').ok, false); assert.equal(v('SMTP_PORT', 'abc').ok, false); assert.equal(v('SMTP_PORT', '70000').ok, false);
assert.equal(v('EMAIL_PROVIDER', 'SMTP').value, 'smtp'); assert.equal(v('EMAIL_PROVIDER', 'gmail').ok, false);
assert.equal(v('EMAIL_FROM', 'Soil Passport <hello@soilpassport.com>').ok, true); assert.equal(v('EMAIL_FROM', 'hello@soilpassport.com').ok, true); assert.equal(v('EMAIL_FROM', 'not an email').ok, false); assert.equal(v('EMAIL_FROM', 'A <b@c.de').ok, false);
assert.equal(v('R2_PUBLIC_BASE_URL', 'https://media.soilpassport.com/').value, 'https://media.soilpassport.com'); assert.equal(v('R2_PUBLIC_BASE_URL', 'http://x.test').ok, false); assert.equal(v('R2_PUBLIC_BASE_URL', 'https://u:p@x.test').ok, false); assert.equal(v('R2_PUBLIC_BASE_URL', 'javascript:alert(1)').ok, false);
assert.equal(v('PUBLIC_SITE_ORIGINS', 'https://soilpassport.com, https://www.soilpassport.com/').value, 'https://soilpassport.com,https://www.soilpassport.com'); assert.equal(v('PUBLIC_SITE_ORIGINS', 'https://a.test/path').ok, false); assert.equal(v('ALLOWED_ORIGIN', 'https://a.test,https://b.test').ok, false);
assert.equal(v('R2_ACCOUNT_ID', 'a'.repeat(32)).ok, true); assert.equal(v('R2_ACCOUNT_ID', 'zz').ok, false); assert.equal(v('R2_BUCKET', 'My Bucket').ok, false); assert.equal(v('R2_BUCKET', 'soilpassport-media').ok, true);
assert.equal(v('IP_HASH_SALT', 'short').ok, false); assert.equal(v('CRON_SECRET', 'x'.repeat(23)).ok, false); assert.equal(v('CRON_SECRET', 'x'.repeat(24)).ok, true);
assert.equal(v('HUBSPOT_DEAL_KINDS', 'Investment, partnership').value, 'investment,partnership'); assert.equal(v('HUBSPOT_DEAL_KINDS', 'sales').ok, false);
assert.equal(v('EVENTBRITE_ORGANIZATION_ID', '123456789').ok, true); assert.equal(v('EVENTBRITE_ORGANIZATION_ID', '12ab').ok, false);
assert.equal(v('HUBSPOT_ACCESS_TOKEN', 'pat na1 x').ok, false); assert.equal(v('HUBSPOT_ACCESS_TOKEN', 'pat-na1-abc').ok, true);
assert.equal(v('SMTP_HOST', 'smtp.example.com').ok, true); assert.equal(v('SMTP_HOST', 'smtp.example.com; rm -rf').ok, false);
assert.equal(v('NOPE', 'x').ok, false); assert.equal(v('SMTP_USER', '').ok, false); assert.equal(v('SMTP_USER', 'a\nb').ok, false); assert.equal(v('SMTP_USER', 'x'.repeat(501)).ok, false); assert.equal(v('SMTP_USER', 5).ok, false);
assert.equal(hintOf('abcdefghijklmnopqrst'), '••••qrst'); assert.equal(hintOf('short'), '••••');

// loader: database overrides environment; bootstrap keys never come from the database; unreadable rows are ignored
const envs = { RESEND_API_KEY: 'from-env', SMTP_HOST: 'env-host', SUPABASE_URL: 'https://real', CONFIG_ENCRYPTION_KEY: MASTER };
globalThis.Deno = { env: { get: k => envs[k] } };
const rows = [
  { key: 'SMTP_HOST', value: 'db-host', is_secret: false },
  { key: 'RESEND_API_KEY', value: await encryptSecret('db-resend', MASTER, 'RESEND_API_KEY'), is_secret: true },
  { key: 'SUPABASE_URL', value: 'https://attacker', is_secret: false },
  { key: 'HUBSPOT_ACCESS_TOKEN', value: await encryptSecret('tok', 'y'.repeat(40), 'HUBSPOT_ACCESS_TOKEN'), is_secret: true },
];
let fail = false;
const fake = { from: () => ({ select: async () => fail ? { data: null, error: { message: 'boom' } } : { data: rows, error: null } }) };
bustConfig(); await loadConfig(fake, true);
assert.equal(env('SMTP_HOST'), 'db-host'); assert.equal(env('RESEND_API_KEY'), 'db-resend'); assert.equal(env('SUPABASE_URL'), 'https://real');
assert.equal(env('HUBSPOT_ACCESS_TOKEN'), '', 'undecryptable row ignored'); assert.equal(sourceOf('SMTP_HOST'), 'database'); assert.equal(sourceOf('HUBSPOT_ACCESS_TOKEN'), 'unset'); assert.equal(sourceOf('SUPABASE_URL'), 'environment');
rows.length = 0; bustConfig(); await loadConfig(fake, true);
assert.equal(env('SMTP_HOST'), 'env-host', 'cleared value falls back to environment'); assert.equal(sourceOf('SMTP_HOST'), 'environment');
fail = true; bustConfig(); await loadConfig(fake, true); assert.equal(env('RESEND_API_KEY'), 'from-env', 'database failure falls back to environment');

// provider selection
delete envs.RESEND_API_KEY; delete envs.SMTP_HOST; bustConfig(); await loadConfig({ from: () => ({ select: async () => ({ data: [], error: null }) }) }, true);
assert.match((await sendEmail({ to: ['a@b.test'], subject: 'S', html: '<p>x</p>' })).error, /not configured/);
envs.EMAIL_PROVIDER = 'smtp'; assert.match((await sendEmail({ to: ['a@b.test'], subject: 'S', html: '<p>x</p>' })).error, /SMTP is not configured/);
// Cloudflare R2 endpoint
import { validateValue as vv } from '../functions/_shared/config-registry.ts';
assert.equal(vv('R2_ENDPOINT', 'https://abc.eu.r2.cloudflarestorage.com/').value, 'https://abc.eu.r2.cloudflarestorage.com');
assert.equal(vv('R2_ENDPOINT', 'http://x.test').ok, false, 'endpoint must be https');
{ const { r2Host } = await import('../functions/_shared/config.ts'); bustConfig(); await loadConfig({ from: () => ({ select: async () => ({ data: [], error: null }) }) }, true);
  envs.R2_ACCOUNT_ID = 'a'.repeat(32); delete envs.R2_ENDPOINT; assert.equal(r2Host(), `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`);
  await loadConfig({ from: () => ({ select: async () => ({ data: [{ key: 'R2_ENDPOINT', value: 'https://z.eu.r2.cloudflarestorage.com', is_secret: false }], error: null }) }) }, true);
  assert.equal(r2Host(), 'https://z.eu.r2.cloudflarestorage.com', 'saved endpoint wins'); }
assert.equal(validateValue('SITE_PUBLISHABLE_KEY', 'sb_publishable_abcdefghijklmnopqrstuv').ok, true);
assert.equal(validateValue('SITE_PUBLISHABLE_KEY', 'sb_secret_abcdefghijklmnopqrstuv').ok, false, 'secret key refused');
assert.equal(validateValue('SITE_PUBLISHABLE_KEY', 'hello').ok, false);
assert.equal(validateValue('TURNSTILE_SITE_KEY', '0x4AAAAAAABkMYinukE8nzYS').ok, true);
assert.equal(validateValue('TURNSTILE_SITE_KEY', 'not a key').ok, false);
console.log('config tests OK');
