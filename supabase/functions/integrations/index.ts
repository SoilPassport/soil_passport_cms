// Staff-only actions: status | crm_process | crm_retry | email_test. Requires a signed-in CMS user with the right permission.
// NOT YET TESTED against live Supabase, HubSpot or Resend.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/cors.ts';
import { render, sendEmail, stripTags } from '../_shared/email.ts';
import { processCrmJob } from '../_shared/pipeline.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const json = (b: unknown, s: number, h: Record<string, string>) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json' } });
const have = (keys: string[]) => ({ configured: keys.every(k => !!env(k)), missing: keys.filter(k => !env(k)) });

Deno.serve(async (req) => {
  const h = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, h);
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: me } = await asUser.auth.getUser(); if (!me.user) return json({ error: 'Not signed in' }, 401, h);
  const can = async (perm: string) => (await asUser.rpc('can', { perm })).data === true;
  let b: Record<string, unknown>; try { b = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400, h); }
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const a = String(b.action ?? '');

  if (a === 'status') {
    if (!(await can('settings.view')) && !(await can('crm.view')) && !(await can('email.view'))) return json({ error: 'Forbidden' }, 403, h);
    return json({ r2: have(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL']), turnstile: have(['TURNSTILE_SECRET_KEY', 'IP_HASH_SALT']), hubspot: have(['HUBSPOT_ACCESS_TOKEN']), email: have(['RESEND_API_KEY', 'EMAIL_FROM']), cors: have(['ALLOWED_ORIGIN']) }, 200, h);
  }
  if (a === 'crm_process' || a === 'crm_retry') {
    if (!(await can('crm.manage'))) return json({ error: 'Forbidden' }, 403, h);
    if (!env('HUBSPOT_ACCESS_TOKEN')) return json({ error: 'HubSpot is not configured (HUBSPOT_ACCESS_TOKEN missing).' }, 503, h);
    if (a === 'crm_retry') {
      const id = String(b.id ?? ''); await admin.from('crm_sync_jobs').update({ status: 'pending', attempts: 0, last_error: null }).eq('id', id);
      return json({ result: await processCrmJob(admin, id) }, 200, h);
    }
    const { data: jobs } = await admin.from('crm_sync_jobs').select('id').in('status', ['pending']).lte('next_attempt_at', new Date().toISOString()).order('created_at').limit(20);
    const out: Record<string, number> = { synced: 0, failed: 0, pending: 0 };
    for (const j of jobs ?? []) out[await processCrmJob(admin, j.id)]++;
    await admin.from('audit_logs').insert({ actor_id: me.user.id, actor_email: me.user.email ?? null, action: 'crm.process', entity_type: 'setting', details: out });
    return json({ processed: (jobs ?? []).length, ...out }, 200, h);
  }
  if (a === 'email_test') {
    if (!(await can('email.edit'))) return json({ error: 'Forbidden' }, 403, h);
    const key = String(b.template ?? 'internal_enquiry');
    const { data: t } = await admin.from('email_templates').select('subject,body_html,body_text').eq('key', key).maybeSingle();
    if (!t) return json({ error: 'Template not found' }, 404, h);
    const vars = { name: 'Test Person', email: me.user.email, organisation: 'Test Organisation', category: 'general', kind: 'contact', message: 'This is a test message.', event_title: 'Test Event', event_date: new Date().toUTCString(), admin_url: 'https://cms.soilpassport.com', confirm_link: 'https://soilpassport.com', unsubscribe_link: 'https://soilpassport.com' };
    const html = render(t.body_html, vars, true);
    const r = await sendEmail({ to: [me.user.email!], subject: '[TEST] ' + render(t.subject, vars, false), html, text: t.body_text ? render(t.body_text, vars, false) : stripTags(html) });
    if (!r.ok) return json({ error: r.error }, 502, h);
    return json({ ok: true, sent_to: me.user.email }, 200, h);
  }
  return json({ error: 'Unknown action' }, 400, h);
});
