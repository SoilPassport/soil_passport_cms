import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, ErrorBox } from '../components/ui';
import { toCsv, downloadCsv } from '../lib/csv';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const tally = (rows: Record<string, unknown>[], k: string) => { const m: Record<string, number> = {}; rows.forEach(r => { const v = String(r[k] ?? 'unknown'); m[v] = (m[v] ?? 0) + 1; }); return m; };
interface Traffic { views: number; visitors: number; daily: { day: string; views: number; visitors: number }[]; pages: { path: string; views: number; visitors: number }[]; referrers: { name: string; views: number }[]; devices: { name: string; views: number }[]; countries: { name: string; views: number }[] }
interface Block { title: string; cols: string[]; rows: (string | number)[][] }

export default function Reports() {
  const { can } = useAuth();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 90 * 864e5))); const [to, setTo] = useState(iso(new Date()));
  const [blocks, setBlocks] = useState<Block[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [capped, setCapped] = useState(false); const [traffic, setTraffic] = useState<Traffic | null>(null); const [tErr, setTErr] = useState('');

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
      if (can('documents.view')) { const { data } = await supabase.from('documents').select('title,access_level,download_count').gt('download_count', 0).order('download_count', { ascending: false }).limit(15); out.push({ title: 'Most downloaded documents (all time)', cols: ['Document', 'Access', 'Downloads'], rows: (data ?? []).map(d => [d.title, String(d.access_level).replace('_', ' '), d.download_count] as (string | number)[]) }); }
      setTErr(''); setTraffic(null);
      if (can('reports.view')) {
        const { data, error } = await supabase.rpc('analytics_summary', { p_from: from, p_to: to });
        if (error) setTErr(error.message.includes('Range') ? 'Choose a range of 400 days or less to see website traffic.' : error.message); else {
          const t = data as Traffic; setTraffic(t);
          out.push({ title: 'Website traffic: top pages', cols: ['Page', 'Views', 'Visitors'], rows: t.pages.map(p => [p.path, p.views, p.visitors] as (string | number)[]) });
          out.push({ title: 'Website traffic: sources', cols: ['Source', 'Views'], rows: t.referrers.map(r => [r.name, r.views] as (string | number)[]) });
          out.push({ title: 'Website traffic: devices', cols: ['Device', 'Views'], rows: t.devices.map(r => [r.name, r.views] as (string | number)[]) });
          out.push({ title: 'Website traffic: countries', cols: ['Country', 'Views'], rows: t.countries.map(r => [r.name, r.views] as (string | number)[]) });
        }
      }
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
    {!loading && tErr && <div className="mb-4"><ErrorBox msg={tErr} /></div>}
    {!loading && traffic && <section className="card mb-4 p-4" aria-label="Website traffic"><h2 className="mb-1 font-medium">Website traffic</h2>
      <p className="mb-3 text-xs text-slate-500">Cookie-free page views counted by the website. A visitor is counted once per day. Browsers that send Do Not Track and known bots are not counted.</p>
      <div className="mb-4 flex gap-8 text-sm"><div><div className="text-2xl font-semibold">{traffic.views}</div>page views</div><div><div className="text-2xl font-semibold">{traffic.visitors}</div>visitors (one person counts once per day)</div></div>
      {traffic.daily.length > 0 ? <Bars data={traffic.daily} /> : <p className="text-sm text-slate-500">No views recorded in this range yet.</p>}</section>}
    {loading ? <Spinner /> : <div className="grid gap-4 lg:grid-cols-2">{blocks.map(b => <div key={b.title} className="card overflow-x-auto p-4"><h2 className="mb-2 font-medium">{b.title}</h2>
      {b.rows.length === 0 ? <p className="text-sm text-slate-500">No data.</p> : <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr>{b.cols.map(c => <th key={c} className="p-2">{c}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{b.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="p-2">{v}</td>)}</tr>)}</tbody></table>}</div>)}</div>}</>;
}

function Bars({ data }: { data: { day: string; views: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.views)); const w = Math.max(6, Math.floor(600 / data.length));
  return <div className="overflow-x-auto"><svg role="img" aria-label={`Daily page views, peak ${max}`} width={Math.max(300, w * data.length)} height="120" className="block">
    {data.map((d, i) => { const h = Math.round((d.views / max) * 100); return <g key={d.day}><title>{`${d.day}: ${d.views} views`}</title><rect x={i * w + 1} y={110 - h} width={Math.max(2, w - 2)} height={h} rx="2" className="fill-emerald-600" /></g>; })}
    <line x1="0" x2="100%" y1="110" y2="110" className="stroke-slate-300" /><text x="0" y="12" className="fill-slate-500 text-[10px]">{max}</text></svg>
    <div className="flex justify-between text-[10px] text-slate-500"><span>{data[0].day}</span><span>{data[data.length - 1].day}</span></div></div>;
}
