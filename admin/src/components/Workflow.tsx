import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { actionsFor, transition, STATUS_TONE, type Action, type Entity } from '../lib/workflow';
import { Badge, ErrorBox } from './ui';
import { fmt } from '../lib/util';

interface Ev { id: number; action: string; from_status: string | null; to_status: string | null; comment: string | null; created_at: string }

export function StatusBadge({ status }: { status: string }) { return <Badge tone={STATUS_TONE[status] ?? 'slate'}>{status.replace('_', ' ')}</Badge>; }

export default function Workflow({ entity, id, status, publishAt, dirty, onChanged }: { entity: Entity; id: string; status: string; publishAt: string | null; dirty: boolean; onChanged: () => void }) {
  const { can, profile } = useAuth();
  const [comment, setComment] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [hist, setHist] = useState<Ev[]>([]);
  const load = useCallback(async () => { const { data } = await supabase.from('workflow_events').select('id,action,from_status,to_status,comment,created_at').eq('entity_type', entity).eq('entity_id', id).order('created_at', { ascending: false }).limit(20); setHist((data ?? []) as Ev[]); }, [entity, id]);
  useEffect(() => { void load(); }, [load, status]);

  async function run(a: Action, needsComment?: boolean) {
    setErr('');
    if (dirty) { setErr('Save your changes first.'); return; }
    if (needsComment && !comment.trim()) { setErr('Add a comment explaining the changes needed.'); return; }
    setBusy(true);
    try { await transition(entity, id, status, a, profile!.id, { comment, publishAt }); setComment(''); onChanged(); await load(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  const acts = actionsFor(entity, status, can);
  return (
    <section className="card p-4" aria-label="Publishing workflow">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Status</h2><StatusBadge status={status} /></div>
      {err && <div className="mb-3"><ErrorBox msg={err} /></div>}
      {acts.length > 0 && <>
        <label className="label" htmlFor="wf-comment">Comment (optional)</label>
        <textarea id="wf-comment" className="input mb-3" rows={2} value={comment} onChange={e => setComment(e.target.value)} />
        <div className="flex flex-wrap gap-2">{acts.map(a => <button key={a.action} type="button" disabled={busy} onClick={() => void run(a.action, a.needsComment)} className={`btn ${a.primary ? 'btn-primary' : 'btn-ghost'}`}>{a.label}</button>)}</div></>}
      {acts.length === 0 && <p className="text-sm text-slate-500">No actions available for your role at this stage.</p>}
      {hist.length > 0 && <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">{hist.map(h => <li key={h.id}><span className="font-medium">{h.action.replace('_', ' ')}</span> → {h.to_status?.replace('_', ' ')} <span className="text-slate-400">· {fmt(h.created_at)}</span>{h.comment && <div className="text-slate-500">“{h.comment}”</div>}</li>)}</ul>}
    </section>);
}
