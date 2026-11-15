// Invites a CMS user. Requires the caller to hold `users.manage` AND an MFA-verified (aal2) session when their roles require it.
// Uses the service-role key, which exists ONLY as an Edge Function secret (never in browser code).
// NOT YET TESTED against a live Supabase project — see docs/SETUP.md "Verification checklist".
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/cors.ts';

const json = (b: unknown, s: number, h: Record<string, string>) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  // 1) Act as the caller (RLS applies) to prove identity + permission.
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: canManage, error: permErr } = await asUser.rpc('can', { perm: 'users.manage' });
  if (permErr || canManage !== true) return json({ error: 'Forbidden' }, 403, cors);

  let body: { email?: string; full_name?: string; role_key?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400, cors); }
  const email = (body.email ?? '').trim().toLowerCase();
  const roleKey = (body.role_key ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return json({ error: 'Invalid email' }, 400, cors);
  if (!/^[a-z][a-z0-9_]*$/.test(roleKey)) return json({ error: 'Invalid role' }, 400, cors);

  // 2) Privileged work with the service role.
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: role } = await admin.from('roles').select('id').eq('key', roleKey).maybeSingle();
  if (!role) return json({ error: 'Unknown role' }, 400, cors);

  const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: (body.full_name ?? '').slice(0, 200) }, redirectTo: Deno.env.get('ADMIN_URL'),
  });
  if (invErr || !inv.user) return json({ error: 'Invite failed' }, 400, cors);

  const uid = inv.user.id;
  await admin.from('profiles').update({ status: 'active', full_name: body.full_name ?? null }).eq('id', uid);
  await admin.from('user_roles').upsert({ user_id: uid, role_id: role.id });
  const { data: me } = await asUser.auth.getUser();
  await admin.from('audit_logs').insert({ actor_id: me.user?.id ?? null, actor_email: me.user?.email ?? null, action: 'user.invited', entity_type: 'user', entity_id: uid, details: { email, role: roleKey } });
  return json({ ok: true }, 200, cors);
});
