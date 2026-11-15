// Allow-list HTML sanitiser for newsletter bodies (pure, no Deno APIs). Anything not listed is dropped; text is kept.
const TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'hr', 'img', 'code', 'pre']);
const attr = (s: string) => s.replace(/&(?!(amp|lt|gt|quot|#39);)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const safeHttp = (u: string, allowMail = false): string | null => {
  const v = u.trim().replace(/&amp;/g, '&');
  if (/^https:\/\//i.test(v) || (allowMail && /^mailto:[^\s]+$/i.test(v))) return /[\s<>"']/.test(v) ? null : v;
  return null;
};
export function sanitizeEmailHtml(input: string): string {
  const src = String(input ?? '').replace(/<(script|style|iframe|object|embed|svg|math|form|noscript)[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  return src.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (m, name: string, rest: string) => {
    const t = name.toLowerCase(); if (!TAGS.has(t)) return '';
    if (m.startsWith('</')) return t === 'br' || t === 'hr' || t === 'img' ? '' : `</${t}>`;
    const get = (a: string) => { const r = new RegExp(`\\s${a}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(' ' + rest); return r ? (r[2] ?? r[3] ?? '') : null; };
    if (t === 'a') { const h = get('href'); const ok = h === null ? null : safeHttp(h, true); return ok ? `<a href="${attr(ok)}" rel="noopener noreferrer">` : '<a>'; }
    if (t === 'img') { const s = get('src'); const ok = s === null ? null : safeHttp(s); if (!ok) return ''; const alt = get('alt'); return `<img src="${attr(ok)}" alt="${attr(alt ?? '')}" style="max-width:100%;height:auto">`; }
    return t === 'br' || t === 'hr' ? `<${t}>` : `<${t}>`;
  });
}
