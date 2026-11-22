import { FormEvent, useEffect, useState } from 'react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, KeyRound, Mic, ShieldCheck, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import type { Tank } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { Badge, Banner, Button, Card, Input, PageHeader } from '../components/ui';

interface Passkey { id: string; deviceName: string | null; createdAt: string; lastUsedAt: string | null }

export function SettingsPage() {
  const { user, reload, activeOrg } = useAuth();
  const { theme, toggle } = useTheme();
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [mfa, setMfa] = useState<{ qrCodeDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [disable, setDisable] = useState({ code: '', password: '' });
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);

  const loadPasskeys = () => api<{ passkeys: Passkey[] }>('/auth/passkeys').then((r) => setPasskeys(r.passkeys)).catch(() => undefined);
  useEffect(() => { void loadPasskeys(); }, []);
  const fail = (e: unknown) => setNotice({ kind: 'error', text: errorMessage(e) });

  const startMfa = async () => { try { setMfa(await api('/auth/mfa/setup', { method: 'POST' })); } catch (e) { fail(e); } };
  const enableMfa = async (e: FormEvent) => {
    e.preventDefault();
    try { await api('/auth/mfa/enable', { method: 'POST', json: { code } }); setMfa(null); setCode(''); await reload(); setNotice({ kind: 'success', text: 'Two-factor authentication is on.' }); } catch (err) { fail(err); }
  };
  const disableMfa = async (e: FormEvent) => {
    e.preventDefault();
    try { await api('/auth/mfa/disable', { method: 'POST', json: disable }); setDisable({ code: '', password: '' }); await reload(); setNotice({ kind: 'success', text: 'Two-factor authentication turned off.' }); } catch (err) { fail(err); }
  };

  const addPasskey = async () => {
    try {
      const { challengeId, options } = await api<{ challengeId: string; options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>('/auth/passkeys/register/options', { method: 'POST' });
      const response = await startRegistration({ optionsJSON: options });
      await api('/auth/passkeys/register/verify', { method: 'POST', json: { challengeId, response, deviceName: navigator.platform || 'This device' } });
      await Promise.all([loadPasskeys(), reload()]);
      setNotice({ kind: 'success', text: 'Passkey added. You can now sign in with Face ID / Touch ID / Windows Hello.' });
    } catch (e) { fail(e); }
  };

  return (
    <>
      <PageHeader title="Settings" />
      {notice && <Banner kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Banner>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Name</dt><dd>{user?.displayName}</dd>
            <dt className="text-slate-500">Email</dt><dd>{user?.email} {user?.emailVerified && <Badge tone="green">Verified</Badge>}</dd>
            <dt className="text-slate-500">Account</dt><dd>{user?.accountType === 'HOME' ? 'Home' : 'Enterprise'}</dd>
            <dt className="text-slate-500">Organization</dt><dd>{activeOrg?.name} ({activeOrg?.role.toLowerCase()})</dd>
            <dt className="text-slate-500">Theme</dt><dd><Button variant="secondary" onClick={toggle}>{theme === 'dark' ? 'Dark' : 'Light'} — switch</Button></dd>
          </dl>
        </Card>

        <Card title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Two-factor authentication</span>}>
          {user?.mfaEnabled ? (
            <form onSubmit={disableMfa} className="space-y-3">
              <Banner kind="success">Authenticator app is enabled.</Banner>
              <Input label="Current code" name="disableCode" inputMode="numeric" maxLength={6} value={disable.code} onChange={(e) => setDisable({ ...disable, code: e.target.value })} />
              <Input label="Password" name="disablePassword" type="password" value={disable.password} onChange={(e) => setDisable({ ...disable, password: e.target.value })} />
              <Button variant="danger" type="submit">Turn off 2FA</Button>
            </form>
          ) : mfa ? (
            <form onSubmit={enableMfa} className="space-y-3">
              <p className="text-sm">Scan with Google Authenticator, 1Password, Authy, or Microsoft Authenticator:</p>
              <img src={mfa.qrCodeDataUrl} alt="Authenticator QR code" className="h-44 w-44 rounded bg-white p-2" />
              <p className="text-xs text-slate-500">Can't scan? Enter this key: <code className="break-all">{mfa.secret}</code></p>
              <Input label="6-digit code" name="enableCode" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <Button type="submit">Verify & enable</Button>
            </form>
          ) : (
            <><p className="mb-3 text-sm text-slate-500">Require a code from an authenticator app when signing in with a password.</p><Button onClick={startMfa}><KeyRound className="h-4 w-4" /> Set up authenticator</Button></>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2"><Fingerprint className="h-4 w-4" /> Passkeys (Face ID / Touch ID)</span>}>
          <p className="mb-3 text-sm text-slate-500">Passkeys use your device's built-in authenticator — Face ID or Touch ID on Apple devices, fingerprint/face on Android, Windows Hello on PCs — through the WebAuthn standard. Your biometric never leaves your device.</p>
          <ul className="mb-3 divide-y divide-slate-100 text-sm dark:divide-abyss-700">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span>{p.deviceName ?? 'Passkey'} <span className="text-xs text-slate-500">· added {new Date(p.createdAt).toLocaleDateString()}</span></span>
                <button aria-label="Remove passkey" onClick={() => api(`/auth/passkeys/${p.id}`, { method: 'DELETE' }).then(loadPasskeys)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          {browserSupportsWebAuthn() ? <Button onClick={addPasskey}>Add a passkey</Button> : <Banner kind="warning">This browser doesn't support passkeys.</Banner>}
        </Card>

        <VoiceAssistantCard />
      </div>
    </>
  );
}

/** Entry point for the future voice integration — every device change requires confirmation. */
function VoiceAssistantCard() {
  const { activeOrg } = useAuth();
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [tankId, setTankId] = useState('');
  const [utterance, setUtterance] = useState('set blue to 60 percent');
  const [proposal, setProposal] = useState<{ summary?: string; answer?: string; confirmationToken?: string; requiresConfirmation: boolean } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { api<{ tanks: Tank[] }>('/tanks').then((r) => { setTanks(r.tanks); setTankId(r.tanks[0]?.id ?? ''); }).catch(() => undefined); }, [activeOrg?.id]);

  const interpret = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null);
    try { setProposal(await api('/voice/intents', { method: 'POST', json: { utterance, tankId } })); } catch (err) { setMsg(errorMessage(err)); }
  };
  const confirmIt = async () => {
    try { const r = await api<{ executed: string }>('/voice/confirm', { method: 'POST', json: { confirmationToken: proposal?.confirmationToken } }); setMsg(`Done: ${r.executed}`); setProposal(null); } catch (err) { setMsg(errorMessage(err)); }
  };

  return (
    <Card title={<span className="flex items-center gap-2"><Mic className="h-4 w-4" /> Voice assistant <Badge tone="amber">Preview</Badge></span>}>
      <p className="mb-3 text-sm text-slate-500">Integration point for Alexa / Google Assistant / Siri Shortcuts. Try a typed command — nothing changes until you confirm.</p>
      <form onSubmit={interpret} className="space-y-3">
        <select aria-label="Tank" className="input" value={tankId} onChange={(e) => setTankId(e.target.value)}>{tanks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <Input name="utterance" aria-label="Command" value={utterance} onChange={(e) => setUtterance(e.target.value)} hint='e.g. "apply the SPS profile", "moonlight to 10", "turn off the lights"' />
        <Button type="submit" variant="secondary">Interpret</Button>
      </form>
      {proposal && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          {proposal.requiresConfirmation ? <>
            <p className="mb-2 font-medium">{proposal.summary}</p>
            <div className="flex gap-2"><Button onClick={confirmIt}>Confirm</Button><Button variant="secondary" onClick={() => setProposal(null)}>Cancel</Button></div>
          </> : <p>{proposal.answer}</p>}
        </div>
      )}
      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </Card>
  );
}
