import { Fragment, useCallback, useEffect, useState } from 'react';
import { invokeFn } from '../lib/fn';
import { PageHeader, Spinner, ErrorBox, Toast, Badge } from '../components/ui';

interface Field { section?: string | null; key: string; label: string; help: string | null; secret: boolean; kind: string; options: string[] | null; placeholder: string | null; source: 'database' | 'environment' | 'unset'; value: string | null; isSet: boolean; hint: string | null; updated_at: string | null; unreadable: boolean }
interface Group { key: string; label: string; help: string; fields: Field[] }
interface Sb { url: string; project_ref: string | null; anon_key_set: boolean; service_key_set: boolean; encryption_key_set: boolean }
interface Resp { encryption: { configured: boolean }; supabase?: Sb; groups: Group[] }
const TESTS: Record<string, { target: string; label: string }[]> = {
  email: [{ target: 'email', label: 'Send test email to me' }], crm: [{ target: 'hubspot', label: 'Test HubSpot connection' }], eventbrite: [{ target: 'eventbrite', label: 'Test Eventbrite connection' }],
  storage: [{ target: 'r2', label: 'Test public bucket' }, { target: 'r2_public', label: 'Test image address (public link)' }, { target: 'r2_private', label: 'Test private bucket' }],
};
const SRC: Record<string, { t: string; tone: 'green' | 'slate' | 'amber' }> = { database: { t: 'Saved here', tone: 'green' }, environment: { t: 'From Supabase secrets', tone: 'slate' }, unset: { t: 'Not set', tone: 'amber' } };

export default function IntegrationSettings() {
  const [data, setData] = useState<Resp | null>(null); const [err, setErr] = useState(''); const [toast, setToast] = useState('');
  const [edit, setEdit] = useState<Record<string, string>>({}); const [clear, setClear] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(''); const [res, setRes] = useState<Record<string, { ok: boolean; message: string }>>({});
  const load = useCallback(async () => { try { setData(await invokeFn<Resp>('config-admin', { action: 'get' })); setErr(''); } catch (e) { setErr((e as Error).message); } }, []);
  useEffect(() => { void load(); }, [load]);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  async function save(g: Group) {
    const values: Record<string, string> = {}; const clr: string[] = [];
    for (const f of g.fields) { if (clear[f.key]) clr.push(f.key); else if (edit[f.key] !== undefined && edit[f.key].trim() !== '' && edit[f.key] !== (f.secret ? '' : f.value ?? '')) values[f.key] = edit[f.key]; }
    if (!Object.keys(values).length && !clr.length) { flash('Nothing to save'); return; }
    setBusy('save-' + g.key); setErr('');
    try { await invokeFn('config-admin', { action: 'save', values, clear: clr }); setEdit(e => { const n = { ...e }; g.fields.forEach(f => delete n[f.key]); return n; }); setClear(c => { const n = { ...c }; g.fields.forEach(f => delete n[f.key]); return n; }); flash('Saved'); await load(); }
    catch (e) { setErr((e as Error).message); } setBusy('');
  }
  async function test(target: string, groupKey: string) {
    setBusy('test-' + target);
    try { const x = await invokeFn<{ ok: boolean; message: string }>('config-admin', { action: 'test', target }); setRes(r => ({ ...r, [groupKey]: x })); }
    catch (e) { setRes(r => ({ ...r, [groupKey]: { ok: false, message: (e as Error).message } })); } setBusy('');
  }

  if (!data && !err) return <Spinner />;
  return <><PageHeader title="Integration Settings" sub="Super Admin only. Supabase, email, HubSpot, Eventbrite, Cloudflare R2 and security settings. Secrets are encrypted and can never be viewed again, only replaced." />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    {data && !data.encryption.configured && <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><strong>One-time step needed before secrets can be saved here.</strong> In Supabase → Edge Functions → Secrets add <code>CONFIG_ENCRYPTION_KEY</code> with 32 or more random characters, and keep a copy somewhere safe. If it is lost or changed, saved secrets cannot be read and must be entered again. Non-secret settings can be saved without it.</div>}
    <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">A value saved here takes priority over the same setting in Supabase secrets. Clearing it falls back to the Supabase secret, if there is one. Changes apply within about 30 seconds. Every change is recorded in the audit log (names only, never values).</div>
    {data?.supabase && <section className="card mb-6 space-y-3 p-4" aria-labelledby="g-supabase">
      <div><h2 id="g-supabase" className="font-medium">Supabase (database and sign-in)</h2><p className="text-sm text-slate-600">These are the connection details this system is using right now. They are read-only here because the system needs them to reach this settings page, so they cannot be stored in it.</p></div>
      <dl className="grid gap-3 text-sm md:grid-cols-2">
        <div><dt className="text-xs uppercase tracking-wide text-slate-500">Project address</dt><dd className="break-all">{data.supabase.url || 'Not set'}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-slate-500">Project reference</dt><dd>{data.supabase.project_ref ?? '—'}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-slate-500">Public (anon) key</dt><dd><Badge tone={data.supabase.anon_key_set ? 'green' : 'amber'}>{data.supabase.anon_key_set ? 'Set' : 'Not set'}</Badge></dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-slate-500">Service key</dt><dd><Badge tone={data.supabase.service_key_set ? 'green' : 'amber'}>{data.supabase.service_key_set ? 'Set (hidden)' : 'Not set'}</Badge></dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-slate-500">Settings encryption key</dt><dd><Badge tone={data.supabase.encryption_key_set ? 'green' : 'amber'}>{data.supabase.encryption_key_set ? 'Set (hidden)' : 'Not set'}</Badge></dd></div>
      </dl>
      <div className="flex flex-wrap items-center gap-2"><button className="btn" disabled={!!busy} onClick={() => void test('supabase', 'supabase')}>{busy === 'test-supabase' ? 'Testing…' : 'Test Supabase connection'}</button></div>
      {res.supabase && <p role="status" className={`rounded-lg p-3 text-sm ${res.supabase.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{res.supabase.message}</p>}
      <p className="text-xs text-slate-500">To point the system at a different Supabase project: update the Edge Function secrets <code>SUPABASE_URL</code>, <code>SUPABASE_ANON_KEY</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code> (Supabase → Edge Functions → Secrets); the GitHub secrets <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> then run <strong>Build admin app</strong>; and the website file <code>assets/cms-config.js</code>. Saved settings live in the project's database, so they stay with the old project.</p>
    </section>}
    <div className="space-y-6">{data?.groups.map(g => <section key={g.key} className="card space-y-4 p-4" aria-labelledby={'g-' + g.key}>
      <div><h2 id={'g-' + g.key} className="font-medium">{g.label}</h2><p className="text-sm text-slate-600">{g.help}</p></div>
      <div className="grid gap-4 md:grid-cols-2">{g.fields.map(f => { const id = 'f-' + f.key; const s = SRC[f.source]; return <Fragment key={f.key}>{f.section && <h3 className="md:col-span-2 mt-2 border-b pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500" style={{ borderColor: 'var(--line)' }}>{f.section}</h3>}<div className={f.kind === 'origins' || f.key === 'EMAIL_FROM' ? 'md:col-span-2' : ''}>
        <div className="mb-1 flex flex-wrap items-center gap-2"><label htmlFor={id} className="text-sm font-medium">{f.label}</label><Badge tone={s.tone}>{s.t}</Badge>{f.secret && f.hint && f.source === 'database' && <span className="text-xs text-slate-500">{f.hint}</span>}{f.unreadable && <Badge tone="red">Cannot be read: re-enter</Badge>}</div>
        {f.kind === 'select' ? <select id={id} className="input" value={edit[f.key] ?? f.value ?? ''} onChange={e => setEdit({ ...edit, [f.key]: e.target.value })}><option value="">{f.source === 'database' ? '' : 'Default'}</option>{f.options!.map(o => <option key={o} value={o}>{o}</option>)}</select>
          : <input id={id} className="input" type={f.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} disabled={!!clear[f.key]} placeholder={f.secret ? (f.source === 'database' ? 'Enter a new value to replace' : (f.placeholder ?? '')) : (f.placeholder ?? '')} value={edit[f.key] ?? (f.secret ? '' : f.value ?? '')} onChange={e => setEdit({ ...edit, [f.key]: e.target.value })} />}
        {f.help && <p className="mt-1 text-xs text-slate-500">{f.help}</p>}
        {f.source === 'database' && <label className="mt-1 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={!!clear[f.key]} onChange={e => setClear({ ...clear, [f.key]: e.target.checked })} />Remove the saved value on save</label>}
      </div></Fragment>; })}</div>
      {g.key === 'email' && <p className="text-xs text-slate-500">Only outgoing mail is used. Incoming mail (IMAP or POP) is not needed: replies go to your normal mailbox.</p>}
      <div className="flex flex-wrap items-center gap-2"><button className="btn btn-primary" disabled={!!busy} onClick={() => void save(g)}>{busy === 'save-' + g.key ? 'Saving…' : 'Save ' + g.label}</button>
        {(TESTS[g.key] ?? []).map(t => <button key={t.target} className="btn" disabled={!!busy} onClick={() => void test(t.target, g.key)}>{busy === 'test-' + t.target ? 'Testing…' : t.label}</button>)}</div>
      {res[g.key] && <p role="status" className={`rounded-lg p-3 text-sm ${res[g.key].ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{res[g.key].message}</p>}
      {TESTS[g.key] && <p className="text-xs text-slate-500">Tests use the saved values. Save first, wait a few seconds, then test.</p>}
    </section>)}</div>
    <p className="mt-6 text-xs text-slate-500">Not managed here: the website's public keys (Supabase publishable key and Turnstile site key) live in the website file <code>assets/cms-config.js</code>.</p>
    <Toast msg={toast} /></>;
}
