import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { ErrorBox } from '../components/ui';

export default function Mfa() {
  const { mfaEnrolled, refresh, signOut } = useAuth();
  const [factorId, setFactorId] = useState(''); const [qr, setQr] = useState(''); const [secret, setSecret] = useState('');
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (mfaEnrolled) {
        const { data } = await supabase.auth.mfa.listFactors();
        const f = data?.totp.find(x => x.status === 'verified'); if (f) setFactorId(f.id);
      } else {
        // clear any abandoned unverified factor first
        const { data: l } = await supabase.auth.mfa.listFactors();
        for (const f of (l?.all ?? []).filter(x => x.status === 'unverified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' });
        if (error || !data) { setErr('Could not start MFA enrolment.'); return; }
        setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret);
      }
    })();
  }, [mfaEnrolled]);

  async function verify(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (error) setErr('That code was not accepted. Try the current code from your authenticator app.'); else await refresh();
    setBusy(false);
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={verify} className="card w-full max-w-sm space-y-4 p-6">
        <div><h1 className="text-lg font-semibold">{mfaEnrolled ? 'Two-factor verification' : 'Set up two-factor authentication'}</h1>
          <p className="text-sm text-slate-500">{mfaEnrolled ? 'Enter the 6-digit code from your authenticator app.' : 'Your role requires MFA. Scan the QR code with an authenticator app, then enter the code.'}</p></div>
        {!mfaEnrolled && qr && <div className="space-y-2"><img src={qr} alt="MFA QR code" className="mx-auto h-40 w-40" /><p className="break-all text-center text-xs text-slate-500">Or enter manually: <code>{secret}</code></p></div>}
        {err && <ErrorBox msg={err} />}
        <div><label className="label" htmlFor="code">6-digit code</label><input id="code" className="input tracking-widest" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" /></div>
        <button className="btn btn-primary w-full" disabled={busy || !factorId}>{busy ? 'Verifying…' : 'Verify'}</button>
        <button type="button" className="w-full text-center text-xs text-slate-500 underline" onClick={() => void signOut()}>Sign out</button>
      </form>
    </div>);
}
