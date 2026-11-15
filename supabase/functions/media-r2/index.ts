// Cloudflare R2 media gateway. The browser never sees R2 credentials: it asks this function for a short-lived
// upload address, uploads straight to R2, then asks this function to confirm (it checks the object really exists).
// Actions: sign | confirm | delete. Every action requires a signed-in CMS user with the right permission.
// NOT YET TESTED against a live R2 bucket — see docs/SETUP.md "Phase 3: R2 storage".
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';
import { corsHeaders } from '../_shared/cors.ts';
import { buildKey, isOwnKey, validateUpload } from '../_shared/media-rules.ts';

const json = (b: unknown, s: number, h: Record<string, string>) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json' } });
const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL'].filter(k => !env(k));
  if (need.length) return json({ error: 'Storage is not configured yet (missing: ' + need.join(', ') + ').' }, 503, cors);

  const url = env('SUPABASE_URL');
  const asUser = createClient(url, env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: me } = await asUser.auth.getUser();
  if (!me.user) return json({ error: 'Not signed in' }, 401, cors);
  const can = async (perm: string) => (await asUser.rpc('can', { perm })).data === true;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400, cors); }
  const action = String(body.action ?? '');

  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'));
  const isPrivate = body.private === true;
  if (isPrivate && !env('R2_PRIVATE_BUCKET')) return json({ error: 'Private storage is not configured yet (missing: R2_PRIVATE_BUCKET).' }, 503, cors);
  const bucket = isPrivate ? env('R2_PRIVATE_BUCKET') : env('R2_BUCKET'), base = env('R2_PUBLIC_BASE_URL').replace(/\/+$/, '');
  const host = `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`;
  let endpoint = `${host}/${bucket}`;
  const r2 = new AwsClient({ accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY'), service: 's3', region: 'auto' });

  if (action === 'sign') {
    if (!(await can(isPrivate ? 'documents.edit' : 'media.edit'))) return json({ error: 'Forbidden' }, 403, cors);
    const v = validateUpload(String(body.filename ?? ''), String(body.mime ?? ''), Number(body.size));
    if (!v.ok) return json({ error: v.error }, 400, cors);
    const checksum = typeof body.checksum === 'string' && /^[0-9a-f]{64}$/.test(body.checksum) ? body.checksum : null;
    if (checksum) {
      const { data: dup } = await admin.from('media_assets').select('id,filename,public_url,kind').eq('checksum_sha256', checksum).eq('visibility', isPrivate ? 'private' : 'public').eq('status', 'active').maybeSingle();
      if (dup) return json({ duplicate: dup }, 200, cors);
    }
    const key = buildKey(new Date(), crypto.randomUUID(), v.filename);
    const signed = await r2.sign(new Request(`${endpoint}/${key}?X-Amz-Expires=600`, { method: 'PUT', headers: { 'Content-Type': String(body.mime) } }), { aws: { signQuery: true } });
    return json({ uploadUrl: signed.url, key, contentType: body.mime }, 200, cors);
  }

  if (action === 'confirm') {
    if (!(await can(isPrivate ? 'documents.edit' : 'media.edit'))) return json({ error: 'Forbidden' }, 403, cors);
    if (!isOwnKey(body.key)) return json({ error: 'Invalid key' }, 400, cors);
    const v = validateUpload(String(body.filename ?? ''), String(body.mime ?? ''), Number(body.size));
    if (!v.ok) return json({ error: v.error }, 400, cors);
    const head = await r2.fetch(`${endpoint}/${body.key}`, { method: 'HEAD' });
    if (!head.ok) return json({ error: 'The upload did not reach storage. Please try again.' }, 400, cors);
    const realSize = Number(head.headers.get('content-length') ?? 0);
    const realType = (head.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (realSize <= 0 || realSize !== Number(body.size) || realType !== String(body.mime).toLowerCase()) {
      await r2.fetch(`${endpoint}/${body.key}`, { method: 'DELETE' });
      return json({ error: 'The uploaded file did not match its declared type or size and was removed.' }, 400, cors);
    }
    const int = (x: unknown) => Number.isFinite(Number(x)) && Number(x) > 0 ? Math.round(Number(x)) : null;
    const checksum = typeof body.checksum === 'string' && /^[0-9a-f]{64}$/.test(body.checksum) ? body.checksum : null;
    const { data, error } = await admin.from('media_assets').insert({
      kind: v.kind, filename: v.filename, mime_type: String(body.mime), size_bytes: realSize, checksum_sha256: checksum,
      storage_bucket: bucket, storage_key: body.key, visibility: isPrivate ? 'private' : 'public', public_url: isPrivate ? null : `${base}/${body.key}`,
      width: int(body.width), height: int(body.height), duration_seconds: int(body.duration),
      alt_text: typeof body.alt_text === 'string' ? body.alt_text.slice(0, 300) : null, uploaded_by: me.user.id,
    }).select('*').single();
    if (error) { await r2.fetch(`${endpoint}/${body.key}`, { method: 'DELETE' }); return json({ error: error.code === '23505' ? 'This file has already been uploaded.' : 'Could not save the file record.' }, 400, cors); }
    await admin.from('audit_logs').insert({ actor_id: me.user.id, actor_email: me.user.email ?? null, action: 'media.uploaded', entity_type: 'media', entity_id: data.id, details: { filename: v.filename, size: realSize } });
    return json({ asset: data }, 200, cors);
  }

  if (action === 'delete') {
    if (!(await can('media.delete'))) return json({ error: 'Forbidden' }, 403, cors);
    const id = String(body.id ?? '');
    const { data: a } = await admin.from('media_assets').select('id,filename,public_url,storage_key,storage_bucket').eq('id', id).maybeSingle();
    if (!a) return json({ error: 'File not found' }, 404, cors);
    endpoint = `${host}/${a.storage_bucket}`;
    // Refuse if the file is still referenced by content (by URL or by id)
    const like = `%${a.storage_key}%`;
    const [art, ev, pg, sp, vid, gi, dv] = await Promise.all([
      admin.from('articles').select('id', { count: 'exact', head: true }).or(`featured_image_url.like.${like},og_image_url.like.${like}`),
      admin.from('events').select('id', { count: 'exact', head: true }).like('banner_url', like),
      admin.from('website_pages').select('blocks,og_image_url').limit(1000),
      admin.from('event_speakers').select('id', { count: 'exact', head: true }).like('photo_url', like),
      admin.from('videos').select('id', { count: 'exact', head: true }).or(`asset_id.eq.${id},thumbnail_url.like.${like}`),
      admin.from('gallery_items').select('id', { count: 'exact', head: true }).eq('asset_id', id),
      admin.from('document_versions').select('id', { count: 'exact', head: true }).eq('asset_id', id),
    ]);
    const used = (art.count ?? 0) + (ev.count ?? 0) + ((pg.data ?? []).filter((r: { blocks: unknown; og_image_url: string | null }) => JSON.stringify(r.blocks ?? []).includes(a.storage_key) || (r.og_image_url ?? '').includes(a.storage_key)).length) + (sp.count ?? 0) + (vid.count ?? 0) + (gi.count ?? 0) + (dv.count ?? 0);
    if (used > 0) return json({ error: `This file is still used in ${used} place${used === 1 ? '' : 's'} (articles, pages, events, galleries, videos or documents). Remove it there first.` }, 409, cors);
    const del = await r2.fetch(`${endpoint}/${a.storage_key}`, { method: 'DELETE' });
    if (!del.ok && del.status !== 404) return json({ error: 'Could not delete from storage.' }, 502, cors);
    await admin.from('media_assets').delete().eq('id', id);
    await admin.from('audit_logs').insert({ actor_id: me.user.id, actor_email: me.user.email ?? null, action: 'media.deleted', entity_type: 'media', entity_id: id, details: { filename: a.filename } });
    return json({ ok: true }, 200, cors);
  }
  return json({ error: 'Unknown action' }, 400, cors);
});
