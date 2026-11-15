import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, Empty, ErrorBox } from '../components/ui';
import { StatusBadge } from '../components/Workflow';
import { fmt } from '../lib/util';

interface Row { id: string; title: string; event_type: string; starts_at: string; status: string; featured: boolean }
export default function Events() {
  const { can } = useAuth(); const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const load = useCallback(async () => { const { data, error } = await supabase.from('events').select('id,title,event_type,starts_at,status,featured').order('starts_at', { ascending: false }).limit(200); if (error) setErr(error.message); setRows((data ?? []) as Row[]); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <Spinner />;
  return <><PageHeader title="Events & Webinars" sub="Published events appear on soilpassport.com/events.html. Registration uses an external link for now." actions={can('events.edit') ? <Link to="/events/new" className="btn btn-primary">New event</Link> : undefined} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <div className="card overflow-x-auto">{rows.length === 0 ? <Empty>No events yet.</Empty> :
      <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">Event</th><th className="p-3">Type</th><th className="p-3">Starts</th><th className="p-3">Status</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(r => <tr key={r.id}><td className="p-3"><Link className="font-medium hover:underline" to={`/events/${r.id}`}>{r.title}</Link>{r.featured && <span className="ml-2 text-xs text-amber-700">featured</span>}</td><td className="p-3">{r.event_type.replace(/_/g, ' ')}</td><td className="whitespace-nowrap p-3 text-xs">{fmt(r.starts_at)}</td><td className="p-3"><StatusBadge status={r.status} /></td></tr>)}</tbody></table>}</div></>;
}
