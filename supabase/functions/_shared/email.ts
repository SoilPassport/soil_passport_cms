// Email templating (pure) and sending through Resend or SMTP (chosen in the admin settings). Values are HTML-escaped before insertion.
import { env } from './config.ts';
import { sendSmtp } from './smtp.ts';
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export function render(tpl: string, vars: Record<string, unknown>, html: boolean): string {
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, k) => {
    const v = vars[k] ?? '';
    return html ? esc(v).replace(/\n/g, '<br>') : String(v);
  });
}
export const stripTags = (h: string) => h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
export const cleanSubject = (s: string) => s.replace(/[\r\n]+/g, ' ').slice(0, 200);

export async function sendEmail(opts: { to: string[]; subject: string; html: string; text?: string; replyTo?: string; headers?: Record<string, string> }): Promise<{ ok: boolean; error?: string }> {
  const subject = cleanSubject(opts.subject), text = opts.text ?? stripTags(opts.html);
  const provider = env('EMAIL_PROVIDER') || (env('RESEND_API_KEY') ? 'resend' : env('SMTP_HOST') ? 'smtp' : 'resend');
  if (provider === 'smtp') return sendSmtp({ to: opts.to, subject, html: opts.html, text, replyTo: opts.replyTo ?? (env('EMAIL_REPLY_TO') || undefined), headers: opts.headers });
  const key = env('RESEND_API_KEY'), from = env('EMAIL_FROM');
  if (!key || !from) return { ok: false, error: 'Email is not configured (Resend API key and From address).' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: opts.to, subject, html: opts.html, text, ...((opts.replyTo ?? env('EMAIL_REPLY_TO')) ? { reply_to: opts.replyTo ?? env('EMAIL_REPLY_TO') } : {}), ...(opts.headers ? { headers: opts.headers } : {}) }),
    });
    if (!r.ok) return { ok: false, error: `Email provider returned ${r.status}` };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message.slice(0, 200) }; }
}
