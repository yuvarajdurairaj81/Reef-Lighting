import { CalendarClock } from 'lucide-react';
import { CHANNELS } from '../domain/channels';
import { Badge, Card, PageHeader } from '../components/ui';

/** Phase 5 preview: data model + API exist (/profiles/:id/versions/:v/schedule); full editor ships next phase. */
export function SchedulerPage() {
  const demo = [
    { label: 'Sunrise ramp', from: 9, to: 10, color: '#fbbf24' },
    { label: 'Photoperiod', from: 10, to: 19, color: '#3b82f6' },
    { label: 'Sunset ramp', from: 19, to: 20, color: '#f97316' },
    { label: 'Moonlight', from: 20, to: 23, color: '#93c5fd' },
  ];
  return (
    <>
      <PageHeader title="Scheduler" subtitle={<span className="flex items-center gap-2">Per-channel schedules, sunrise/sunset ramps and overrides <Badge tone="amber">Next phase</Badge></span>} />
      <Card title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> How scheduling will work</span>}>
        <ul className="mb-6 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>Each channel gets its own on/off time, with gradual ramp-up and ramp-down.</li>
          <li>Schedules are time-zone aware (each site has its own time zone).</li>
          <li>The <strong>controller stores and runs the schedule with its own clock</strong>; internet or Wi-Fi outages never interrupt lighting.</li>
          <li>Cloud changes sync to the controller over MQTT when it reconnects; manual overrides expire automatically.</li>
        </ul>
        <div className="space-y-2" aria-label="Example daily schedule">
          <div className="flex justify-between text-[10px] text-slate-500">{[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => <span key={h}>{String(h).padStart(2, '0')}:00</span>)}</div>
          <div className="relative h-8 rounded bg-slate-100 dark:bg-abyss-700">
            {demo.map((d) => <div key={d.label} title={d.label} className="absolute inset-y-0 rounded" style={{ left: `${(d.from / 24) * 100}%`, width: `${((d.to - d.from) / 24) * 100}%`, background: d.color }} />)}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">{demo.map((d) => <span key={d.label} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: d.color }} />{d.label}</span>)}</div>
        </div>
        <p className="mt-6 text-xs text-slate-500">Channels covered: {CHANNELS.map((c) => c.label).join(', ')}. API ready: <code>PUT /api/v1/profiles/:id/versions/:version/schedule</code>.</p>
      </Card>
    </>
  );
}
