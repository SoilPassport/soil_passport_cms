import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, Empty, ErrorBox, Toast } from '../components/ui';
import { fmt } from '../lib/util';
import { downloadCsv, toCsv } from '../lib/csv';

interface Sub { id: string; email: string; name: string | null; status: string; consent_at: string; confirmed_at: string | null; source: string | null; created_at: string }
export default function Newsletter() {
  const { can } = useAuth(); const [rows, setRows] = useState<Sub[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [st, setSt] = useState(''); const [q, setQ] = useState(''); const [toast, setToast] = useState('');
  const load = useCallback(async () => { const { data, error } = await supabase.from('newsletter_subscribers').select('*').order('created_at', { ascending: false }).limit(2000); if (error) setErr(error.message); setRows((data ?? []) as Sub[]); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  const shown = rows.filter(r => (!st || r.status === st) && (!q || (r.email + ' ' + (r.name ?? '')).toLowerCase().includes(q.toLowerCase())));
  async function unsub(r: Sub) { if (!window.confirm(`Mark ${r.email} as unsubscribed?`)) return; const { error } = await supabase.from('newsletter_subscribers').update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() }).eq('id', r.id); if (error) { setErr(error.message); return; } await supabase.rpc('write_audit', { p_action: 'newsletter.unsubscribed', p_entity_type: 'setting', p_entity_id: null, p_details: { id: r.id } }); setToast('Updated'); setTimeout(() => setToast(''), 2000); await load(); }
  async function exportCsv() { const d = shown.map(r => ({ email: r.email, name: r.name, status: r.status, consent_at: r.consent_at, confirmed_at: r.confirmed_at, source: r.source })); await downloadCsv('newsletter-subscribers.csv', toCsv(d, ['email', 'name', 'status', 'consent_at', 'confirmed_at', 'source'].map(k => ({ key: k as never, label: k }))), 'newsletter.exported', d.length); }
  if (loading) return <Spinner />;
  const counts = ['pending', 'subscribed', 'unsubscribed', 'bounced'].map(s => `${rows.filter(r => r.status === s).length} ${s}`).join(' · ');
  return <><PageHeader title="Newsletter Management" sub={`Subscribers with recorded consent (double opt-in). ${counts}`} actions={<div className="flex gap-2"><Link to="/newsletter/campaigns" className="btn btn-primary">Campaigns</Link>{shown.length > 0 && <button className="btn btn-ghost" onClick={() => void exportCsv()}>Export CSV</button>}</div>} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <div className="mb-4 flex flex-wrap gap-2"><input className="input max-w-xs" placeholder="Search" aria-label="Search subscribers" value={q} onChange={e => setQ(e.target.value)} /><select className="input w-auto" aria-label="Status" value={st} onChange={e => setSt(e.target.value)}><option value="">All</option><option value="pending">Pending confirmation</option><option value="subscribed">Subscribed</option><option value="unsubscribed">Unsubscribed</option><option value="bounced">Bounced</option></select></div>
    <div className="card overflow-x-auto">{shown.length === 0 ? <Empty>No subscribers yet.</Empty> :
      <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">Email</th><th className="p-3">Status</th><th className="p-3">Consent</th><th className="p-3" /></tr></thead>
        <tbody className="divide-y divide-slate-100">{shown.map(r => <tr key={r.id}><td className="p-3">{r.email}{r.name && <span className="text-xs text-slate-500"> · {r.name}</span>}</td><td className="p-3">{r.status}</td><td className="whitespace-nowrap p-3 text-xs">{fmt(r.consent_at)}</td><td className="p-3 text-right">{can('newsletter.edit') && r.status !== 'unsubscribed' && <button className="text-xs underline" onClick={() => void unsub(r)}>Unsubscribe</button>}</td></tr>)}</tbody></table>}</div>
    <p className="mt-3 text-xs text-slate-500">New subscribers must confirm by email. To email subscribers, use Campaigns. You can also export the list to another email platform.</p><Toast msg={toast} /></>;
}
