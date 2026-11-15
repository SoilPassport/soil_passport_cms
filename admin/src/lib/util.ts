import DOMPurify from 'dompurify';
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
export const clean = (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, ADD_ATTR: ['target', 'rel'] });
export const fmt = (d?: string | null) => d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
/** datetime-local <-> ISO helpers */
export const toLocalInput = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const fromLocalInput = (v: string) => v ? new Date(v).toISOString() : null;
