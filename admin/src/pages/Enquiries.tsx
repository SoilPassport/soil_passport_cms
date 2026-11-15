import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, Empty, ErrorBox, Field, Toast } from '../components/ui';
import { fmt } from '../lib/util';
import { downloadCsv, toCsv } from '../lib/csv';

export type EnqKind = 'contact' | 'investment' | 'partnership';
interface Enq { id: string; kind: string; name: string; email: string; organisation: string | null; telephone: string | null; country: string | null; category: string | null; message: string | null; source_page: string | null; status: string; assigned_to: string | null; created_at: string; consent_at: string;
  contact_enquiries: { category: string }[] | { category: string } | null; investment_enquiries: { investor_type: string; investment_interest: string | null; follow_up_status: string }[] | { investor_type: string; investment_interest: string | null; follow_up_status: string } | null; partnership_enquiries: { partnership_category: string; website: string | null }[] | { partnership_category: string; website: string | null } | null }
interface Note { id: string; note: string; created_at: string; author_id: string | null }
interface Person { id: string; full_name: string | null; email: string }
const STATUSES = ['new', 'in_progress', 'awaiting_reply', 'closed', 'spam'];
const FOLLOW = ['none', 'to_contact', 'contacted', 'meeting_scheduled', 'closed'];
const one = <T,>(v: T[] | T | null): T | null => Array.isArray(v) ? v[0] ?? null : v;
const TITLES: Record<EnqKind, { t: string; s: string; perm: string; manage: string }> = {
  contact: { t: 'Contact Enquiries', s: 'Messages and demo requests from the website contact form.', perm: 'contact.view', manage: 'contact.manage' },
  investment: { t: 'Investment Enquiries', s: 'Investor enquiries with follow-up tracking. Handle with care: contains personal data.', perm: 'investment.view', manage: 'investment.manage' },
  partnership: { t: 'Partnership Enquiries', s: 'Partnership applications from the website.', perm: 'partnerships.view', manage: 'partnerships.manage' },
};

export default function Enquiries({ kind }: { kind: EnqKind }) {
  const { can, profile } = useAuth(); const T = TITLES[kind];
  const [rows, setRows] = useState<Enq[]>([]); const [people, setPeople] = useState<Person[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [toast, setToast] = useState('');
  const [q, setQ] = useState(''); const [st, setSt] = useState(''); const [cur, setCur] = useState<Enq | null>(null); const [notes, setNotes] = useState<Note[]>([]); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };
  const load = useCallback(async () => {
    let query = supabase.from('enquiries').select('*,contact_enquiries(category),investment_enquiries(investor_type,investment_interest,follow_up_status),partnership_enquiries(partnership_category,website)').order('created_at', { ascending: false }).limit(500);
    query = kind === 'contact' ? query.in('kind', ['contact', 'demo']) : query.eq('kind', kind);
    const { data, error } = await query; if (error) setErr(error.message); setRows((data ?? []) as unknown as Enq[]);
    const { data: p } = await supabase.from('profiles').select('id,full_name,email').eq('status', 'active'); setPeople((p ?? []) as Person[]); setLoading(false);
  }, [kind]);
  useEffect(() => { setLoading(true); setCur(null); void load(); }, [load]);
  async function open(e: Enq) { setCur(e); setNote(''); const { data } = await supabase.from('enquiry_notes').select('id,note,created_at,author_id').eq('enquiry_id', e.id).order('created_at'); setNotes((data ?? []) as Note[]); }
  const canManage = can(T.manage) || can('enquiries.manage_all');
  const who = (id: string | null) => { const p = people.find(x => x.id === id); return p ? (p.full_name || p.email) : id ? 'Unknown' : 'Unassigned'; };

  async function patch(fields: Partial<Enq>, label: string) {
    if (!cur) return; setBusy(true); setErr('');
    const { error } = await supabase.from('enquiries').update(fields).eq('id', cur.id);
    if (error) { setErr(error.message); setBusy(false); return; }
    await supabase.rpc('write_audit', { p_action: 'enquiry.updated', p_entity_type: 'enquiry', p_entity_id: cur.id, p_details: { change: label } });
    const next = { ...cur, ...fields }; setCur(next); setRows(rows.map(r => r.id === cur.id ? next : r)); setBusy(false); flash('Saved');
  }
  async function followUp(v: string) { if (!cur) return; setBusy(true); const { error } = await supabase.from('investment_enquiries').update({ follow_up_status: v }).eq('enquiry_id', cur.id); setBusy(false); if (error) { setErr(error.message); return; } const inv = one(cur.investment_enquiries); const next = { ...cur, investment_enquiries: inv ? { ...inv, follow_up_status: v } : null }; setCur(next); setRows(rows.map(r => r.id === cur.id ? next : r)); flash('Saved'); }
  async function addNote() { if (!cur || !note.trim()) return; setBusy(true); const { data, error } = await supabase.from('enquiry_notes').insert({ enquiry_id: cur.id, author_id: profile!.id, note: note.trim() }).select('id,note,created_at,author_id').single(); setBusy(false); if (error) { setErr(error.message); return; } setNotes([...notes, data as Note]); setNote(''); }
  async function del() { if (!cur || !window.confirm('Delete this enquiry permanently? This cannot be undone.')) return; const { error } = await supabase.from('enquiries').delete().eq('id', cur.id); if (error) { setErr(error.message); return; } await supabase.rpc('write_audit', { p_action: 'enquiry.deleted', p_entity_type: 'enquiry', p_entity_id: cur.id, p_details: {} }); setRows(rows.filter(r => r.id !== cur.id)); setCur(null); }
  async function exportCsv() {
    const data = shown.map(r => ({ received: r.created_at, name: r.name, email: r.email, organisation: r.organisation, telephone: r.telephone, country: r.country, category: r.category, status: r.status, message: r.message, source_page: r.source_page, type: one(r.investment_enquiries)?.investor_type ?? one(r.partnership_enquiries)?.partnership_category ?? one(r.contact_enquiries)?.category ?? '' }));
    await downloadCsv(`${kind}-enquiries.csv`, toCsv(data, Object.keys(data[0] ?? { received: 1 }).map(k => ({ key: k, label: k }))), 'enquiries.exported', data.length);
  }
  const shown = rows.filter(r => (!st || r.status === st) && (!q || (r.name + ' ' + r.email + ' ' + (r.organisation ?? '') + ' ' + (r.message ?? '')).toLowerCase().includes(q.toLowerCase())));

  if (loading) return <Spinner />;
  const inv = cur && one(cur.investment_enquiries), par = cur && one(cur.partnership_enquiries), con = cur && one(cur.contact_enquiries);
  return <>
    <PageHeader title={T.t} sub={T.s} actions={shown.length ? <button className="btn btn-ghost" onClick={() => void exportCsv()}>Export CSV</button> : undefined} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <div className="mb-4 flex flex-wrap gap-2"><input className="input max-w-xs" placeholder="Search" aria-label="Search enquiries" value={q} onChange={e => setQ(e.target.value)} />
      <select className="input w-auto" aria-label="Status" value={st} onChange={e => setSt(e.target.value)}><option value="">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="card overflow-x-auto">{shown.length === 0 ? <Empty>No enquiries yet.</Empty> :
        <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">Received</th><th className="p-3">From</th><th className="p-3">Status</th><th className="p-3">Assigned</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{shown.map(r => <tr key={r.id} className={cur?.id === r.id ? 'bg-slate-50' : ''}><td className="whitespace-nowrap p-3 text-xs">{fmt(r.created_at)}</td>
            <td className="p-3"><button className="text-left font-medium hover:underline" onClick={() => void open(r)}>{r.name}</button><div className="text-xs text-slate-500">{r.organisation || r.email}</div></td>
            <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${r.status === 'new' ? 'bg-amber-100 text-amber-800' : r.status === 'closed' ? 'bg-slate-100 text-slate-600' : r.status === 'spam' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-800'}`}>{r.status.replace('_', ' ')}</span></td><td className="p-3 text-xs">{who(r.assigned_to)}</td></tr>)}</tbody></table>}</div>
      <aside className="card h-fit space-y-3 p-4" aria-label="Enquiry details">{!cur ? <p className="text-sm text-slate-500">Select an enquiry to read it.</p> : <>
        <div><p className="font-semibold">{cur.name}</p><p className="break-all text-sm text-slate-600">{cur.email}{cur.telephone ? ` · ${cur.telephone}` : ''}</p><p className="text-xs text-slate-500">{[cur.organisation, cur.country].filter(Boolean).join(' · ')}</p></div>
        <p className="text-xs text-slate-500">Received {fmt(cur.created_at)} · consent given {fmt(cur.consent_at)}{cur.source_page ? ` · from ${cur.source_page}` : ''}</p>
        {cur.category && <p className="text-xs"><strong>Category:</strong> {cur.category}</p>}
        {con && <p className="text-xs"><strong>Topic:</strong> {con.category.replace('_', ' ')}</p>}
        {par && <p className="text-xs"><strong>Partnership type:</strong> {par.partnership_category.replace('_', ' ')}{par.website ? <> · <a className="underline" href={par.website} target="_blank" rel="noopener noreferrer">{par.website}</a></> : ''}</p>}
        {inv && <p className="text-xs"><strong>Investor type:</strong> {inv.investor_type.replace('_', ' ')}{inv.investment_interest ? ` — ${inv.investment_interest}` : ''}</p>}
        <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{cur.message}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Field label="Status" htmlFor="q-st"><select id="q-st" className="input" value={cur.status} disabled={!canManage || busy} onChange={e => void patch({ status: e.target.value }, 'status → ' + e.target.value)}>{STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></Field>
          <Field label="Assigned to" htmlFor="q-as"><select id="q-as" className="input" value={cur.assigned_to ?? ''} disabled={!canManage || busy} onChange={e => void patch({ assigned_to: e.target.value || null }, 'assignment')}><option value="">Unassigned</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</select></Field>
          {inv && <Field label="Follow-up" htmlFor="q-fu"><select id="q-fu" className="input" value={inv.follow_up_status} disabled={!can('investment.manage') || busy} onChange={e => void followUp(e.target.value)}>{FOLLOW.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></Field>}</div>
        <div><h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Notes</h3>{notes.length === 0 && <p className="text-xs text-slate-400">No notes.</p>}<ul className="space-y-2">{notes.map(n => <li key={n.id} className="rounded bg-slate-50 p-2 text-sm"><span className="whitespace-pre-wrap">{n.note}</span><span className="mt-1 block text-xs text-slate-400">{who(n.author_id)} · {fmt(n.created_at)}</span></li>)}</ul>
          {canManage && <div className="mt-2 flex gap-2"><input className="input" aria-label="Add a note" placeholder="Add a note" value={note} onChange={e => setNote(e.target.value)} /><button className="btn btn-ghost shrink-0" disabled={busy || !note.trim()} onClick={() => void addNote()}>Add</button></div>}</div>
        {can('enquiries.delete') && <button className="btn btn-danger" onClick={() => void del()}>Delete enquiry</button>}</>}</aside>
    </div><Toast msg={toast} /></>;
}
