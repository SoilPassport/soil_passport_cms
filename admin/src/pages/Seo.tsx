import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PageHeader, Spinner, ErrorBox, Badge } from '../components/ui';

const SITE = 'https://soilpassport.com';
interface Row { kind: string; title: string; slug: string; url: string; seo_title: string | null; seo_description: string | null; og: boolean; noindex: boolean; updated: string | null }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Static pages that ship with the website itself (not managed in the CMS).
const STATIC = ['index', 'about', 'platform', 'dspx-platform', 'dspx-standard', 'solutions', 'industries', 'sustainability', 'partners', 'partner-with-us', 'contact', 'resources', 'faq', 'news', 'events', 'gallery', 'videos', 'downloads', 'roadmap', 'investor-enquiry', 'spx', 'spx-biochar', 'spx-bioh2', 'spx-biooil', 'spx-biotar', 'spx-carbon', 'spx-compliance', 'spx-crop-risk', 'spx-farm', 'spx-power', 'spx-weather', 'privacy', 'terms', 'cookies'];

export default function Seo() {
  const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [copied, setCopied] = useState('');
  useEffect(() => { (async () => {
    try {
      const [a, p, e, g] = await Promise.all([
        supabase.from('articles').select('title,slug,seo_title,seo_description,og_image_url,noindex,updated_at').eq('status', 'published'),
        supabase.from('website_pages').select('title,slug,seo_title,seo_description,og_image_url,noindex,updated_at').eq('status', 'published'),
        supabase.from('events').select('title,slug,updated_at').eq('status', 'published'),
        supabase.from('galleries').select('title,slug,updated_at').eq('status', 'published'),
      ]);
      for (const r of [a, p, e, g]) if (r.error) throw r.error;
      const out: Row[] = [];
      (a.data ?? []).forEach(x => out.push({ kind: 'Article', title: x.title, slug: x.slug, url: `${SITE}/article.html?slug=${x.slug}`, seo_title: x.seo_title, seo_description: x.seo_description, og: !!x.og_image_url, noindex: !!x.noindex, updated: x.updated_at }));
      (p.data ?? []).forEach(x => out.push({ kind: 'Page', title: x.title, slug: x.slug, url: `${SITE}/page.html?slug=${x.slug}`, seo_title: x.seo_title, seo_description: x.seo_description, og: !!x.og_image_url, noindex: !!x.noindex, updated: x.updated_at }));
      (e.data ?? []).forEach(x => out.push({ kind: 'Event', title: x.title, slug: x.slug, url: `${SITE}/events.html?slug=${x.slug}`, seo_title: null, seo_description: null, og: false, noindex: false, updated: x.updated_at }));
      (g.data ?? []).forEach(x => out.push({ kind: 'Gallery', title: x.title, slug: x.slug, url: `${SITE}/gallery.html?slug=${x.slug}`, seo_title: null, seo_description: null, og: false, noindex: false, updated: x.updated_at }));
      setRows(out);
    } catch (x) { setErr((x as Error).message); } setLoading(false);
  })(); }, []);

  const indexable = rows.filter(r => !r.noindex);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [...STATIC.map(s => ({ loc: `${SITE}/${s}.html`, lastmod: '' })), ...indexable.map(r => ({ loc: r.url, lastmod: r.updated ? r.updated.slice(0, 10) : '' }))]
      .map(u => `  <url>\n    <loc>${esc(u.loc)}</loc>\n${u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : ''}  </url>`).join('\n') + '\n</urlset>\n';
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
  const issues = rows.filter(r => r.kind === 'Article' || r.kind === 'Page').map(r => ({ r, p: [!r.seo_title && 'No SEO title', !r.seo_description && 'No meta description', r.seo_description && r.seo_description.length > 160 && 'Description over 160 characters', r.seo_title && r.seo_title.length > 60 && 'Title over 60 characters', !r.og && 'No social image'].filter(Boolean) as string[] })).filter(x => x.p.length);

  function copy(t: string, k: string) { void navigator.clipboard.writeText(t).then(() => { setCopied(k); setTimeout(() => setCopied(''), 2000); }, () => setErr('Copy was blocked by the browser. Select the text and copy it manually.')); }
  function save(name: string, t: string, type: string) { const u = URL.createObjectURL(new Blob([t], { type })); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); }

  if (loading) return <Spinner />;
  return <><PageHeader title="SEO Management" sub="Generate sitemap.xml and robots.txt from published content, and find pages with missing SEO fields. Per-item SEO fields are edited in each article or page." />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    <div className="mb-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">The website is a static site, so these files are not updated automatically. Download them and upload to the website's root folder (replacing the existing files) after publishing new content. Pages marked noindex are left out of the sitemap. Content is rendered in the browser, so search engines that do not run JavaScript will not see CMS articles or pages.</div>
    <div className="grid gap-4 lg:grid-cols-2">
      {[['sitemap.xml', sitemap, 'application/xml'], ['robots.txt', robots, 'text/plain']].map(([n, t, ty]) => <div key={n} className="card p-4">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-medium">{n}</h2><div className="flex gap-2"><button className="btn" onClick={() => copy(t, n)}>{copied === n ? 'Copied' : 'Copy'}</button><button className="btn btn-primary" onClick={() => save(n, t, ty)}>Download</button></div></div>
        <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-3 text-xs">{t}</pre></div>)}
    </div>
    <h2 className="mb-2 mt-8 font-medium">SEO audit ({issues.length} item{issues.length === 1 ? '' : 's'} need attention)</h2>
    <div className="card overflow-x-auto">{issues.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">All published articles and pages have SEO fields filled in.</p> :
      <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">Type</th><th className="p-3">Title</th><th className="p-3">Issues</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{issues.map(({ r, p }) => <tr key={r.kind + r.slug}><td className="p-3">{r.kind}</td><td className="p-3">{r.title}</td><td className="p-3"><div className="flex flex-wrap gap-1">{p.map(i => <Badge key={i} tone="amber">{i}</Badge>)}</div></td></tr>)}</tbody></table>}</div></>;
}
