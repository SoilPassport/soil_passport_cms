// Staff-only actions: status | crm_process | crm_retry | email_test | run_scheduled | doc_grant | doc_open | newsletter_test | newsletter_send | newsletter_process | newsletter_cancel. Requires a signed-in CMS user with the right permission.
// NOT YET TESTED against live Supabase, HubSpot or Resend.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';
import { corsHeaders } from '../_shared/cors.ts';
import { render, sendEmail, stripTags } from '../_shared/email.ts';
import { processCrmJob, sendTemplate } from '../_shared/pipeline.ts';
import { cancelCampaign, processCampaigns, runAll, startCampaign, unsubUrl } from '../_shared/jobs.ts';
import { buildNewsletter } from '../_shared/newsletter.ts';
import { randomToken, sha256Hex } from '../_shared/crypto.ts';

import { env, loadConfig, r2Host } from '../_shared/config.ts';
const json = (b: unknown, s: number, h: Record<string, string>) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json' } });
const have = (keys: string[]) => ({ configured: keys.every(k => !!env(k)), missing: keys.filter(k => !env(k)) });

Deno.serve(async (req) => {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  await loadConfig(admin);
  const h = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, h);
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: me } = await asUser.auth.getUser(); if (!me.user) return json({ error: 'Not signed in' }, 401, h);
  const can = async (perm: string) => (await asUser.rpc('can', { perm })).data === true;
  let b: Record<string, unknown>; try { b = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400, h); }
  const a = String(b.action ?? '');

  if (a === 'status') {
    if (!(await can('settings.view')) && !(await can('crm.view')) && !(await can('email.view'))) return json({ error: 'Forbidden' }, 403, h);
    return json({ r2: have(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL']), turnstile: have(['TURNSTILE_SECRET_KEY', 'IP_HASH_SALT']), hubspot: have(['HUBSPOT_ACCESS_TOKEN']), email: (env('EMAIL_PROVIDER') || (env('RESEND_API_KEY') ? 'resend' : env('SMTP_HOST') ? 'smtp' : 'resend')) === 'smtp' ? have(['SMTP_HOST', 'EMAIL_FROM']) : have(['RESEND_API_KEY', 'EMAIL_FROM']), cors: have(['ALLOWED_ORIGIN']), r2_private: have(['R2_PRIVATE_BUCKET']), cron: have(['CRON_SECRET']), hubspot_deals: have(['HUBSPOT_DEAL_PIPELINE', 'HUBSPOT_DEAL_STAGE']), eventbrite: have(['EVENTBRITE_PRIVATE_TOKEN']) }, 200, h);
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

  if (a === 'run_scheduled') {
    if (!(await can('settings.manage'))) return json({ error: 'Forbidden' }, 403, h);
    const r = await runAll(admin);
    await admin.from('audit_logs').insert({ actor_id: me.user.id, actor_email: me.user.email ?? null, action: 'jobs.run_now', entity_type: 'setting', details: r });
    return json(r, 200, h);
  }
  if (a === 'doc_grant') {
    if (!(await can('documents.grant'))) return json({ error: 'Forbidden' }, 403, h);
    const email = String(b.email ?? '').trim().toLowerCase(); const days = Math.min(90, Math.max(1, Math.round(Number(b.days) || 7))); const max = Math.min(50, Math.max(1, Math.round(Number(b.max_downloads) || 3)));
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 200) return json({ error: 'Enter a valid email address.' }, 400, h);
    const { data: d } = await admin.from('documents').select('id,title,status,access_level,current_version_id').eq('id', String(b.document_id ?? '')).maybeSingle();
    if (!d) return json({ error: 'Document not found.' }, 404, h);
    if (d.access_level === 'public') return json({ error: 'This document is public and needs no access link.' }, 400, h);
    if (d.status !== 'published' || !d.current_version_id) return json({ error: 'Publish the document (with a file) before sharing it.' }, 400, h);
    const token = randomToken(); const expires = new Date(Date.now() + days * 86400_000);
    const { data: g, error } = await admin.from('document_access_grants').insert({ document_id: d.id, email, token_hash: await sha256Hex(token), expires_at: expires.toISOString(), max_downloads: max, created_by: me.user.id }).select('id').single();
    if (error) return json({ error: 'Could not create the access link.' }, 500, h);
    const st = await sendTemplate(admin, 'document_access', [email], { name: String(b.name ?? '').slice(0, 100) || 'there', document_title: d.title, download_link: `${env('SUPABASE_URL')}/functions/v1/doc-download?t=${token}`, expires: expires.toUTCString(), max_downloads: max });
    if (st !== 'sent') { await admin.from('document_access_grants').update({ revoked_at: new Date().toISOString() }).eq('id', g.id); return json({ error: 'The email could not be sent, so the link was withdrawn. Check the Email Configuration page.' }, 502, h); }
    await admin.from('audit_logs').insert({ actor_id: me.user.id, actor_email: me.user.email ?? null, action: 'document.access_granted', entity_type: 'document', entity_id: d.id, details: { to: email, days, max } });
    return json({ ok: true }, 200, h);
  }
  if (a === 'doc_open') {
    // Staff view of a document's current file (works for private files too). Not counted as a public download.
    if (!(await can('documents.view'))) return json({ error: 'Forbidden' }, 403, h);
    const { data: d } = await admin.from('documents').select('id,title,current_version_id').eq('id', String(b.document_id ?? '')).maybeSingle();
    if (!d?.current_version_id) return json({ error: 'This document has no file yet.' }, 404, h);
    const { data: v } = await admin.from('document_versions').select('media_assets(filename,visibility,public_url,storage_bucket,storage_key)').eq('id', d.current_version_id).maybeSingle();
    const m = (v as unknown as { media_assets: { filename: string; visibility: string; public_url: string | null; storage_bucket: string; storage_key: string } | null } | null)?.media_assets;
    if (!m) return json({ error: 'File not found.' }, 404, h);
    if (m.visibility === 'public' && m.public_url) return json({ url: m.public_url }, 200, h);
    const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter(k => !env(k));
    if (need.length) return json({ error: 'Storage is not configured (missing: ' + need.join(', ') + ').' }, 503, h);
    const r2 = new AwsClient({ accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY'), service: 's3', region: 'auto' });
    const cd = encodeURIComponent(`attachment; filename="${m.filename.replace(/[^A-Za-z0-9._\-]/g, '_')}"`);
    const signed = await r2.sign(new Request(`${r2Host()}/${m.storage_bucket}/${m.storage_key}?X-Amz-Expires=300&response-content-disposition=${cd}`, { method: 'GET' }), { aws: { signQuery: true } });
    await admin.from('audit_logs').insert({ actor_id: me.user.id, actor_email: me.user.email ?? null, action: 'document.opened', entity_type: 'document', entity_id: d.id, details: { title: d.title } });
    return json({ url: signed.url }, 200, h);
  }
  if (a === 'newsletter_test' || a === 'newsletter_send' || a === 'newsletter_process' || a === 'newsletter_cancel') {
    if (!(await can('newsletter.send'))) return json({ error: 'Forbidden' }, 403, h);
    const id = String(b.id ?? '');
    try {
      if (a === 'newsletter_test') {
        const { data: c } = await admin.from('newsletter_campaigns').select('subject,preheader,body_html').eq('id', id).maybeSingle();
        if (!c) return json({ error: 'Campaign not found.' }, 404, h);
        if (!env('IP_HASH_SALT')) return json({ error: 'IP_HASH_SALT is not set.' }, 503, h);
        const u = await unsubUrl(me.user.email!); const m = buildNewsletter({ subject: c.subject, preheader: c.preheader, bodyHtml: c.body_html, unsubscribeUrl: u, postalName: 'Soil Passport' });
        const r = await sendEmail({ to: [me.user.email!], subject: '[TEST] ' + c.subject, html: m.html, text: m.text });
        if (!r.ok) return json({ error: r.error }, 502, h);
        return json({ ok: true, sent_to: me.user.email }, 200, h);
      }
      if (a === 'newsletter_send') {
        const r = await startCampaign(admin, id, me.user.id); const p = await processCampaigns(admin, 20);
        await admin.from('audit_logs').insert({ actor_id: me.user.id, actor_email: me.user.email ?? null, action: 'newsletter.send_started', entity_type: 'newsletter', entity_id: id, details: r });
        return json({ ...r, ...p }, 200, h);
      }
      if (a === 'newsletter_cancel') { await cancelCampaign(admin, id); await admin.from('audit_logs').insert({ actor_id: me.user.id, actor_email: me.user.email ?? null, action: 'newsletter.cancelled', entity_type: 'newsletter', entity_id: id }); return json({ ok: true }, 200, h); }
      return json(await processCampaigns(admin, 40), 200, h);
    } catch (e) { return json({ error: (e as Error).message }, 400, h); }
  }
  return json({ error: 'Unknown action' }, 400, h);
});
