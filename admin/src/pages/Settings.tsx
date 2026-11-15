import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, ErrorBox, Field, Toast } from '../components/ui';

interface Banner { enabled: boolean; message: string; link_url: string; link_label: string }
const EMPTY: Banner = { enabled: false, message: '', link_url: '', link_label: '' };

export default function Settings() {
  const { can, profile } = useAuth();
  const [b, setB] = useState<Banner>(EMPTY); const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [toast, setToast] = useState(''); const [busy, setBusy] = useState(false);
  const editable = can('settings.manage');
  useEffect(() => { (async () => {
    const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'announcement').maybeSingle();
    if (error) setErr(error.message);
    if (data?.value) setB({ ...EMPTY, ...(data.value as Partial<Banner>) });
    setLoading(false); })(); }, []);
  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (b.enabled && !b.message.trim()) { setErr('Enter the banner message, or switch the banner off.'); return; }
    if (b.link_url.trim() && !/^https?:\/\//i.test(b.link_url.trim()) && !b.link_url.trim().startsWith('/')) { setErr('The link must start with https:// or /'); return; }
    setBusy(true);
    const value = { enabled: b.enabled, message: b.message.trim(), link_url: b.link_url.trim(), link_label: b.link_label.trim() };
    const { error } = await supabase.from('system_settings').upsert({ key: 'announcement', category: 'website', value, is_public: true, updated_by: profile!.id, updated_at: new Date().toISOString() });
    if (error) { setErr(error.message); setBusy(false); return; }
    await supabase.rpc('write_audit', { p_action: 'settings.announcement_updated', p_entity_type: 'setting', p_entity_id: null, p_details: { enabled: value.enabled } });
    setBusy(false); setToast('Saved. The banner updates on soilpassport.com within a minute.'); setTimeout(() => setToast(''), 3500);
  }
  if (loading) return <Spinner />;
  return <><PageHeader title="Website Settings" sub="Announcement banner shown at the top of every page on soilpassport.com." />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <form onSubmit={save} className="card max-w-xl space-y-4 p-4">
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={b.enabled} disabled={!editable} onChange={e => setB({ ...b, enabled: e.target.checked })} />Show the banner</label>
      <Field label="Message" htmlFor="b-msg"><input id="b-msg" className="input" maxLength={200} value={b.message} disabled={!editable} onChange={e => setB({ ...b, message: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Link label (optional)" htmlFor="b-ll"><input id="b-ll" className="input" value={b.link_label} disabled={!editable} onChange={e => setB({ ...b, link_label: e.target.value })} /></Field>
        <Field label="Link address (optional)" htmlFor="b-lu"><input id="b-lu" className="input" value={b.link_url} disabled={!editable} onChange={e => setB({ ...b, link_url: e.target.value })} /></Field></div>
      {b.enabled && b.message && <div className="rounded-lg bg-emerald-800 p-3 text-center text-sm text-white" aria-label="Preview">{b.message}{b.link_label && <span className="ml-2 underline">{b.link_label}</span>}</div>}
      {editable ? <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save banner'}</button> : <p className="text-sm text-slate-500">You can view these settings but not change them.</p>}
    </form><Toast msg={toast} /></>;
}
