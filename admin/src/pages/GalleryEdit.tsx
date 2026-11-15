import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { ErrorBox, Field, PageHeader, Spinner, Toast } from '../components/ui';
import MediaPicker, { Thumb } from '../components/MediaPicker';
import { slugify } from '../lib/util';

const COLLECTIONS = ['company_events', 'product_demos', 'soil_research', 'farmer_engagement', 'field_trials', 'biochar_bioenergy', 'partnerships', 'conferences', 'corporate'];
interface Item { asset_id: string; caption: string; url: string | null; alt: string | null; filename: string }
export default function GalleryEdit() {
  const { id } = useParams(); const isNew = !id || id === 'new'; const nav = useNavigate(); const { can, profile } = useAuth();
  const [f, setF] = useState({ title: '', slug: '', description: '', collection: '', status: 'draft', cover: '' });
  const [items, setItems] = useState<Item[]>([]); const [loading, setLoading] = useState(!isNew); const [err, setErr] = useState(''); const [toast, setToast] = useState(''); const [busy, setBusy] = useState(false); const [pick, setPick] = useState(false); const [slugTouched, setSlugTouched] = useState(false);
  const load = useCallback(async () => {
    if (isNew) return;
    const { data, error } = await supabase.from('galleries').select('*').eq('id', id).maybeSingle();
    if (error || !data) { setErr(error?.message ?? 'Album not found.'); setLoading(false); return; }
    const { data: it } = await supabase.from('gallery_items').select('asset_id,caption,sort_order,media_assets(public_url,alt_text,filename)').eq('gallery_id', id).order('sort_order');
    setItems(((it ?? []) as unknown as { asset_id: string; caption: string | null; media_assets: { public_url: string | null; alt_text: string | null; filename: string } | null }[]).map(r => ({ asset_id: r.asset_id, caption: r.caption ?? '', url: r.media_assets?.public_url ?? null, alt: r.media_assets?.alt_text ?? null, filename: r.media_assets?.filename ?? '' })));
    setF({ title: data.title, slug: data.slug, description: data.description ?? '', collection: data.collection ?? '', status: data.status, cover: data.cover_asset_id ?? '' }); setSlugTouched(true); setLoading(false);
  }, [id, isNew]);
  useEffect(() => { void load(); }, [load]);
  const canEdit = can('gallery.edit'); const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= items.length) return; const c = [...items]; [c[i], c[j]] = [c[j], c[i]]; setItems(c); };

  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!f.title.trim()) { setErr('Title is required.'); return; }
    if (f.status === 'published' && items.length === 0) { setErr('Add at least one photo before publishing.'); return; }
    setBusy(true);
    const row = { title: f.title.trim(), slug: slugify(f.slug || f.title), description: f.description.trim() || null, collection: f.collection || null, status: f.status, cover_asset_id: f.cover || items[0]?.asset_id || null };
    let gid = id as string;
    if (isNew) { const { data, error } = await supabase.from('galleries').insert({ ...row, created_by: profile!.id }).select('id').single(); if (error) { setErr(error.code === '23505' ? 'That slug is already used by another album.' : error.message); setBusy(false); return; } gid = data.id; }
    else { const { error } = await supabase.from('galleries').update(row).eq('id', gid); if (error) { setErr(error.code === '23505' ? 'That slug is already used by another album.' : error.message); setBusy(false); return; } }
    const { error: de } = await supabase.from('gallery_items').delete().eq('gallery_id', gid); if (de) { setErr(de.message); setBusy(false); return; }
    if (items.length) { const { error: ie } = await supabase.from('gallery_items').insert(items.map((x, n) => ({ gallery_id: gid, asset_id: x.asset_id, caption: x.caption.trim() || null, sort_order: n }))); if (ie) { setErr(ie.message); setBusy(false); return; } }
    await supabase.rpc('write_audit', { p_action: isNew ? 'gallery.created' : 'gallery.updated', p_entity_type: 'gallery', p_entity_id: gid, p_details: { title: row.title, status: row.status } });
    setBusy(false); setToast('Saved'); setTimeout(() => setToast(''), 2500);
    if (isNew) nav(`/gallery/${gid}`, { replace: true }); else await load();
  }
  async function del() { if (!window.confirm('Delete this album? The photos stay in the media library.')) return; const { error } = await supabase.from('galleries').delete().eq('id', id); if (error) { setErr(error.message); return; } nav('/gallery'); }

  if (loading) return <Spinner />;
  return <><PageHeader title={isNew ? 'New album' : 'Edit album'} actions={<Link to="/gallery" className="btn btn-ghost">Back to gallery</Link>} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4"><div className="card space-y-4 p-4">
        <Field label="Album title" htmlFor="g-title"><input id="g-title" className="input" value={f.title} disabled={!canEdit} onChange={e => setF({ ...f, title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} /></Field>
        <Field label="Description" htmlFor="g-desc"><textarea id="g-desc" className="input" rows={3} value={f.description} disabled={!canEdit} onChange={e => setF({ ...f, description: e.target.value })} /></Field></div>
        <section className="card space-y-3 p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Photos ({items.length})</h2>{canEdit && <button type="button" className="btn btn-ghost" onClick={() => setPick(true)}>Add photos</button>}</div>
          {items.length === 0 ? <p className="text-sm text-slate-500">No photos yet.</p> : <ul className="space-y-2">{items.map((x, i) => <li key={x.asset_id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-2"><Thumb a={{ kind: 'image', public_url: x.url, alt_text: x.alt, filename: x.filename }} className="h-14 w-20 shrink-0 rounded" />
            <input className="input" aria-label={`Caption for photo ${i + 1}`} placeholder="Caption (optional)" value={x.caption} disabled={!canEdit} onChange={e => setItems(items.map((y, j) => j === i ? { ...y, caption: e.target.value } : y))} />
            {canEdit && <div className="flex shrink-0 gap-1"><button type="button" className="btn btn-ghost px-2 py-1" aria-label="Move up" onClick={() => move(i, -1)}>↑</button><button type="button" className="btn btn-ghost px-2 py-1" aria-label="Move down" onClick={() => move(i, 1)}>↓</button><button type="button" className="btn btn-ghost px-2 py-1" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</button></div>}</li>)}</ul>}</section></div>
      <div className="space-y-4"><div className="card space-y-4 p-4">
        <Field label="URL slug" htmlFor="g-slug"><input id="g-slug" className="input" value={f.slug} disabled={!canEdit} onChange={e => { setSlugTouched(true); setF({ ...f, slug: e.target.value }); }} /></Field>
        <Field label="Collection" htmlFor="g-col"><select id="g-col" className="input" value={f.collection} disabled={!canEdit} onChange={e => setF({ ...f, collection: e.target.value })}><option value="">None</option>{COLLECTIONS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}</select></Field>
        <Field label="Status" htmlFor="g-st" hint={can('gallery.publish') ? undefined : 'You need publish permission to publish an album.'}><select id="g-st" className="input" value={f.status} disabled={!canEdit} onChange={e => setF({ ...f, status: e.target.value })}><option value="draft">Draft</option><option value="published" disabled={!can('gallery.publish')}>Published</option><option value="archived">Archived</option></select></Field>
        {items.length > 0 && <Field label="Cover photo" htmlFor="g-cov"><select id="g-cov" className="input" value={f.cover} disabled={!canEdit} onChange={e => setF({ ...f, cover: e.target.value })}><option value="">First photo</option>{items.map((x, i) => <option key={x.asset_id} value={x.asset_id}>{i + 1}. {x.filename}</option>)}</select></Field>}</div>
        {canEdit && <div className="flex gap-2"><button className="btn btn-primary flex-1" disabled={busy}>{busy ? 'Saving…' : 'Save album'}</button>{!isNew && can('gallery.delete') && <button type="button" className="btn btn-danger" onClick={() => void del()}>Delete</button>}</div>}</div>
    </form>
    {pick && <MediaPicker kinds={['image']} multiple onClose={() => setPick(false)} onPick={as => { setItems(cur => [...cur, ...as.filter(a => !cur.some(c => c.asset_id === a.id)).map(a => ({ asset_id: a.id, caption: a.caption ?? '', url: a.public_url, alt: a.alt_text, filename: a.filename }))]); setPick(false); }} />}
    <Toast msg={toast} /></>;
}
