import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { invokeFn } from '../lib/fn';
import { PageHeader, Spinner, Empty, ErrorBox, Field, Toast, Badge } from '../components/ui';
import RichText from '../components/RichText';
import { fmt } from '../lib/util';

interface Camp { id: string; subject: string; preheader: string | null; body_html: string; status: string; recipients_total: number; sent_count: number; failed_count: number; created_at: string; started_at: string | null; finished_at: string | null }
const tone = (s: string) => s === 'sent' ? 'green' : s === 'sending' ? 'amber' : s === 'cancelled' ? 'red' : 'slate';

export default function Campaigns() {
  const { can, profile } = useAuth();
  const [rows, setRows] = useState<Camp[]>([]); const [subs, setSubs] = useState(0); const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [toast, setToast] = useState(''); const [busy, setBusy] = useState('');
  const [creating, setCreating] = useState(false); const [cur, setCur] = useState<Camp | null>(null); const [f, setF] = useState({ subject: '', preheader: '', body: '' });
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  const load = useCallback(async () => {
    const [c, s] = await Promise.all([supabase.from('newsletter_campaigns').select('*').order('created_at', { ascending: false }).limit(100), supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'subscribed')]);
    if (c.error) setErr(c.error.message); setRows((c.data ?? []) as Camp[]); setSubs(s.count ?? 0); setLoading(false);
    return (c.data ?? []) as Camp[];
  }, []);
  useEffect(() => { void load(); }, [load]);
  function open(c: Camp | null) { setErr(''); setCreating(c === null); setCur(c); setF({ subject: c?.subject ?? '', preheader: c?.preheader ?? '', body: c?.body_html ?? '' }); }
  const editable = !cur || cur.status === 'draft';

  async function save(): Promise<string | null> {
    if (!f.subject.trim()) { setErr('Add a subject.'); return null; }
    const row = { subject: f.subject.trim(), preheader: f.preheader.trim() || null, body_html: f.body };
    if (cur) { const { error } = await supabase.from('newsletter_campaigns').update(row).eq('id', cur.id); if (error) { setErr(error.message); return null; } await load(); return cur.id; }
    const { data, error } = await supabase.from('newsletter_campaigns').insert({ ...row, created_by: profile!.id }).select('*').single();
    if (error) { setErr(error.message); return null; }
    setCur(data as Camp); setCreating(false); await load(); return (data as Camp).id;
  }
  async function act(label: string, fn: () => Promise<void>) { setBusy(label); setErr(''); try { await fn(); } catch (e) { setErr((e as Error).message); } setBusy(''); }
  const refreshCur = async (id: string) => { const l = await load(); setCur(l.find(x => x.id === id) ?? null); };

  if (loading) return <Spinner />;
  const showEditor = cur !== null || creating;

  return <><PageHeader title="Newsletter Campaigns" sub={`Write an email and send it to the ${subs} confirmed subscriber${subs === 1 ? '' : 's'}. Every email carries an unsubscribe link.`} actions={<div className="flex gap-2"><Link to="/newsletter" className="btn btn-ghost">Subscribers</Link>{can('newsletter.edit') && <button className="btn btn-primary" onClick={() => open(null)}>New campaign</button>}</div>} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="card divide-y divide-slate-100 self-start">{rows.length === 0 ? <Empty>No campaigns yet.</Empty> : rows.map(c => <button key={c.id} className={`block w-full p-3 text-left text-sm hover:bg-slate-50 ${cur?.id === c.id ? 'bg-slate-50' : ''}`} onClick={() => open(c)}><div className="truncate font-medium">{c.subject}</div><div className="mt-1 flex items-center gap-2 text-xs text-slate-500"><Badge tone={tone(c.status)}>{c.status}</Badge>{c.status !== 'draft' && <span>{c.sent_count}/{c.recipients_total} sent{c.failed_count ? `, ${c.failed_count} failed` : ''}</span>}<span>{fmt(c.created_at)}</span></div></button>)}</div>
      <div>{showEditor ? <div className="card space-y-4 p-4">
        {cur && cur.status !== 'draft' && <div className="rounded-lg bg-slate-50 p-3 text-sm"><strong>{cur.status === 'sending' ? 'Sending in progress' : cur.status === 'sent' ? 'Sent' : 'Cancelled'}.</strong> {cur.sent_count} of {cur.recipients_total} delivered{cur.failed_count ? `, ${cur.failed_count} failed or skipped` : ''}.{cur.started_at && <> Started {fmt(cur.started_at)}.</>}
          {cur.status === 'sending' && can('newsletter.send') && <div className="mt-2 flex gap-2"><button className="btn" disabled={!!busy} onClick={() => void act('next', async () => { await invokeFn('integrations', { action: 'newsletter_process' }); await refreshCur(cur.id); })}>{busy === 'next' ? 'Sending…' : 'Send next batch now'}</button><button className="btn btn-danger" disabled={!!busy} onClick={() => { if (window.confirm('Stop sending? People who have not received it yet will not get it.')) void act('cancel', async () => { await invokeFn('integrations', { action: 'newsletter_cancel', id: cur.id }); await refreshCur(cur.id); }); }}>Stop sending</button></div>}
          {cur.status === 'sending' && <p className="mt-2 text-xs text-slate-500">The background job sends the rest in batches every few minutes. Use "Send next batch now" to speed it up.</p>}</div>}
        <Field label="Subject" htmlFor="c-sub"><input id="c-sub" className="input" maxLength={200} value={f.subject} disabled={!editable} onChange={e => setF({ ...f, subject: e.target.value })} /></Field>
        <Field label="Preview text (optional)" htmlFor="c-pre" hint="Shown after the subject in most inboxes."><input id="c-pre" className="input" maxLength={200} value={f.preheader} disabled={!editable} onChange={e => setF({ ...f, preheader: e.target.value })} /></Field>
        <Field label="Content" htmlFor="c-body" hint="Only basic formatting, https links and https images are kept. Scripts and other markup are removed when sending."><div className={editable ? '' : 'pointer-events-none opacity-70'}><RichText id="c-body" value={f.body} onChange={h => setF(p => ({ ...p, body: h }))} /></div></Field>
        {editable && <div className="flex flex-wrap gap-2">
          {can('newsletter.edit') && <button className="btn btn-primary" disabled={!!busy} onClick={() => void act('save', async () => { if (await save()) flash('Draft saved'); })}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>}
          {can('newsletter.send') && <button className="btn" disabled={!!busy} onClick={() => void act('test', async () => { const id = await save(); if (!id) return; const r = await invokeFn<{ sent_to: string }>('integrations', { action: 'newsletter_test', id }); flash(`Test sent to ${r.sent_to}`); })}>{busy === 'test' ? 'Sending…' : 'Send test to me'}</button>}
          {can('newsletter.send') && <button className="btn btn-danger" disabled={!!busy || subs === 0} onClick={() => { if (!window.confirm(`Send "${f.subject}" to ${subs} subscriber${subs === 1 ? '' : 's'}? This cannot be undone.`)) return; void act('send', async () => { const id = await save(); if (!id) return; const r = await invokeFn<{ total: number; sent: number }>('integrations', { action: 'newsletter_send', id }); flash(`Sending started: ${r.total} recipients queued, ${r.sent} sent so far`); await refreshCur(id); }); }}>{busy === 'send' ? 'Starting…' : `Send to ${subs} subscribers`}</button>}
          {cur && can('newsletter.delete') && <button className="btn btn-ghost" disabled={!!busy} onClick={() => { if (window.confirm('Delete this draft?')) void act('del', async () => { const { error } = await supabase.from('newsletter_campaigns').delete().eq('id', cur.id); if (error) throw new Error(error.message); open(null); setCreating(false); await load(); }); }}>Delete draft</button>}
        </div>}
        {!can('newsletter.send') && <p className="text-xs text-slate-500">You can write drafts. Sending needs the "Send newsletter campaigns" permission.</p>}
      </div> : <div className="card"><Empty>Select a campaign or create a new one.</Empty></div>}</div>
    </div><Toast msg={toast} /></>;
}
