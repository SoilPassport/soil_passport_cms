import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, Badge } from '../components/ui';

type Tile = { label: string; value: number | string; tone?: 'amber' | 'red' | 'green'; perm: string };
const iso = (d: Date) => d.toISOString().slice(0, 10);
async function count(table: string, f?: (q: any) => any): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let q = supabase.from(table).select('*', { count: 'exact', head: true }); if (f) q = f(q);
  const { count: c, error } = await q; if (error) throw error; return c ?? 0;
}

export default function Dashboard() {
  const { can } = useAuth();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 864e5))); const [to, setTo] = useState(iso(new Date()));
  const [tiles, setTiles] = useState<Tile[]>([]); const [byKind, setByKind] = useState<Record<string, number>>({});
  const [audit, setAudit] = useState<{ id: number; occurred_at: string; actor_email: string | null; action: string }[]>([]);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    const range = (q: any) => q.gte('created_at', from).lt('created_at', iso(new Date(new Date(to).getTime() + 864e5))); // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      const jobs: Promise<Tile | null>[] = [
        can('articles.view') ? count('articles', q => q.eq('status', 'published')).then(v => ({ label: 'Published articles', value: v, perm: '' })) : Promise.resolve(null),
        can('articles.view') ? count('articles', q => q.in('status', ['draft', 'scheduled'])).then(v => ({ label: 'Draft & scheduled articles', value: v, perm: '' })) : Promise.resolve(null),
        can('events.view') ? count('events', q => q.in('status', ['published', 'scheduled']).gte('starts_at', new Date().toISOString())).then(v => ({ label: 'Upcoming events', value: v, perm: '' })) : Promise.resolve(null),
        can('registrations.view') ? count('event_registrations', range).then(v => ({ label: 'Event registrations (range)', value: v, perm: '' })) : Promise.resolve(null),
        can('media.view') ? count('media_assets', q => q.eq('status', 'active')).then(v => ({ label: 'Media assets', value: v, perm: '' })) : Promise.resolve(null),
        can('documents.view') ? count('documents', q => q.neq('status', 'archived')).then(v => ({ label: 'Documents', value: v, perm: '' })) : Promise.resolve(null),
        count('enquiries', q => range(q).eq('status', 'new')).then(v => ({ label: 'New enquiries (range)', value: v, tone: v ? 'amber' : undefined, perm: '' } as Tile)),
        count('enquiries', q => q.eq('status', 'new').is('assigned_to', null)).then(v => ({ label: 'Unassigned leads', value: v, tone: v ? 'amber' : undefined, perm: '' } as Tile)),
        can('crm.view') ? count('crm_sync_jobs', q => q.in('status', ['failed'])).then(v => ({ label: 'HubSpot failed syncs', value: v, tone: v ? 'red' : 'green', perm: '' } as Tile)) : Promise.resolve(null),
        can('articles.approve') || can('pages.approve') ? Promise.all(['articles', 'website_pages', 'events', 'documents'].map(t => count(t, q => q.eq('status', 'pending_review')))).then(a => ({ label: 'Awaiting approval', value: a.reduce((x, y) => x + y, 0), tone: a.some(Boolean) ? 'amber' : undefined, perm: '' } as Tile)) : Promise.resolve(null),
      ];
      setTiles((await Promise.all(jobs)).filter(Boolean) as Tile[]);
      const { data: ks } = await range(supabase.from('enquiries').select('kind').limit(5000));
      const m: Record<string, number> = {}; (ks ?? []).forEach((r: { kind: string }) => { m[r.kind] = (m[r.kind] ?? 0) + 1; }); setByKind(m);
      if (can('audit.view')) { const { data } = await supabase.from('audit_logs').select('id,occurred_at,actor_email,action').order('occurred_at', { ascending: false }).limit(8); setAudit(data ?? []); }
    } catch (e) { setErr((e as Error).message); }
    setLoading(false);
  }, [from, to, can]);
  useEffect(() => { void load(); }, [load]);

  const max = Math.max(1, ...Object.values(byKind));
  return <>
    <PageHeader title="Dashboard" sub="Live counts from your CMS database. Empty until content and enquiries exist."
      actions={<div className="flex items-end gap-2"><div><label className="label" htmlFor="f">From</label><input id="f" type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label className="label" htmlFor="t">To</label><input id="t" type="date" className="input" value={to} onChange={e => setTo(e.target.value)} /></div></div>} />
    {err && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
    {loading ? <Spinner /> : <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{tiles.map(t => (
        <div key={t.label} className="card p-4"><div className="text-xs text-slate-500">{t.label}</div>
          <div className={`mt-1 text-2xl font-semibold ${t.tone === 'red' ? 'text-red-600' : t.tone === 'amber' ? 'text-amber-600' : ''}`}>{t.value}</div></div>))}</div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-4"><h2 className="mb-3 text-sm font-semibold">Enquiries by type</h2>
          {Object.keys(byKind).length === 0 ? <p className="text-sm text-slate-500">No enquiries in this date range.</p> :
            <ul className="space-y-2">{Object.entries(byKind).map(([k, v]) => <li key={k} className="flex items-center gap-3 text-sm"><span className="w-28 capitalize text-slate-600">{k.replace('_', ' ')}</span>
              <div className="h-3 flex-1 rounded bg-slate-100"><div className="h-3 rounded bg-brand-500" style={{ width: `${(v / max) * 100}%` }} /></div><span className="w-8 text-right tabular-nums">{v}</span></li>)}</ul>}</section>
        {can('audit.view') && <section className="card p-4"><h2 className="mb-3 text-sm font-semibold">Recent administrator activity</h2>
          {audit.length === 0 ? <p className="text-sm text-slate-500">No activity recorded yet.</p> :
            <ul className="divide-y divide-slate-100 text-sm">{audit.map(a => <li key={a.id} className="flex items-center justify-between gap-2 py-2"><span><Badge>{a.action}</Badge> <span className="text-slate-500">{a.actor_email ?? 'system'}</span></span><time className="text-xs text-slate-400">{new Date(a.occurred_at).toLocaleString()}</time></li>)}</ul>}</section>}
      </div></>}
  </>;
}
