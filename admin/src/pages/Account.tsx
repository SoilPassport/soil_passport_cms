import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { ErrorBox, PageHeader } from '../components/ui';

const MIN = 12;
function problem(pw: string, again: string): string {
  if (pw.length < MIN) return `Use at least ${MIN} characters.`;
  if (pw !== again) return 'The two new passwords do not match.';
  return '';
}
function friendly(msg: string): string {
  if (/same|different from the old/i.test(msg)) return 'Choose a password you have not used before.';
  if (/aal2|reauth|mfa/i.test(msg)) return 'Verify with your authenticator code first (sign out and sign in again, then retry).';
  if (/weak|short|least|characters/i.test(msg)) return 'That password does not meet the password rules. Use a longer, less guessable one.';
  return 'The password could not be changed. Try again, or sign out and back in.';
}

export default function Account() {
  const { profile, roles, session, mfaEnrolled } = useAuth();
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setOk('');
    const p = problem(pw, again); if (p) { setErr(p); return; }
    if (!profile?.email) { setErr('Not signed in.'); return; }
    setBusy(true);
    // Confirm the current password first so a borrowed, unlocked session cannot change it.
    const { error: e1 } = await supabase.auth.signInWithPassword({ email: profile.email, password: cur });
    if (e1) { setErr('Your current password is not correct.'); setBusy(false); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) setErr(friendly(error.message));
    else {
      await supabase.rpc('write_audit', { p_action: 'user.password_changed', p_entity_type: 'user', p_entity_id: session?.user.id ?? null, p_details: {} });
      setOk('Your password has been changed.'); setCur(''); setPw(''); setAgain('');
    }
    setBusy(false);
  }

  return (<div className="space-y-6">
    <PageHeader title="My account" sub="Your sign-in details" />
    <div className="card space-y-1 p-4 text-sm">
      <div><span className="text-slate-500">Name: </span>{profile?.full_name || '—'}</div>
      <div><span className="text-slate-500">Email: </span>{profile?.email}</div>
      <div><span className="text-slate-500">Role: </span>{roles.map(r => r.name).join(', ') || 'None'}</div>
      <div><span className="text-slate-500">Two-step sign-in: </span>{mfaEnrolled ? 'On (authenticator app)' : 'Not set up'}</div>
    </div>
    <form onSubmit={submit} className="card max-w-md space-y-4 p-5">
      <h2 className="text-base font-semibold">Change password</h2>
      {err && <ErrorBox msg={err} />}{ok && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{ok}</p>}
      <div><label className="label" htmlFor="cp">Current password</label><input id="cp" className="input" type="password" autoComplete="current-password" required value={cur} onChange={e => setCur(e.target.value)} /></div>
      <div><label className="label" htmlFor="np">New password</label><input id="np" className="input" type="password" autoComplete="new-password" required minLength={MIN} value={pw} onChange={e => setPw(e.target.value)} /><p className="mt-1 text-xs text-slate-500">At least {MIN} characters. A few random words works well.</p></div>
      <div><label className="label" htmlFor="np2">Confirm new password</label><input id="np2" className="input" type="password" autoComplete="new-password" required value={again} onChange={e => setAgain(e.target.value)} /></div>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
    </form>
  </div>);
}

/** Shown after someone follows the "Forgot password?" email link. */
export function SetPassword() {
  const { endRecovery } = useAuth(); const nav = useNavigate();
  const [pw, setPw] = useState(''); const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    const p = problem(pw, again); if (p) { setErr(p); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setErr(friendly(error.message)); setBusy(false); return; }
    await supabase.rpc('write_audit', { p_action: 'user.password_reset', p_entity_type: 'user', p_entity_id: null, p_details: {} });
    endRecovery(); nav('/', { replace: true });
  }
  return (<div className="flex min-h-[68vh] items-center justify-center p-4">
    <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
      <div><h1 className="text-lg font-semibold">Set a new password</h1><p className="text-sm text-slate-500">Choose a new password for your account.</p></div>
      {err && <ErrorBox msg={err} />}
      <div><label className="label" htmlFor="rp">New password</label><input id="rp" className="input" type="password" autoComplete="new-password" required minLength={MIN} value={pw} onChange={e => setPw(e.target.value)} /></div>
      <div><label className="label" htmlFor="rp2">Confirm new password</label><input id="rp2" className="input" type="password" autoComplete="new-password" required value={again} onChange={e => setAgain(e.target.value)} /></div>
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
    </form>
  </div>);
}
