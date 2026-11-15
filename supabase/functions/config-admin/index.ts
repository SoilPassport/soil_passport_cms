// Super-Admin-only settings API for the admin panel: get | save | test.
//  - Secrets are encrypted before storage and are NEVER returned (only "is set", a short hint and the update time).
//  - Needs the CONFIG_ENCRYPTION_KEY Edge Function secret (32+ characters) before any secret can be saved.
// NOT YET TESTED against a live Supabase project.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';
import { corsHeaders } from '../_shared/cors.ts';
import { bustConfig, env, loadConfig, sourceOf } from '../_shared/config.ts';
import { DEFS, GROUPS, defOf, hintOf, validateValue } from '../_shared/config-registry.ts';
import { encryptSecret } from '../_shared/secretbox.ts';
import { render, sendEmail } from '../_shared/email.ts';

const json = (b: unknown, s: number, h: Record<string, string>) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const masterOk = () => env('CONFIG_ENCRYPTION_KEY').length >= 32;

Deno.serve(async (req) => {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  await loadConfig(admin);
  const h = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, h);
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: me } = await asUser.auth.getUser(); if (!me.user) return json({ error: 'Not signed in' }, 401, h);
  if ((await asUser.rpc('is_super_admin')).data !== true) return json({ error: 'Only a Super Admin can view or change these settings.' }, 403, h);
  let b: Record<string, unknown>; try { b = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400, h); }
  const a = String(b.action ?? '');
  const audit = (action: string, details: Record<string, unknown>) => admin.from('audit_logs').insert({ actor_id: me.user!.id, actor_email: me.user!.email ?? null, action, entity_type: 'setting', details });

  if (a === 'get') {
    await loadConfig(admin, true);
    const { data: rows, error } = await admin.from('app_config').select('key,value,is_secret,hint,updated_at');
    if (error) return json({ error: 'Could not read settings. Has migration 0008 been run?' }, 500, h);
    const by = new Map((rows ?? []).map(r => [r.key, r]));
    return json({
      encryption: { configured: masterOk() },
      groups: GROUPS.map(g => ({ ...g, fields: DEFS.filter(d => d.group === g.key).map(d => {
        const r = by.get(d.key); const src = r ? 'database' : sourceOf(d.key);
        return { key: d.key, label: d.label, help: d.help ?? null, secret: !!d.secret, kind: d.kind, options: d.options ?? null, placeholder: d.placeholder ?? null, source: src,
          value: d.secret ? null : (r ? r.value : null), isSet: !!r || src === 'environment', hint: d.secret && r ? r.hint : null, updated_at: r?.updated_at ?? null, unreadable: !!(r?.is_secret && sourceOf(d.key) !== 'database') };
      }) })),
    }, 200, h);
  }

  if (a === 'save') {
    const values = (b.values && typeof b.values === 'object' ? b.values : {}) as Record<string, unknown>; const clear = Array.isArray(b.clear) ? b.clear.map(String) : [];
    if (Object.keys(values).length + clear.length > 40) return json({ error: 'Too many changes at once.' }, 400, h);
    const errors: string[] = []; const ready: { key: string; value: string; secret: boolean }[] = [];
    for (const [k, v] of Object.entries(values)) { const d = defOf(k); if (!d) { errors.push(`Unknown setting ${k}.`); continue; } const r = validateValue(k, v); if (!r.ok) errors.push(r.error); else ready.push({ key: k, value: r.value, secret: !!d.secret }); }
    for (const k of clear) if (!defOf(k)) errors.push(`Unknown setting ${k}.`);
    if (ready.some(x => x.secret) && !masterOk()) errors.push('Secrets cannot be saved yet: set the CONFIG_ENCRYPTION_KEY secret in Supabase (32+ random characters) first.');
    if (errors.length) return json({ error: errors.join(' ') }, 400, h);
    for (const x of ready) {
      const stored = x.secret ? await encryptSecret(x.value, env('CONFIG_ENCRYPTION_KEY'), x.key) : x.value;
      const { error } = await admin.from('app_config').upsert({ key: x.key, value: stored, is_secret: x.secret, hint: x.secret ? hintOf(x.value) : null, updated_by: me.user.id, updated_at: new Date().toISOString() });
      if (error) return json({ error: `Could not save ${x.key}.` }, 500, h);
    }
    if (clear.length) { const { error } = await admin.from('app_config').delete().in('key', clear); if (error) return json({ error: 'Could not clear settings.' }, 500, h); }
    await audit('config.updated', { changed: ready.map(x => x.key), cleared: clear });   // key names only, never values
    bustConfig(); await loadConfig(admin, true);
    return json({ ok: true, changed: ready.length, cleared: clear.length }, 200, h);
  }

  if (a === 'test') {
    const t = String(b.target ?? ''); const ok = (message: string) => json({ ok: true, message }, 200, h); const no = (message: string) => json({ ok: false, message }, 200, h);
    try {
      if (t === 'email') {
        const r = await sendEmail({ to: [me.user.email!], subject: '[TEST] Soil Passport email settings', html: render('<p>This test email confirms your email settings work. Provider: {{p}}.</p>', { p: env('EMAIL_PROVIDER') || 'resend' }, true) });
        return r.ok ? ok(`Test email sent to ${me.user.email}. Check the inbox (and spam).`) : no(r.error ?? 'Sending failed.');
      }
      if (t === 'hubspot') {
        if (!env('HUBSPOT_ACCESS_TOKEN')) return no('No HubSpot token is set.');
        const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', { headers: { Authorization: `Bearer ${env('HUBSPOT_ACCESS_TOKEN')}` } });
        if (r.ok) return ok('HubSpot accepted the token and contacts can be read.');
        return no(r.status === 401 ? 'HubSpot rejected the token (401). Check it was copied in full.' : r.status === 403 ? 'The token is valid but lacks contact permissions (403). Add the contacts scopes to the private app.' : `HubSpot returned ${r.status}.`);
      }
      if (t === 'eventbrite') {
        if (!env('EVENTBRITE_PRIVATE_TOKEN')) return no('No Eventbrite token is set.');
        const r = await fetch('https://www.eventbriteapi.com/v3/users/me/organizations/', { headers: { Authorization: `Bearer ${env('EVENTBRITE_PRIVATE_TOKEN')}` } });
        if (!r.ok) return no(r.status === 401 ? 'Eventbrite rejected the token (401).' : `Eventbrite returned ${r.status}.`);
        const orgs = ((await r.json()).organizations ?? []) as { id: string; name: string }[];
        const want = env('EVENTBRITE_ORGANIZATION_ID');
        if (want && !orgs.some(o => o.id === want)) return no(`The token works, but organization ${want} is not one it can see. Available: ${orgs.map(o => `${o.name} (${o.id})`).join(', ') || 'none'}.`);
        return ok(`Eventbrite accepted the token. Organizations: ${orgs.map(o => `${o.name} (${o.id})`).join(', ') || 'none'}.`);
      }
      if (t === 'r2' || t === 'r2_private') {
        const bucket = env(t === 'r2' ? 'R2_BUCKET' : 'R2_PRIVATE_BUCKET'); const miss = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter(k => !env(k));
        if (miss.length || !bucket) return no(`Missing: ${[...miss, ...(bucket ? [] : [t === 'r2' ? 'R2_BUCKET' : 'R2_PRIVATE_BUCKET'])].join(', ')}.`);
        const r2 = new AwsClient({ accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY'), service: 's3', region: 'auto' });
        const r = await r2.fetch(`https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${bucket}?list-type=2&max-keys=1`);
        if (r.ok) return ok(`Connected to bucket "${bucket}".`);
        return no(r.status === 403 ? 'Cloudflare rejected the keys, or they do not cover this bucket (403).' : r.status === 404 ? `Bucket "${bucket}" was not found (404). Check the name and account ID.` : `Cloudflare returned ${r.status}.`);
      }
    } catch (e) { return no('Could not complete the test: ' + String((e as Error).message ?? e).slice(0, 160)); }
    return json({ error: 'Unknown test' }, 400, h);
  }
  return json({ error: 'Unknown action' }, 400, h);
});
