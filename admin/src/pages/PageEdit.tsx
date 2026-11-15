import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, ErrorBox, Field, Toast } from '../components/ui';
import Workflow from '../components/Workflow';
import BlockEditor from '../components/BlockEditor';
import type { Block } from '../lib/blocks';
import { fromLocalInput, slugify, toLocalInput } from '../lib/util';

interface Form { title: string; slug: string; visibility: 'public' | 'hidden'; sort_order: number; blocks: Block[]; publish_at: string; seo_title: string; seo_description: string; canonical_url: string; og_image_url: string; noindex: boolean }
const EMPTY: Form = { title: '', slug: '', visibility: 'public', sort_order: 0, blocks: [], publish_at: '', seo_title: '', seo_description: '', canonical_url: '', og_image_url: '', noindex: false };

export default function PageEdit() {
  const { id } = useParams(); const isNew = !id || id === 'new'; const nav = useNavigate(); const { can, profile } = useAuth();
  const [f, setF] = useState<Form>(EMPTY); const [status, setStatus] = useState('draft'); const [loading, setLoading] = useState(!isNew); const [err, setErr] = useState(''); const [toast, setToast] = useState(''); const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [slugTouched, setSlugTouched] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF(p => ({ ...p, [k]: v })); setDirty(true); };
  const load = useCallback(async () => {
    if (isNew) return;
    const { data, error } = await supabase.from('website_pages').select('*').eq('id', id).maybeSingle();
    if (error || !data) { setErr(error?.message ?? 'Page not found, or you do not have access.'); setLoading(false); return; }
    setStatus(data.status); setSlugTouched(true);
    setF({ title: data.title, slug: data.slug, visibility: data.visibility, sort_order: data.sort_order, blocks: (data.blocks ?? []) as Block[], publish_at: toLocalInput(data.publish_at), seo_title: data.seo_title ?? '', seo_description: data.seo_description ?? '', canonical_url: data.canonical_url ?? '', og_image_url: data.og_image_url ?? '', noindex: data.noindex });
    setDirty(false); setLoading(false);
  }, [id, isNew]);
  useEffect(() => { void load(); }, [load]);
  const live = status === 'published' || status === 'scheduled';
  const readOnly = !can('pages.edit') || ((live || status === 'archived') && !can('pages.publish'));

  async function save(e?: FormEvent) {
    e?.preventDefault(); setErr('');
    if (!f.title.trim()) { setErr('Title is required.'); return; }
    const slug = slugify(f.slug || f.title); if (!slug) { setErr('Slug is required.'); return; }
    setBusy(true);
    const row = { title: f.title.trim(), slug, visibility: f.visibility, sort_order: Number(f.sort_order) || 0, blocks: f.blocks, publish_at: fromLocalInput(f.publish_at), seo_title: f.seo_title.trim() || null, seo_description: f.seo_description.trim() || null, canonical_url: f.canonical_url.trim() || null, og_image_url: f.og_image_url.trim() || null, noindex: f.noindex, updated_by: profile!.id };
    let pid = id as string;
    const dup = (c?: string) => c === '23505' ? 'That slug is already used by another page. Change the slug.' : undefined;
    if (isNew) { const { data, error } = await supabase.from('website_pages').insert({ ...row, status: 'draft', created_by: profile!.id }).select('id').single(); if (error) { setErr(dup(error.code) ?? error.message); setBusy(false); return; } pid = data.id; }
    else { const { error } = await supabase.from('website_pages').update(row).eq('id', pid); if (error) { setErr(dup(error.code) ?? error.message); setBusy(false); return; } }
    await supabase.rpc('write_audit', { p_action: isNew ? 'page.created' : 'page.updated', p_entity_type: 'page', p_entity_id: pid, p_details: { title: row.title } });
    setBusy(false); setDirty(false); setToast('Saved'); setTimeout(() => setToast(''), 2500);
    if (isNew) nav(`/pages/${pid}`, { replace: true }); else await load();
  }
  async function del() { if (!window.confirm('Delete this page permanently?')) return; const { error } = await supabase.from('website_pages').delete().eq('id', id); if (error) { setErr(error.message); return; } await supabase.rpc('write_audit', { p_action: 'page.deleted', p_entity_type: 'page', p_entity_id: id, p_details: { title: f.title } }); nav('/pages'); }

  if (loading) return <Spinner />;
  const dis = readOnly || busy;
  return <>
    <PageHeader title={isNew ? 'New page' : 'Edit page'} actions={<Link to="/pages" className="btn btn-ghost">Back to pages</Link>} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    {readOnly && !isNew && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This page is {status}. Ask a Content Manager to unpublish it or request changes before editing.</p>}
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="card space-y-4 p-4">
          <Field label="Page title" htmlFor="p-title"><input id="p-title" className="input" value={f.title} disabled={dis} onChange={e => { set('title', e.target.value); if (!slugTouched) setF(p => ({ ...p, title: e.target.value, slug: slugify(e.target.value) })); }} /></Field>
          <Field label="URL slug" htmlFor="p-slug" hint={`Address: page.html?slug=${slugify(f.slug || f.title) || '…'}`}><input id="p-slug" className="input" value={f.slug} disabled={dis} onChange={e => { setSlugTouched(true); set('slug', e.target.value); }} /></Field>
        </div>
        <div><h2 className="mb-2 text-sm font-semibold">Page sections</h2><BlockEditor blocks={f.blocks} disabled={dis} onChange={b => set('blocks', b)} /></div>
        <details className="card p-4"><summary className="cursor-pointer text-sm font-semibold">SEO and social sharing</summary><div className="mt-4 space-y-4">
          <Field label="SEO title" htmlFor="p-st" hint={`${f.seo_title.length}/60 characters. Blank uses the page title.`}><input id="p-st" className="input" value={f.seo_title} disabled={dis} onChange={e => set('seo_title', e.target.value)} /></Field>
          <Field label="Meta description" htmlFor="p-sd" hint={`${f.seo_description.length}/160 characters`}><textarea id="p-sd" className="input" rows={2} value={f.seo_description} disabled={dis} onChange={e => set('seo_description', e.target.value)} /></Field>
          <Field label="Canonical URL" htmlFor="p-cu"><input id="p-cu" className="input" type="url" value={f.canonical_url} disabled={dis} onChange={e => set('canonical_url', e.target.value)} /></Field>
          <Field label="Social sharing image URL" htmlFor="p-og"><input id="p-og" className="input" type="url" value={f.og_image_url} disabled={dis} onChange={e => set('og_image_url', e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.noindex} disabled={dis} onChange={e => set('noindex', e.target.checked)} />Ask search engines not to index this page</label></div></details>
      </div>
      <div className="space-y-4">
        {!isNew && <Workflow entity="page" id={id!} status={status} publishAt={fromLocalInput(f.publish_at)} dirty={dirty} onChanged={() => void load()} />}
        <div className="card space-y-4 p-4">
          <Field label="Visibility" htmlFor="p-vis" hint="Hidden pages are not shown on the website even when published."><select id="p-vis" className="input" value={f.visibility} disabled={dis} onChange={e => set('visibility', e.target.value as Form['visibility'])}><option value="public">Public</option><option value="hidden">Hidden</option></select></Field>
          <Field label="Display order" htmlFor="p-ord"><input id="p-ord" className="input" type="number" value={f.sort_order} disabled={dis} onChange={e => set('sort_order', Number(e.target.value))} /></Field>
          {can('pages.publish') && <Field label="Schedule for" htmlFor="p-pub" hint="Set a time, save, then press Schedule."><input id="p-pub" className="input" type="datetime-local" value={f.publish_at} disabled={dis} onChange={e => set('publish_at', e.target.value)} /></Field>}
        </div>
        {!readOnly && <div className="flex gap-2"><button className="btn btn-primary flex-1" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create draft' : 'Save changes'}</button>{!isNew && can('pages.delete') && <button type="button" className="btn btn-danger" onClick={() => void del()}>Delete</button>}</div>}
        {dirty && !readOnly && <p className="text-xs text-amber-700">You have unsaved changes.</p>}
      </div>
    </form><Toast msg={toast} /></>;
}
