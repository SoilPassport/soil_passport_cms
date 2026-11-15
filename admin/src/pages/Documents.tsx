import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, Empty, ErrorBox } from '../components/ui';
import { StatusBadge } from '../components/Workflow';
import { fmt } from '../lib/util';

interface Row { id: string; title: string; category: string; status: string; updated_at: string }
export default function Documents() {
  const { can } = useAuth(); const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const load = useCallback(async () => { const { data, error } = await supabase.from('documents').select('id,title,category,status,updated_at').order('updated_at', { ascending: false }); if (error) setErr(error.message); setRows((data ?? []) as Row[]); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <Spinner />;
  return <><PageHeader title="Document Management" sub="Brochures, reports and white papers with version history. Published documents appear on soilpassport.com/downloads.html." actions={can('documents.edit') ? <Link to="/documents/new" className="btn btn-primary">New document</Link> : undefined} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <div className="card overflow-x-auto">{rows.length === 0 ? <Empty>No documents yet.</Empty> :
      <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">Document</th><th className="p-3">Category</th><th className="p-3">Updated</th><th className="p-3">Status</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(r => <tr key={r.id}><td className="p-3"><Link className="font-medium hover:underline" to={`/documents/${r.id}`}>{r.title}</Link></td><td className="p-3">{r.category.replace(/_/g, ' ')}</td><td className="whitespace-nowrap p-3 text-xs">{fmt(r.updated_at)}</td><td className="p-3"><StatusBadge status={r.status} /></td></tr>)}</tbody></table>}</div></>;
}
