import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, Empty, ErrorBox } from '../components/ui';
import { slugify } from '../lib/util';

export default function Categories() {
  const { can } = useAuth(); const edit = can('articles.edit'); const del = can('articles.delete');
  const [rows, setRows] = useState<{ id: string; name: string; slug: string }[]>([]); const [name, setName] = useState(''); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const load = useCallback(async () => { const { data } = await supabase.from('article_categories').select('id,name,slug').order('name'); setRows(data ?? []); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  async function add(e: FormEvent) { e.preventDefault(); setErr(''); const { error } = await supabase.from('article_categories').insert({ name: name.trim(), slug: slugify(name) }); if (error) setErr(error.code === '23505' ? 'That category already exists.' : error.message); else { setName(''); await load(); } }
  async function remove(id: string, n: string) { if (!window.confirm(`Delete category "${n}"? Articles in it become uncategorised.`)) return; const { error } = await supabase.from('article_categories').delete().eq('id', id); if (error) setErr(error.message); else await load(); }
  if (loading) return <Spinner />;
  return <><PageHeader title="Article categories" sub="Use categories such as News, Press, Insights or Product updates." />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    {edit && <form onSubmit={add} className="card mb-6 flex flex-wrap items-end gap-3 p-4"><div className="min-w-[220px] flex-1"><label className="label" htmlFor="cn">New category</label><input id="cn" className="input" required maxLength={60} value={name} onChange={e => setName(e.target.value)} /></div><button className="btn btn-primary">Add category</button></form>}
    <div className="card">{rows.length === 0 ? <Empty>No categories yet.</Empty> : <ul className="divide-y divide-slate-100">{rows.map(r => <li key={r.id} className="flex items-center justify-between p-3 text-sm"><span>{r.name} <span className="text-xs text-slate-400">/{r.slug}</span></span>{del && <button className="btn btn-ghost py-1 text-xs" onClick={() => void remove(r.id, r.name)}>Delete</button>}</li>)}</ul>}</div></>;
}
