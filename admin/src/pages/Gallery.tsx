import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, Empty, ErrorBox } from '../components/ui';
import { StatusBadge } from '../components/Workflow';

interface Row { id: string; title: string; collection: string | null; status: string }
export default function Gallery() {
  const { can } = useAuth(); const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const load = useCallback(async () => { const { data, error } = await supabase.from('galleries').select('id,title,collection,status').order('created_at', { ascending: false }); if (error) setErr(error.message); setRows((data ?? []) as Row[]); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <Spinner />;
  return <><PageHeader title="Gallery" sub="Albums of photos. Published albums appear on soilpassport.com/gallery.html." actions={can('gallery.edit') ? <Link to="/gallery/new" className="btn btn-primary">New album</Link> : undefined} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <div className="card overflow-x-auto">{rows.length === 0 ? <Empty>No albums yet.</Empty> :
      <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">Album</th><th className="p-3">Collection</th><th className="p-3">Status</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(r => <tr key={r.id}><td className="p-3"><Link className="font-medium hover:underline" to={`/gallery/${r.id}`}>{r.title}</Link></td><td className="p-3">{(r.collection ?? '—').replace(/_/g, ' ')}</td><td className="p-3"><StatusBadge status={r.status} /></td></tr>)}</tbody></table>}</div></>;
}
