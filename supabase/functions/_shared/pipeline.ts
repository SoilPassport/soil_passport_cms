// Server-side helpers shared by submit-form and integrations (service-role client).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { render, sendEmail, stripTags } from './email.ts';
import { MAX_ATTEMPTS, createDeal, dealKinds, dealProps, dealsEnabled, nextAttempt, pushContact } from './hubspot.ts';
const envv = (k: string) => Deno.env.get(k) ?? '';

export async function sendTemplate(admin: SupabaseClient, key: string, to: string[], vars: Record<string, unknown>, ref: { enquiry_id?: string; registration_id?: string } = {}, replyTo?: string): Promise<'sent' | 'failed' | 'skipped'> {
  const { data: t } = await admin.from('email_templates').select('subject,body_html,body_text,enabled').eq('key', key).maybeSingle();
  const log = (status: string, error?: string) => admin.from('email_log').insert({ template_key: key, to_email: to.join(',').slice(0, 500), status, error: error ?? null, ...ref });
  if (!t || !t.enabled) { await log('skipped', 'Template missing or disabled'); return 'skipped'; }
  const html = render(t.body_html, vars, true);
  const text = t.body_text ? render(t.body_text, vars, false) : stripTags(html);
  const subject = render(t.subject, vars, false);
  const r = await sendEmail({ to, subject, html, text, replyTo });
  await log(r.ok ? 'sent' : 'failed', r.error);
  return r.ok ? 'sent' : 'failed';
}

export async function notifyStaff(admin: SupabaseClient, vars: Record<string, unknown>, ref: { enquiry_id?: string; registration_id?: string }, replyTo?: string) {
  const { data: s } = await admin.from('notification_settings').select('enabled,recipients').eq('key', 'internal_enquiry').maybeSingle();
  if (!s || !s.enabled || !s.recipients?.length) return;
  await sendTemplate(admin, 'internal_enquiry', s.recipients, vars, ref, replyTo);
}

export async function processCrmJob(admin: SupabaseClient, jobId: string): Promise<'synced' | 'failed' | 'pending'> {
  const token = Deno.env.get('HUBSPOT_ACCESS_TOKEN');
  if (!token) return 'pending';
  const { data: job } = await admin.from('crm_sync_jobs').select('*').eq('id', jobId).maybeSingle();
  if (!job || job.status === 'synced') return 'synced';
  await admin.from('crm_sync_jobs').update({ status: 'processing', attempts: job.attempts + 1 }).eq('id', jobId);
  try {
    let person, note;
    if (job.enquiry_id) {
      const { data: e } = await admin.from('enquiries').select('*').eq('id', job.enquiry_id).single();
      person = { email: e.email, name: e.name, organisation: e.organisation, telephone: e.telephone, country: e.country };
      note = `Website ${e.kind} enquiry received ${e.created_at}\nCategory: ${e.category ?? '-'}\nSource page: ${e.source_page ?? '-'}\n\n${e.message ?? ''}`;
    } else {
      const { data: r } = await admin.from('event_registrations').select('*,events(title,starts_at)').eq('id', job.registration_id).single();
      person = { email: r.email, name: r.name, organisation: r.organisation, job_title: r.job_title, country: r.country };
      note = `Registered for event: ${r.events?.title ?? ''} (${r.events?.starts_at ?? ''})`;
    }
    // On a retry the contact and note may already exist; do not push them twice.
    let contactId: string | null = job.hubspot_contact_id ?? null;
    if (!contactId) {
      contactId = (await pushContact(person, note, token)).contactId;
      await admin.from('crm_sync_jobs').update({ hubspot_contact_id: contactId }).eq('id', jobId);
    }
    let dealId: string | null = job.hubspot_deal_id ?? null;
    if (!dealId && job.enquiry_id && dealsEnabled(envv) && dealKinds(envv).includes(job.workflow)) {
      const { data: e } = await admin.from('enquiries').select('name,organisation,message,category').eq('id', job.enquiry_id).single();
      let extra = '';
      if (job.workflow === 'investment') { const { data: i } = await admin.from('investment_enquiries').select('investor_type,investment_interest').eq('enquiry_id', job.enquiry_id).maybeSingle(); extra = `Investor type: ${i?.investor_type ?? '-'}\nInterest: ${i?.investment_interest ?? '-'}\n\n`; }
      const props = dealProps({ kind: job.workflow, name: e?.name ?? 'Unknown', organisation: e?.organisation, description: `${extra}${e?.message ?? ''}`, pipeline: envv('HUBSPOT_DEAL_PIPELINE'), stage: envv('HUBSPOT_DEAL_STAGE') });
      dealId = (await createDeal(contactId, props, token)).dealId;
    }
    await admin.from('crm_sync_jobs').update({ status: 'synced', hubspot_contact_id: contactId, hubspot_deal_id: dealId, last_error: null }).eq('id', jobId);
    return 'synced';
  } catch (e) {
    const attempts = job.attempts + 1;
    await admin.from('crm_sync_jobs').update({ status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', last_error: (e as Error).message.slice(0, 500), next_attempt_at: nextAttempt(attempts) }).eq('id', jobId);
    return 'failed';
  }
}
