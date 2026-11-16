import { supabase } from './supabase';

export async function invokeFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      let j: { error?: unknown; message?: unknown; code?: unknown } | null = null;
      try { j = await ctx.json(); } catch { /* not JSON */ }
      if (j?.error) throw new Error(String(j.error));
      const st = (ctx as Response).status;
      if (st === 404) throw new Error(`The "${name}" function is not deployed in this Supabase project (404). Run "Deploy Supabase functions" in GitHub.`);
      if (st === 401) throw new Error('Supabase rejected the sign-in token (401). Sign out and in again.');
      throw new Error(`The "${name}" function failed (HTTP ${st}${j?.code ? ', ' + String(j.code) : ''}${j?.message ? ': ' + String(j.message).slice(0, 160) : ''}). Open Supabase → Edge Functions → ${name} → Logs for details.`);
    }
    throw new Error(`The browser could not connect to the "${name}" function. This is usually the ALLOWED_ORIGIN secret not matching this site's address (it must be exactly ${window.location.origin}), or the function is not deployed.`);
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}
export interface IntegrationStatus { r2: S; turnstile: S; hubspot: S; email: S; cors: S; r2_private: S; cron: S; hubspot_deals: S; eventbrite: S }
interface S { configured: boolean; missing: string[] }
