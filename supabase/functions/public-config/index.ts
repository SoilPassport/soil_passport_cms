// Public (no sign-in) endpoint the website calls to learn its PUBLIC keys, so they can be changed in the admin panel
// instead of editing a file on the web host. Returns only values that are public by design:
// the Supabase publishable key and the Cloudflare Turnstile SITE key. Never returns a secret.
// Deploy with --no-verify-jwt. NOT YET TESTED against a live project.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { env, loadConfig } from '../_shared/config.ts';

Deno.serve(async (req) => {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  await loadConfig(admin);
  const origins = env('PUBLIC_SITE_ORIGINS').split(',').map(s => s.trim()).filter(Boolean);
  const o = req.headers.get('origin');
  const h: Record<string, string> = { 'Access-Control-Allow-Origin': origins.length ? (o && origins.includes(o) ? o : origins[0]) : '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Vary': 'Origin' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...h, 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify({ key: env('SITE_PUBLISHABLE_KEY') || null, turnstileSiteKey: env('TURNSTILE_SITE_KEY') || null, analytics: (env('SITE_ANALYTICS') || 'on') !== 'off' }),
    { status: 200, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } });
});
