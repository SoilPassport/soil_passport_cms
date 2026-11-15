// Scheduled and on-demand background work: event reminders, approval emails, newsletter sending, CRM retries, housekeeping.
// Called by the "scheduled" function (cron) and by staff through "integrations". Service-role client only.
// NOT YET TESTED against live Supabase, Resend or HubSpot.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sendEmail } from './email.ts';
import { hmacHex } from './crypto.ts';
import { buildNewsletter } from './newsletter.ts';
import { processCrmJob, sendTemplate } from './pipeline.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const siteBase = () => (env('PUBLIC_SITE_ORIGINS') || 'https://soilpassport.com').split(',')[0].trim();
const adminBase = () => (env('ADMIN_URL') || 'https://cms.soilpassport.com').replace(/\/+$/, '');
export const unsubUrl = async (email: string) => `${env('SUPABASE_URL')}/functions/v1/submit-form?a=unsub&e=${encodeURIComponent(email)}&t=${await hmacHex(env('IP_HASH_SALT'), 'unsub:' + email)}`;

export async function runReminders(admin: SupabaseClient, now = new Date()): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  const { data: events } = await admin.from('events').select('id,slug,title,starts_at,location,reminder_hours')
    .eq('status', 'published').not('reminder_hours', 'is', null).gt('starts_at', now.toISOString()).lte('starts_at', new Date(now.getTime() + 168 * 3600_000).toISOString());
  for (const ev of (events ?? []).filter(e => new Date(e.starts_at).getTime() - now.getTime() <= e.reminder_hours * 3600_000)) {
    const { data: regs } = await admin.from('event_registrations').select('id,name,email').eq('event_id', ev.id).eq('status', 'registered').limit(500);
    const ids = (regs ?? []).map(r => r.id);
    const { data: done } = ids.length ? await admin.from('event_reminders_sent').select('registration_id').in('registration_id', ids).in('status', ['sent', 'skipped']) : { data: [] };
    const skip = new Set((done ?? []).map(d => d.registration_id));
    for (const r of (regs ?? []).filter(r => !skip.has(r.id)).slice(0, 100)) {
      const st = await sendTemplate(admin, 'event_reminder', [r.email], { name: r.name, event_title: ev.title, event_date: new Date(ev.starts_at).toUTCString(), location: ev.location ?? '', event_url: `${siteBase()}/events.html?slug=${ev.slug}` }, { registration_id: r.id });
      await admin.from('event_reminders_sent').upsert({ registration_id: r.id, status: st, sent_at: new Date().toISOString(), error: st === 'sent' ? null : 'See email log' });
      if (st === 'sent') out.sent++; else if (st === 'failed') out.failed++;
      await sleep(300);
    }
  }
  return out;
}

const PATHS: Record<string, string> = { articles: 'articles', website_pages: 'pages', events: 'events', documents: 'documents' };
const NICE: Record<string, string> = { articles: 'article', website_pages: 'page', events: 'event', documents: 'document' };
export function headlineFor(kind: string, to: string): string {
  if (kind === 'review_requested') return 'Review requested';
  return to === 'approved' ? 'Approved' : to === 'published' ? 'Published' : to === 'scheduled' ? 'Approved and scheduled' : 'Returned to draft for changes';
}
export async function processApprovalQueue(admin: SupabaseClient): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  const { data: q } = await admin.from('notification_queue').select('*').eq('status', 'pending').order('created_at').limit(50);
  for (const n of q ?? []) {
    const done = (status: string, error?: string) => admin.from('notification_queue').update({ status, error: error ?? null, processed_at: new Date().toISOString() }).eq('id', n.id);
    const { data: actor } = n.actor_id ? await admin.from('profiles').select('email,full_name').eq('id', n.actor_id).maybeSingle() : { data: null };
    let to: string[] = [];
    if (n.kind === 'review_requested') {
      const { data: ap } = await admin.rpc('approver_emails', { p_module: n.module });
      const { data: ns } = await admin.from('notification_settings').select('enabled,recipients').eq('key', 'content_approval').maybeSingle();
      to = [...new Set([...(ap ?? []), ...(ns?.enabled ? ns.recipients ?? [] : [])])];
    } else if (n.owner_id) {
      const { data: o } = await admin.from('profiles').select('email,status').eq('id', n.owner_id).maybeSingle();
      if (o?.status === 'active') to = [o.email];
    }
    to = to.filter(e => e && e.toLowerCase() !== (actor?.email ?? '').toLowerCase());
    if (!to.length) { await done('skipped', 'No recipients'); out.skipped++; continue; }
    const by = actor?.full_name || actor?.email || 'a team member';
    const st = await sendTemplate(admin, 'content_approval', to, { headline: headlineFor(n.kind, n.to_status), title: n.title ?? '(untitled)', entity: NICE[n.entity_type] ?? n.entity_type, detail: n.kind === 'review_requested' ? `Submitted for review by ${by}.` : `Status changed to "${n.to_status}" by ${by}.`, admin_url: `${adminBase()}/${PATHS[n.entity_type] ?? ''}/${n.entity_id}` });
    await done(st, st === 'sent' ? undefined : 'See email log'); out[st]++;
    await sleep(300);
  }
  return out;
}

export async function startCampaign(admin: SupabaseClient, id: string, userId: string): Promise<{ total: number }> {
  if (!env('IP_HASH_SALT')) throw new Error('IP_HASH_SALT is not set, so unsubscribe links cannot be signed.');
  const { data: c } = await admin.from('newsletter_campaigns').select('id,status,subject,body_html').eq('id', id).maybeSingle();
  if (!c) throw new Error('Campaign not found.');
  if (c.status !== 'draft') throw new Error('Only a draft can be sent.');
  if (!c.subject.trim() || !c.body_html.replace(/<[^>]+>/g, '').trim()) throw new Error('Add a subject and some content first.');
  const { data: subs } = await admin.from('newsletter_subscribers').select('id').eq('status', 'subscribed').limit(20000);
  if (!subs?.length) throw new Error('There are no confirmed subscribers.');
  for (let i = 0; i < subs.length; i += 500) {
    const { error } = await admin.from('newsletter_deliveries').upsert(subs.slice(i, i + 500).map(s => ({ campaign_id: id, subscriber_id: s.id })), { onConflict: 'campaign_id,subscriber_id', ignoreDuplicates: true });
    if (error) throw new Error('Could not queue recipients.');
  }
  const { error } = await admin.from('newsletter_campaigns').update({ status: 'sending', recipients_total: subs.length, started_at: new Date().toISOString(), started_by: userId }).eq('id', id).eq('status', 'draft');
  if (error) throw new Error('Could not start the campaign.');
  return { total: subs.length };
}
export async function cancelCampaign(admin: SupabaseClient, id: string) {
  await admin.from('newsletter_deliveries').delete().eq('campaign_id', id).eq('status', 'pending');
  await admin.from('newsletter_campaigns').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', id).eq('status', 'sending');
}
// Sends up to `limit` pending emails. Each row is claimed BEFORE sending, so overlapping runs can never email someone twice
// (if a run dies mid-send, that one recipient is counted as sent rather than risking a duplicate).
export async function processCampaigns(admin: SupabaseClient, limit = 40): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  const { data: camps } = await admin.from('newsletter_campaigns').select('id,subject,preheader,body_html').eq('status', 'sending').order('started_at').limit(3);
  let budget = limit;
  for (const c of camps ?? []) {
    if (budget <= 0) break;
    const { data: pend } = await admin.from('newsletter_deliveries').select('subscriber_id,newsletter_subscribers(email,status)').eq('campaign_id', c.id).eq('status', 'pending').limit(budget);
    for (const d of (pend ?? []) as unknown as { subscriber_id: string; newsletter_subscribers: { email: string; status: string } | null }[]) {
      const { data: claimed } = await admin.from('newsletter_deliveries').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('campaign_id', c.id).eq('subscriber_id', d.subscriber_id).eq('status', 'pending').select('subscriber_id');
      if (!claimed?.length) continue; budget--;
      const s = d.newsletter_subscribers;
      if (!s || s.status !== 'subscribed') { await admin.from('newsletter_deliveries').update({ status: 'failed', error: 'Unsubscribed before send' }).eq('campaign_id', c.id).eq('subscriber_id', d.subscriber_id); continue; }
      const u = await unsubUrl(s.email);
      const m = buildNewsletter({ subject: c.subject, preheader: c.preheader, bodyHtml: c.body_html, unsubscribeUrl: u, postalName: 'Soil Passport' });
      const r = await sendEmail({ to: [s.email], subject: c.subject, html: m.html, text: m.text, headers: { 'List-Unsubscribe': `<${u}>` } });
      if (r.ok) out.sent++; else { out.failed++; await admin.from('newsletter_deliveries').update({ status: 'failed', error: (r.error ?? 'failed').slice(0, 200) }).eq('campaign_id', c.id).eq('subscriber_id', d.subscriber_id); }
      await sleep(550); // stay under the provider's per-second limit
    }
    const cnt = async (st: string) => (await admin.from('newsletter_deliveries').select('subscriber_id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', st)).count ?? 0;
    const [sent, failed, pending] = await Promise.all([cnt('sent'), cnt('failed'), cnt('pending')]);
    await admin.from('newsletter_campaigns').update({ sent_count: sent, failed_count: failed, ...(pending === 0 ? { status: 'sent', finished_at: new Date().toISOString() } : {}) }).eq('id', c.id);
  }
  return out;
}

export async function runAll(admin: SupabaseClient) {
  const res: Record<string, unknown> = {};
  const step = async (k: string, f: () => Promise<unknown>) => { try { res[k] = await f(); } catch (e) { res[k] = { error: (e as Error).message.slice(0, 200) }; } };
  await step('reminders', () => runReminders(admin));
  await step('approvals', () => processApprovalQueue(admin));
  await step('newsletter', () => processCampaigns(admin));
  await step('crm', async () => {
    if (!env('HUBSPOT_ACCESS_TOKEN')) return 'not configured';
    const { data: jobs } = await admin.from('crm_sync_jobs').select('id').eq('status', 'pending').lte('next_attempt_at', new Date().toISOString()).order('created_at').limit(20);
    const o: Record<string, number> = { synced: 0, failed: 0, pending: 0 }; for (const j of jobs ?? []) o[await processCrmJob(admin, j.id)]++; return o;
  });
  await step('housekeeping', async () => {
    await admin.from('form_rate_limits').delete().lt('created_at', new Date(Date.now() - 2 * 86400_000).toISOString());
    const { data } = await admin.rpc('analytics_purge'); return { analytics_rows_purged: data ?? 0 };
  });
  return res;
}
