// Pure helpers for building newsletter emails.
import { esc } from './email.ts';
import { sanitizeEmailHtml } from './sanitize.ts';
export function buildNewsletter(o: { subject: string; preheader?: string | null; bodyHtml: string; unsubscribeUrl: string; postalName: string }) {
  const body = sanitizeEmailHtml(o.bodyHtml);
  const pre = o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}</div>` : '';
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f4"><div style="max-width:620px;margin:0 auto;padding:24px;font:16px/1.5 Arial,sans-serif;color:#1f2933;background:#ffffff">${pre}${body}<hr style="border:none;border-top:1px solid #dde3dd;margin:32px 0 12px"><p style="font-size:12px;color:#667">You are receiving this because you subscribed on the ${esc(o.postalName)} website. <a href="${esc(o.unsubscribeUrl)}">Unsubscribe</a></p></div></body></html>`;
  const text = body.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li|blockquote)>/gi, '\n').replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim() + `\n\n--\nUnsubscribe: ${o.unsubscribeUrl}`;
  return { html, text };
}
