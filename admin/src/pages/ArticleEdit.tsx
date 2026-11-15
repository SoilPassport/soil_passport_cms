import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, ErrorBox, Field, Toast } from '../components/ui';
import RichText from '../components/RichText';
import Workflow from '../components/Workflow';
import { clean, fmt, fromLocalInput, slugify, toLocalInput } from '../lib/util';

interface Form { title: string; slug: string; summary: string; html: string; featured_image_url: string; author_display_name: string; category_id: string; tags: string; publish_at: string; seo_title: string; seo_description: string; canonical_url: string; og_image_url: string; noindex: boolean }
const EMPTY: Form = { title: '', slug: '', summary: '', html: '', featured_image_url: '', author_display_name: '', category_id: '', tags: '', publish_at: '', seo_title: '', seo_description: '', canonical_url: '', og_image_url: '', noindex: false };
interface Rev { id: string; revision_no: number; created_at: string; snapshot: Partial<Form> & { body?: { html?: string } } }

export default function ArticleEdit() {
  const { id } = useParams(); const isNew = !id || id === 'new'; const nav = useNavigate(); const { can, profile } = useAuth();
  const [f, setF] = useState<Form>(EMPTY); const [status, setStatus] = useState('draft'); const [cats, setCats] = useState<{ id: string; name: string }[]>([]); const [revs, setRevs] = useState<Rev[]>([]);
  const [loading, setLoading] = useState(!isNew); const [err, setErr] = useState(''); const [toast, setToast] = useState(''); const [dirty, setDirty] = useState(false); const [slugTouched, setSlugTouched] = useState(false); const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF(p => ({ ...p, [k]: v })); setDirty(true); };
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    const { data: c } = await supabase.from('article_categories').select('id,name').order('name'); setCats(c ?? []);
    if (isNew) return;
    const { data, error } = await supabase.from('articles').select('*').eq('id', id).maybeSingle();
    if (error || !data) { setErr(error?.message ?? 'Article not found, or you do not have access.'); setLoading(false); return; }
    const { data: tg } = await supabase.from('article_tag_map').select('article_tags(name)').eq('article_id', id);
    setStatus(data.status); setSlugTouched(true);
    setF({ title: data.title, slug: data.slug, summary: data.summary ?? '', html: (data.body as { html?: string })?.html ?? '', featured_image_url: data.featured_image_url ?? '', author_display_name: data.author_display_name ?? '', category_id: data.category_id ?? '',
      tags: ((tg ?? []) as unknown as { article_tags: { name: string } | null }[]).map(t => t.article_tags?.name).filter(Boolean).join(', '), publish_at: toLocalInput(data.publish_at), seo_title: data.seo_title ?? '', seo_description: data.seo_description ?? '', canonical_url: data.canonical_url ?? '', og_image_url: data.og_image_url ?? '', noindex: data.noindex });
    const { data: r } = await supabase.from('article_revisions').select('id,revision_no,created_at,snapshot').eq('article_id', id).order('revision_no', { ascending: false }).limit(15); setRevs((r ?? []) as unknown as Rev[]);
    setDirty(false); setLoading(false);
  }, [id, isNew]);
  useEffect(() => { void load(); }, [load]);

  const live = status === 'published' || status === 'scheduled';
  const readOnly = !can('articles.edit') || ((live || status === 'archived') && !can('articles.publish'));

  async function save(e?: FormEvent) {
    e?.preventDefault(); setErr('');
    if (!f.title.trim()) { setErr('Title is required.'); return; }
    const slug = slugify(f.slug || f.title); if (!slug) { setErr('Slug is required.'); return; }
    setBusy(true);
    const row = { title: f.title.trim(), slug, summary: f.summary.trim() || null, body: { html: clean(f.html) }, featured_image_url: f.featured_image_url.trim() || null, author_display_name: f.author_display_name.trim() || null,
      category_id: f.category_id || null, publish_at: fromLocalInput(f.publish_at), seo_title: f.seo_title.trim() || null, seo_description: f.seo_description.trim() || null, canonical_url: f.canonical_url.trim() || null, og_image_url: f.og_image_url.trim() || null, noindex: f.noindex, updated_by: profile!.id };
    let aid = id as string;
    if (isNew) {
      const { data, error } = await supabase.from('articles').insert({ ...row, status: 'draft', created_by: profile!.id, author_id: profile!.id }).select('id').single();
      if (error) { setErr(error.code === '23505' ? 'That slug is already used by another article. Change the slug.' : error.message); setBusy(false); return; }
      aid = data.id;
    } else {
      const { error } = await supabase.from('articles').update(row).eq('id', aid);
      if (error) { setErr(error.code === '23505' ? 'That slug is already used by another article. Change the slug.' : error.message); setBusy(false); return; }
    }
    // tags
    const names = [...new Set(f.tags.split(',').map(t => t.trim()).filter(Boolean))].slice(0, 12);
    await supabase.from('article_tag_map').delete().eq('article_id', aid);
    if (names.length) {
      const { data: tg } = await supabase.from('article_tags').upsert(names.map(n => ({ name: n, slug: slugify(n) })), { onConflict: 'slug' }).select('id');
      if (tg?.length) await supabase.from('article_tag_map').insert(tg.map(t => ({ article_id: aid, tag_id: t.id })));
    }
    // revision
    const { data: last } = await supabase.from('article_revisions').select('revision_no').eq('article_id', aid).order('revision_no', { ascending: false }).limit(1);
    await supabase.from('article_revisions').insert({ article_id: aid, revision_no: (last?.[0]?.revision_no ?? 0) + 1, snapshot: { ...f, slug }, created_by: profile!.id });
    await supabase.rpc('write_audit', { p_action: isNew ? 'article.created' : 'article.updated', p_entity_type: 'article', p_entity_id: aid, p_details: { title: row.title } });
    setBusy(false); setDirty(false); flash('Saved');
    if (isNew) nav(`/articles/${aid}`, { replace: true }); else await load();
  }
  async function del() {
    if (!window.confirm('Delete this article permanently? This cannot be undone.')) return;
    const { error } = await supabase.from('articles').delete().eq('id', id); if (error) { setErr(error.message); return; }
    await supabase.rpc('write_audit', { p_action: 'article.deleted', p_entity_type: 'article', p_entity_id: id, p_details: { title: f.title } }); nav('/articles');
  }
  function restore(r: Rev) { const s = r.snapshot; setF({ ...f, title: s.title ?? f.title, slug: s.slug ?? f.slug, summary: s.summary ?? '', html: s.html ?? '', featured_image_url: s.featured_image_url ?? '', seo_title: s.seo_title ?? '', seo_description: s.seo_description ?? '' }); setDirty(true); flash(`Revision ${r.revision_no} loaded. Save to keep it.`); }

  if (loading) return <Spinner />;
  const dis = readOnly || busy;
  return <>
    <PageHeader title={isNew ? 'New article' : 'Edit article'} sub={isNew ? 'Saved as a draft first. Publish from the Status panel after saving.' : undefined} actions={<Link to="/articles" className="btn btn-ghost">Back to articles</Link>} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    {readOnly && !isNew && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This article is {status}. {can('articles.edit') ? 'Ask a Content Manager to unpublish it or request changes before editing.' : 'You can view it but not edit it.'}</p>}
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="card space-y-4 p-4">
          <Field label="Title" htmlFor="a-title"><input id="a-title" className="input" value={f.title} disabled={dis} onChange={e => { set('title', e.target.value); if (!slugTouched) setF(p => ({ ...p, title: e.target.value, slug: slugify(e.target.value) })); }} /></Field>
          <Field label="URL slug" htmlFor="a-slug" hint={`Address: article.html?slug=${slugify(f.slug || f.title) || '…'}`}><input id="a-slug" className="input" value={f.slug} disabled={dis} onChange={e => { setSlugTouched(true); set('slug', e.target.value); }} /></Field>
          <Field label="Short description" htmlFor="a-sum" hint="Shown on the news list. Aim for one or two sentences."><textarea id="a-sum" className="input" rows={2} maxLength={300} value={f.summary} disabled={dis} onChange={e => set('summary', e.target.value)} /></Field>
          <div><span className="label">Content</span>{dis ? <div className="prose-body rounded-lg border border-slate-200 bg-slate-50 p-4" dangerouslySetInnerHTML={{ __html: clean(f.html) }} /> : <RichText value={f.html} onChange={h => set('html', h)} />}</div>
        </div>
        <details className="card p-4"><summary className="cursor-pointer text-sm font-semibold">SEO and social sharing</summary>
          <div className="mt-4 space-y-4">
            <Field label="SEO title" htmlFor="a-st" hint={`${f.seo_title.length}/60 characters. Leave blank to use the article title.`}><input id="a-st" className="input" value={f.seo_title} disabled={dis} onChange={e => set('seo_title', e.target.value)} /></Field>
            <Field label="Meta description" htmlFor="a-sd" hint={`${f.seo_description.length}/160 characters`}><textarea id="a-sd" className="input" rows={2} value={f.seo_description} disabled={dis} onChange={e => set('seo_description', e.target.value)} /></Field>
            <Field label="Canonical URL" htmlFor="a-cu" hint="Only set if this content was first published elsewhere."><input id="a-cu" className="input" type="url" value={f.canonical_url} disabled={dis} onChange={e => set('canonical_url', e.target.value)} /></Field>
            <Field label="Social sharing image URL" htmlFor="a-og"><input id="a-og" className="input" type="url" value={f.og_image_url} disabled={dis} onChange={e => set('og_image_url', e.target.value)} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.noindex} disabled={dis} onChange={e => set('noindex', e.target.checked)} />Ask search engines not to index this article</label>
          </div></details>
      </div>
      <div className="space-y-4">
        {!isNew && <Workflow entity="article" id={id!} status={status} publishAt={fromLocalInput(f.publish_at)} dirty={dirty} onChanged={() => void load()} />}
        <div className="card space-y-4 p-4">
          <Field label="Category" htmlFor="a-cat"><select id="a-cat" className="input" value={f.category_id} disabled={dis} onChange={e => set('category_id', e.target.value)}><option value="">None</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Tags" htmlFor="a-tags" hint="Separate with commas."><input id="a-tags" className="input" value={f.tags} disabled={dis} onChange={e => set('tags', e.target.value)} /></Field>
          <Field label="Author name shown" htmlFor="a-au"><input id="a-au" className="input" value={f.author_display_name} disabled={dis} onChange={e => set('author_display_name', e.target.value)} /></Field>
          <Field label="Featured image URL" htmlFor="a-img" hint="Paste an image address. The media library comes in Phase 3."><input id="a-img" className="input" type="url" value={f.featured_image_url} disabled={dis} onChange={e => set('featured_image_url', e.target.value)} /></Field>
          {can('articles.publish') && <Field label="Schedule for" htmlFor="a-pub" hint="Set a time, save, then press Schedule."><input id="a-pub" className="input" type="datetime-local" value={f.publish_at} disabled={dis} onChange={e => set('publish_at', e.target.value)} /></Field>}
        </div>
        {!readOnly && <div className="flex gap-2"><button className="btn btn-primary flex-1" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create draft' : 'Save changes'}</button>{!isNew && can('articles.delete') && <button type="button" className="btn btn-danger" onClick={() => void del()}>Delete</button>}</div>}
        {dirty && !readOnly && <p className="text-xs text-amber-700">You have unsaved changes.</p>}
        {revs.length > 0 && <section className="card p-4"><h2 className="mb-2 text-sm font-semibold">Revision history</h2><ul className="space-y-1 text-xs">{revs.map(r => <li key={r.id} className="flex items-center justify-between gap-2"><span>#{r.revision_no} · {fmt(r.created_at)}</span>{!readOnly && <button type="button" className="underline" onClick={() => restore(r)}>Load</button>}</li>)}</ul></section>}
      </div>
    </form>
    <Toast msg={toast} />
  </>;
}
