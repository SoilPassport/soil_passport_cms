import { supabase } from './supabase';

export async function invokeFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') { try { const j = await ctx.json(); if (j?.error) throw new Error(String(j.error)); } catch (e) { if (e instanceof Error && e.message && !/JSON|Unexpected/.test(e.message)) throw e; } }
    throw new Error(`Could not reach the "${name}" service. Check that the function is deployed.`);
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}
export interface IntegrationStatus { r2: S; turnstile: S; hubspot: S; email: S; cors: S; r2_private: S; cron: S; hubspot_deals: S; eventbrite: S }
interface S { configured: boolean; missing: string[] }
