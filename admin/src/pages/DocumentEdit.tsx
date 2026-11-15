import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { ErrorBox, Field, PageHeader, Spinner, Toast } from '../components/ui';
import MediaPicker from '../components/MediaPicker';
import { fmtSize, type Asset } from '../lib/media';
import { fmt, fromLocalInput, slugify, toLocalInput } from '../lib/util';

const CATS = ['corporate', 'company_profile', 'investor_presentation', 'product_brochure', 'technical', 'research_report', 'white_paper', 'case_study', 'certification', 'press_release', 'event_resource', 'policy'];
interface Ver { id: string; version_label: string; change_note: string | null; created_at: string; media_assets: { filename: string; size_bytes: number } | null }
export default function DocumentEdit() {
  const { id } = useParams(); const isNew = !id || id === 'new'; const nav = useNavigate(); const { can, profile } = useAuth();
  const [f, setF] = useState({ title: '', slug: '', description: '', category: 'corporate', tags: '', expires_at: '', status: 'draft' });
  const [file, setFile] = useState<Asset | null>(null); const [label, setLabel] = useState('v1'); const [note, setNote] = useState('');
  const [orig, setOrig] = useState('draft'); const [vers, setVers] = useState<Ver[]>([]); const [curVer, setCurVer] = useState<string | null>(null); const [loading, setLoading] = useState(!isNew); const [err, setErr] = useState(''); const [toast, setToast] = useState(''); const [busy, setBusy] = useState(false); const [pick, setPick] = useState(false); const [slugTouched, setSlugTouched] = useState(false);
  const load = useCallback(async () => {
    if (isNew) return;
    const { data, error } = await supabase.from('documents').select('*').eq('id', id).maybeSingle();
    if (error || !data) { setErr(error?.message ?? 'Document not found.'); setLoading(false); return; }
    const { data: v } = await supabase.from('document_versions').select('id,version_label,change_note,created_at,media_assets(filename,size_bytes)').eq('document_id', id).order('created_at', { ascending: false });
    setOrig(data.status); setVers((v ?? []) as unknown as Ver[]); setCurVer(data.current_version_id); setSlugTouched(true);
    setF({ title: data.title, slug: data.slug ?? '', description: data.description ?? '', category: data.category, tags: (data.tags ?? []).join(', '), expires_at: toLocalInput(data.expires_at), status: data.status });
    setLabel('v' + ((v?.length ?? 0) + 1)); setLoading(false);
  }, [id, isNew]);
  useEffect(() => { void load(); }, [load]);
  const canEdit = can('documents.edit');
  const statusOk = (s: string) => s === 'published' ? can('documents.publish') : s === 'approved' ? can('documents.approve') : true;

  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!f.title.trim()) { setErr('Title is required.'); return; }
    if (isNew && !file) { setErr('Choose the file for this document.'); return; }
    if (f.status === 'published' && !file && !curVer) { setErr('A document needs a file before it can be published.'); return; }
    setBusy(true);
    const row = { title: f.title.trim(), slug: slugify(f.slug || f.title), description: f.description.trim() || null, category: f.category, access_level: 'public', tags: f.tags.split(',').map(t => t.trim()).filter(Boolean), expires_at: fromLocalInput(f.expires_at), status: f.status, published_at: f.status === 'published' ? new Date().toISOString() : null };
    let did = id as string;
    if (isNew) { const { data, error } = await supabase.from('documents').insert({ ...row, status: 'draft', published_at: null, created_by: profile!.id, author_id: profile!.id }).select('id').single(); if (error) { setErr(error.code === '23505' ? 'That slug is already used by another document.' : error.message); setBusy(false); return; } did = data.id; }
    let verId = curVer;
    if (file) { const { data: v, error: ve } = await supabase.from('document_versions').insert({ document_id: did, version_label: label.trim() || 'v1', asset_id: file.id, change_note: note.trim() || null, created_by: profile!.id }).select('id').single(); if (ve) { setErr(ve.code === '23505' ? 'That version label already exists. Use a new one.' : ve.message); setBusy(false); return; } verId = v.id; }
    const { published_at, ...rest } = row; const { error } = await supabase.from('documents').update({ ...rest, ...(f.status === 'published' && orig !== 'published' ? { published_at } : f.status !== 'published' ? { published_at: null } : {}), current_version_id: verId }).eq('id', did);
    if (error) { setErr(error.code === '23505' ? 'That slug is already used by another document.' : error.message); setBusy(false); return; }
    await supabase.rpc('write_audit', { p_action: isNew ? 'document.created' : 'document.updated', p_entity_type: 'document', p_entity_id: did, p_details: { title: row.title, status: row.status } });
    setBusy(false); setFile(null); setNote(''); setToast('Saved'); setTimeout(() => setToast(''), 2500);
    if (isNew) nav(`/documents/${did}`, { replace: true }); else await load();
  }
  async function del() { if (!window.confirm('Delete this document and its version history? The files stay in the media library.')) return; const { error } = await supabase.from('documents').delete().eq('id', id); if (error) { setErr(error.message); return; } nav('/documents'); }

  if (loading) return <Spinner />;
  return <><PageHeader title={isNew ? 'New document' : 'Edit document'} actions={<Link to="/documents" className="btn btn-ghost">Back to documents</Link>} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4"><div className="card space-y-4 p-4">
        <Field label="Title" htmlFor="d-title"><input id="d-title" className="input" value={f.title} disabled={!canEdit} onChange={e => setF({ ...f, title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} /></Field>
        <Field label="Description" htmlFor="d-desc"><textarea id="d-desc" className="input" rows={3} value={f.description} disabled={!canEdit} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Category" htmlFor="d-cat"><select id="d-cat" className="input" value={f.category} disabled={!canEdit} onChange={e => setF({ ...f, category: e.target.value })}>{CATS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}</select></Field>
          <Field label="Tags (comma separated)" htmlFor="d-tags"><input id="d-tags" className="input" value={f.tags} disabled={!canEdit} onChange={e => setF({ ...f, tags: e.target.value })} /></Field></div></div>
        <section className="card space-y-3 p-4"><h2 className="text-sm font-semibold">{isNew ? 'File' : 'Upload a new version'}</h2>
          <div className="flex flex-wrap items-center gap-3">{canEdit && <button type="button" className="btn btn-ghost" onClick={() => setPick(true)}>{file ? 'Change file' : 'Choose file'}</button>}<span className="text-sm text-slate-600">{file ? `${file.filename} (${fmtSize(file.size_bytes)})` : isNew ? 'None selected' : 'Leave empty to keep the current file'}</span></div>
          {file && <div className="grid gap-4 sm:grid-cols-2"><Field label="Version label" htmlFor="d-lab"><input id="d-lab" className="input" value={label} onChange={e => setLabel(e.target.value)} /></Field><Field label="What changed (optional)" htmlFor="d-note"><input id="d-note" className="input" value={note} onChange={e => setNote(e.target.value)} /></Field></div>}</section>
        {vers.length > 0 && <section className="card p-4"><h2 className="mb-2 text-sm font-semibold">Version history</h2><ul className="divide-y divide-slate-100 text-sm">{vers.map(v => <li key={v.id} className="flex flex-wrap justify-between gap-2 py-2"><span><strong>{v.version_label}</strong>{v.id === curVer && <span className="ml-2 text-xs text-emerald-700">current</span>} · {v.media_assets?.filename} ({fmtSize(v.media_assets?.size_bytes ?? 0)}){v.change_note ? ` — ${v.change_note}` : ''}</span><span className="text-xs text-slate-500">{fmt(v.created_at)}</span></li>)}</ul></section>}</div>
      <div className="space-y-4"><div className="card space-y-4 p-4">
        <Field label="URL slug" htmlFor="d-slug"><input id="d-slug" className="input" value={f.slug} disabled={!canEdit} onChange={e => { setSlugTouched(true); setF({ ...f, slug: e.target.value }); }} /></Field>
        <Field label="Status" htmlFor="d-st" hint="Approving needs approve permission and publishing needs publish permission."><select id="d-st" className="input" value={f.status} disabled={!canEdit} onChange={e => setF({ ...f, status: e.target.value })}>{['draft', 'pending_review', 'approved', 'published', 'archived'].map(s => <option key={s} value={s} disabled={!statusOk(s)}>{s.replace('_', ' ')}</option>)}</select></Field>
        <Field label="Expires (optional)" htmlFor="d-exp" hint="After this date the document is hidden from the website."><input id="d-exp" className="input" type="datetime-local" value={f.expires_at} disabled={!canEdit} onChange={e => setF({ ...f, expires_at: e.target.value })} /></Field>
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Access: public. Restricted, internal and investor-only documents need a private storage bucket and are not available yet.</p></div>
        {canEdit && <div className="flex gap-2"><button className="btn btn-primary flex-1" disabled={busy}>{busy ? 'Saving…' : 'Save document'}</button>{!isNew && can('documents.delete') && <button type="button" className="btn btn-danger" onClick={() => void del()}>Delete</button>}</div>}</div>
    </form>
    {pick && <MediaPicker kinds={['pdf', 'document']} onClose={() => setPick(false)} onPick={([a]) => { setFile(a); setPick(false); }} />}
    <Toast msg={toast} /></>;
}
