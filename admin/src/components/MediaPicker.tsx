import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { ACCEPT, ASSET_COLS, fmtSize, uploadFile, type Asset } from '../lib/media';
import { ErrorBox, Spinner } from './ui';

export const Thumb = ({ a, className = '' }: { a: Pick<Asset, 'kind' | 'public_url' | 'alt_text' | 'filename'>; className?: string }) =>
  a.kind === 'image' && a.public_url ? <img src={a.public_url} alt={a.alt_text ?? ''} loading="lazy" className={`object-cover ${className}`} />
    : <div className={`flex items-center justify-center bg-slate-100 text-xs font-semibold uppercase text-slate-500 ${className}`} aria-label={a.filename}>{a.kind === 'video' ? 'Video' : a.kind === 'pdf' ? 'PDF' : 'File'}</div>;

export function UploadButton({ onDone, onError }: { onDone: (a: Asset) => void; onError: (m: string) => void }) {
  const { can } = useAuth(); const ref = useRef<HTMLInputElement>(null); const [prog, setProg] = useState<string>('');
  if (!can('media.edit')) return null;
  async function go(files: FileList | null) {
    if (!files?.length) return;
    for (const [i, f] of [...files].entries()) {
      try { setProg(`Uploading ${i + 1} of ${files.length}… 0%`); const r = await uploadFile(f, p => setProg(`Uploading ${i + 1} of ${files.length}… ${Math.round(p * 100)}%`)); onDone(r.asset); if (r.duplicate) onError(`"${f.name}" was already in the library, so the existing file was used.`); }
      catch (e) { onError(`${f.name}: ${(e as Error).message}`); }
    }
    setProg(''); if (ref.current) ref.current.value = '';
  }
  return <><input ref={ref} type="file" multiple accept={ACCEPT} className="sr-only" id="media-up" onChange={e => void go(e.target.files)} />
    <label htmlFor="media-up" className="btn btn-primary cursor-pointer">{prog || 'Upload files'}</label></>;
}

export default function MediaPicker({ kinds, multiple, onPick, onClose }: { kinds?: Asset['kind'][]; multiple?: boolean; onPick: (a: Asset[]) => void; onClose: () => void }) {
  const [rows, setRows] = useState<Asset[]>([]); const [loading, setLoading] = useState(true); const [q, setQ] = useState(''); const [err, setErr] = useState(''); const [sel, setSel] = useState<Asset[]>([]);
  const load = useCallback(async () => {
    let query = supabase.from('media_assets').select(ASSET_COLS).eq('status', 'active').eq('visibility', 'public').order('created_at', { ascending: false }).limit(200);
    if (kinds?.length) query = query.in('kind', kinds);
    const { data, error } = await query; if (error) setErr(error.message); setRows((data ?? []) as Asset[]); setLoading(false);
  }, [kinds]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const shown = rows.filter(r => !q || (r.filename + ' ' + (r.alt_text ?? '') + ' ' + (r.tags ?? []).join(' ')).toLowerCase().includes(q.toLowerCase()));
  const toggle = (a: Asset) => { if (!multiple) { onPick([a]); return; } setSel(s => s.some(x => x.id === a.id) ? s.filter(x => x.id !== a.id) : [...s, a]); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Choose from media library">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <h2 className="mr-auto text-base font-semibold">Media library</h2>
          <input className="input max-w-[220px]" placeholder="Search files" aria-label="Search files" value={q} onChange={e => setQ(e.target.value)} />
          <UploadButton onDone={a => { setRows(r => [a, ...r.filter(x => x.id !== a.id)]); if (!multiple) onPick([a]); else setSel(s => [...s, a]); }} onError={setErr} />
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button></div>
        {err && <div className="p-3"><ErrorBox msg={err} /></div>}
        <div className="overflow-y-auto p-3">{loading ? <Spinner /> : shown.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No files yet. Upload one to get started.</p> :
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{shown.map(a => { const on = sel.some(x => x.id === a.id); return (
            <li key={a.id}><button type="button" onClick={() => toggle(a)} aria-pressed={on} className={`block w-full overflow-hidden rounded-lg border text-left ${on ? 'border-brand-500 ring-2 ring-brand-500' : 'border-slate-200 hover:border-slate-400'}`}>
              <Thumb a={a} className="h-28 w-full" /><span className="block truncate p-2 text-xs">{a.filename}<br /><span className="text-slate-400">{fmtSize(a.size_bytes)}</span></span></button></li>); })}</ul>}</div>
        {multiple && <div className="flex items-center justify-between border-t border-slate-200 p-3"><span className="text-sm text-slate-500">{sel.length} selected</span><button type="button" className="btn btn-primary" disabled={!sel.length} onClick={() => onPick(sel)}>Add selected</button></div>}
      </div></div>);
}
