import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { Badge, Banner, Card, PageHeader, Spinner, timeAgo } from '../components/ui';

interface Member { id: string; role: string; createdAt: string; user: { id: string; email: string; displayName: string; mfaEnabled: boolean } }
interface Log { id: string; action: string; entityType: string | null; createdAt: string; user: { email: string } | null }

/** Enterprise admin only. Invitations and role editing arrive in Phase 6; listing + audit log are live. */
export function UsersPage() {
  const { activeOrg } = useAuth();
  const members = useAsync(() => api<{ members: Member[] }>('/organization/members').then((r) => r.members), [activeOrg?.id]);
  const logs = useAsync(() => api<{ logs: Log[] }>('/audit-logs').then((r) => r.logs), [activeOrg?.id]);
  return (
    <>
      <PageHeader title="User Management" subtitle={activeOrg?.name} />
      <Banner kind="info">Inviting users and editing roles (Owner, Admin, Operator, Viewer) is part of the Enterprise phase. Roles are already enforced by the API.</Banner>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Members">
          {members.loading ? <Spinner /> : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-abyss-700">
              {members.data?.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2">
                  <div><p className="font-medium">{m.user.displayName}</p><p className="text-xs text-slate-500">{m.user.email}</p></div>
                  <div className="flex gap-1"><Badge tone="blue">{m.role}</Badge>{m.user.mfaEnabled && <Badge tone="green">2FA</Badge>}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Audit log">
          {logs.loading ? <Spinner /> : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto text-sm dark:divide-abyss-700">
              {logs.data?.map((l) => (
                <li key={l.id} className="flex justify-between gap-2 py-2"><span className="font-mono text-xs">{l.action}</span><span className="text-xs text-slate-500">{l.user?.email ?? 'system'} · {timeAgo(l.createdAt)}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
