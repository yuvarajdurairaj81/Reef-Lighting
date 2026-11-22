import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client';
import type { Dashboard } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { PowerPanel } from '../components/PowerPanel';
import { Banner, Card, PageHeader, Spinner } from '../components/ui';

interface Point { deviceId: string; recordedAt: string; powerWatts: number | null; powerIsMeasured: boolean }

export function EnergyPage() {
  const { activeOrg } = useAuth();
  const dash = useAsync(() => api<Dashboard>('/dashboard'), [activeOrg?.id]);
  const energy = useAsync(() => api<{ points: Point[] }>('/dashboard/energy').then((r) => r.points), [activeOrg?.id]);
  if (dash.loading && !dash.data) return <Spinner />;
  const f = dash.data?.focus;
  const points = (energy.data ?? []).map((p) => ({ t: new Date(p.recordedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), watts: p.powerWatts }));
  const anyMeasured = energy.data?.some((p) => p.powerIsMeasured);
  return (
    <>
      <PageHeader title="Energy Monitoring" subtitle="Power use per controller" />
      {!anyMeasured && <Banner kind="info">Values are <strong>estimates</strong> computed from channel intensity × configured maximum wattage. Controllers with power sensors will report measured values.</Banner>}
      <div className="grid gap-6 lg:grid-cols-3">
        {f && <Card title={`Now · ${f.tank.name}`}><PowerPanel intensities={f.intensities} measuredWatts={f.power.isMeasured ? f.power.estimatedWatts : null} wattages={Object.fromEntries(Object.entries(f.power.perChannel).map(([k, v]) => [k, v.maxWatts])) as never} /></Card>}
        <Card title="History (last 7 days)" className="lg:col-span-2">
          {points.length === 0 ? <p className="text-sm text-slate-500">No telemetry yet. Apply a configuration or refresh a controller to record a data point.</p> : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ left: -10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={30} />
                  <YAxis unit=" W" tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="watts" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
