// SMTP sending through the "denomailer" library (loaded only when SMTP is the chosen provider). NOT TESTED against a live mail server.
import { env } from './config.ts';

export interface Mail { to: string[]; subject: string; html: string; text: string; replyTo?: string; headers?: Record<string, string> }
export async function sendSmtp(m: Mail): Promise<{ ok: boolean; error?: string }> {
  const host = env('SMTP_HOST'), from = env('EMAIL_FROM'); const port = Number(env('SMTP_PORT') || 465);
  if (!host || !from) return { ok: false, error: 'SMTP is not configured (server and From address are required).' };
  const ssl = (env('SMTP_SECURE') || (port === 465 ? 'ssl' : 'starttls')) === 'ssl';
  let client: { send(o: Record<string, unknown>): Promise<void>; close(): Promise<void> } | null = null;
  try {
    const mod = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
    client = new mod.SMTPClient({ connection: { hostname: host, port, tls: ssl, ...(env('SMTP_USER') ? { auth: { username: env('SMTP_USER'), password: env('SMTP_PASSWORD') } } : {}) } });
    await client.send({ from, to: m.to, subject: m.subject, content: m.text, html: m.html, ...(m.replyTo ? { replyTo: m.replyTo } : {}), ...(m.headers ? { headers: m.headers } : {}) });
    return { ok: true };
  } catch (e) { return { ok: false, error: 'SMTP error: ' + String((e as Error).message ?? e).replace(/(pass(word)?|auth)\S*/gi, '').slice(0, 160) }; }
  finally { try { await client?.close(); } catch { /* ignore */ } }
}
