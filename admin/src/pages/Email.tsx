import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { invokeFn, type IntegrationStatus } from '../lib/fn';
import { PageHeader, Spinner, ErrorBox, Field, Toast } from '../components/ui';
import { fmt } from '../lib/util';

interface Tpl { key: string; subject: string; body_html: string; enabled: boolean }
interface Log { id: number; template_key: string; to_email: string; status: string; error: string | null; created_at: string }
const LABEL: Record<string, string> = { contact_ack: 'Contact: reply to sender', partnership_ack: 'Partnership: reply to sender', investment_ack: 'Investment: reply to sender', event_confirmation: 'Event registration confirmation', internal_enquiry: 'Alert to staff', newsletter_confirm: 'Newsletter confirmation', event_reminder: 'Event reminder to registrants', content_approval: 'Content review and approval alert', document_access: 'Restricted document access link', account: 'Account (not used yet)' };
const VARS = '{{name}} {{email}} {{organisation}} {{category}} {{kind}} {{message}} {{event_title}} {{event_date}} {{admin_url}} {{confirm_link}} {{unsubscribe_link}}';
export default function Email() {
  const { can, profile } = useAuth(); const [tpls, setTpls] = useState<Tpl[]>([]); const [log, setLog] = useState<Log[]>([]); const [rec, setRec] = useState({ enabled: true, recipients: '' }); const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [toast, setToast] = useState(''); const [cur, setCur] = useState<Tpl | null>(null); const [busy, setBusy] = useState(false); const [stat, setStat] = useState<IntegrationStatus | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };
  const load = useCallback(async () => {
    const [t, l, n] = await Promise.all([supabase.from('email_templates').select('key,subject,body_html,enabled').order('key'), supabase.from('email_log').select('id,template_key,to_email,status,error,created_at').order('created_at', { ascending: false }).limit(50), supabase.from('notification_settings').select('enabled,recipients').eq('key', 'internal_enquiry').maybeSingle()]);
    if (t.error) setErr(t.error.message); setTpls((t.data ?? []) as Tpl[]); setLog((l.data ?? []) as Log[]); if (n.data) setRec({ enabled: n.data.enabled, recipients: (n.data.recipients ?? []).join(', ') }); setLoading(false);
  }, []);
  useEffect(() => { void load(); invokeFn<IntegrationStatus>('integrations', { action: 'status' }).then(setStat).catch(() => setStat(null)); }, [load]);
  const edit = can('email.edit');
  async function saveTpl() { if (!cur) return; setBusy(true); setErr(''); const { error } = await supabase.from('email_templates').update({ subject: cur.subject, body_html: cur.body_html, enabled: cur.enabled, updated_by: profile!.id, updated_at: new Date().toISOString() }).eq('key', cur.key); setBusy(false); if (error) { setErr(error.message); return; } await supabase.rpc('write_audit', { p_action: 'email.template_updated', p_entity_type: 'setting', p_entity_id: null, p_details: { key: cur.key } }); flash('Saved'); await load(); }
  async function saveRec() {
    const list = rec.recipients.split(/[,\n;]/).map(s => s.trim().toLowerCase()).filter(Boolean); const bad = list.find(e => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e));
    if (bad) { setErr(`"${bad}" is not a valid email address.`); return; } setBusy(true); setErr('');
    const { error } = await supabase.from('notification_settings').upsert({ key: 'internal_enquiry', enabled: rec.enabled, recipients: list, updated_at: new Date().toISOString() }); setBusy(false);
    if (error) { setErr(error.message); return; } await supabase.rpc('write_audit', { p_action: 'email.recipients_updated', p_entity_type: 'setting', p_entity_id: null, p_details: { count: list.length } }); flash('Saved'); }
  async function test() { if (!cur) return; setBusy(true); setErr(''); try { const r = await invokeFn<{ sent_to: string }>('integrations', { action: 'email_test', template: cur.key }); flash(`Test sent to ${r.sent_to}`); } catch (e) { setErr((e as Error).message); } setBusy(false); await load(); }
  if (loading) return <Spinner />;
  return <><PageHeader title="Email Configuration" sub="Emails are sent through Resend. Templates, alert recipients and a sending log." />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <div className={`mb-4 rounded-lg p-3 text-sm ${stat?.email.configured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{stat ? stat.email.configured ? 'Email sending is configured.' : `Email sending is not configured. Missing in Supabase secrets: ${stat.email.missing.join(', ')}. Forms still save, but no emails are sent.` : 'Could not check email status. Is the integrations function deployed?'}</div>
    <section className="card mb-6 space-y-3 p-4"><h2 className="text-sm font-semibold">Who receives staff alerts</h2>
      <Field label="Email addresses (comma separated)" htmlFor="e-rec" hint="Each new enquiry or registration is emailed to these addresses."><textarea id="e-rec" rows={2} className="input" value={rec.recipients} disabled={!edit} onChange={e => setRec({ ...rec, recipients: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rec.enabled} disabled={!edit} onChange={e => setRec({ ...rec, enabled: e.target.checked })} />Send alerts</label>{edit && <button className="btn btn-primary" disabled={busy} onClick={() => void saveRec()}>Save recipients</button>}</section>
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]"><nav className="card h-fit p-2" aria-label="Templates"><ul>{tpls.map(t => <li key={t.key}><button className={`block w-full rounded px-3 py-2 text-left text-sm ${cur?.key === t.key ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`} onClick={() => setCur(t)}>{LABEL[t.key] ?? t.key}{!t.enabled && <span className="ml-1 text-xs opacity-70">(off)</span>}</button></li>)}</ul></nav>
      <div className="card space-y-3 p-4">{!cur ? <p className="text-sm text-slate-500">Choose a template to edit.</p> : <>
        <Field label="Subject" htmlFor="t-sub"><input id="t-sub" className="input" value={cur.subject} disabled={!edit} onChange={e => setCur({ ...cur, subject: e.target.value })} /></Field>
        <Field label="Body (HTML)" htmlFor="t-body" hint={`You can use: ${VARS}. Values are escaped automatically.`}><textarea id="t-body" rows={10} className="input font-mono text-xs" value={cur.body_html} disabled={!edit} onChange={e => setCur({ ...cur, body_html: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cur.enabled} disabled={!edit} onChange={e => setCur({ ...cur, enabled: e.target.checked })} />Enabled</label>
        {edit && <div className="flex gap-2"><button className="btn btn-primary" disabled={busy} onClick={() => void saveTpl()}>Save template</button><button className="btn btn-ghost" disabled={busy} onClick={() => void test()}>Send a test to me</button></div>}
        <p className="text-xs text-slate-500">Test emails go only to your own login address, using sample text. Save before testing.</p></>}</div></div>
    <section className="card mt-6 overflow-x-auto"><h2 className="p-4 pb-0 text-sm font-semibold">Recent emails</h2>{log.length === 0 ? <p className="p-4 text-sm text-slate-500">Nothing sent yet.</p> :
      <table className="w-full text-left text-sm"><tbody className="divide-y divide-slate-100">{log.map(l => <tr key={l.id}><td className="whitespace-nowrap p-3 text-xs">{fmt(l.created_at)}</td><td className="p-3">{LABEL[l.template_key] ?? l.template_key}</td><td className="p-3 text-xs">{l.to_email}</td><td className="p-3"><span className={l.status === 'failed' ? 'text-red-700' : l.status === 'sent' ? 'text-emerald-700' : 'text-slate-500'}>{l.status}</span>{l.error && <span className="block text-xs text-slate-500">{l.error}</span>}</td></tr>)}</tbody></table>}</section><Toast msg={toast} /></>;
}
