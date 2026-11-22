import { ChangeEvent, useEffect, useState } from 'react';
import { clampIntensity } from '../domain/channels';

interface Props {
  channelKey: string;
  label: string;
  color: string;
  value: number;
  watts?: number;
  maxWatts?: number;
  disabled?: boolean;
  overridden?: boolean;
  onChange: (value: number) => void;
}

/**
 * 0–100% in 1% steps, with a numeric box for manual entry. The number box
 * keeps a local draft so users can type freely; it is clamped on blur/Enter.
 */
export function ChannelSlider({ channelKey, label, color, value, watts, maxWatts, disabled, overridden, onChange }: Props) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const n = clampIntensity(Number(draft));
    setDraft(String(n));
    if (n !== value) onChange(n);
  };

  const id = `ch-${channelKey}`;
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-abyss-600" data-testid={id}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
          <span className="h-3 w-3 rounded-full ring-2 ring-white dark:ring-abyss-800" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
          {label}
          {overridden && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" title="Differs from the selected profile">override</span>}
        </label>
        <div className="flex items-center gap-1">
          <input
            aria-label={`${label} percentage`}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            disabled={disabled}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            className="input w-16 px-2 py-1 text-right tabular-nums"
          />
          <span className="text-sm text-slate-500">%</span>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        aria-valuetext={`${value}%`}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(clampIntensity(Number(e.target.value)))}
        className="channel-range w-full"
        style={{ ['--ch' as string]: color, background: `linear-gradient(to right, ${color} ${value}%, rgb(148 163 184 / .3) ${value}%)` }}
      />
      {watts !== undefined && (
        <p className="mt-1 text-right text-xs tabular-nums text-slate-500">{watts.toFixed(1)} W / {maxWatts} W max</p>
      )}
    </div>
  );
}
