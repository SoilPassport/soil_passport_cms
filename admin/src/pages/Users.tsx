import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, Empty, ErrorBox, Badge } from '../components/ui';

interface Role { id: string; key: string; name: string }
interface Row { id: string; email: string; full_name: string | null; status: 'active' | 'suspended' | 'invited'; user_roles: { roles: Role | null }[] }
const audit = (action: string, id: string, details: object = {}) => supabase.rpc('write_audit', { p_action: action, p_entity_type: 'user', p_entity_id: id, p_details: details });

export default function Users() {
  const { can, profile: me } = useAuth();
  const manage = can('users.manage');
  const [rows, setRows] = useState<Row[]>([]); const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [inv, setInv] = useState({ email: '', full_name: '', role_key: 'contributor' }); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [u, r] = await Promise.all([
      supabase.from('profiles').select('id,email,full_name,status,user_roles(roles(id,key,name))').order('email'),
      supabase.from('roles').select('id,key,name').order('name')]);
    if (u.error) setErr(u.error.message); setRows((u.data ?? []) as unknown as Row[]); setRoles(r.data ?? []); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) { setErr(''); setMsg(''); const { error } = await fn(); if (error) setErr(error.message); else await load(); }
  const setStatus = (r: Row, status: Row['status']) => run(async () => { const x = await supabase.from('profiles').update({ status }).eq('id', r.id); if (!x.error) await audit(`user.${status}`, r.id, { email: r.email }); return x; });
  const addRole = (r: Row, role: Role) => run(async () => { const x = await supabase.from('user_roles').insert({ user_id: r.id, role_id: role.id, assigned_by: me?.id }); if (!x.error) await audit('user.role_assigned', r.id, { role: role.key }); return x; });
  const removeRole = (r: Row, role: Role) => run(async () => { const x = await supabase.from('user_roles').delete().eq('user_id', r.id).eq('role_id', role.id); if (!x.error) await audit('user.role_removed', r.id, { role: role.key }); return x; });

  async function invite(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    const { error } = await supabase.functions.invoke('invite-user', { body: inv });
    if (error) setErr('Invite failed. Check the invite-user Edge Function is deployed and you hold users.manage.'); else { setMsg(`Invitation sent to ${inv.email}.`); setInv({ ...inv, email: '', full_name: '' }); await load(); }
    setBusy(false);
  }
  if (loading) return <Spinner />;
  return <>
    <PageHeader title="User Management" sub="Activate, suspend and assign roles. Changes are recorded in the audit log." />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}{msg && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</p>}
    {manage && <form onSubmit={invite} className="card mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_180px_auto] sm:items-end">
      <div><label className="label" htmlFor="ie">Email</label><input id="ie" className="input" type="email" required value={inv.email} onChange={e => setInv({ ...inv, email: e.target.value })} /></div>
      <div><label className="label" htmlFor="in">Full name</label><input id="in" className="input" value={inv.full_name} onChange={e => setInv({ ...inv, full_name: e.target.value })} /></div>
      <div><label className="label" htmlFor="ir">Initial role</label><select id="ir" className="input" value={inv.role_key} onChange={e => setInv({ ...inv, role_key: e.target.value })}>{roles.map(r => <option key={r.id} value={r.key}>{r.name}</option>)}</select></div>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Invite user'}</button></form>}
    <div className="card overflow-x-auto">{rows.length === 0 ? <Empty>No users yet.</Empty> :
      <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">User</th><th className="p-3">Roles</th><th className="p-3">Status</th>{manage && <th className="p-3">Actions</th>}</tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(r => { const mine = r.user_roles.map(x => x.roles).filter(Boolean) as Role[]; const avail = roles.filter(x => !mine.some(m => m.id === x.id)); return (
          <tr key={r.id}><td className="p-3"><div className="font-medium">{r.full_name || '—'}</div><div className="text-xs text-slate-500">{r.email}</div></td>
            <td className="p-3"><div className="flex flex-wrap gap-1">{mine.map(m => <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{m.name}{manage && <button aria-label={`Remove ${m.name}`} className="text-slate-400 hover:text-red-600" onClick={() => void removeRole(r, m)}>×</button>}</span>)}{mine.length === 0 && <span className="text-xs text-slate-400">none</span>}</div></td>
            <td className="p-3"><Badge tone={r.status === 'active' ? 'green' : r.status === 'suspended' ? 'red' : 'amber'}>{r.status}</Badge></td>
            {manage && <td className="p-3"><div className="flex flex-wrap gap-2">
              <select aria-label={`Add role to ${r.email}`} className="input w-auto py-1 text-xs" value="" onChange={e => { const x = roles.find(z => z.id === e.target.value); if (x) void addRole(r, x); }}><option value="">+ Role</option>{avail.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              {r.status !== 'active' && <button className="btn btn-ghost py-1 text-xs" onClick={() => void setStatus(r, 'active')}>Activate</button>}
              {r.status === 'active' && r.id !== me?.id && <button className="btn btn-ghost py-1 text-xs" onClick={() => { if (confirm(`Suspend ${r.email}?`)) void setStatus(r, 'suspended'); }}>Suspend</button>}</div></td>}
          </tr>); })}</tbody></table>}</div>
  </>;
}
