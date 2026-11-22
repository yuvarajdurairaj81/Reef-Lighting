import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { Fingerprint, Mic } from 'lucide-react';
import { ApiError, api, errorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Banner, Button, Input } from '../../components/ui';
import { AuthLayout } from '../../layouts/AuthLayout';

export function LoginPage() {
  const { login, completeMfa, loginWithPasskey } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [info, setInfo] = useState<string | null>((location.state as { message?: string })?.message ?? null);
  const [busy, setBusy] = useState(false);
  const done = () => navigate((location.state as { from?: string })?.from ?? '/', { replace: true });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setUnverified(false);
    try {
      const r = await login(email, password, remember);
      if (r.mfaRequired) setMfaToken(r.mfaToken);
      else done();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') setUnverified(true);
      setError(errorMessage(err));
    } finally { setBusy(false); }
  };

  const submitMfa = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await completeMfa(mfaToken!, code); done(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  const passkey = async () => {
    setError(null);
    try { await loginWithPasskey(remember); done(); } catch (err) { setError(errorMessage(err)); }
  };

  if (mfaToken) {
    return (
      <AuthLayout title="Two-factor authentication" subtitle="Enter the 6-digit code from your authenticator app.">
        {error && <Banner kind="error">{error}</Banner>}
        <form onSubmit={submitMfa} className="space-y-4">
          <Input label="Authentication code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <Button type="submit" className="w-full" loading={busy}>Verify</Button>
          <button type="button" className="w-full text-sm text-slate-500 hover:underline" onClick={() => setMfaToken(null)}>Back to sign in</button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in" subtitle="Manage your reef lighting from anywhere.">
      {info && <Banner kind="success" onClose={() => setInfo(null)}>{info}</Banner>}
      {error && (
        <Banner kind="error">
          {error}
          {unverified && (
            <button className="ml-1 font-medium underline" onClick={() => api('/auth/resend-verification', { method: 'POST', json: { email } }).then(() => { setError(null); setInfo('Verification email sent.'); })}>
              Resend link
            </button>
          )}
        </Banner>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Input label="Email" name="email" type="email" autoComplete="username webauthn" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember this device</label>
          <Link to="/forgot-password" className="text-reef-600 hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
      </form>
      {browserSupportsWebAuthn() && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200 dark:bg-abyss-600" />or<span className="h-px flex-1 bg-slate-200 dark:bg-abyss-600" /></div>
          <Button variant="secondary" className="w-full" onClick={passkey}><Fingerprint className="h-4 w-4" /> Sign in with Face ID / passkey</Button>
        </>
      )}
      <Button variant="ghost" className="mt-2 w-full" disabled title="Voice assistant integration is planned for a future release"><Mic className="h-4 w-4" /> Voice sign-in (coming soon)</Button>
      <p className="mt-6 text-center text-sm text-slate-500">New here? <Link to="/register" className="font-medium text-reef-600 hover:underline">Create an account</Link></p>
    </AuthLayout>
  );
}
