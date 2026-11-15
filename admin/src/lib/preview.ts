import { clean } from './util';
import type { Block } from './blocks';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const safe = (u: unknown) => { const v = String(u ?? '').trim(); return /^(https?:\/\/|\/|[a-z0-9._-]+\.html(\?|#|$)|#)/i.test(v) ? v : ''; };
const paras = (t: unknown) => String(t ?? '').split(/\n{2,}/).map(p => p.trim() ? `<p>${esc(p).replace(/\n/g, '<br>')}</p>` : '').join('');
const btn = (l: unknown, u: unknown) => l && safe(u) ? `<a class="btn btn-primary" href="${esc(safe(u))}">${esc(l)}</a>` : '';
const img = (u: unknown, alt = '') => safe(u) ? `<img class="cms-hero-img" src="${esc(safe(u))}" alt="${esc(alt)}">` : '';
type O = Record<string, unknown>;
const items = (b: O) => (Array.isArray(b.items) ? b.items : []) as O[];
const R: Record<string, (b: O) => string> = {
  hero: b => `<section class="cms-sec"><div class="wrap">${b.heading ? `<h2>${esc(b.heading)}</h2>` : ''}${paras(b.text)}${btn(b.cta_label, b.cta_url)}${img(b.image_url)}</div></section>`,
  text: b => `<section class="cms-sec"><div class="wrap cms-narrow">${b.heading ? `<h2>${esc(b.heading)}</h2>` : ''}${paras(b.body)}</div></section>`,
  text_image: b => `<section class="cms-sec"><div class="wrap grid-2"><div>${b.heading ? `<h2>${esc(b.heading)}</h2>` : ''}${paras(b.body)}</div>${img(b.image_url, String(b.image_alt ?? ''))}</div></section>`,
  cards: b => `<section class="cms-sec"><div class="wrap">${b.heading ? `<h2>${esc(b.heading)}</h2>` : ''}<div class="grid-3">${items(b).map(i => `<div class="card"><h3>${esc(i.title)}</h3>${paras(i.text)}</div>`).join('')}</div></div></section>`,
  stats: b => `<section class="cms-sec"><div class="wrap">${b.heading ? `<h2>${esc(b.heading)}</h2>` : ''}<div class="grid-4">${items(b).map(i => `<div class="card"><h3 class="cms-stat">${esc(i.value)}</h3><p>${esc(i.label)}</p></div>`).join('')}</div></div></section>`,
  faq: b => `<section class="cms-sec"><div class="wrap cms-narrow">${b.heading ? `<h2>${esc(b.heading)}</h2>` : ''}${items(b).map(i => `<details class="cms-faq" open><summary>${esc(i.q)}</summary>${paras(i.a)}</details>`).join('')}</div></section>`,
  cta: b => `<section class="cms-sec cms-cta"><div class="wrap cms-narrow">${b.heading ? `<h2>${esc(b.heading)}</h2>` : ''}${paras(b.text)}${btn(b.cta_label, b.cta_url)}</div></section>`,
};

const FALLBACK_CSS = `body{margin:0;font-family:Inter,system-ui,sans-serif;background:#F4F1E8;color:#20190F;line-height:1.55}.wrap{max-width:1200px;margin:0 auto;padding:0 24px}
.page-hero{background:#A6572A;color:#F4F1E8;padding:48px 0 36px}.page-hero h1{margin:6px 0 0;font:560 clamp(28px,4.6vw,44px)/1.1 Georgia,serif}.breadcrumb{font:12px monospace;letter-spacing:.12em;text-transform:uppercase}
.cms-meta{font:11px monospace;letter-spacing:.08em;text-transform:uppercase}.cms-body{max-width:760px;font-size:18px;line-height:1.75}.cms-body img,.cms-hero-img{max-width:100%;height:auto;border-radius:8px}
.cms-sec{padding:48px 0}.cms-narrow>*{max-width:760px}.card{border:1px solid rgba(32,25,15,.3);border-radius:8px;padding:20px;background:#F4F1E8}.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:32px}.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.cms-cta{background:#ECE6D5}.btn{display:inline-block;background:#A6572A;color:#F4F1E8;padding:12px 20px;border-radius:2px;text-decoration:none;font:13px monospace;text-transform:uppercase}.cms-speakers{display:flex;gap:20px;flex-wrap:wrap}.cms-faq{border-bottom:1px solid rgba(32,25,15,.16);padding:12px 0}
.cms-banner-note{background:#fff3cd;padding:8px 16px;font:13px sans-serif;text-align:center}@media(max-width:700px){.grid-2,.grid-3,.grid-4{grid-template-columns:1fr}}`;

function shell(inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560&family=IBM+Plex+Mono:wght@400&family=Inter:wght@400;600&display=swap">
<style>${FALLBACK_CSS}</style><link rel="stylesheet" href="https://soilpassport.com/assets/style.css"></head><body><div class="cms-banner-note">Preview — this is how it will look on soilpassport.com. Nothing is published.</div>${inner}</body></html>`;
}
const hero = (crumb: string, title: string, meta: string) => `<section class="page-hero page-hero-light"><div class="wrap"><div class="breadcrumb">${esc(crumb)}</div><h1>${esc(title || 'Untitled')}</h1><p class="cms-meta" style="margin-top:12px">${esc(meta)}</p></div></section>`;
const d = (s: string | null | undefined) => { try { return s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; } catch { return ''; } };

export function articlePreview(a: { title: string; html: string; image: string; author: string; date?: string | null }) {
  return shell(hero('News', a.title, [d(a.date ?? new Date().toISOString()), a.author].filter(Boolean).join(' · ')) + `<section style="padding:48px 0"><div class="wrap">${img(a.image)}<div class="cms-body">${clean(a.html)}</div></div></section>`);
}
export function eventPreview(e: { title: string; html: string; banner: string; starts: string; location: string; regUrl: string; speakers: { name: string; title: string; organisation: string }[] }) {
  const sp = e.speakers.filter(s => s.name);
  return shell(hero('Events', e.title, [d(e.starts), e.location].filter(Boolean).join(' · ')) + `<section style="padding:48px 0"><div class="wrap">${img(e.banner)}<div class="cms-body">${clean(e.html)}</div>${sp.length ? `<h2>Speakers</h2><div class="cms-speakers">${sp.map(s => `<div><strong>${esc(s.name)}</strong><br>${esc([s.title, s.organisation].filter(Boolean).join(', '))}</div>`).join('')}</div>` : ''}<p style="margin-top:28px">${btn('Register', e.regUrl)}</p></div></section>`);
}
export function pagePreview(title: string, blocks: Block[]) {
  return shell((blocks as O[]).map(b => R[String(b.type)]?.(b) ?? '').join('') || `<div class="wrap"><p>${esc(title)} has no sections yet.</p></div>`);
}
