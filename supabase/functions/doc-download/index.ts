// Download gateway: counts every download, and serves restricted documents only to people holding a valid access link.
//   GET ?slug=<slug>   public document  -> logged, then redirect to the public file
//   GET ?t=<token>     restricted/investor document -> token checked (not revoked, not expired, download limit), logged,
//                      then redirect to a 5-minute signed address on the PRIVATE R2 bucket
// Deploy with: supabase functions deploy doc-download --no-verify-jwt. NOT YET TESTED against live Supabase/R2.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';
import { hmacHex, sha256Hex } from '../_shared/crypto.ts';

import { env, loadConfig } from '../_shared/config.ts';
const page = (status: number, title: string, msg: string) => new Response(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:16px system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem"><h1 style="font-size:1.3rem">${title}</h1><p>${msg}</p>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });

Deno.serve(async (req) => {
  if (req.method !== 'GET') return page(405, 'Not allowed', 'This address only supports downloads.');
  const url = new URL(req.url); const slug = url.searchParams.get('slug'); const token = url.searchParams.get('t');
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  await loadConfig(admin);
  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  const ipHash = env('IP_HASH_SALT') ? await hmacHex(env('IP_HASH_SALT'), 'ip:' + ip) : '';
  const nowIso = new Date().toISOString();
  type Doc = { id: string; status: string; access_level: string; expires_at: string | null; current_version_id: string | null };
  const assetOf = async (d: Doc) => {
    if (!d.current_version_id) return null;
    const { data: v } = await admin.from('document_versions').select('media_assets(filename,mime_type,visibility,public_url,storage_bucket,storage_key)').eq('id', d.current_version_id).maybeSingle();
    return (v as unknown as { media_assets: { filename: string; mime_type: string; visibility: string; public_url: string | null; storage_bucket: string; storage_key: string } | null } | null)?.media_assets ?? null;
  };
  const live = (d: Doc) => d.status === 'published' && (!d.expires_at || d.expires_at > nowIso);

  if (slug && /^[a-z0-9\-]{1,100}$/.test(slug)) {
    const { data: d } = await admin.from('documents').select('id,status,access_level,expires_at,current_version_id').eq('slug', slug).maybeSingle();
    if (!d || d.access_level !== 'public' || !live(d)) return page(404, 'Not found', 'This document is not available.');
    const a = await assetOf(d);
    if (!a || a.visibility !== 'public' || !a.public_url) return page(404, 'Not found', 'This document is not available.');
    await admin.rpc('record_download', { p_doc: d.id, p_ip_hash: ipHash, p_grant: null, p_email: null });
    return redirect(a.public_url);
  }

  if (token && /^[A-Za-z0-9_\-]{20,80}$/.test(token)) {
    const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter(k => !env(k));
    if (need.length) return page(503, 'Unavailable', 'Downloads are not available right now. Please try again later.');
    const { data: g } = await admin.from('document_access_grants').select('id,document_id,email,expires_at,max_downloads,downloads,revoked_at').eq('token_hash', await sha256Hex(token)).maybeSingle();
    const bad = () => page(403, 'Link not valid', 'This link is invalid, has expired, has been withdrawn or has reached its download limit. Please contact Soil Passport for a new link.');
    if (!g || g.revoked_at || g.expires_at < nowIso || g.downloads >= g.max_downloads) return bad();
    const { data: d } = await admin.from('documents').select('id,status,access_level,expires_at,current_version_id').eq('id', g.document_id).maybeSingle();
    if (!d || !live(d)) return bad();
    const a = await assetOf(d);
    if (!a || a.visibility !== 'private' || !env('R2_PRIVATE_BUCKET') || a.storage_bucket !== env('R2_PRIVATE_BUCKET')) return page(404, 'Not found', 'This document is not available.');
    const r2 = new AwsClient({ accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY'), service: 's3', region: 'auto' });
    const cd = encodeURIComponent(`attachment; filename="${a.filename.replace(/[^A-Za-z0-9._\-]/g, '_')}"`);
    const signed = await r2.sign(new Request(`https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${a.storage_bucket}/${a.storage_key}?X-Amz-Expires=300&response-content-disposition=${cd}`, { method: 'GET' }), { aws: { signQuery: true } });
    await admin.rpc('record_download', { p_doc: d.id, p_ip_hash: ipHash, p_grant: g.id, p_email: g.email });
    return redirect(signed.url);
  }
  return page(400, 'Bad request', 'Missing or invalid document address.');
});
