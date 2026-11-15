import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, Empty, ErrorBox } from '../components/ui';
import { StatusBadge } from '../components/Workflow';
import { fmt } from '../lib/util';

interface Row { id: string; title: string; slug: string; status: string; updated_at: string; published_at: string | null; article_categories: { name: string } | null }
const STATUSES = ['', 'draft', 'pending_review', 'approved', 'scheduled', 'published', 'archived'];

export default function Articles() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Row[]>([]); const [q, setQ] = useState(''); const [st, setSt] = useState(''); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('articles').select('id,title,slug,status,updated_at,published_at,article_categories(name)').order('updated_at', { ascending: false }).limit(200);
    if (st) query = query.eq('status', st);
    if (q.trim()) query = query.ilike('title', `%${q.trim().replace(/[%_]/g, '')}%`);
    const { data, error } = await query; if (error) setErr(error.message);
    setRows((data ?? []) as unknown as Row[]); setLoading(false);
  }, [q, st]);
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [load]);
  return <>
    <PageHeader title="News & Articles" sub="Articles you publish appear on soilpassport.com/news.html." actions={can('articles.edit') ? <Link to="/articles/new" className="btn btn-primary">New article</Link> : undefined} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <div className="mb-4 flex flex-wrap gap-3"><input aria-label="Search titles" className="input max-w-xs" placeholder="Search title…" value={q} onChange={e => setQ(e.target.value)} />
      <select aria-label="Filter by status" className="input w-auto" value={st} onChange={e => setSt(e.target.value)}>{STATUSES.map(s => <option key={s} value={s}>{s ? s.replace('_', ' ') : 'All statuses'}</option>)}</select></div>
    <div className="card overflow-x-auto">{loading ? <Spinner /> : rows.length === 0 ? <Empty>No articles yet.{can('articles.edit') && <> <Link className="underline" to="/articles/new">Write the first one</Link>.</>}</Empty> :
      <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">Title</th><th className="p-3">Category</th><th className="p-3">Status</th><th className="p-3">Updated</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(r => <tr key={r.id}><td className="p-3"><Link className="font-medium hover:underline" to={`/articles/${r.id}`}>{r.title}</Link><div className="text-xs text-slate-400">/{r.slug}</div></td>
          <td className="p-3">{r.article_categories?.name ?? '—'}</td><td className="p-3"><StatusBadge status={r.status} /></td><td className="whitespace-nowrap p-3 text-xs text-slate-500">{fmt(r.updated_at)}</td></tr>)}</tbody></table>}</div></>;
}
