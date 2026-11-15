import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { invokeFn } from '../lib/fn';
import { fmt } from '../lib/util';
import { ErrorBox, Field } from './ui';

interface Grant { id: string; email: string; created_at: string; expires_at: string; max_downloads: number; downloads: number; revoked_at: string | null }
// Restricted documents are never public. Staff send a personal, expiring link by email; every download is counted.
export default function AccessLinks({ docId, ready }: { docId: string; ready: boolean }) {
  const [rows, setRows] = useState<Grant[]>([]); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [f, setF] = useState({ email: '', name: '', days: '7', max: '3' }); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const { data, error } = await supabase.from('document_access_grants').select('id,email,created_at,expires_at,max_downloads,downloads,revoked_at').eq('document_id', docId).order('created_at', { ascending: false }).limit(100); if (error) setErr(error.message); setRows((data ?? []) as Grant[]); }, [docId]);
  useEffect(() => { void load(); }, [load]);
  // Not a <form>: this panel sits inside the document editor's own form, and forms cannot be nested.
  async function send() {
    setErr(''); setOk('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { setErr('Enter a valid email address.'); return; }
    setBusy(true);
    try { await invokeFn('integrations', { action: 'doc_grant', document_id: docId, email: f.email, name: f.name, days: Number(f.days), max_downloads: Number(f.max) }); setOk(`Link emailed to ${f.email}.`); setF({ ...f, email: '', name: '' }); await load(); }
    catch (x) { setErr((x as Error).message); } setBusy(false);
  }
  async function revoke(g: Grant) { if (!window.confirm(`Withdraw the link sent to ${g.email}?`)) return; const { error } = await supabase.from('document_access_grants').update({ revoked_at: new Date().toISOString() }).eq('id', g.id); if (error) setErr(error.message); else await load(); }
  const state = (g: Grant) => g.revoked_at ? 'Withdrawn' : new Date(g.expires_at) < new Date() ? 'Expired' : g.downloads >= g.max_downloads ? 'Limit reached' : 'Active';
  return <section className="card space-y-3 p-4"><h2 className="text-sm font-semibold">Access links</h2>
    <p className="text-xs text-slate-600">This document is not public. Send a personal link by email. It expires, has a download limit, and every download is counted. Email security scanners can use up a download, so keep the limit at 3 or more.</p>
    {!ready && <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">Publish the document with a file before sending links.</p>}
    {err && <ErrorBox msg={err} />}{ok && <p role="status" className="rounded bg-emerald-50 p-2 text-xs text-emerald-800">{ok}</p>}
    {ready && <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Recipient email" htmlFor="g-em"><input id="g-em" type="email" className="input" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Recipient name (optional)" htmlFor="g-nm"><input id="g-nm" className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Valid for (days)" htmlFor="g-d"><input id="g-d" type="number" min="1" max="90" className="input" value={f.days} onChange={e => setF({ ...f, days: e.target.value })} /></Field>
      <Field label="Maximum downloads" htmlFor="g-m"><input id="g-m" type="number" min="1" max="50" className="input" value={f.max} onChange={e => setF({ ...f, max: e.target.value })} /></Field>
      <div className="sm:col-span-2"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void send()}>{busy ? 'Sending…' : 'Email access link'}</button></div></div>}
    {rows.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-slate-200 uppercase text-slate-500"><tr><th className="p-2">Sent to</th><th className="p-2">Sent</th><th className="p-2">Expires</th><th className="p-2">Used</th><th className="p-2">State</th><th /></tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.map(g => <tr key={g.id}><td className="p-2">{g.email}</td><td className="p-2">{fmt(g.created_at)}</td><td className="p-2">{fmt(g.expires_at)}</td><td className="p-2">{g.downloads}/{g.max_downloads}</td><td className="p-2">{state(g)}</td><td className="p-2 text-right">{state(g) === 'Active' && <button className="underline" onClick={() => void revoke(g)}>Withdraw</button>}</td></tr>)}</tbody></table></div>}
  </section>;
}
