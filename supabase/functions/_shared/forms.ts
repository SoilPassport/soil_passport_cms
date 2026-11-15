// Pure validation for public form submissions (no Deno APIs, unit-tested in supabase/tests/forms.test.mjs).
export type Kind = 'contact' | 'demo' | 'partnership' | 'investment' | 'event_registration' | 'newsletter';
export const KINDS: Kind[] = ['contact', 'demo', 'partnership', 'investment', 'event_registration', 'newsletter'];
export const PARTNER_CATS = ['technology', 'research', 'academic', 'agronomy', 'farming_org', 'food_producer', 'distributor', 'biochar', 'bioenergy', 'investor', 'other'];
export const INVESTOR_TYPES = ['angel', 'venture_capital', 'family_office', 'institutional', 'strategic', 'corporate_partner', 'other'];
export const CONTACT_CATS = ['general', 'product', 'book_demo', 'technical', 'media', 'partnership', 'investment', 'events', 'other'];

export interface Clean { kind: Kind; name?: string; email: string; organisation?: string; telephone?: string; country?: string; job_title?: string; category?: string; message?: string; consent: true; source_page?: string; event_slug?: string; contact_category?: string; partnership_category?: string; website?: string; investor_type?: string; investment_interest?: string; interests?: string[] }
type R = { ok: true; value: Clean } | { ok: false; error: string };

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
function str(v: unknown, max: number, min = 0): string | null {
  if (v === undefined || v === null) return min === 0 ? '' : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/\r\n/g, '\n').trim();
  if (CTRL.test(s) || s.length > max || s.length < min) return null;
  return s;
}
export const EMAIL_RE = /^[^\s@<>"',;:()\[\]\\]+@[^\s@<>"',;:()\[\]\\]+\.[^\s@<>"',;:()\[\]\\]{2,}$/;
const URL_RE = /^https?:\/\/[^\s<>"']{3,200}$/i;

export function validate(kind: string, b: Record<string, unknown>): R {
  if (!KINDS.includes(kind as Kind)) return { ok: false, error: 'Unknown form.' };
  const k = kind as Kind;
  const email = str(b.email, 254, 5);
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: 'Please enter a valid email address.' };
  if (b.consent !== true) return { ok: false, error: 'Please confirm that you agree to us contacting you.' };
  const out: Clean = { kind: k, email: email.toLowerCase(), consent: true };
  const bad = (m: string): R => ({ ok: false, error: m });

  if (k === 'newsletter') {
    const name = str(b.name, 120); if (name === null) return bad('Please check your name.');
    if (name) out.name = name;
    return { ok: true, value: out };
  }
  const name = str(b.name, 120, 2); if (!name) return bad('Please enter your name.');
  out.name = name;
  for (const [f, max] of [['organisation', 150], ['telephone', 40], ['country', 80], ['job_title', 120], ['category', 80]] as const) {
    const v = str(b[f], max); if (v === null) return bad(`Please check the ${f.replace('_', ' ')} field.`);
    if (v) (out as unknown as Record<string, string>)[f] = v;
  }
  if (out.telephone && !/^[0-9+()\-.\s]{5,40}$/.test(out.telephone)) return bad('Please enter a valid telephone number.');
  const sp = str(b.source_page, 200); if (sp) out.source_page = sp;

  if (k === 'event_registration') {
    const slug = str(b.event_slug, 160, 1); if (!slug || !/^[a-z0-9-]+$/.test(slug)) return bad('Event not found.');
    out.event_slug = slug;
    if (Array.isArray(b.interests)) out.interests = b.interests.filter((x): x is string => typeof x === 'string' && x.length <= 60).slice(0, 10);
    return { ok: true, value: out };
  }
  const message = str(b.message, 5000, 1); if (!message) return bad('Please enter your message.');
  out.message = message;
  if (k === 'contact' || k === 'demo') {
    const c = k === 'demo' ? 'book_demo' : (typeof b.contact_category === 'string' ? b.contact_category : 'general');
    if (!CONTACT_CATS.includes(c)) return bad('Please choose a valid topic.');
    out.contact_category = c;
  }
  if (k === 'partnership') {
    if (!out.organisation) return bad('Please enter your organisation.');
    const c = typeof b.partnership_category === 'string' ? b.partnership_category : '';
    if (!PARTNER_CATS.includes(c)) return bad('Please choose a partnership type.');
    out.partnership_category = c;
    const w = str(b.website, 200); if (w === null || (w && !URL_RE.test(w))) return bad('Website must start with https://');
    if (w) out.website = w;
  }
  if (k === 'investment') {
    if (!out.organisation) return bad('Please enter your organisation.');
    const t = typeof b.investor_type === 'string' ? b.investor_type : '';
    if (!INVESTOR_TYPES.includes(t)) return bad('Please choose an investor type.');
    out.investor_type = t;
    const i = str(b.investment_interest, 1000); if (i === null) return bad('Please check the investment interest.');
    if (i) out.investment_interest = i;
  }
  return { ok: true, value: out };
}
