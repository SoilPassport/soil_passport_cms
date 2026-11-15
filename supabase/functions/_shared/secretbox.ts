// AES-GCM encryption for secrets stored in app_config. The master key lives only in the CONFIG_ENCRYPTION_KEY Edge Function
// secret (never in the database or the browser). Each value is bound to its config key (AAD), so rows cannot be swapped.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u: Uint8Array) => { let s = ''; u.forEach(b => { s += String.fromCharCode(b); }); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function aesKey(master: string): Promise<CryptoKey> {
  if (master.length < 32) throw new Error('CONFIG_ENCRYPTION_KEY must be at least 32 characters.');
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(master)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptSecret(plain: string, master: string, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, await aesKey(master), enc.encode(plain)));
  return `v1.${b64(iv)}.${b64(ct)}`;
}
export async function decryptSecret(box: string, master: string, aad: string): Promise<string> {
  const [v, iv, ct] = box.split('.'); if (v !== 'v1' || !iv || !ct) throw new Error('Unknown secret format');
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: enc.encode(aad) }, await aesKey(master), unb64(ct)));
}
