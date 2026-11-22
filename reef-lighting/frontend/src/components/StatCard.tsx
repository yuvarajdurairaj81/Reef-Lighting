import clsx from 'clsx';
import { ReactNode } from 'react';

export function StatCard({ label, value, icon, tone = 'default', hint }: { label: string; value: ReactNode; icon?: ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn'; hint?: ReactNode }) {
  return (
    <div className="card flex items-start justify-between gap-3 p-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={clsx('mt-1 text-2xl font-bold tabular-nums', tone === 'good' && 'text-emerald-600', tone === 'bad' && 'text-red-600', tone === 'warn' && 'text-amber-600')}>{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      {icon && <div className="rounded-lg bg-reef-50 p-2 text-reef-600 dark:bg-reef-950 dark:text-reef-400">{icon}</div>}
    </div>
  );
}
