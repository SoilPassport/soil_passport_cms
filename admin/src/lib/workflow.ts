import { supabase } from './supabase';

export type Entity = 'article' | 'page' | 'event';
export type Action = 'submit' | 'request_changes' | 'approve' | 'publish' | 'schedule' | 'unpublish' | 'archive' | 'restore';
export const TABLE: Record<Entity, string> = { article: 'articles', page: 'website_pages', event: 'events' };
export const MODULE: Record<Entity, string> = { article: 'articles', page: 'pages', event: 'events' };
export const STATUS_TONE: Record<string, 'slate' | 'green' | 'amber' | 'red'> = { draft: 'slate', pending_review: 'amber', approved: 'amber', scheduled: 'amber', published: 'green', archived: 'red', cancelled: 'red', completed: 'slate' };

export interface ActionDef { action: Action; label: string; primary?: boolean; needsComment?: boolean }

/** Which buttons to show. UI convenience only: the database trigger enforces who may approve/publish. */
export function actionsFor(entity: Entity, status: string, can: (p: string) => boolean): ActionDef[] {
  const m = MODULE[entity]; const out: ActionDef[] = [];
  const edit = can(`${m}.edit`), approve = can(`${m}.approve`), publish = can(`${m}.publish`);
  if (status === 'archived') { if (publish) out.push({ action: 'restore', label: 'Restore to draft' }); return out; }
  if (status === 'draft' && edit && !publish) out.push({ action: 'submit', label: 'Submit for review', primary: true });
  if (status === 'draft' && edit && publish) out.push({ action: 'submit', label: 'Submit for review' });
  if (status === 'pending_review' && approve) { out.push({ action: 'approve', label: 'Approve', primary: !publish }); out.push({ action: 'request_changes', label: 'Request changes', needsComment: true }); }
  if (publish && status !== 'published') out.push({ action: 'publish', label: 'Publish now', primary: true });
  if (publish && entity !== 'event' && status !== 'published' && status !== 'scheduled') out.push({ action: 'schedule', label: 'Schedule' });
  if (publish && (status === 'published' || status === 'scheduled')) out.push({ action: 'unpublish', label: 'Unpublish (back to draft)' });
  if (publish) out.push({ action: 'archive', label: 'Archive' });
  return out;
}

const NEXT: Record<Action, string> = { submit: 'pending_review', request_changes: 'draft', approve: 'approved', publish: 'published', schedule: 'scheduled', unpublish: 'draft', archive: 'archived', restore: 'draft' };

export async function transition(entity: Entity, id: string, from: string, action: Action, userId: string, opts: { comment?: string; publishAt?: string | null } = {}) {
  const to = NEXT[action]; const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, updated_by: userId };
  if (action === 'approve') patch.approved_by = userId;
  if (action === 'publish') { patch.published_by = userId; patch.published_at = now; patch.approved_by = userId; }
  if (action === 'schedule') { if (!opts.publishAt) throw new Error('Choose a publish date and time before scheduling.'); patch.publish_at = opts.publishAt; patch.published_by = userId; }
  if (action === 'unpublish') { patch.published_at = null; }
  const { error } = await supabase.from(TABLE[entity]).update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  await supabase.from('workflow_events').insert({ entity_type: entity, entity_id: id, from_status: from, to_status: to, action, comment: opts.comment || null, actor_id: userId });
  await supabase.rpc('write_audit', { p_action: `${entity}.${action}`, p_entity_type: entity, p_entity_id: id, p_details: { from, to } });
  return to;
}
