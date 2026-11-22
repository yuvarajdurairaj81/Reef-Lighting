import { useState } from 'react';
import { Bell } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import type { AlertItem } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { Badge, Banner, Button, EmptyState, PageHeader, Spinner, timeAgo } from '../components/ui';

export function AlertsPage() {
  const { can, activeOrg } = useAuth();
  const [status, setStatus] = useState<'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | ''>('OPEN');
  const { data, loading, reload } = useAsync(() => api<{ alerts: AlertItem[] }>(`/alerts${status ? `?status=${status}` : ''}`).then((r) => r.alerts), [status, activeOrg?.id]);
  const [error, setError] = useState<string | null>(null);
  const update = async (a: AlertItem, s: 'ACKNOWLEDGED' | 'RESOLVED') => {
    try { await api(`/alerts/${a.id}`, { method: 'PATCH', json: { status: s } }); await reload(); } catch (e) { setError(errorMessage(e)); }
  };
  return (
    <>
      <PageHeader title="Alerts" actions={
        <select aria-label="Filter by status" className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="OPEN">Open</option><option value="ACKNOWLEDGED">Acknowledged</option><option value="RESOLVED">Resolved</option><option value="">All</option>
        </select>} />
      {error && <Banner kind="error">{error}</Banner>}
      {loading && !data ? <Spinner /> : !data?.length ? <EmptyState icon={<Bell className="h-10 w-10" />} title="All clear">No alerts in this view.</EmptyState> : (
        <ul className="card divide-y divide-slate-100 dark:divide-abyss-700">
          {data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <Badge tone={a.severity === 'CRITICAL' ? 'red' : a.severity === 'WARNING' ? 'amber' : 'blue'}>{a.severity}</Badge>
              <div className="min-w-0 flex-1"><p>{a.message}</p><p className="text-xs text-slate-500">{a.code} · {a.device?.name ?? 'Organization'} · {timeAgo(a.createdAt)}</p></div>
              {can('apply') && a.status === 'OPEN' && <Button variant="secondary" onClick={() => update(a, 'ACKNOWLEDGED')}>Acknowledge</Button>}
              {can('apply') && a.status !== 'RESOLVED' && <Button variant="ghost" onClick={() => update(a, 'RESOLVED')}>Resolve</Button>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
