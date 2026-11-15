// Pure upload rules shared by the media-r2 Edge Function and its tests (no Deno APIs here).
export type Kind = 'image' | 'video' | 'pdf' | 'document';
const MB = 1024 * 1024;
export const ALLOWED: Record<string, { kind: Kind; exts: string[]; max: number }> = {
  'image/jpeg': { kind: 'image', exts: ['jpg', 'jpeg'], max: 10 * MB },
  'image/png': { kind: 'image', exts: ['png'], max: 10 * MB },
  'image/webp': { kind: 'image', exts: ['webp'], max: 10 * MB },
  'image/gif': { kind: 'image', exts: ['gif'], max: 10 * MB },
  'image/avif': { kind: 'image', exts: ['avif'], max: 10 * MB },
  'video/mp4': { kind: 'video', exts: ['mp4'], max: 150 * MB },
  'video/webm': { kind: 'video', exts: ['webm'], max: 150 * MB },
  'application/pdf': { kind: 'pdf', exts: ['pdf'], max: 30 * MB },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { kind: 'document', exts: ['docx'], max: 30 * MB },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { kind: 'document', exts: ['xlsx'], max: 30 * MB },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { kind: 'document', exts: ['pptx'], max: 30 * MB },
};
// SVG is deliberately not allowed: it can carry scripts.

export function safeFilename(name: string): string {
  const base = String(name).split(/[\\/]/).pop() ?? 'file';
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : '';
  return ext ? `${stem}.${ext}` : stem;
}

export function validateUpload(filename: string, mime: string, size: number): { ok: true; kind: Kind; filename: string } | { ok: false; error: string } {
  const rule = ALLOWED[mime];
  if (!rule) return { ok: false, error: 'This file type is not allowed. Use JPG, PNG, WebP, GIF, AVIF, MP4, WebM, PDF, DOCX, XLSX or PPTX.' };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'The file is empty.' };
  if (size > rule.max) return { ok: false, error: `This file is too large. The limit for this type is ${Math.round(rule.max / MB)} MB.` };
  const name = safeFilename(filename);
  const ext = name.includes('.') ? name.split('.').pop()! : '';
  if (!rule.exts.includes(ext)) return { ok: false, error: 'The file extension does not match its type.' };
  return { ok: true, kind: rule.kind, filename: name };
}

export function buildKey(now: Date, id: string, filename: string): string {
  const y = now.getUTCFullYear(), m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `uploads/${y}/${m}/${id}-${safeFilename(filename)}`;
}
export const isOwnKey = (k: unknown): k is string => typeof k === 'string' && /^uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}-[a-z0-9._-]+$/.test(k);
