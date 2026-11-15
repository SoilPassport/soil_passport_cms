// Pure helpers for the cookie-free analytics endpoint.
export const isBot = (ua: string) => !ua || /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python|axios|go-http|java\//i.test(ua);
export const deviceOf = (ua: string) => /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|android|iphone/i.test(ua) ? 'mobile' : 'desktop';
// Keep only a clean site path, plus the ?slug= of CMS pages. Everything else (query strings, fragments) is dropped.
export function cleanPath(p: unknown): string | null {
  if (typeof p !== 'string' || p.length > 300) return null;
  const [path, query = ''] = p.split('?', 2);
  if (!/^\/[A-Za-z0-9._\-\/]{0,200}$/.test(path) || path.includes('..')) return null;
  const slug = /(?:^|&)slug=([a-z0-9\-\/]{1,120})(?:&|$)/.exec(query)?.[1];
  return slug ? `${path}?slug=${slug}` : path;
}
export function hostOf(r: unknown, ownHosts: string[]): string | null {
  if (typeof r !== 'string' || !r) return null;
  try { const h = new URL(r).hostname.replace(/^www\./, '').toLowerCase().slice(0, 100); return ownHosts.map(x => x.replace(/^www\./, '')).includes(h) ? null : h; } catch { return null; }
}
export const cleanSource = (u: unknown) => typeof u === 'string' && /^[a-zA-Z0-9_.\- ]{1,60}$/.test(u) ? u.toLowerCase() : null;
