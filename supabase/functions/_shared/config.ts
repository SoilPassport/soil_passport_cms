// Settings lookup: a value saved by a Super Admin in the admin panel (database) wins over the Edge Function environment.
// Call `await loadConfig(admin)` once at the start of a request, then use env('NAME') everywhere (it is synchronous).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { BOOTSTRAP_KEYS } from './config-registry.ts';
import { decryptSecret } from './secretbox.ts';

const denoEnv = (k: string) => (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? '';
let cache: { at: number; map: Record<string, string>; src: Record<string, 'database'> } = { at: 0, map: {}, src: {} };
const TTL_MS = 30_000;

export const env = (k: string): string => BOOTSTRAP_KEYS.includes(k) ? denoEnv(k) : (cache.map[k] ?? denoEnv(k));
export const sourceOf = (k: string): 'database' | 'environment' | 'unset' => !BOOTSTRAP_KEYS.includes(k) && cache.src[k] ? 'database' : denoEnv(k) ? 'environment' : 'unset';
export const bustConfig = () => { cache = { at: 0, map: {}, src: {} }; };

export async function loadConfig(admin: SupabaseClient, force = false): Promise<void> {
  if (!force && Date.now() - cache.at < TTL_MS) return;
  const { data, error } = await admin.from('app_config').select('key,value,is_secret');
  if (error) { console.error('config load failed', error.message); cache = { ...cache, at: Date.now() - TTL_MS + 5_000 }; return; } // retry soon; fall back to environment
  const master = denoEnv('CONFIG_ENCRYPTION_KEY'); const map: Record<string, string> = {}; const src: Record<string, 'database'> = {};
  for (const r of data ?? []) {
    try { map[r.key] = r.is_secret ? await decryptSecret(r.value, master, r.key) : r.value; src[r.key] = 'database'; }
    catch { console.error('could not read setting', r.key); }   // wrong/missing master key: ignore the row, environment value (if any) is used
  }
  cache = { at: Date.now(), map, src };
}

/** Address of the Cloudflare R2 S3 endpoint (custom endpoint if set, else the account default). */
export const r2Host = (): string => (env('R2_ENDPOINT') || `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`).replace(/\/+$/, '');
