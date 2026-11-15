import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, Empty, ErrorBox } from '../components/ui';
import { StatusBadge } from '../components/Workflow';
import { fmt } from '../lib/util';

interface Row { id: string; title: string; slug: string; status: string; visibility: string; updated_at: string }
export default function Pages() {
  const { can } = useAuth(); const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const load = useCallback(async () => { const { data, error } = await supabase.from('website_pages').select('id,title,slug,status,visibility,updated_at').order('sort_order').order('title'); if (error) setErr(error.message); setRows((data ?? []) as Row[]); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <Spinner />;
  return <><PageHeader title="Website Pages" sub="New pages you publish are available at soilpassport.com/page.html?slug=… The existing pages (Home, About, Platform…) are not managed here yet." actions={can('pages.edit') ? <Link to="/pages/new" className="btn btn-primary">New page</Link> : undefined} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <div className="card overflow-x-auto">{rows.length === 0 ? <Empty>No pages yet.</Empty> :
      <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">Title</th><th className="p-3">Visibility</th><th className="p-3">Status</th><th className="p-3">Updated</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(r => <tr key={r.id}><td className="p-3"><Link className="font-medium hover:underline" to={`/pages/${r.id}`}>{r.title}</Link><div className="text-xs text-slate-400">page.html?slug={r.slug}</div></td><td className="p-3">{r.visibility}</td><td className="p-3"><StatusBadge status={r.status} /></td><td className="whitespace-nowrap p-3 text-xs text-slate-500">{fmt(r.updated_at)}</td></tr>)}</tbody></table>}</div></>;
}
