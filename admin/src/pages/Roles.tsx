import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, ErrorBox, Badge } from '../components/ui';

interface Role { id: string; key: string; name: string; description: string | null; is_system: boolean; requires_mfa: boolean }
interface Perm { id: string; key: string; module: string; description: string | null }
const log = (action: string, id: string, details: object = {}) => supabase.rpc('write_audit', { p_action: action, p_entity_type: 'role', p_entity_id: id, p_details: details });

export default function Roles() {
  const { can } = useAuth(); const manage = can('roles.manage');
  const [roles, setRoles] = useState<Role[]>([]); const [perms, setPerms] = useState<Perm[]>([]); const [map, setMap] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState(''); const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [nr, setNr] = useState({ key: '', name: '' });

  const load = useCallback(async () => {
    const [r, p, rp] = await Promise.all([supabase.from('roles').select('*').order('name'), supabase.from('permissions').select('*').order('key'), supabase.from('role_permissions').select('role_id,permission_id')]);
    setRoles((r.data ?? []) as Role[]); setPerms((p.data ?? []) as Perm[]);
    setMap(new Set((rp.data ?? []).map(x => `${x.role_id}:${x.permission_id}`))); setSel(s => s || (r.data?.[0]?.id ?? '')); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const role = roles.find(r => r.id === sel); const isSuper = role?.key === 'super_admin';
  async function toggle(p: Perm) {
    if (!role || !manage || isSuper) return; setErr('');
    const has = map.has(`${role.id}:${p.id}`);
    const { error } = has ? await supabase.from('role_permissions').delete().eq('role_id', role.id).eq('permission_id', p.id) : await supabase.from('role_permissions').insert({ role_id: role.id, permission_id: p.id });
    if (error) setErr(error.message); else { await log(has ? 'role.permission_removed' : 'role.permission_added', role.id, { permission: p.key }); await load(); }
  }
  async function setMfa(v: boolean) { if (!role) return; const { error } = await supabase.from('roles').update({ requires_mfa: v }).eq('id', role.id); if (error) setErr(error.message); else { await log('role.mfa_policy', role.id, { requires_mfa: v }); await load(); } }
  async function create(e: FormEvent) {
    e.preventDefault(); setErr('');
    const { data, error } = await supabase.from('roles').insert({ key: nr.key.trim(), name: nr.name.trim(), is_system: false, requires_mfa: true }).select('id').single();
    if (error) setErr(error.message); else { await log('role.created', data.id, nr); setNr({ key: '', name: '' }); setSel(data.id); await load(); }
  }
  async function del() { if (!role || role.is_system || !confirm(`Delete role "${role.name}"?`)) return; const { error } = await supabase.from('roles').delete().eq('id', role.id); if (error) setErr(error.message); else { await log('role.deleted', role.id, { key: role.key }); setSel(''); await load(); } }

  if (loading) return <Spinner />;
  const modules = [...new Set(perms.map(p => p.module))];
  return <>
    <PageHeader title="Roles & Permissions" sub="Permissions are enforced by the database. Super Admin always has full access." />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <div className="space-y-4"><ul className="card divide-y divide-slate-100">{roles.map(r => <li key={r.id}><button onClick={() => setSel(r.id)} className={`w-full px-4 py-3 text-left text-sm ${sel === r.id ? 'bg-slate-50 font-medium' : ''}`}>{r.name}{r.is_system && <span className="ml-2 text-xs text-slate-400">system</span>}</button></li>)}</ul>
        {manage && <form onSubmit={create} className="card space-y-2 p-4"><div className="text-sm font-medium">New role</div>
          <input aria-label="Role key" className="input" placeholder="key_like_this" pattern="[a-z][a-z0-9_]*" required value={nr.key} onChange={e => setNr({ ...nr, key: e.target.value })} />
          <input aria-label="Role name" className="input" placeholder="Display name" required value={nr.name} onChange={e => setNr({ ...nr, name: e.target.value })} /><button className="btn btn-primary w-full">Create role</button></form>}</div>
      {role && <div className="card p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{role.name}</h2><p className="text-sm text-slate-500">{role.description}</p></div>
        <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!manage} checked={role.requires_mfa} onChange={e => void setMfa(e.target.checked)} />Require MFA</label>{manage && !role.is_system && <button className="btn btn-danger py-1 text-xs" onClick={() => void del()}>Delete</button>}</div></div>
        {isSuper && <p className="mb-3"><Badge tone="amber">Full access — permissions cannot be edited</Badge></p>}
        <div className="space-y-4">{modules.map(m => <fieldset key={m}><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{m}</legend>
          <div className="grid gap-1 sm:grid-cols-2">{perms.filter(p => p.module === m).map(p => <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!manage || isSuper} checked={isSuper || map.has(`${role.id}:${p.id}`)} onChange={() => void toggle(p)} /><code className="text-xs">{p.key}</code></label>)}</div></fieldset>)}</div></div>}
    </div></>;
}
