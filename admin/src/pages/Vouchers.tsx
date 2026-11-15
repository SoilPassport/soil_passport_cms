import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, Empty, ErrorBox, Field, Toast, Badge } from '../components/ui';
import { fmt, fromLocalInput, toLocalInput } from '../lib/util';

interface V { id: string; code: string; description: string | null; benefit_type: string; benefit_value: number | null; currency: string; event_id: string | null; max_redemptions: number | null; valid_from: string | null; valid_until: string | null; active: boolean; redeemed_count: number; created_at: string }
interface Ev { id: string; title: string }
interface Reg { id: string; name: string; email: string; created_at: string; status: string }
const BENEFITS = [['access', 'Access code (no discount)'], ['free_place', 'Free place'], ['percent_off', 'Percentage off'], ['amount_off', 'Amount off']];
const EMPTY = { code: '', description: '', benefit_type: 'access', benefit_value: '', currency: 'GBP', event_id: '', max_redemptions: '', valid_from: '', valid_until: '', active: true };
const gen = () => { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(8)); return [...r].map(x => a[x % a.length]).join(''); };
const benefitText = (v: V) => v.benefit_type === 'free_place' ? 'Free place' : v.benefit_type === 'percent_off' ? `${v.benefit_value}% off` : v.benefit_type === 'amount_off' ? `${v.currency} ${v.benefit_value} off` : 'Access code';

export default function Vouchers() {
  const { can, profile } = useAuth();
  const [rows, setRows] = useState<V[]>([]); const [events, setEvents] = useState<Ev[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [toast, setToast] = useState('');
  const [cur, setCur] = useState<V | null>(null); const [creating, setCreating] = useState(false); const [f, setF] = useState(EMPTY); const [regs, setRegs] = useState<Reg[]>([]); const [busy, setBusy] = useState(false);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };
  const load = useCallback(async () => {
    const [v, e] = await Promise.all([supabase.from('voucher_codes').select('*').order('created_at', { ascending: false }).limit(500), supabase.from('events').select('id,title').eq('registration_mode', 'native').order('starts_at', { ascending: false }).limit(200)]);
    if (v.error) setErr(v.error.message.includes('voucher_codes') ? 'Voucher tables are missing. Run migration 0009 in Supabase.' : v.error.message);
    setRows((v.data ?? []) as V[]); setEvents((e.data ?? []) as Ev[]); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const evName = (id: string | null) => id ? events.find(e => e.id === id)?.title ?? 'One event' : 'Any event';
  async function open(v: V | null) {
    setErr(''); setCur(v); setCreating(v === null); setRegs([]);
    setF(v ? { code: v.code, description: v.description ?? '', benefit_type: v.benefit_type, benefit_value: v.benefit_value?.toString() ?? '', currency: v.currency, event_id: v.event_id ?? '', max_redemptions: v.max_redemptions?.toString() ?? '', valid_from: toLocalInput(v.valid_from), valid_until: toLocalInput(v.valid_until), active: v.active } : { ...EMPTY, code: gen() });
    if (v) { const { data } = await supabase.from('event_registrations').select('id,name,email,created_at,status').eq('voucher_id', v.id).order('created_at', { ascending: false }).limit(200); setRegs((data ?? []) as Reg[]); }
  }
  async function save() {
    setErr('');
    const code = f.code.trim().toUpperCase(); if (!/^[A-Z0-9_-]{3,32}$/.test(code)) { setErr('Code: 3 to 32 letters, numbers, hyphens or underscores.'); return; }
    const needsValue = f.benefit_type === 'percent_off' || f.benefit_type === 'amount_off'; const val = Number(f.benefit_value);
    if (needsValue && !(val > 0)) { setErr('Enter the discount value.'); return; } if (f.benefit_type === 'percent_off' && val > 100) { setErr('A percentage cannot be over 100.'); return; }
    const max = f.max_redemptions ? Math.round(Number(f.max_redemptions)) : null; if (max !== null && !(max > 0)) { setErr('Maximum uses must be 1 or more.'); return; }
    const from = fromLocalInput(f.valid_from), until = fromLocalInput(f.valid_until); if (from && until && new Date(until) <= new Date(from)) { setErr('"Valid until" must be after "Valid from".'); return; }
    const row = { code, description: f.description.trim() || null, benefit_type: f.benefit_type, benefit_value: needsValue ? val : null, currency: f.currency.trim().toUpperCase() || 'GBP', event_id: f.event_id || null, max_redemptions: max, valid_from: from, valid_until: until, active: f.active };
    setBusy(true);
    const r = cur ? await supabase.from('voucher_codes').update(row).eq('id', cur.id).select('*').single() : await supabase.from('voucher_codes').insert({ ...row, created_by: profile!.id }).select('*').single();
    setBusy(false);
    if (r.error) { setErr(r.error.code === '23505' ? 'That code already exists.' : r.error.message); return; }
    await supabase.rpc('write_audit', { p_action: cur ? 'voucher.updated' : 'voucher.created', p_entity_type: 'event', p_entity_id: (r.data as V).id, p_details: { code } });
    flash('Saved'); setCur(r.data as V); setCreating(false); await load();
  }
  async function del() {
    if (!cur || !window.confirm(`Delete code ${cur.code}?`)) return;
    const { data, error } = await supabase.from('voucher_codes').delete().eq('id', cur.id).select('id');
    if (error) { setErr(error.message); return; } if (!data?.length) { setErr('A code that has been used cannot be deleted. Switch it off instead.'); return; }
    setCur(null); setCreating(false); await load();
  }
  if (loading) return <Spinner />;
  const editor = cur !== null || creating; const dis = !can('events.edit');
  return <><PageHeader title="Vouchers & Coupons" sub="Codes people enter when registering for an event. The system checks and counts them. It does not take payment: the benefit is shown to the person, saved on their registration and passed to HubSpot, so your team (or Eventbrite) can honour it." actions={can('events.edit') && <button className="btn btn-primary" onClick={() => void open(null)}>New code</button>} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="card overflow-x-auto">{rows.length === 0 ? <Empty>No codes yet.</Empty> : <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">Code</th><th className="p-3">Benefit</th><th className="p-3">Event</th><th className="p-3">Used</th><th className="p-3">Status</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(v => { const expired = v.valid_until && new Date(v.valid_until) < new Date(); const full = v.max_redemptions !== null && v.redeemed_count >= v.max_redemptions;
          return <tr key={v.id} className={`cursor-pointer hover:bg-slate-50 ${cur?.id === v.id ? 'bg-slate-50' : ''}`} onClick={() => void open(v)}><td className="p-3 font-mono font-medium">{v.code}</td><td className="p-3">{benefitText(v)}</td><td className="p-3">{evName(v.event_id)}</td><td className="p-3">{v.redeemed_count}{v.max_redemptions !== null ? ` / ${v.max_redemptions}` : ''}</td>
            <td className="p-3">{!v.active ? <Badge>Off</Badge> : expired ? <Badge tone="red">Expired</Badge> : full ? <Badge tone="amber">All used</Badge> : <Badge tone="green">Active</Badge>}</td></tr>; })}</tbody></table>}</div>
      <div>{editor ? <div className="card space-y-4 p-4">
        <Field label="Code" htmlFor="v-code" hint="Letters, numbers, - and _. Not case sensitive."><div className="flex gap-2"><input id="v-code" className="input font-mono uppercase" maxLength={32} value={f.code} disabled={dis} onChange={e => setF({ ...f, code: e.target.value })} />{!dis && !cur && <button type="button" className="btn btn-ghost" onClick={() => setF({ ...f, code: gen() })}>Generate</button>}</div></Field>
        <Field label="Note (for your team)" htmlFor="v-desc"><input id="v-desc" className="input" maxLength={200} value={f.description} disabled={dis} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Benefit" htmlFor="v-ben"><select id="v-ben" className="input" value={f.benefit_type} disabled={dis} onChange={e => setF({ ...f, benefit_type: e.target.value })}>{BENEFITS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        {(f.benefit_type === 'percent_off' || f.benefit_type === 'amount_off') && <div className="grid grid-cols-2 gap-3"><Field label={f.benefit_type === 'percent_off' ? 'Percent off' : 'Amount off'} htmlFor="v-val"><input id="v-val" className="input" type="number" min="0.01" step="0.01" value={f.benefit_value} disabled={dis} onChange={e => setF({ ...f, benefit_value: e.target.value })} /></Field>
          {f.benefit_type === 'amount_off' && <Field label="Currency" htmlFor="v-cur"><input id="v-cur" className="input uppercase" maxLength={3} value={f.currency} disabled={dis} onChange={e => setF({ ...f, currency: e.target.value })} /></Field>}</div>}
        <Field label="Works for" htmlFor="v-ev" hint="Only events with registration on this website are listed."><select id="v-ev" className="input" value={f.event_id} disabled={dis} onChange={e => setF({ ...f, event_id: e.target.value })}><option value="">Any event</option>{events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></Field>
        <Field label="Maximum uses (optional)" htmlFor="v-max" hint="Each email address can use a code once."><input id="v-max" className="input" type="number" min="1" value={f.max_redemptions} disabled={dis} onChange={e => setF({ ...f, max_redemptions: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Valid from" htmlFor="v-from"><input id="v-from" className="input" type="datetime-local" value={f.valid_from} disabled={dis} onChange={e => setF({ ...f, valid_from: e.target.value })} /></Field><Field label="Valid until" htmlFor="v-to"><input id="v-to" className="input" type="datetime-local" value={f.valid_until} disabled={dis} onChange={e => setF({ ...f, valid_until: e.target.value })} /></Field></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} disabled={dis} onChange={e => setF({ ...f, active: e.target.checked })} />Code is switched on</label>
        {!dis && <div className="flex gap-2"><button className="btn btn-primary flex-1" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save code'}</button>{cur && can('events.delete') && <button className="btn btn-danger" onClick={() => void del()}>Delete</button>}</div>}
        {cur && <div><h3 className="mb-1 text-sm font-semibold">Used by ({regs.length})</h3>{regs.length === 0 ? <p className="text-xs text-slate-500">Nobody yet.</p> : <ul className="divide-y divide-slate-100 text-xs">{regs.map(r => <li key={r.id} className="flex justify-between gap-2 py-1.5"><span>{r.name} · {r.email}</span><span className="text-slate-500">{fmt(r.created_at)}</span></li>)}</ul>}</div>}
      </div> : <div className="card"><Empty>Select a code or create a new one.</Empty></div>}</div>
    </div><Toast msg={toast} /></>;
}
