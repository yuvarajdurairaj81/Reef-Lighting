import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { api, orgStore, tokenStore, tryRefresh } from '../api/client';
import type { OrgSummary, Session, User } from '../api/types';

interface MeResponse { user: User; organizations: OrgSummary[]; passkeyCount: number }
type LoginResult = { mfaRequired: true; mfaToken: string } | { mfaRequired?: false };

interface AuthState {
  user: User | null;
  organizations: OrgSummary[];
  activeOrg: OrgSummary | null;
  passkeyCount: number;
  loading: boolean;
  /** Home user with one tank: hide org/site/tank navigation. */
  isSingleTankHome: boolean;
  isEnterprise: boolean;
  can: (perm: 'manage' | 'apply' | 'admin') => boolean;
  login: (email: string, password: string, remember: boolean) => Promise<LoginResult>;
  completeMfa: (mfaToken: string, code: string) => Promise<void>;
  loginWithPasskey: (remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  switchOrg: (id: string) => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(orgStore.get());

  const reload = useCallback(async () => {
    const data = await api<MeResponse>('/auth/me');
    setMe(data);
    const valid = data.organizations.find((o) => o.id === orgStore.get()) ?? data.organizations.find((o) => o.isDefault) ?? data.organizations[0];
    orgStore.set(valid?.id ?? null);
    setActiveOrgId(valid?.id ?? null);
  }, []);

  const startSession = useCallback(async (s: Session) => {
    tokenStore.set(s.accessToken);
    await reload();
  }, [reload]);

  useEffect(() => {
    tokenStore.onSessionLost(() => setMe(null));
    // Restore a session from the refresh cookie ("remember this device").
    tryRefresh()
      .then((ok) => (ok ? reload() : undefined))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [reload]);

  const value = useMemo<AuthState>(() => {
    const activeOrg = me?.organizations.find((o) => o.id === activeOrgId) ?? null;
    const role = activeOrg?.role;
    return {
      user: me?.user ?? null,
      organizations: me?.organizations ?? [],
      activeOrg,
      passkeyCount: me?.passkeyCount ?? 0,
      loading,
      isSingleTankHome: activeOrg?.type === 'PERSONAL' && activeOrg.tankCount <= 1,
      isEnterprise: activeOrg?.type === 'ENTERPRISE',
      can: (perm) =>
        perm === 'admin' ? role === 'OWNER' || role === 'ADMIN'
        : perm === 'manage' ? role === 'OWNER' || role === 'ADMIN'
        : role !== 'VIEWER',
      login: async (email, password, remember) => {
        const r = await api<Session | { mfaRequired: true; mfaToken: string }>('/auth/login', { method: 'POST', json: { email, password, remember } });
        if ('mfaRequired' in r) return r;
        await startSession(r);
        return {};
      },
      completeMfa: async (mfaToken, code) => startSession(await api<Session>('/auth/mfa/verify', { method: 'POST', json: { mfaToken, code } })),
      loginWithPasskey: async (remember) => {
        const { challengeId, options } = await api<{ challengeId: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>('/auth/passkeys/login/options', { method: 'POST' });
        // The OS shows Face ID / Touch ID / Windows Hello here.
        const response = await startAuthentication({ optionsJSON: options });
        await startSession(await api<Session>('/auth/passkeys/login/verify', { method: 'POST', json: { challengeId, response, remember } }));
      },
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        tokenStore.set(null);
        setMe(null);
      },
      reload,
      switchOrg: (id) => {
        orgStore.set(id);
        setActiveOrgId(id);
      },
    };
  }, [me, activeOrgId, loading, reload, startSession]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
