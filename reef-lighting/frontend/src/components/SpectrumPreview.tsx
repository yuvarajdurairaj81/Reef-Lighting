import { CHANNELS, Intensities } from '../domain/channels';

/** Visual real-time preview: a stylized tank lit by the current mix. */
export function SpectrumPreview({ intensities }: { intensities: Intensities }) {
  const total = CHANNELS.reduce((s, c) => s + intensities[c.key], 0) || 1;
  const gradient = CHANNELS.filter((c) => intensities[c.key] > 0)
    .map((c) => `${c.color}${Math.round((intensities[c.key] / 100) * 255).toString(16).padStart(2, '0')}`)
    .join(', ');
  const brightness = Math.min(1, total / 500);
  return (
    <div className="space-y-3">
      <div
        aria-label="Lighting preview"
        className="relative h-36 overflow-hidden rounded-xl border border-slate-700 bg-abyss-900"
        style={{ boxShadow: `inset 0 40px 80px -20px rgba(59,130,246,${brightness * 0.6})` }}
      >
        <div className="absolute inset-x-0 top-0 h-full opacity-80" style={{ background: gradient ? `linear-gradient(to bottom, ${gradient.split(', ').slice(0, 4).join(', ')}, transparent)` : 'transparent', filter: `brightness(${0.4 + brightness})` }} />
        <svg viewBox="0 0 300 80" className="absolute bottom-0 w-full" aria-hidden>
          <path d="M0 80 Q30 40 50 60 T100 55 Q120 30 140 58 T200 50 Q230 35 250 60 T300 55 V80 Z" fill="#334155" />
          <circle cx="60" cy="52" r="8" fill="#f472b6" opacity=".8" /><circle cx="150" cy="48" r="10" fill="#a78bfa" opacity=".8" /><circle cx="230" cy="52" r="7" fill="#34d399" opacity=".8" />
        </svg>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full" aria-label="Spectrum mix">
        {CHANNELS.map((c) => (
          <div key={c.key} title={`${c.label}: ${intensities[c.key]}%`} style={{ width: `${(intensities[c.key] / total) * 100}%`, background: c.color }} />
        ))}
      </div>
    </div>
  );
}
