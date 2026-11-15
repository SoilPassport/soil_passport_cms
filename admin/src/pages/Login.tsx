import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { ErrorBox } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [info, setInfo] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setInfo('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    // Generic message: do not reveal whether the account exists.
    if (error) setErr('Sign-in failed. Check your email and password.');
    setBusy(false);
  }
  async function reset() {
    if (!email.trim()) { setErr('Enter your email first.'); return; }
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setErr(''); setInfo('If an account exists for that email, a reset link has been sent.');
  }
  return (
    <div className="flex min-h-[68vh] items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div><h1 className="text-lg font-semibold">Soil Passport™ CMS</h1><p className="text-sm text-slate-500">Authorised staff only. Sign in to continue.</p></div>
        {err && <ErrorBox msg={err} />}{info && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{info}</p>}
        <div><label className="label" htmlFor="em">Email</label><input id="em" className="input" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div><label className="label" htmlFor="pw">Password</label><input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="w-full text-center text-xs text-slate-500 underline" onClick={() => void reset()}>Forgot password?</button>
      </form>
    </div>);
}
