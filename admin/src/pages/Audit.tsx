import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PageHeader, Spinner, Empty, ErrorBox } from '../components/ui';
interface Row { id: number; occurred_at: string; actor_email: string | null; action: string; entity_type: string | null; entity_id: string | null; details: object }
const SIZE = 25;
export default function Audit() {
  const [rows, setRows] = useState<Row[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(0); const [q, setQ] = useState(''); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('audit_logs').select('*', { count: 'exact' }).order('occurred_at', { ascending: false }).range(page * SIZE, page * SIZE + SIZE - 1);
    if (q.trim()) query = query.ilike('action', `%${q.trim().replace(/[%_]/g, '')}%`);
    const { data, count, error } = await query; if (error) setErr(error.message); setRows((data ?? []) as Row[]); setTotal(count ?? 0); setLoading(false);
  }, [page, q]);
  useEffect(() => { void load(); }, [load]);
  return <>
    <PageHeader title="Security & Audit Logs" sub="Append-only record of administrative activity." actions={<input aria-label="Filter by action" className="input w-56" placeholder="Filter action…" value={q} onChange={e => { setPage(0); setQ(e.target.value); }} />} />
    {err && <ErrorBox msg={err} />}
    <div className="card overflow-x-auto">{loading ? <Spinner /> : rows.length === 0 ? <Empty>No audit entries.</Empty> :
      <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">Time</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Entity</th><th className="p-3">Details</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(r => <tr key={r.id}><td className="whitespace-nowrap p-3 text-xs">{new Date(r.occurred_at).toLocaleString()}</td><td className="p-3">{r.actor_email ?? 'system'}</td><td className="p-3"><code className="text-xs">{r.action}</code></td><td className="p-3 text-xs">{r.entity_type} {r.entity_id?.slice(0, 8)}</td><td className="max-w-xs truncate p-3 text-xs text-slate-500">{JSON.stringify(r.details)}</td></tr>)}</tbody></table>}</div>
    <div className="mt-3 flex items-center justify-between text-sm text-slate-500"><span>{total} entries</span><div className="flex gap-2"><button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><button className="btn btn-ghost" disabled={(page + 1) * SIZE >= total} onClick={() => setPage(p => p + 1)}>Next</button></div></div></>;
}
