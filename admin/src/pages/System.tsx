import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { invokeFn, type IntegrationStatus } from '../lib/fn';
import { PageHeader, Spinner, Badge } from '../components/ui';

const LABELS: Record<string, string> = { r2: 'Cloudflare R2 media storage', turnstile: 'Cloudflare Turnstile (form spam protection)', hubspot: 'HubSpot CRM', email: 'Email (Resend)', cors: 'Allowed website origin (CORS)' };
function useStatus() { const [s, setS] = useState<IntegrationStatus | null>(null); const [err, setErr] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { invokeFn<IntegrationStatus>('integrations', { action: 'status' }).then(setS).catch(e => setErr((e as Error).message)).finally(() => setLoading(false)); }, []); return { s, err, loading }; }

export function Status({ only }: { only?: string[] }) {
  const { s, err, loading } = useStatus(); if (loading) return <Spinner />;
  if (!s) return <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Could not read integration status: {err}. The "integrations" function may not be deployed yet.</div>;
  return <div className="card divide-y divide-slate-100">{Object.entries(s).filter(([k]) => !only || only.includes(k)).map(([k, v]) => <div key={k} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><div><div className="font-medium">{LABELS[k] ?? k}</div>{!v.configured && <div className="text-xs text-slate-500">Missing secrets: {v.missing.join(', ')}</div>}</div><Badge tone={v.configured ? 'green' : 'amber'}>{v.configured ? 'Secrets present' : 'Not configured'}</Badge></div>)}</div>;
}
export default function System() {
  const { profile } = useAuth();
  return <><PageHeader title="System Configuration" sub="Read-only overview. Secrets are set in Supabase (Edge Function secrets) and are never shown or stored in the browser." />
    <h2 className="mb-2 font-medium">Integrations</h2><Status />
    <p className="mt-2 text-xs text-slate-500">"Secrets present" only means the values are set. It does not prove the credentials are valid. Use the test buttons on the Email and CRM pages, and submit a test form, to confirm.</p>
    <h2 className="mb-2 mt-8 font-medium">Security policy</h2>
    <ul className="card list-disc space-y-1 p-4 pl-8 text-sm text-slate-700"><li>Access is controlled by roles and permissions, enforced in the database (row level security), not only in this app.</li><li>Multi-factor authentication can be required per role on the Roles & Permissions page.</li><li>Actions such as publishing, user changes and exports are written to the audit log.</li><li>Public forms are protected by a hidden honeypot field, Turnstile, per-visitor rate limiting (6 per hour) and server-side validation.</li><li>Session length and password rules are set in the Supabase dashboard under Authentication.</li></ul>
    {profile?.email && <p className="mt-4 text-xs text-slate-500">Signed in as {profile.email}</p>}
    </>;
}
