import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fmt } from '../lib/util';
import { downloadCsv, toCsv } from '../lib/csv';

interface Reg { id: string; name: string; email: string; organisation: string | null; job_title: string | null; country: string | null; status: string; created_at: string }
export default function Registrations({ eventId, title }: { eventId: string; title: string }) {
  const { can } = useAuth(); const [rows, setRows] = useState<Reg[]>([]); const [err, setErr] = useState('');
  const load = useCallback(async () => { const { data, error } = await supabase.from('event_registrations').select('id,name,email,organisation,job_title,country,status,created_at').eq('event_id', eventId).order('created_at', { ascending: false }); if (error) setErr(error.message); setRows((data ?? []) as Reg[]); }, [eventId]);
  useEffect(() => { if (can('registrations.view')) void load(); }, [load, can]);
  if (!can('registrations.view')) return null;
  async function set(r: Reg, status: string) { const { error } = await supabase.from('event_registrations').update({ status, ...(status === 'cancelled' ? { cancelled_at: new Date().toISOString() } : {}) }).eq('id', r.id); if (error) { setErr(error.message); return; } setRows(rows.map(x => x.id === r.id ? { ...x, status } : x)); }
  async function exp() { const d = rows.map(r => ({ ...r })); await downloadCsv(`registrations-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.csv`, toCsv(d, ['name', 'email', 'organisation', 'job_title', 'country', 'status', 'created_at'].map(k => ({ key: k as never, label: k }))), 'registrations.exported', d.length); }
  return <section className="card space-y-3 p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Registrations ({rows.length})</h2>{rows.length > 0 && can('registrations.export') && <button type="button" className="btn btn-ghost" onClick={() => void exp()}>Export CSV</button>}</div>
    {err && <p className="text-sm text-red-700">{err}</p>}{rows.length === 0 ? <p className="text-sm text-slate-500">No registrations yet.</p> :
      <ul className="divide-y divide-slate-100 text-sm">{rows.map(r => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><strong>{r.name}</strong> · {r.email}<span className="block text-xs text-slate-500">{[r.organisation, r.job_title, r.country].filter(Boolean).join(' · ')} · {fmt(r.created_at)}</span></span>
        <select aria-label={`Status for ${r.name}`} className="input w-auto text-xs" value={r.status} disabled={!can('registrations.manage')} onChange={e => void set(r, e.target.value)}>{['registered', 'cancelled', 'attended', 'no_show'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></li>)}</ul>}</section>;
}
