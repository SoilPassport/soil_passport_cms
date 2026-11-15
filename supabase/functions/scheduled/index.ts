// Cron entry point. Call it every 5 minutes with header "x-cron-secret: <CRON_SECRET>" (see docs/SETUP.md).
// Deploy with: supabase functions deploy scheduled --no-verify-jwt   (it does its own secret check)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { safeEqual } from '../_shared/crypto.ts';
import { runAll } from '../_shared/jobs.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET') ?? '';
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const given = req.headers.get('x-cron-secret') ?? '';
  if (secret.length < 24 || !safeEqual(given, secret)) return new Response('Forbidden', { status: 403 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  return new Response(JSON.stringify(await runAll(admin)), { headers: { 'Content-Type': 'application/json' } });
});
