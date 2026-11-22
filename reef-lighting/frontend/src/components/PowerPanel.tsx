import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHANNELS, Intensities, Wattages, estimatePower } from '../domain/channels';

export function PowerPanel({ intensities, wattages, measuredWatts }: { intensities: Intensities; wattages?: Wattages; measuredWatts?: number | null }) {
  const est = estimatePower(intensities, wattages);
  const isMeasured = measuredWatts != null;
  const watts = isMeasured ? measuredWatts! : est.estimatedWatts;
  const data = CHANNELS.map((c) => ({ name: c.label.replace(' (UV)', ''), watts: est.perChannel[c.key], color: c.color }));
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <p className="text-3xl font-bold tabular-nums">{watts.toFixed(1)} <span className="text-base font-medium text-slate-500">W</span></p>
          <p className="text-xs text-slate-500">{isMeasured ? 'Measured by controller' : 'Estimated'} · max {est.maxWatts} W</p>
        </div>
        <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-abyss-600" aria-label={`${Math.round((watts / est.maxWatts) * 100)}% of maximum`}>
          <div className="h-full bg-reef-500" style={{ width: `${Math.min(100, (watts / est.maxWatts) * 100)}%` }} />
        </div>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -20, right: 0, top: 4, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10 }} unit="W" />
            <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} W`, 'Contribution']} />
            <Bar dataKey="watts" radius={[4, 4, 0, 0]} fill="#06b6d4" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {!isMeasured && <p className="mt-2 text-xs text-slate-500">Estimate = Σ (channel max watts × intensity / 100). Shown as an estimate until the controller reports measured power.</p>}
    </div>
  );
}
