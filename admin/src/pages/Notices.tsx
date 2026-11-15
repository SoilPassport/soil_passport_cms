import { useAuth } from '../lib/auth';
export function SetupRequired() {
  return <div className="flex min-h-screen items-center justify-center p-4"><div className="card max-w-lg space-y-3 p-6">
    <h1 className="text-lg font-semibold">Supabase is not configured</h1>
    <p className="text-sm text-slate-600">Create <code>admin/.env</code> from <code>.env.example</code> and set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> for your dedicated Soil Passport CMS Supabase project, then rebuild. See <code>docs/SETUP.md</code>.</p></div></div>;
}
export function AccessPending() {
  const { profile, signOut } = useAuth();
  const suspended = profile?.status === 'suspended';
  return <div className="flex min-h-screen items-center justify-center p-4"><div className="card max-w-md space-y-3 p-6">
    <h1 className="text-lg font-semibold">{suspended ? 'Account suspended' : 'Access pending'}</h1>
    <p className="text-sm text-slate-600">{suspended ? 'Your account has been suspended. Contact a Super Admin.' : 'Your account is not active or has no role yet. A Super Admin must activate it and assign a role.'}</p>
    <button className="btn btn-ghost" onClick={() => void signOut()}>Sign out</button></div></div>;
}
