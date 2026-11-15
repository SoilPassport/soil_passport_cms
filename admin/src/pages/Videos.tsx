import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, Empty, ErrorBox, Field, Toast } from '../components/ui';
import { StatusBadge } from '../components/Workflow';
import MediaPicker from '../components/MediaPicker';
import ImageField from '../components/ImageField';

interface Video { id: string; title: string; description: string | null; source: 'upload' | 'youtube' | 'vimeo'; asset_id: string | null; external_url: string | null; thumbnail_url: string | null; sort_order: number; status: string; media_assets?: { filename: string } | null }
const EMPTY = { title: '', description: '', source: 'youtube' as Video['source'], asset_id: '', filename: '', external_url: '', thumbnail_url: '', sort_order: 0, status: 'draft' };
const valid = (src: string, u: string) => src === 'youtube' ? /^https:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]{6,}/.test(u) : /^https:\/\/(www\.)?vimeo\.com\/(video\/)?\d+/.test(u);

export default function Videos() {
  const { can, profile } = useAuth();
  const [rows, setRows] = useState<Video[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [toast, setToast] = useState('');
  const [f, setF] = useState<(typeof EMPTY) | null>(null); const [editId, setEditId] = useState<string | null>(null); const [pick, setPick] = useState(false); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const { data, error } = await supabase.from('videos').select('*,media_assets(filename)').order('sort_order').order('created_at', { ascending: false }); if (error) setErr(error.message); setRows((data ?? []) as Video[]); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };
  const edit = (v: Video) => { setEditId(v.id); setF({ title: v.title, description: v.description ?? '', source: v.source, asset_id: v.asset_id ?? '', filename: v.media_assets?.filename ?? '', external_url: v.external_url ?? '', thumbnail_url: v.thumbnail_url ?? '', sort_order: v.sort_order, status: v.status }); };

  async function save(e: FormEvent) {
    e.preventDefault(); if (!f) return; setErr('');
    if (!f.title.trim()) { setErr('Title is required.'); return; }
    if (f.source === 'upload' && !f.asset_id) { setErr('Choose an uploaded video file.'); return; }
    if (f.source !== 'upload' && !valid(f.source, f.external_url.trim())) { setErr(f.source === 'youtube' ? 'Enter a full YouTube link, e.g. https://www.youtube.com/watch?v=…' : 'Enter a full Vimeo link, e.g. https://vimeo.com/123456789'); return; }
    setBusy(true);
    const prev = rows.find(r => r.id === editId); const prevStatus = prev?.status, prevAt = (prev as unknown as { published_at?: string } | undefined)?.published_at;
    const row = { title: f.title.trim(), description: f.description.trim() || null, source: f.source, asset_id: f.source === 'upload' ? f.asset_id : null, external_url: f.source === 'upload' ? null : f.external_url.trim(), thumbnail_url: f.thumbnail_url.trim() || null, sort_order: Number(f.sort_order) || 0, status: f.status, published_at: f.status === 'published' ? (prevStatus === 'published' && prevAt ? prevAt : new Date().toISOString()) : null };
    const q = editId ? supabase.from('videos').update(row).eq('id', editId) : supabase.from('videos').insert({ ...row, created_by: profile!.id });
    const { error } = await q; setBusy(false);
    if (error) { setErr(error.message); return; }
    await supabase.rpc('write_audit', { p_action: editId ? 'video.updated' : 'video.created', p_entity_type: 'video', p_entity_id: editId, p_details: { title: row.title, status: row.status } });
    setF(null); setEditId(null); flash('Saved'); await load();
  }
  async function del(id: string) { if (!window.confirm('Delete this video entry? An uploaded file stays in the media library.')) return; const { error } = await supabase.from('videos').delete().eq('id', id); if (error) setErr(error.message); else { setF(null); setEditId(null); await load(); } }

  if (loading) return <Spinner />;
  return <><PageHeader title="Video Library" sub="Upload MP4 or WebM files, or link YouTube and Vimeo videos. Published videos appear on soilpassport.com/videos.html." actions={can('media.edit') && !f ? <button className="btn btn-primary" onClick={() => { setEditId(null); setF({ ...EMPTY }); }}>Add video</button> : undefined} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    {f && <form onSubmit={save} className="card mb-6 space-y-4 p-4"><h2 className="text-sm font-semibold">{editId ? 'Edit video' : 'New video'}</h2>
      <Field label="Title" htmlFor="v-title"><input id="v-title" className="input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Description" htmlFor="v-desc"><textarea id="v-desc" className="input" rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-3"><Field label="Source" htmlFor="v-src"><select id="v-src" className="input" value={f.source} onChange={e => setF({ ...f, source: e.target.value as Video['source'] })}><option value="youtube">YouTube link</option><option value="vimeo">Vimeo link</option><option value="upload">Uploaded file</option></select></Field>
        <Field label="Order" htmlFor="v-ord" hint="Lower numbers show first."><input id="v-ord" className="input" type="number" value={f.sort_order} onChange={e => setF({ ...f, sort_order: Number(e.target.value) })} /></Field>
        <Field label="Status" htmlFor="v-st" hint={can('media.publish') ? undefined : 'You need publish permission to publish.'}><select id="v-st" className="input" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="draft">Draft</option><option value="published" disabled={!can('media.publish')}>Published</option><option value="archived">Archived</option></select></Field></div>
      {f.source === 'upload' ? <div><span className="label">Video file</span><div className="flex items-center gap-3"><button type="button" className="btn btn-ghost" onClick={() => setPick(true)}>Choose video</button><span className="text-sm text-slate-600">{f.filename || (f.asset_id ? 'Selected' : 'None selected')}</span></div></div>
        : <Field label={f.source === 'youtube' ? 'YouTube link' : 'Vimeo link'} htmlFor="v-url"><input id="v-url" className="input" type="url" value={f.external_url} onChange={e => setF({ ...f, external_url: e.target.value })} /></Field>}
      <ImageField id="v-thumb" label="Thumbnail image (optional)" value={f.thumbnail_url} onChange={v => setF({ ...f, thumbnail_url: v })} />
      <div className="flex gap-2"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save video'}</button><button type="button" className="btn btn-ghost" onClick={() => { setF(null); setEditId(null); }}>Cancel</button>{editId && can('media.delete') && <button type="button" className="btn btn-danger ml-auto" onClick={() => void del(editId)}>Delete</button>}</div></form>}
    <div className="card overflow-x-auto">{rows.length === 0 ? <Empty>No videos yet.</Empty> :
      <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">Video</th><th className="p-3">Source</th><th className="p-3">Status</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(r => <tr key={r.id}><td className="p-3">{can('media.edit') ? <button className="font-medium hover:underline" onClick={() => edit(r)}>{r.title}</button> : r.title}</td><td className="p-3">{r.source}</td><td className="p-3"><StatusBadge status={r.status} /></td></tr>)}</tbody></table>}</div>
    {pick && f && <MediaPicker kinds={['video']} onClose={() => setPick(false)} onPick={([a]) => { setF({ ...f, asset_id: a.id, filename: a.filename }); setPick(false); }} />}
    <Toast msg={toast} /></>;
}
