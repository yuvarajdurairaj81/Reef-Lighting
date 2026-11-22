import { Link, useSearchParams } from 'react-router-dom';
import { Activity, AlertTriangle, Cpu, Fish, Layers, RefreshCw, Thermometer, WifiOff } from 'lucide-react';
import { api } from '../api/client';
import type { Dashboard } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { CHANNELS, coralLabel } from '../domain/channels';
import { PowerPanel } from '../components/PowerPanel';
import { SpectrumPreview } from '../components/SpectrumPreview';
import { StatCard } from '../components/StatCard';
import { Badge, Banner, Button, Card, EmptyState, PageHeader, SimulatedBadge, Spinner, StatusBadge, timeAgo } from '../components/ui';

export function DashboardPage() {
  const { isSingleTankHome, isEnterprise, activeOrg } = useAuth();
  const [params, setParams] = useSearchParams();
  const tankId = params.get('tankId') ?? '';
  const { data, error, loading, reload } = useAsync(() => api<Dashboard>(`/dashboard${tankId ? `?tankId=${tankId}` : ''}`), [tankId, activeOrg?.id]);

  if (loading && !data) return <Spinner />;
  if (error) return <Banner kind="error">{error}</Banner>;
  if (!data) return null;
  const f = data.focus;

  return (
    <>
      <PageHeader
        title={isSingleTankHome && f ? f.tank.name : 'Dashboard'}
        subtitle={isSingleTankHome ? 'Your aquarium at a glance' : `${data.totals.tanks} tanks across ${data.totals.sites} site${data.totals.sites === 1 ? '' : 's'}`}
        actions={
          <>
            {!isSingleTankHome && data.tanks.length > 0 && (
              <select aria-label="Select tank" className="input w-auto" value={f?.tank.id ?? ''} onChange={(e) => setParams({ tankId: e.target.value })}>
                {data.tanks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <Button variant="secondary" onClick={reload} loading={loading}><RefreshCw className="h-4 w-4" /> Refresh</Button>
          </>
        }
      />

      {data.totals.simulatedDevices > 0 && (
        <Banner kind="info">{data.totals.simulatedDevices} controller{data.totals.simulatedDevices > 1 ? 's are' : ' is'} running on the <strong>device simulator</strong>. Values come from simulated hardware, not a physical light.</Banner>
      )}

      {!isSingleTankHome && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Tanks" value={data.totals.tanks} icon={<Fish className="h-5 w-5" />} />
          <StatCard label="Connected" value={data.totals.connected} tone="good" icon={<Cpu className="h-5 w-5" />} hint={`of ${data.totals.devices} controllers`} />
          <StatCard label="Offline" value={data.totals.offline} tone={data.totals.offline ? 'bad' : 'default'} icon={<WifiOff className="h-5 w-5" />} />
          <StatCard label="Active profiles" value={data.totals.activeProfiles} icon={<Layers className="h-5 w-5" />} />
          <StatCard label="Open alerts" value={data.totals.openAlerts} tone={data.totals.openAlerts ? 'warn' : 'default'} icon={<AlertTriangle className="h-5 w-5" />} />
          <StatCard label="Last sync" value={<span className="text-base">{timeAgo(data.lastSyncAt)}</span>} icon={<Activity className="h-5 w-5" />} />
        </div>
      )}

      {isEnterprise && data.sites && (
        <Card title="Sites" className="mb-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.sites.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 p-4 dark:border-abyss-600">
                <p className="font-semibold">{s.name}</p>
                <p className="mt-1 text-sm text-slate-500">{s.tanks} tanks · {s.devices} controllers</p>
                {s.offline > 0 ? <Badge tone="red">{s.offline} offline</Badge> : <Badge tone="green">All online</Badge>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {!f ? (
        <EmptyState icon={<Fish className="h-10 w-10" />} title="No tanks yet" action={<Link to="/tanks"><Button>Add a tank</Button></Link>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card
            className="lg:col-span-2"
            title={<span className="flex items-center gap-2">{f.tank.name} {f.device?.isSimulated && <SimulatedBadge />}</span>}
            actions={<Link to={`/lighting?tankId=${f.tank.id}`}><Button variant="secondary">Adjust lighting</Button></Link>}
          >
            <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span><span className="text-slate-500">Profile:</span> <strong>{f.profile.name}</strong> v{f.profile.version}</span>
              <span><span className="text-slate-500">Mode:</span> <strong>{f.mode}</strong></span>
              <span><span className="text-slate-500">Coral:</span> {coralLabel(f.tank.coralCategory)}</span>
              {!isSingleTankHome && <span><span className="text-slate-500">Site:</span> {f.tank.siteName}</span>}
            </div>
            <SpectrumPreview intensities={f.intensities} />
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-9">
              {CHANNELS.map((c) => (
                <div key={c.key} className="rounded-lg bg-slate-50 p-2 text-center dark:bg-abyss-700">
                  <div className="mx-auto mb-1 h-2 w-2 rounded-full" style={{ background: c.color }} />
                  <p className="text-lg font-bold tabular-nums">{f.intensities[c.key]}%</p>
                  <p className="truncate text-[10px] text-slate-500" title={c.label}>{c.label.replace(' (UV)', '')}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Source: {f.intensitiesSource === 'controller' ? 'last values reported by the controller' : 'configured values (controller has not reported yet)'}</p>
          </Card>

          <div className="space-y-6">
            <Card title="Device health">
              {!f.device ? (
                <p className="text-sm text-slate-500">No controller assigned. <Link to="/devices" className="text-reef-600 hover:underline">Add one</Link>.</p>
              ) : (
                <dl className="grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-slate-500">Controller</dt><dd className="text-right font-medium">{f.device.name}</dd>
                  <dt className="text-slate-500">Status</dt><dd className="text-right"><StatusBadge status={f.health} /></dd>
                  <dt className="text-slate-500">Connection</dt><dd className="text-right"><StatusBadge status={f.device.status} /></dd>
                  <dt className="text-slate-500">Sync</dt><dd className="text-right"><StatusBadge status={f.device.syncStatus} /></dd>
                  <dt className="text-slate-500">Last sync</dt><dd className="text-right">{timeAgo(f.device.lastSyncedAt)}</dd>
                  <dt className="text-slate-500">Last seen</dt><dd className="text-right">{timeAgo(f.device.lastSeenAt)}</dd>
                  <dt className="text-slate-500">Firmware</dt><dd className="text-right font-mono text-xs">{f.device.firmwareVersion ?? '—'}</dd>
                  {f.temperatureC != null && <><dt className="flex items-center gap-1 text-slate-500"><Thermometer className="h-3 w-3" />LED temp</dt><dd className="text-right">{f.temperatureC.toFixed(1)} °C</dd></>}
                </dl>
              )}
            </Card>
            <Card title="Power consumption">
              <PowerPanel intensities={f.intensities} wattages={Object.fromEntries(Object.entries(f.power.perChannel).map(([k, v]) => [k, v.maxWatts])) as never} measuredWatts={f.power.isMeasured ? f.power.estimatedWatts : null} />
            </Card>
          </div>
        </div>
      )}

      {data.alerts.length > 0 && (
        <Card title="Active alerts" className="mt-6" actions={<Link to="/alerts" className="text-sm text-reef-600 hover:underline">View all</Link>}>
          <ul className="divide-y divide-slate-100 dark:divide-abyss-700">
            {data.alerts.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                <Badge tone={a.severity === 'CRITICAL' ? 'red' : a.severity === 'WARNING' ? 'amber' : 'blue'}>{a.severity}</Badge>
                <span className="flex-1">{a.message}</span>
                <span className="text-xs text-slate-500">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
