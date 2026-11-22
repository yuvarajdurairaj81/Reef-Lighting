import { API_URL } from '../appConfig';

/**
 * Centralized API service.
 * - Access token lives in memory only (not localStorage) to limit XSS impact.
 * - Refresh token is an httpOnly cookie; a 401 triggers one silent refresh + retry.
 * - The active organization is sent as X-Organization-Id (tenant selection).
 */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;
const ORG_KEY = 'reef.activeOrg';

export const tokenStore = {
  set: (t: string | null) => (accessToken = t),
  get: () => accessToken,
  onSessionLost: (fn: () => void) => (onSessionLost = fn),
};

export const orgStore = {
  get: () => { try { return localStorage.getItem(ORG_KEY); } catch { return null; } },
  set: (id: string | null) => { try { if (id) localStorage.setItem(ORG_KEY, id); else localStorage.removeItem(ORG_KEY); } catch { /* storage unavailable */ } },
};

async function refresh(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) return false;
      accessToken = (await r.json()).accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown; retry?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const org = orgStore.get();
  if (org) headers.set('X-Organization-Id', org);

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });

  if (res.status === 401 && init.retry !== false && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(path, { ...init, retry: false });
    accessToken = null;
    onSessionLost?.();
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 207) {
    const e = body?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? `Request failed (${res.status})`, e.details);
  }
  return body as T;
}

export const tryRefresh = refresh;

/** Turns a validation error payload into a readable message. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const fe = (e.details as { fieldErrors?: Record<string, string[]> })?.fieldErrors;
    const first = fe && Object.values(fe).flat()[0];
    return first ? `${e.message}: ${first}` : e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}
