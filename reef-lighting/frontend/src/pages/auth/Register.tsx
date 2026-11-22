import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Building2, Home } from 'lucide-react';
import { ApiError, api, errorMessage } from '../../api/client';
import { Banner, Button, Input } from '../../components/ui';
import { AuthLayout } from '../../layouts/AuthLayout';

export function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: '', email: '', password: '', confirm: '', accountType: 'HOME' as 'HOME' | 'ENTERPRISE', organizationName: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.password.length < 10) e.password = 'At least 10 characters';
    else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) e.password = 'Include a letter and a number';
    if (form.confirm !== form.password) e.confirm = 'Passwords do not match';
    if (form.accountType === 'ENTERPRISE' && form.organizationName.trim().length < 2) e.organizationName = 'Organization name is required';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ emailVerificationRequired: boolean }>('/auth/register', {
        method: 'POST',
        json: { displayName: form.displayName, email: form.email, password: form.password, accountType: form.accountType, organizationName: form.accountType === 'ENTERPRISE' ? form.organizationName : undefined },
      });
      navigate('/login', { state: { message: r.emailVerificationRequired ? `Check ${form.email} for a confirmation link, then sign in.` : 'Account created — sign in.' } });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') {
        const fe = (e.details as { fieldErrors?: Record<string, string[]> })?.fieldErrors ?? {};
        setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0]])));
      }
      setError(errorMessage(e));
    } finally { setBusy(false); }
  };

  const typeCard = (type: 'HOME' | 'ENTERPRISE', Icon: typeof Home, title: string, desc: string) => (
    <button type="button" onClick={() => set('accountType')(type)} aria-pressed={form.accountType === type}
      className={clsx('flex-1 rounded-xl border-2 p-3 text-left transition', form.accountType === type ? 'border-reef-500 bg-reef-50 dark:bg-reef-950/40' : 'border-slate-200 dark:border-abyss-600')}>
      <Icon className="mb-1 h-5 w-5 text-reef-600" />
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-slate-500">{desc}</p>
    </button>
  );

  return (
    <AuthLayout title="Create your account">
      {error && <Banner kind="error">{error}</Banner>}
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-3">
          {typeCard('HOME', Home, 'Home', 'One or more tanks at home')}
          {typeCard('ENTERPRISE', Building2, 'Enterprise', 'Aquariums, stores, labs')}
        </div>
        {form.accountType === 'ENTERPRISE' && <Input label="Organization name" name="organizationName" value={form.organizationName} error={errors.organizationName} onChange={(e) => set('organizationName')(e.target.value)} />}
        <Input label="Your name" name="displayName" required autoComplete="name" value={form.displayName} error={errors.displayName} onChange={(e) => set('displayName')(e.target.value)} />
        <Input label="Email" name="email" type="email" required autoComplete="email" value={form.email} error={errors.email} onChange={(e) => set('email')(e.target.value)} />
        <Input label="Password" name="password" type="password" required autoComplete="new-password" hint="10+ characters with a letter and a number" value={form.password} error={errors.password} onChange={(e) => set('password')(e.target.value)} />
        <Input label="Confirm password" name="confirm" type="password" required autoComplete="new-password" value={form.confirm} error={errors.confirm} onChange={(e) => set('confirm')(e.target.value)} />
        <Button type="submit" className="w-full" loading={busy}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">Already have an account? <Link to="/login" className="font-medium text-reef-600 hover:underline">Sign in</Link></p>
    </AuthLayout>
  );
}
