import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, Empty, ErrorBox, Field, Toast } from '../components/ui';

interface Item { id: string; title: string; description: string | null; category: string | null; target_date: string | null; status: string; is_public: boolean; approved: boolean; sort_order: number }
const EMPTY = { title: '', description: '', category: '', target_date: '', status: 'planned', is_public: false, approved: false, sort_order: 0 };
const STATUS = ['completed', 'in_progress', 'planned', 'under_review'];
export default function Roadmap() {
  const { can, profile } = useAuth(); const [rows, setRows] = useState<Item[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [toast, setToast] = useState('');
  const [f, setF] = useState<typeof EMPTY | null>(null); const [id, setId] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const { data, error } = await supabase.from('roadmap_items').select('*').order('sort_order').order('target_date'); if (error) setErr(error.message); setRows((data ?? []) as Item[]); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  const edit = (r: Item) => { setId(r.id); setF({ title: r.title, description: r.description ?? '', category: r.category ?? '', target_date: r.target_date ?? '', status: r.status, is_public: r.is_public, approved: r.approved, sort_order: r.sort_order }); };
  async function save(e: FormEvent) {
    e.preventDefault(); if (!f) return; setErr(''); if (!f.title.trim()) { setErr('Title is required.'); return; } setBusy(true);
    const row = { title: f.title.trim(), description: f.description.trim() || null, category: f.category.trim() || null, target_date: f.target_date || null, status: f.status, is_public: f.is_public, approved: f.approved, sort_order: Number(f.sort_order) || 0 };
    const { error } = id ? await supabase.from('roadmap_items').update(row).eq('id', id) : await supabase.from('roadmap_items').insert({ ...row, created_by: profile!.id });
    setBusy(false); if (error) { setErr(error.message); return; }
    await supabase.rpc('write_audit', { p_action: id ? 'roadmap.updated' : 'roadmap.created', p_entity_type: 'roadmap_item', p_entity_id: id, p_details: { title: row.title, approved: row.approved, is_public: row.is_public } });
    setF(null); setId(null); setToast('Saved'); setTimeout(() => setToast(''), 2000); await load();
  }
  async function del() { if (!id || !window.confirm('Delete this roadmap item?')) return; const { error } = await supabase.from('roadmap_items').delete().eq('id', id); if (error) { setErr(error.message); return; } setF(null); setId(null); await load(); }
  if (loading) return <Spinner />;
  return <><PageHeader title="Roadmap Management" sub="Only items that are both approved and public appear on soilpassport.com/roadmap.html." actions={can('roadmap.edit') && !f ? <button className="btn btn-primary" onClick={() => { setId(null); setF({ ...EMPTY }); }}>Add item</button> : undefined} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    {f && <form onSubmit={save} className="card mb-6 space-y-4 p-4"><h2 className="text-sm font-semibold">{id ? 'Edit item' : 'New item'}</h2>
      <Field label="Title" htmlFor="r-t"><input id="r-t" className="input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Description" htmlFor="r-d"><textarea id="r-d" rows={3} className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-4"><Field label="Status" htmlFor="r-s"><select id="r-s" className="input" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>{STATUS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></Field>
        <Field label="Target date" htmlFor="r-dt"><input id="r-dt" type="date" className="input" value={f.target_date} onChange={e => setF({ ...f, target_date: e.target.value })} /></Field>
        <Field label="Category" htmlFor="r-c"><input id="r-c" className="input" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} /></Field>
        <Field label="Order" htmlFor="r-o"><input id="r-o" type="number" className="input" value={f.sort_order} onChange={e => setF({ ...f, sort_order: Number(e.target.value) })} /></Field></div>
      <div className="flex flex-wrap gap-6"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_public} onChange={e => setF({ ...f, is_public: e.target.checked })} />Show on the public roadmap</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.approved} disabled={!can('roadmap.approve')} onChange={e => setF({ ...f, approved: e.target.checked })} />Approved{!can('roadmap.approve') && <span className="text-xs text-slate-500"> (needs approve permission)</span>}</label></div>
      <div className="flex gap-2"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="btn btn-ghost" onClick={() => { setF(null); setId(null); }}>Cancel</button>{id && can('roadmap.delete') && <button type="button" className="btn btn-danger ml-auto" onClick={() => void del()}>Delete</button>}</div></form>}
    <div className="card overflow-x-auto">{rows.length === 0 ? <Empty>No roadmap items yet.</Empty> :
      <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">Item</th><th className="p-3">Status</th><th className="p-3">Target</th><th className="p-3">On website</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(r => <tr key={r.id}><td className="p-3">{can('roadmap.edit') ? <button className="font-medium hover:underline" onClick={() => edit(r)}>{r.title}</button> : r.title}</td><td className="p-3">{r.status.replace('_', ' ')}</td><td className="p-3 text-xs">{r.target_date ?? '—'}</td><td className="p-3 text-xs">{r.is_public && r.approved ? 'Yes' : r.is_public ? 'Waiting for approval' : 'No'}</td></tr>)}</tbody></table>}</div><Toast msg={toast} /></>;
}
