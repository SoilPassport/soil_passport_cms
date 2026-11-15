import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { invokeFn, type IntegrationStatus } from '../lib/fn';
import { PageHeader, Spinner, Empty, ErrorBox, Toast } from '../components/ui';
import { fmt } from '../lib/util';

interface Job { id: string; workflow: string; status: string; attempts: number; last_error: string | null; hubspot_contact_id: string | null; hubspot_deal_id: string | null; created_at: string; next_attempt_at: string }
export default function Crm() {
  const { can } = useAuth(); const [rows, setRows] = useState<Job[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [toast, setToast] = useState(''); const [busy, setBusy] = useState(false); const [stat, setStat] = useState<IntegrationStatus | null>(null);
  const load = useCallback(async () => { const { data, error } = await supabase.from('crm_sync_jobs').select('id,workflow,status,attempts,last_error,hubspot_contact_id,hubspot_deal_id,created_at,next_attempt_at').order('created_at', { ascending: false }).limit(200); if (error) setErr(error.message); setRows((data ?? []) as Job[]); setLoading(false); }, []);
  useEffect(() => { void load(); invokeFn<IntegrationStatus>('integrations', { action: 'status' }).then(setStat).catch(() => setStat(null)); }, [load]);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };
  async function run(body: Record<string, unknown>, label: string) { setBusy(true); setErr(''); try { await invokeFn('integrations', body); flash(label); await load(); } catch (e) { setErr((e as Error).message); } setBusy(false); }
  if (loading) return <Spinner />;
  const c = (s: string) => rows.filter(r => r.status === s).length;
  return <><PageHeader title="CRM Integration" sub="Enquiries and event registrations are queued here and pushed to HubSpot as a contact plus a note." actions={can('crm.manage') ? <button className="btn btn-primary" disabled={busy} onClick={() => void run({ action: 'crm_process' }, 'Queue processed')}>{busy ? 'Working…' : 'Process pending now'}</button> : undefined} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <div className={`mb-4 rounded-lg p-3 text-sm ${stat?.hubspot.configured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{stat ? stat.hubspot.configured ? 'HubSpot is configured. Jobs sync automatically after each submission.' : 'HubSpot is not configured yet (add HUBSPOT_ACCESS_TOKEN in Supabase secrets). Jobs wait in the queue until it is.' : 'Could not check HubSpot status. Is the integrations function deployed?'}</div>
    <p className="mb-3 text-sm text-slate-600">{c('pending')} pending · {c('synced')} synced · {c('failed')} failed</p>
    <div className="card overflow-x-auto">{rows.length === 0 ? <Empty>No jobs yet. They appear when someone submits a form.</Empty> :
      <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">Created</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Tries</th><th className="p-3">Detail</th><th className="p-3" /></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(r => <tr key={r.id}><td className="whitespace-nowrap p-3 text-xs">{fmt(r.created_at)}</td><td className="p-3">{r.workflow.replace('_', ' ')}</td><td className="p-3"><span className={r.status === 'failed' ? 'text-red-700' : r.status === 'synced' ? 'text-emerald-700' : ''}>{r.status}</span></td><td className="p-3">{r.attempts}</td><td className="max-w-xs truncate p-3 text-xs text-slate-500" title={r.last_error ?? ''}>{r.last_error ?? (r.hubspot_contact_id ? `Contact ${r.hubspot_contact_id}${r.hubspot_deal_id ? ` · Deal ${r.hubspot_deal_id}` : ''}` : '')}</td>
          <td className="p-3 text-right">{can('crm.manage') && r.status !== 'synced' && <button className="text-xs underline" disabled={busy} onClick={() => void run({ action: 'crm_retry', id: r.id }, 'Retried')}>Retry</button>}</td></tr>)}</tbody></table>}</div><Toast msg={toast} /></>;
}
