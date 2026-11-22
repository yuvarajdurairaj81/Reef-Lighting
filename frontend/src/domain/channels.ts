/**
 * Mirror of backend/src/domain/channels.ts (kept in sync by unit tests on both
 * sides). Used for instant UI feedback; the server re-validates everything.
 */
export const CHANNEL_KEYS = ['UV', 'VIOLET', 'ROYAL_BLUE', 'BLUE', 'GREEN', 'YELLOW', 'RED', 'WHITE', 'MOONLIGHT'] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];
export type Intensities = Record<ChannelKey, number>;
export type Wattages = Record<ChannelKey, number>;

export const CHANNELS: { key: ChannelKey; label: string; defaultMaxWattage: number; color: string }[] = [
  { key: 'UV', label: 'Ultraviolet (UV)', defaultMaxWattage: 15, color: '#7c3aed' },
  { key: 'VIOLET', label: 'Violet', defaultMaxWattage: 15, color: '#8b5cf6' },
  { key: 'ROYAL_BLUE', label: 'Royal Blue', defaultMaxWattage: 20, color: '#1d4ed8' },
  { key: 'BLUE', label: 'Blue', defaultMaxWattage: 20, color: '#3b82f6' },
  { key: 'GREEN', label: 'Green', defaultMaxWattage: 10, color: '#22c55e' },
  { key: 'YELLOW', label: 'Yellow', defaultMaxWattage: 10, color: '#eab308' },
  { key: 'RED', label: 'Red', defaultMaxWattage: 10, color: '#ef4444' },
  { key: 'WHITE', label: 'White', defaultMaxWattage: 25, color: '#cbd5e1' },
  { key: 'MOONLIGHT', label: 'Moon Light', defaultMaxWattage: 5, color: '#93c5fd' },
];

export const DEFAULT_WATTAGES = Object.fromEntries(CHANNELS.map((c) => [c.key, c.defaultMaxWattage])) as Wattages;

export const AB_PLUS: Intensities = { UV: 90, VIOLET: 90, ROYAL_BLUE: 90, BLUE: 95, GREEN: 2, YELLOW: 2, RED: 3, WHITE: 30, MOONLIGHT: 20 };

export const CORAL_CATEGORIES = [
  { key: 'SPS', label: 'SPS Corals' },
  { key: 'LPS', label: 'LPS Corals' },
  { key: 'SOFT', label: 'Soft Corals' },
  { key: 'MIXED_REEF', label: 'Mixed Reef' },
  { key: 'FISH_ONLY', label: 'Fish Only' },
  { key: 'ANEMONE', label: 'Anemone Reef' },
] as const;
export type CoralCategory = (typeof CORAL_CATEGORIES)[number]['key'];
export const coralLabel = (k: string) => CORAL_CATEGORIES.find((c) => c.key === k)?.label ?? k;

export const RECOMMENDED_PRESET: Record<CoralCategory, string> = {
  SPS: 'SPS', LPS: 'LPS', SOFT: 'SOFT', MIXED_REEF: 'AB_PLUS', FISH_ONLY: 'FISH_ONLY', ANEMONE: 'LPS',
};

export function clampIntensity(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
}

/** Estimated Wattage = Σ (Channel Maximum Wattage × Channel Intensity / 100) */
export function estimatePower(i: Intensities, w: Wattages = DEFAULT_WATTAGES) {
  const perChannel = {} as Record<ChannelKey, number>;
  let total = 0;
  let max = 0;
  for (const k of CHANNEL_KEYS) {
    const watts = ((w[k] ?? 0) * (i[k] ?? 0)) / 100;
    perChannel[k] = Math.round(watts * 100) / 100;
    total += watts;
    max += w[k] ?? 0;
  }
  return { estimatedWatts: Math.round(total * 100) / 100, maxWatts: max, perChannel };
}

export function validateIntensities(i: Partial<Intensities>): string[] {
  const errors: string[] = [];
  for (const c of CHANNELS) {
    const v = i[c.key];
    if (v === undefined || v === null || Number.isNaN(v)) errors.push(`${c.label} is required`);
    else if (!Number.isInteger(v)) errors.push(`${c.label} must be a whole number`);
    else if (v < 0 || v > 100) errors.push(`${c.label} must be between 0 and 100%`);
  }
  return errors;
}
