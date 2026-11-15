// Cookie-free page-view counter for the public website. Stores: path, referrer host, device class, country, and a
// visitor hash that changes every day (HMAC of day + IP + browser, never stored raw). No cookies, no raw IPs, no fingerprints that persist.
// Deploy with: supabase functions deploy track --no-verify-jwt. NOT YET TESTED against live Supabase.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { cleanPath, cleanSource, deviceOf, hostOf, isBot } from '../_shared/analytics.ts';
import { hmacHex } from '../_shared/crypto.ts';

import { env, loadConfig } from '../_shared/config.ts';
const origins = () => (env('PUBLIC_SITE_ORIGINS') || 'https://soilpassport.com,https://www.soilpassport.com').split(',').map(s => s.trim());
const cors = (o: string | null) => ({ 'Access-Control-Allow-Origin': o && origins().includes(o) ? o : origins()[0], 'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' });

Deno.serve(async (req) => {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  await loadConfig(admin);
  const origin = req.headers.get('origin'); const h = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: h });
  const quiet = new Response(null, { status: 204, headers: h });
  if (!env('IP_HASH_SALT') || !origin || !origins().includes(origin)) return quiet;
  const ua = req.headers.get('user-agent') ?? '';
  if (isBot(ua)) return quiet;
  const raw = await req.text(); if (raw.length > 2000) return quiet;
  let b: Record<string, unknown>; try { b = JSON.parse(raw); } catch { return quiet; }
  const path = cleanPath(b.p); if (!path) return quiet;
  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const visitor = (await hmacHex(env('IP_HASH_SALT'), `v:${day}:${ip}:${ua}`)).slice(0, 32);
  // Crude flood guard: one visitor cannot add more than 30 views a minute.
  const { count } = await admin.from('analytics_pageviews').select('id', { count: 'exact', head: true }).eq('visitor_hash', visitor).gte('ts', new Date(Date.now() - 60_000).toISOString());
  if ((count ?? 0) >= 30) return quiet;
  const country = (req.headers.get('cf-ipcountry') ?? '').toUpperCase(); 
  await admin.from('analytics_pageviews').insert({ path, referrer_host: hostOf(b.r, origins().map(o => new URL(o).hostname)), utm_source: cleanSource(b.u), device: deviceOf(ua), country: /^[A-Z]{2}$/.test(country) ? country : null, visitor_hash: visitor });
  return quiet;
});
