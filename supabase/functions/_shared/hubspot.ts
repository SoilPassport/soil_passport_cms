// HubSpot contact + note sync (private app token in HUBSPOT_ACCESS_TOKEN). NOT TESTED against a live HubSpot account.
const API = 'https://api.hubapi.com';
export interface Person { email: string; name?: string | null; organisation?: string | null; telephone?: string | null; country?: string | null; job_title?: string | null }

export function contactProps(p: Person): Record<string, string> {
  const parts = (p.name ?? '').trim().split(/\s+/).filter(Boolean);
  const o: Record<string, string> = { email: p.email };
  if (parts.length) { o.firstname = parts[0]; if (parts.length > 1) o.lastname = parts.slice(1).join(' '); }
  if (p.organisation) o.company = p.organisation;
  if (p.telephone) o.phone = p.telephone;
  if (p.country) o.country = p.country;
  if (p.job_title) o.jobtitle = p.job_title;
  return o;
}
export const nextAttempt = (attempts: number, now = Date.now()) => new Date(now + Math.min(6 * 3600_000, 2 ** attempts * 60_000)).toISOString();
export const MAX_ATTEMPTS = 5;

async function hs(path: string, init: RequestInit, token: string) {
  const r = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const text = await r.text();
  if (!r.ok) throw new Error(`HubSpot ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}
export async function pushContact(person: Person, note: string, token: string): Promise<{ contactId: string }> {
  const found = await hs('/crm/v3/objects/contacts/search', { method: 'POST', body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: person.email }] }], limit: 1 }) }, token);
  let id: string = found.results?.[0]?.id;
  const properties = contactProps(person);
  if (id) await hs(`/crm/v3/objects/contacts/${id}`, { method: 'PATCH', body: JSON.stringify({ properties }) }, token);
  else id = (await hs('/crm/v3/objects/contacts', { method: 'POST', body: JSON.stringify({ properties }) }, token)).id;
  await hs('/crm/v3/objects/notes', { method: 'POST', body: JSON.stringify({ properties: { hs_note_body: note.slice(0, 60000), hs_timestamp: new Date().toISOString() }, associations: [{ to: { id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }] }) }, token);
  return { contactId: id };
}
