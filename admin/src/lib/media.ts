import { supabase } from './supabase';

export interface Asset { id: string; kind: 'image' | 'video' | 'pdf' | 'document' | 'svg' | 'other'; filename: string; mime_type: string; size_bytes: number; public_url: string | null; alt_text: string | null; caption: string | null; category: string | null; tags: string[]; width: number | null; height: number | null; created_at: string; visibility?: 'public' | 'private' }
export const ASSET_COLS = 'id,kind,filename,mime_type,size_bytes,public_url,alt_text,caption,category,tags,width,height,created_at,visibility';
export const CATEGORIES = ['corporate', 'product', 'platform_screenshots', 'events', 'webinars', 'research', 'biochar', 'bioenergy', 'team', 'press', 'marketing', 'other'];
export const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,application/pdf,.docx,.xlsx,.pptx';

export const fmtSize = (n: number) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

async function errMsg(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') { try { const j = await ctx.json(); if (j?.error) return String(j.error); } catch { /* fall through */ } }
  return (error as Error)?.message?.includes('Failed to send') ? 'Could not reach the media service. Check that the media-r2 function is deployed.' : 'The media service returned an error.';
}
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('media-r2', { body });
  if (error) throw new Error(await errMsg(error));
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

async function sha256(file: File): Promise<string | null> {
  if (file.size > 50 * 1048576 || !crypto?.subtle) return null;
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null);
  return new Promise(res => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => { res({ width: i.naturalWidth, height: i.naturalHeight }); URL.revokeObjectURL(u); }; i.onerror = () => { res(null); URL.revokeObjectURL(u); }; i.src = u; });
}
function videoMeta(file: File): Promise<{ width: number; height: number; duration: number } | null> {
  if (!file.type.startsWith('video/')) return Promise.resolve(null);
  return new Promise(res => { const u = URL.createObjectURL(file); const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => { res({ width: v.videoWidth, height: v.videoHeight, duration: Math.round(v.duration) }); URL.revokeObjectURL(u); }; v.onerror = () => { res(null); URL.revokeObjectURL(u); }; v.src = u; });
}
function put(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open('PUT', url); x.setRequestHeader('Content-Type', file.type);
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => x.status >= 200 && x.status < 300 ? resolve() : reject(new Error('Upload to storage failed (' + x.status + '). Check the R2 CORS settings.'));
    x.onerror = () => reject(new Error('Upload to storage was blocked. Check the R2 bucket CORS settings allow this admin address.'));
    x.send(file);
  });
}

export interface UploadResult { asset: Asset; duplicate: boolean }
export async function uploadFile(file: File, onProgress: (p: number) => void, opts: { private?: boolean } = {}): Promise<UploadResult> {
  const priv = opts.private === true;
  const checksum = await sha256(file);
  const s = await call<{ duplicate?: Asset; uploadUrl?: string; key?: string }>({ action: 'sign', filename: file.name, mime: file.type, size: file.size, checksum, private: priv });
  if (s.duplicate) { const { data } = await supabase.from('media_assets').select(ASSET_COLS).eq('id', s.duplicate.id).single(); return { asset: data as Asset, duplicate: true }; }
  await put(s.uploadUrl!, file, onProgress);
  const dim = (await imageSize(file)) ?? (await videoMeta(file));
  const c = await call<{ asset: Asset }>({ action: 'confirm', key: s.key, filename: file.name, mime: file.type, size: file.size, checksum, private: priv, ...(dim ?? {}) });
  return { asset: c.asset, duplicate: false };
}
export const deleteAsset = (id: string) => call<{ ok: boolean }>({ action: 'delete', id });
