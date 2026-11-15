// Public form gateway: contact, demo, partnership, investment, event registration, newsletter.
// Called from soilpassport.com with the publishable key. Order of checks: size -> honeypot -> Turnstile -> rate limit -> validation -> save.
// The browser never writes to the database directly. NOT YET TESTED against live Supabase, Turnstile, Resend or HubSpot.
// Deploy with: supabase functions deploy submit-form --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { validate } from '../_shared/forms.ts';
import { notifyStaff, processCrmJob, sendTemplate } from '../_shared/pipeline.ts';

import { env, loadConfig } from '../_shared/config.ts';
const origins = () => (env('PUBLIC_SITE_ORIGINS') || 'https://soilpassport.com,https://www.soilpassport.com').split(',').map(s => s.trim());
const cors = (o: string | null) => ({ 'Access-Control-Allow-Origin': o && origins().includes(o) ? o : origins()[0], 'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', Vary: 'Origin' });
const json = (b: unknown, s: number, h: Record<string, string>) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json' } });
const enc = new TextEncoder();
async function hmac(msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(env('IP_HASH_SALT')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
const page = (t: string, body: string) => new Response(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${t}</title><body style="font:16px system-ui;max-width:480px;margin:15vh auto;padding:0 20px"><h1 style="font-size:22px">${t}</h1><p>${body}</p><p><a href="${origins()[0]}">Return to soilpassport.com</a></p>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
const later = (p: Promise<unknown>) => { const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime; if (rt?.waitUntil) rt.waitUntil(p.catch(() => { })); return rt?.waitUntil ? Promise.resolve() : p.catch(() => { }); };

Deno.serve(async (req) => {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  await loadConfig(admin);
  const c = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: c });
  const url = new URL(req.url);

  // Newsletter confirm / unsubscribe links (signed, so they cannot be guessed)
  if (req.method === 'GET') {
    const a = url.searchParams.get('a'), e = (url.searchParams.get('e') ?? '').toLowerCase(), t = url.searchParams.get('t') ?? '';
    if (!env('IP_HASH_SALT') || !['confirm', 'unsub'].includes(a ?? '') || !e || t !== (await hmac(`${a}:${e}`))) return page('Link not valid', 'This link is invalid or has expired.');
    if (a === 'confirm') { await admin.from('newsletter_subscribers').update({ status: 'subscribed', confirmed_at: new Date().toISOString() }).eq('email', e).eq('status', 'pending'); return page('Subscription confirmed', 'Thank you. You are now subscribed.'); }
    await admin.from('newsletter_subscribers').update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() }).eq('email', e);
    return page('Unsubscribed', 'You have been unsubscribed and will not receive further emails.');
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, c);

  if (!env('TURNSTILE_SECRET_KEY') || !env('IP_HASH_SALT')) return json({ error: 'Forms are not available yet. Please email us instead.' }, 503, c);
  const raw = await req.text();
  if (raw.length > 30000) return json({ error: 'Submission too large.' }, 413, c);
  let b: Record<string, unknown>; try { b = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400, c); }
  if (typeof b.website_url === 'string' && b.website_url) return json({ ok: true }, 200, c); // honeypot: pretend success

  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  const ts = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ secret: env('TURNSTILE_SECRET_KEY'), response: String(b.turnstile_token ?? ''), ...(ip ? { remoteip: ip } : {}) }) }).then(r => r.json()).catch(() => ({ success: false }));
  if (!ts.success) return json({ error: 'Spam check failed. Please refresh the page and try again.' }, 400, c);

  const kind = String(b.kind ?? '');
  const ipHash = await hmac('ip:' + ip);
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from('form_rate_limits').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since);
  if ((count ?? 0) >= 6) return json({ error: 'Too many submissions. Please try again later.' }, 429, c);
  await admin.from('form_rate_limits').insert({ ip_hash: ipHash, kind });

  const v = validate(kind, b); if (!v.ok) return json({ error: v.error }, 400, c);
  const f = v.value; const ua = (req.headers.get('user-agent') ?? '').slice(0, 300);
  const ok = (msg: string) => json({ ok: true, message: msg }, 200, c);

  if (f.kind === 'newsletter') {
    const { data: ex } = await admin.from('newsletter_subscribers').select('status').eq('email', f.email).maybeSingle();
    if (!ex) await admin.from('newsletter_subscribers').insert({ email: f.email, name: f.name ?? null, consent: true, source: f.source_page ?? null, status: 'pending' });
    if (!ex || ex.status === 'pending') {
      const base = `${env('SUPABASE_URL')}/functions/v1/submit-form`;
      const link = `${base}?a=confirm&e=${encodeURIComponent(f.email)}&t=${await hmac('confirm:' + f.email)}`;
      await later(sendTemplate(admin, 'newsletter_confirm', [f.email], { name: f.name ?? '', email: f.email, confirm_link: link, unsubscribe_link: `${base}?a=unsub&e=${encodeURIComponent(f.email)}&t=${await hmac('unsub:' + f.email)}` }));
    }
    return ok('Thanks. Please check your email to confirm your subscription.');
  }

  if (f.kind === 'event_registration') {
    const { data: ev } = await admin.from('events').select('id,title,starts_at,status,registration_mode,registration_closes_at,max_attendees,is_investor_event,require_voucher').eq('slug', f.event_slug!).maybeSingle();
    if (!ev || ev.status !== 'published' || ev.is_investor_event || ev.registration_mode !== 'native') return json({ error: 'Registration is not open for this event.' }, 400, c);
    if (ev.registration_closes_at && new Date(ev.registration_closes_at) < new Date()) return json({ error: 'Registration for this event has closed.' }, 400, c);
    if (ev.max_attendees) { const { count: n } = await admin.from('event_registrations').select('id', { count: 'exact', head: true }).eq('event_id', ev.id).neq('status', 'cancelled'); if ((n ?? 0) >= ev.max_attendees) return json({ error: 'Sorry, this event is full.' }, 400, c); }
    if (f.voucher_code) { const { data: okv } = await admin.rpc('check_voucher', { p_code: f.voucher_code, p_event: ev.id, p_email: f.email }); if (!okv) return json({ error: 'That voucher code is not valid for this event.' }, 400, c); }
    else if (ev.require_voucher) return json({ error: 'A voucher code is needed to register for this event.' }, 400, c);
    const { data: reg, error } = await admin.from('event_registrations').insert({ event_id: ev.id, name: f.name, email: f.email, organisation: f.organisation ?? null, job_title: f.job_title ?? null, country: f.country ?? null, interests: f.interests ?? [], consent: true, consent_text: 'Agreed to be contacted about this event', source: f.source_page ?? null }).select('id').single();
    if (error) { if (error.code === '23505') return ok('You are registered. Check your email for details.'); return json({ error: 'Could not save your registration. Please try again.' }, 500, c); }
    let benefit = '';
    if (f.voucher_code) {   // re-checked and counted atomically; if someone took the last use meanwhile, undo the registration
      const { data: b, error: ve } = await admin.rpc('redeem_voucher', { p_code: f.voucher_code, p_event: ev.id, p_email: f.email, p_registration: reg.id });
      if (ve || !b) { await admin.from('event_registrations').delete().eq('id', reg.id); return json({ error: 'That voucher code is no longer available.' }, 400, c); }
      benefit = String(b);
    }
    await admin.from('crm_sync_jobs').insert({ registration_id: reg.id, workflow: 'event_registration' });
    const vars = { name: f.name, email: f.email, organisation: f.organisation ?? '', event_title: ev.title, event_date: new Date(ev.starts_at).toUTCString(), voucher_code: f.voucher_code ?? '', benefit };
    await later((async () => { await sendTemplate(admin, 'event_confirmation', [f.email], vars, { registration_id: reg.id }); await notifyStaff(admin, { ...vars, kind: 'event registration', message: `Registered for ${ev.title}` }, { registration_id: reg.id }, f.email); const { data: j } = await admin.from('crm_sync_jobs').select('id').eq('registration_id', reg.id).single(); if (j) await processCrmJob(admin, j.id); })());
    return ok(benefit ? `You are registered. Voucher accepted: ${benefit}. Check your email for details.` : 'You are registered. Check your email for details.');
  }

  // contact / demo / partnership / investment
  const { data: enq, error: ee } = await admin.from('enquiries').insert({ kind: f.kind, name: f.name, email: f.email, organisation: f.organisation ?? null, telephone: f.telephone ?? null, country: f.country ?? null, category: f.category ?? null, message: f.message, consent: true, source_page: f.source_page ?? null, ip_hash: ipHash, user_agent: ua }).select('id').single();
  if (ee) return json({ error: 'Could not save your message. Please try again.' }, 500, c);
  const child = f.kind === 'partnership' ? admin.from('partnership_enquiries').insert({ enquiry_id: enq.id, partnership_category: f.partnership_category, website: f.website ?? null })
    : f.kind === 'investment' ? admin.from('investment_enquiries').insert({ enquiry_id: enq.id, investor_type: f.investor_type, investment_interest: f.investment_interest ?? null })
    : admin.from('contact_enquiries').insert({ enquiry_id: enq.id, category: f.contact_category });
  const { error: ce } = await child;
  if (ce) { await admin.from('enquiries').delete().eq('id', enq.id); return json({ error: 'Could not save your message. Please try again.' }, 500, c); }
  const { data: job } = await admin.from('crm_sync_jobs').insert({ enquiry_id: enq.id, workflow: f.kind }).select('id').single();
  const ack = f.kind === 'partnership' ? 'partnership_ack' : f.kind === 'investment' ? 'investment_ack' : 'contact_ack';
  const vars = { name: f.name, email: f.email, organisation: f.organisation ?? '', category: f.category ?? f.partnership_category ?? f.investor_type ?? f.contact_category ?? '', kind: f.kind, message: f.message, admin_url: 'https://cms.soilpassport.com' };
  await later((async () => { await sendTemplate(admin, ack, [f.email], vars, { enquiry_id: enq.id }); await notifyStaff(admin, vars, { enquiry_id: enq.id }, f.email); if (job) await processCrmJob(admin, job.id); })());
  return ok('Thank you. We have received your message and will be in touch.');
});
