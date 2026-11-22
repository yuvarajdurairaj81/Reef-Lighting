import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { Banner, Button, Input, Spinner } from '../../components/ui';
import { AuthLayout } from '../../layouts/AuthLayout';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const token = params.get('token');
    if (!token) { setError('Missing verification token.'); return; }
    api('/auth/verify-email', { method: 'POST', json: { token } })
      .then(() => navigate('/login', { replace: true, state: { message: 'Email confirmed — you can sign in now.' } }))
      .catch((e) => setError(errorMessage(e)));
  }, [params, navigate]);
  return (
    <AuthLayout title="Confirming your email">
      {error ? <><Banner kind="error">{error}</Banner><Link to="/login" className="text-sm text-reef-600 hover:underline">Back to sign in</Link></> : <Spinner label="Verifying…" />}
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api('/auth/forgot-password', { method: 'POST', json: { email } }); setSent(true); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to choose a new password.">
      {error && <Banner kind="error">{error}</Banner>}
      {sent ? <Banner kind="success">If an account exists for {email}, a reset link is on its way. It expires in 1 hour.</Banner> : (
        <form onSubmit={submit} className="space-y-4">
          <Input label="Email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm"><Link to="/login" className="text-reef-600 hover:underline">Back to sign in</Link></p>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true); setError(null);
    try {
      await api('/auth/reset-password', { method: 'POST', json: { token: params.get('token'), password } });
      navigate('/login', { replace: true, state: { message: 'Password updated. All other sessions were signed out.' } });
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <AuthLayout title="Choose a new password">
      {error && <Banner kind="error">{error}</Banner>}
      <form onSubmit={submit} className="space-y-4">
        <Input label="New password" name="password" type="password" autoComplete="new-password" required hint="10+ characters with a letter and a number" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Input label="Confirm password" name="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button type="submit" className="w-full" loading={busy}>Update password</Button>
      </form>
    </AuthLayout>
  );
}
