import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { ASSET_COLS, CATEGORIES, deleteAsset, fmtSize, type Asset } from '../lib/media';
import { PageHeader, Spinner, Empty, ErrorBox, Field, Toast } from '../components/ui';
import { Thumb, UploadButton } from '../components/MediaPicker';

export default function Media() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Asset[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [toast, setToast] = useState('');
  const [q, setQ] = useState(''); const [kind, setKind] = useState(''); const [cur, setCur] = useState<Asset | null>(null); const [busy, setBusy] = useState(false);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };
  const load = useCallback(async () => { const { data, error } = await supabase.from('media_assets').select(ASSET_COLS).eq('status', 'active').eq('visibility', 'public').order('created_at', { ascending: false }).limit(500); if (error) setErr(error.message); setRows((data ?? []) as Asset[]); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  const shown = rows.filter(r => (!kind || r.kind === kind) && (!q || (r.filename + ' ' + (r.alt_text ?? '') + ' ' + (r.tags ?? []).join(' ')).toLowerCase().includes(q.toLowerCase())));

  async function save() {
    if (!cur) return; setBusy(true); setErr('');
    const { error } = await supabase.from('media_assets').update({ alt_text: cur.alt_text?.trim() || null, caption: cur.caption?.trim() || null, category: cur.category || null, tags: (cur.tags ?? []).filter(Boolean) }).eq('id', cur.id);
    setBusy(false); if (error) { setErr(error.message); return; }
    setRows(rows.map(r => r.id === cur.id ? cur : r)); flash('Saved');
  }
  async function del() {
    if (!cur || !window.confirm(`Delete "${cur.filename}" permanently? This cannot be undone.`)) return;
    setBusy(true); setErr('');
    try { await deleteAsset(cur.id); setRows(rows.filter(r => r.id !== cur.id)); setCur(null); flash('Deleted'); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function copy(t: string) { try { await navigator.clipboard.writeText(t); flash('Address copied'); } catch { window.prompt('Copy this address', t); } }

  if (loading) return <Spinner />;
  return <>
    <PageHeader title="Media Library" sub="Images, videos and documents stored on Cloudflare R2. Pick them from any editor with the Choose button." actions={<UploadButton onDone={a => { setRows(r => [a, ...r.filter(x => x.id !== a.id)]); flash('Uploaded'); }} onError={setErr} />} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <div className="mb-4 flex flex-wrap gap-2"><input className="input max-w-xs" placeholder="Search files" aria-label="Search files" value={q} onChange={e => setQ(e.target.value)} />
      <select className="input w-auto" aria-label="File type" value={kind} onChange={e => setKind(e.target.value)}><option value="">All types</option><option value="image">Images</option><option value="video">Videos</option><option value="pdf">PDFs</option><option value="document">Documents</option></select></div>
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card p-3">{shown.length === 0 ? <Empty>{rows.length ? 'No files match.' : 'No files yet. Upload your first file.'}</Empty> :
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{shown.map(a => <li key={a.id}><button type="button" onClick={() => setCur(a)} aria-pressed={cur?.id === a.id} className={`block w-full overflow-hidden rounded-lg border text-left ${cur?.id === a.id ? 'border-brand-500 ring-2 ring-brand-500' : 'border-slate-200 hover:border-slate-400'}`}><Thumb a={a} className="h-28 w-full" /><span className="block truncate p-2 text-xs">{a.filename}<br /><span className="text-slate-400">{fmtSize(a.size_bytes)}</span></span></button></li>)}</ul>}</div>
      <aside className="card h-fit space-y-3 p-4" aria-label="File details">{!cur ? <p className="text-sm text-slate-500">Select a file to see its details.</p> : <>
        <Thumb a={cur} className="h-40 w-full rounded-lg" />
        <p className="break-all text-sm font-medium">{cur.filename}</p>
        <p className="text-xs text-slate-500">{cur.mime_type} · {fmtSize(cur.size_bytes)}{cur.width ? ` · ${cur.width}×${cur.height}` : ''}</p>
        {cur.public_url && <div className="flex gap-2"><input className="input text-xs" readOnly value={cur.public_url} aria-label="File address" onFocus={e => e.target.select()} /><button type="button" className="btn btn-ghost shrink-0" onClick={() => void copy(cur.public_url!)}>Copy</button></div>}
        <Field label="Description for screen readers (alt text)" htmlFor="m-alt"><input id="m-alt" className="input" value={cur.alt_text ?? ''} disabled={!can('media.edit')} onChange={e => setCur({ ...cur, alt_text: e.target.value })} /></Field>
        <Field label="Caption" htmlFor="m-cap"><input id="m-cap" className="input" value={cur.caption ?? ''} disabled={!can('media.edit')} onChange={e => setCur({ ...cur, caption: e.target.value })} /></Field>
        <Field label="Category" htmlFor="m-cat"><select id="m-cat" className="input" value={cur.category ?? ''} disabled={!can('media.edit')} onChange={e => setCur({ ...cur, category: e.target.value || null })}><option value="">None</option>{CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}</select></Field>
        <Field label="Tags (comma separated)" htmlFor="m-tags"><input id="m-tags" className="input" value={(cur.tags ?? []).join(', ')} disabled={!can('media.edit')} onChange={e => setCur({ ...cur, tags: e.target.value.split(',').map(t => t.trim()) })} /></Field>
        <div className="flex gap-2">{can('media.edit') && <button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={() => void save()}>Save details</button>}{can('media.delete') && <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void del()}>Delete</button>}</div></>}</aside>
    </div><Toast msg={toast} /></>;
}
