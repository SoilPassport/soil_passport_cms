// Email templating (pure) and sending through Resend. Values are HTML-escaped before insertion.
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export function render(tpl: string, vars: Record<string, unknown>, html: boolean): string {
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, k) => {
    const v = vars[k] ?? '';
    return html ? esc(v).replace(/\n/g, '<br>') : String(v);
  });
}
export const stripTags = (h: string) => h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
export const cleanSubject = (s: string) => s.replace(/[\r\n]+/g, ' ').slice(0, 200);

export async function sendEmail(opts: { to: string[]; subject: string; html: string; text?: string; replyTo?: string }): Promise<{ ok: boolean; error?: string }> {
  const key = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('EMAIL_FROM');
  if (!key || !from) return { ok: false, error: 'Email is not configured (RESEND_API_KEY / EMAIL_FROM).' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: opts.to, subject: cleanSubject(opts.subject), html: opts.html, text: opts.text ?? stripTags(opts.html), ...(opts.replyTo ? { reply_to: opts.replyTo } : {}) }),
    });
    if (!r.ok) return { ok: false, error: `Email provider returned ${r.status}` };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message.slice(0, 200) }; }
}
