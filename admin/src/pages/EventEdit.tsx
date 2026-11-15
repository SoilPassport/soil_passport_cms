import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader, Spinner, ErrorBox, Field, Toast } from '../components/ui';
import ImageField from '../components/ImageField';
import PreviewModal from '../components/PreviewModal';
import { eventPreview } from '../lib/preview';
import RichText from '../components/RichText';
import Registrations from '../components/Registrations';
import Workflow from '../components/Workflow';
import { clean, fromLocalInput, slugify, toLocalInput } from '../lib/util';

const TYPES = ['public_webinar', 'product_demo', 'customer_workshop', 'industry_conference', 'physical_event', 'partner_event', 'training_session', 'investor_event'];
const PROVIDERS = ['', 'calendly', 'zoom', 'teams', 'eventbrite', 'other'];
interface Speaker { id?: string; name: string; title: string; organisation: string; bio: string; photo_url: string }
interface Form { title: string; slug: string; html: string; event_type: string; category: string; banner_url: string; starts_at: string; ends_at: string; timezone: string; mode: string; location: string; registration_mode: string; registration_url: string; registration_provider: string; max_attendees: string; registration_closes_at: string; featured: boolean; recording_url: string; is_investor_event: boolean }
const EMPTY: Form = { title: '', slug: '', html: '', event_type: 'public_webinar', category: '', banner_url: '', starts_at: '', ends_at: '', timezone: 'Europe/London', mode: 'online', location: '', registration_mode: 'external', registration_url: '', registration_provider: '', max_attendees: '', registration_closes_at: '', featured: false, recording_url: '', is_investor_event: false };

export default function EventEdit() {
  const { id } = useParams(); const isNew = !id || id === 'new'; const nav = useNavigate(); const { can, profile } = useAuth();
  const [f, setF] = useState<Form>(EMPTY); const [prev, setPrev] = useState(''); const [sp, setSp] = useState<Speaker[]>([]); const [status, setStatus] = useState('draft'); const [loading, setLoading] = useState(!isNew); const [err, setErr] = useState(''); const [toast, setToast] = useState(''); const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [slugTouched, setSlugTouched] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF(p => ({ ...p, [k]: v })); setDirty(true); };
  const load = useCallback(async () => {
    if (isNew) return;
    const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    if (error || !data) { setErr(error?.message ?? 'Event not found, or you do not have access.'); setLoading(false); return; }
    const { data: s } = await supabase.from('event_speakers').select('id,name,title,organisation,bio,photo_url').eq('event_id', id).order('sort_order');
    setStatus(data.status); setSlugTouched(true);
    setSp(((s ?? []) as Partial<Speaker>[]).map(x => ({ id: x.id, name: x.name ?? '', title: x.title ?? '', organisation: x.organisation ?? '', bio: x.bio ?? '', photo_url: x.photo_url ?? '' })));
    setF({ title: data.title, slug: data.slug, html: (data.description as { html?: string })?.html ?? '', event_type: data.event_type, category: data.category ?? '', banner_url: data.banner_url ?? '', starts_at: toLocalInput(data.starts_at), ends_at: toLocalInput(data.ends_at), timezone: data.timezone, mode: data.mode, location: data.location ?? '', registration_mode: data.registration_mode, registration_url: data.registration_url ?? '', registration_provider: data.registration_provider ?? '', max_attendees: data.max_attendees ? String(data.max_attendees) : '', registration_closes_at: toLocalInput(data.registration_closes_at), featured: data.featured, recording_url: data.recording_url ?? '', is_investor_event: data.is_investor_event });
    setDirty(false); setLoading(false);
  }, [id, isNew]);
  useEffect(() => { void load(); }, [load]);
  const readOnly = !can('events.edit') || ((status === 'published' || status === 'archived') && !can('events.publish'));

  async function save(e?: FormEvent) {
    e?.preventDefault(); setErr('');
    if (!f.title.trim()) { setErr('Title is required.'); return; }
    if (!f.starts_at || !f.ends_at) { setErr('Start and end date and time are required.'); return; }
    if (new Date(f.ends_at) <= new Date(f.starts_at)) { setErr('The end must be after the start.'); return; }
    if (f.registration_mode === 'external' && !f.registration_url.trim()) { setErr('Add the registration link, or set registration to "No registration".'); return; }
    const slug = slugify(f.slug || f.title); setBusy(true);
    const row = { title: f.title.trim(), slug, description: { html: clean(f.html) }, event_type: f.event_type, category: f.category.trim() || null, banner_url: f.banner_url.trim() || null, starts_at: fromLocalInput(f.starts_at), ends_at: fromLocalInput(f.ends_at), timezone: f.timezone.trim() || 'Europe/London', mode: f.mode, location: f.location.trim() || null, registration_mode: f.registration_mode, registration_url: f.registration_url.trim() || null, registration_provider: f.registration_provider || null, max_attendees: f.max_attendees ? Number(f.max_attendees) : null, registration_closes_at: fromLocalInput(f.registration_closes_at), featured: f.featured, recording_url: f.recording_url.trim() || null, is_investor_event: f.is_investor_event || f.event_type === 'investor_event', updated_by: profile!.id };
    let eid = id as string; const dup = (c?: string) => c === '23505' ? 'That slug is already used by another event.' : undefined;
    if (isNew) { const { data, error } = await supabase.from('events').insert({ ...row, status: 'draft', created_by: profile!.id }).select('id').single(); if (error) { setErr(dup(error.code) ?? error.message); setBusy(false); return; } eid = data.id; }
    else { const { error } = await supabase.from('events').update(row).eq('id', eid); if (error) { setErr(dup(error.code) ?? error.message); setBusy(false); return; } }
    await supabase.from('event_speakers').delete().eq('event_id', eid);
    const valid = sp.filter(s => s.name.trim());
    if (valid.length) await supabase.from('event_speakers').insert(valid.map((s, i) => ({ event_id: eid, name: s.name.trim(), title: s.title.trim() || null, organisation: s.organisation.trim() || null, bio: s.bio.trim() || null, photo_url: s.photo_url.trim() || null, sort_order: i })));
    await supabase.rpc('write_audit', { p_action: isNew ? 'event.created' : 'event.updated', p_entity_type: 'event', p_entity_id: eid, p_details: { title: row.title } });
    setBusy(false); setDirty(false); setToast('Saved'); setTimeout(() => setToast(''), 2500);
    if (isNew) nav(`/events/${eid}`, { replace: true }); else await load();
  }
  async function del() { if (!window.confirm('Delete this event permanently?')) return; const { error } = await supabase.from('events').delete().eq('id', id); if (error) { setErr(error.message); return; } await supabase.rpc('write_audit', { p_action: 'event.deleted', p_entity_type: 'event', p_entity_id: id, p_details: { title: f.title } }); nav('/events'); }
  const updSp = (i: number, p: Partial<Speaker>) => { setSp(sp.map((s, j) => j === i ? { ...s, ...p } : s)); setDirty(true); };

  if (loading) return <Spinner />;
  const dis = readOnly || busy;
  return <>
    <PageHeader title={isNew ? 'New event' : 'Edit event'} actions={<div className="flex gap-2"><button type="button" className="btn btn-ghost" onClick={() => setPrev(eventPreview({ title: f.title, html: f.html, banner: f.banner_url, starts: fromLocalInput(f.starts_at) ?? '', location: f.location, regUrl: f.registration_mode === 'external' ? f.registration_url : '', speakers: sp }))}>Preview</button><Link to="/events" className="btn btn-ghost">Back to events</Link></div>} />
    {err && <div className="mb-4"><ErrorBox msg={err} /></div>}
    {readOnly && !isNew && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This event is {status}. Ask someone with publish rights to unpublish it before editing.</p>}
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="card space-y-4 p-4">
          <Field label="Event title" htmlFor="e-title"><input id="e-title" className="input" value={f.title} disabled={dis} onChange={e => { set('title', e.target.value); if (!slugTouched) setF(p => ({ ...p, title: e.target.value, slug: slugify(e.target.value) })); }} /></Field>
          <Field label="URL slug" htmlFor="e-slug"><input id="e-slug" className="input" value={f.slug} disabled={dis} onChange={e => { setSlugTouched(true); set('slug', e.target.value); }} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="e-type"><select id="e-type" className="input" value={f.event_type} disabled={dis} onChange={e => set('event_type', e.target.value)}>{TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></Field>
            <Field label="Category (optional)" htmlFor="e-cat"><input id="e-cat" className="input" value={f.category} disabled={dis} onChange={e => set('category', e.target.value)} /></Field>
            <Field label="Starts" htmlFor="e-start"><input id="e-start" className="input" type="datetime-local" value={f.starts_at} disabled={dis} onChange={e => set('starts_at', e.target.value)} /></Field>
            <Field label="Ends" htmlFor="e-end"><input id="e-end" className="input" type="datetime-local" value={f.ends_at} disabled={dis} onChange={e => set('ends_at', e.target.value)} /></Field>
            <Field label="Time zone" htmlFor="e-tz" hint="For example Europe/London or Asia/Kolkata."><input id="e-tz" className="input" value={f.timezone} disabled={dis} onChange={e => set('timezone', e.target.value)} /></Field>
            <Field label="Format" htmlFor="e-mode"><select id="e-mode" className="input" value={f.mode} disabled={dis} onChange={e => set('mode', e.target.value)}><option value="online">Online</option><option value="physical">In person</option><option value="hybrid">Hybrid</option></select></Field>
          </div>
          <Field label="Location or joining details" htmlFor="e-loc"><input id="e-loc" className="input" value={f.location} disabled={dis} onChange={e => set('location', e.target.value)} /></Field>
          <div><span className="label">Description</span>{dis ? <div className="prose-body rounded-lg border border-slate-200 bg-slate-50 p-4" dangerouslySetInnerHTML={{ __html: clean(f.html) }} /> : <RichText value={f.html} onChange={h => set('html', h)} />}</div>
        </div>
        <section className="card space-y-3 p-4"><h2 className="text-sm font-semibold">Speakers</h2>
          {sp.length === 0 && <p className="text-sm text-slate-500">No speakers added.</p>}
          {sp.map((s, i) => <div key={i} className="space-y-2 rounded-lg bg-slate-50 p-3"><div className="grid gap-2 sm:grid-cols-2"><input aria-label={`Speaker ${i + 1} name`} placeholder="Name" className="input" value={s.name} disabled={dis} onChange={e => updSp(i, { name: e.target.value })} /><input aria-label={`Speaker ${i + 1} job title`} placeholder="Job title" className="input" value={s.title} disabled={dis} onChange={e => updSp(i, { title: e.target.value })} /><input aria-label={`Speaker ${i + 1} organisation`} placeholder="Organisation" className="input" value={s.organisation} disabled={dis} onChange={e => updSp(i, { organisation: e.target.value })} /><ImageField id={`sp-${i}`} label="Photo" value={s.photo_url} disabled={dis} onChange={v => updSp(i, { photo_url: v })} /></div>
            <textarea aria-label={`Speaker ${i + 1} bio`} placeholder="Short bio" rows={2} className="input" value={s.bio} disabled={dis} onChange={e => updSp(i, { bio: e.target.value })} />{!dis && <button type="button" className="text-xs underline" onClick={() => { setSp(sp.filter((_, j) => j !== i)); setDirty(true); }}>Remove speaker</button>}</div>)}
          {!dis && <button type="button" className="btn btn-ghost text-xs" onClick={() => { setSp([...sp, { name: '', title: '', organisation: '', bio: '', photo_url: '' }]); setDirty(true); }}>+ Add speaker</button>}</section>
        {!isNew && f.registration_mode === 'native' && <Registrations eventId={id!} title={f.title} />}
      </div>
      <div className="space-y-4">
        {!isNew && <Workflow entity="event" id={id!} status={status} publishAt={null} dirty={dirty} onChanged={() => void load()} />}
        <div className="card space-y-4 p-4">
          <ImageField id="e-ban" label="Banner image" value={f.banner_url} disabled={dis} onChange={v => set('banner_url', v)} />
          <Field label="Registration" htmlFor="e-rm" hint="Website registration uses a protected form and emails a confirmation."><select id="e-rm" className="input" value={f.registration_mode} disabled={dis} onChange={e => set('registration_mode', e.target.value)}><option value="native">Register on this website</option><option value="external">External link</option><option value="none">No registration</option></select></Field>
          {f.registration_mode === 'native' && <><Field label="Maximum attendees (optional)" htmlFor="e-max"><input id="e-max" className="input" type="number" min="1" value={f.max_attendees} disabled={dis} onChange={e => set('max_attendees', e.target.value)} /></Field>
            <Field label="Registration closes (optional)" htmlFor="e-rc"><input id="e-rc" className="input" type="datetime-local" value={f.registration_closes_at} disabled={dis} onChange={e => set('registration_closes_at', e.target.value)} /></Field></>}
          {f.registration_mode === 'external' && <><Field label="Registration link" htmlFor="e-ru"><input id="e-ru" className="input" type="url" value={f.registration_url} disabled={dis} onChange={e => set('registration_url', e.target.value)} /></Field>
            <Field label="Provider" htmlFor="e-rp"><select id="e-rp" className="input" value={f.registration_provider} disabled={dis} onChange={e => set('registration_provider', e.target.value)}>{PROVIDERS.map(p => <option key={p} value={p}>{p || 'Not specified'}</option>)}</select></Field></>}
          <Field label="Recording link (after the event)" htmlFor="e-rec"><input id="e-rec" className="input" type="url" value={f.recording_url} disabled={dis} onChange={e => set('recording_url', e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.featured} disabled={dis} onChange={e => set('featured', e.target.checked)} />Featured event</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_investor_event} disabled={dis} onChange={e => set('is_investor_event', e.target.checked)} />Investor event (never shown on the public site)</label>
        </div>
        {!readOnly && <div className="flex gap-2"><button className="btn btn-primary flex-1" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create draft' : 'Save changes'}</button>{!isNew && can('events.delete') && <button type="button" className="btn btn-danger" onClick={() => void del()}>Delete</button>}</div>}
        {dirty && !readOnly && <p className="text-xs text-amber-700">You have unsaved changes.</p>}
      </div>
    </form>{prev && <PreviewModal html={prev} onClose={() => setPrev('')} />}<Toast msg={toast} /></>;
}
