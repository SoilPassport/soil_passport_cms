import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, ErrorBox } from '../components/ui';
import { toCsv, downloadCsv } from '../lib/csv';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const tally = (rows: Record<string, unknown>[], k: string) => { const m: Record<string, number> = {}; rows.forEach(r => { const v = String(r[k] ?? 'unknown'); m[v] = (m[v] ?? 0) + 1; }); return m; };
interface Block { title: string; cols: string[]; rows: (string | number)[][] }

export default function Reports() {
  const { can } = useAuth();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 90 * 864e5))); const [to, setTo] = useState(iso(new Date()));
  const [blocks, setBlocks] = useState<Block[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [capped, setCapped] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(''); const end = iso(new Date(new Date(to).getTime() + 864e5)); const out: Block[] = []; let cap = false;
    const grab = async (table: string, cols: string, ranged = true) => { let q = supabase.from(table).select(cols).limit(5000); if (ranged) q = q.gte('created_at', from).lt('created_at', end); const { data, error } = await q; if (error) throw error; if ((data ?? []).length >= 5000) cap = true; return (data ?? []) as unknown as Record<string, unknown>[]; };
    try {
      const content = [['articles', 'Articles', 'articles.view'], ['website_pages', 'Website pages', 'pages.view'], ['events', 'Events', 'events.view'], ['documents', 'Documents', 'documents.view'], ['galleries', 'Galleries', 'gallery.view']] as const;
      const rowsC: (string | number)[][] = [];
      for (const [t, label, perm] of content) if (can(perm)) { const r = tally(await grab(t, 'status', false), 'status'); rowsC.push([label, r.published ?? 0, (r.draft ?? 0) + (r.pending_review ?? 0) + (r.approved ?? 0) + (r.scheduled ?? 0), r.archived ?? 0]); }
      if (rowsC.length) out.push({ title: 'Content by status (all time)', cols: ['Module', 'Published', 'In progress', 'Archived'], rows: rowsC });
      const enq = await grab('enquiries', 'kind,status,created_at');
      if (enq.length || true) {
        const months: Record<string, Record<string, number>> = {};
        enq.forEach(e => { const m = String(e.created_at).slice(0, 7); months[m] ??= {}; const k = String(e.kind); months[m][k] = (months[m][k] ?? 0) + 1; });
        const kinds = [...new Set(enq.map(e => String(e.kind)))].sort();
        out.push({ title: 'Enquiries per month', cols: ['Month', ...kinds, 'Total'], rows: Object.keys(months).sort().map(m => [m, ...kinds.map(k => months[m][k] ?? 0), Object.values(months[m]).reduce((a, b) => a + b, 0)]) });
        const st = tally(enq, 'status'); out.push({ title: 'Enquiries by status (in range)', cols: ['Status', 'Count'], rows: Object.entries(st).sort() });
      }
      if (can('registrations.view')) {
        const reg = await grab('event_registrations', 'event_id,status,created_at'); const ids = [...new Set(reg.map(r => String(r.event_id)))];
        const names: Record<string, string> = {}; if (ids.length) { const { data } = await supabase.from('events').select('id,title').in('id', ids); (data ?? []).forEach(e => { names[e.id] = e.title; }); }
        const per = tally(reg, 'event_id'); out.push({ title: 'Event registrations (in range)', cols: ['Event', 'Registrations'], rows: Object.entries(per).map(([id, n]) => [names[id] ?? id, n] as (string | number)[]).sort((a, b) => Number(b[1]) - Number(a[1])) });
      }
      if (can('newsletter.view')) { const s = tally(await grab('newsletter_subscribers', 'status', false), 'status'); out.push({ title: 'Newsletter subscribers (all time)', cols: ['Status', 'Count'], rows: Object.entries(s).sort() }); }
      if (can('crm.view')) { const s = tally(await grab('crm_sync_jobs', 'status', false), 'status'); out.push({ title: 'HubSpot sync jobs (all time)', cols: ['Status', 'Count'], rows: Object.entries(s).sort() }); }
      setBlocks(out); setCapped(cap);
    } catch (e) { setErr((e as Error).message); } setLoading(false);
  }, [from, to, can]);
  useEffect(() => { void load(); }, [load]);

  async function exportAll() {
    const lines: string[] = [];
    blocks.forEach(b => { lines.push(toCsv(b.rows.map(r => Object.fromEntries(r.map((v, i) => ['c' + i, v]))), b.cols.map((c, i) => ({ key: 'c' + i, label: i === 0 ? `${b.title} - ${c}` : c })))); lines.push(''); });
    await downloadCsv(`soilpassport-report-${from}-to-${to}.csv`, lines.join('\r\n'), 'reports.export', blocks.length);
  }
  return <><PageHeader title="Reports & Analytics" sub="Counts from the CMS database. Website visitor analytics (page views, traffic sources) are not collected here; use a privacy-respecting analytics tool for that." actions={can('reports.view') && blocks.length > 0 && <button className="btn" onClick={() => void exportAll()}>Export CSV</button>} />
    <div className="mb-4 flex flex-wrap items-end gap-3 text-sm"><label>From<br /><input type="date" className="input" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label><label>To<br /><input type="date" className="input" value={to} min={from} onChange={e => setTo(e.target.value)} /></label></div>
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    {capped && <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">One or more reports reached the 5,000-row limit, so figures may be understated. Narrow the date range.</div>}
    {loading ? <Spinner /> : <div className="grid gap-4 lg:grid-cols-2">{blocks.map(b => <div key={b.title} className="card overflow-x-auto p-4"><h2 className="mb-2 font-medium">{b.title}</h2>
      {b.rows.length === 0 ? <p className="text-sm text-slate-500">No data.</p> : <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr>{b.cols.map(c => <th key={c} className="p-2">{c}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{b.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="p-2">{v}</td>)}</tr>)}</tbody></table>}</div>)}</div>}</>;
}
