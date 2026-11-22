/**
 * Lighting domain constants — the single source of truth on the server.
 * (frontend/src/domain/channels.ts mirrors this file; a unit test in each
 * package pins the AB+ values and wattages so they cannot drift silently.)
 */

export const CHANNEL_KEYS = [
  'UV',
  'VIOLET',
  'ROYAL_BLUE',
  'BLUE',
  'GREEN',
  'YELLOW',
  'RED',
  'WHITE',
  'MOONLIGHT',
] as const;

export type ChannelKey = (typeof CHANNEL_KEYS)[number];
export type ChannelIntensities = Record<ChannelKey, number>;
export type ChannelWattages = Record<ChannelKey, number>;

export interface ChannelDefinition {
  key: ChannelKey;
  position: number;
  label: string;
  defaultMaxWattage: number;
  color: string; // UI hint
}

export const CHANNELS: ChannelDefinition[] = [
  { key: 'UV', position: 1, label: 'Ultraviolet (UV)', defaultMaxWattage: 15, color: '#7c3aed' },
  { key: 'VIOLET', position: 2, label: 'Violet', defaultMaxWattage: 15, color: '#8b5cf6' },
  { key: 'ROYAL_BLUE', position: 3, label: 'Royal Blue', defaultMaxWattage: 20, color: '#1d4ed8' },
  { key: 'BLUE', position: 4, label: 'Blue', defaultMaxWattage: 20, color: '#3b82f6' },
  { key: 'GREEN', position: 5, label: 'Green', defaultMaxWattage: 10, color: '#22c55e' },
  { key: 'YELLOW', position: 6, label: 'Yellow', defaultMaxWattage: 10, color: '#eab308' },
  { key: 'RED', position: 7, label: 'Red', defaultMaxWattage: 10, color: '#ef4444' },
  { key: 'WHITE', position: 8, label: 'White', defaultMaxWattage: 25, color: '#e5e7eb' },
  { key: 'MOONLIGHT', position: 9, label: 'Moon Light', defaultMaxWattage: 5, color: '#93c5fd' },
];

export const DEFAULT_WATTAGES: ChannelWattages = Object.fromEntries(
  CHANNELS.map((c) => [c.key, c.defaultMaxWattage]),
) as ChannelWattages;

export const CORAL_CATEGORIES = ['SPS', 'LPS', 'SOFT', 'MIXED_REEF', 'FISH_ONLY', 'ANEMONE'] as const;
export type CoralCategoryKey = (typeof CORAL_CATEGORIES)[number];

export const CORAL_CATEGORY_LABELS: Record<CoralCategoryKey, string> = {
  SPS: 'SPS Corals',
  LPS: 'LPS Corals',
  SOFT: 'Soft Corals',
  MIXED_REEF: 'Mixed Reef',
  FISH_ONLY: 'Fish Only',
  ANEMONE: 'Anemone Reef',
};

export interface PresetDefinition {
  key: string;
  name: string;
  coralCategory: CoralCategoryKey;
  description: string;
  intensities: ChannelIntensities;
  rampUpMinutes: number;
  rampDownMinutes: number;
}

const p = (v: number[]): ChannelIntensities =>
  Object.fromEntries(CHANNEL_KEYS.map((k, i) => [k, v[i]])) as ChannelIntensities;

/**
 * Built-in presets. AB+ values come from the product specification. The other
 * presets are reasonable starting points and should be tuned per tank (PAR
 * readings, fixture height, coral response).
 */
export const PRESETS: PresetDefinition[] = [
  {
    key: 'AB_PLUS',
    name: 'AB+',
    coralCategory: 'MIXED_REEF',
    description: 'Default blue-heavy reef spectrum (Default AB+ profile).',
    intensities: p([90, 90, 90, 95, 2, 2, 3, 30, 20]),
    rampUpMinutes: 60,
    rampDownMinutes: 60,
  },
  {
    key: 'SPS',
    name: 'SPS',
    coralCategory: 'SPS',
    description: 'High-intensity blue/UV for small-polyp stony corals.',
    intensities: p([85, 85, 100, 90, 5, 3, 5, 35, 15]),
    rampUpMinutes: 90,
    rampDownMinutes: 90,
  },
  {
    key: 'LPS',
    name: 'LPS',
    coralCategory: 'LPS',
    description: 'Moderate intensity for large-polyp stony corals.',
    intensities: p([60, 65, 80, 75, 8, 5, 8, 30, 15]),
    rampUpMinutes: 60,
    rampDownMinutes: 60,
  },
  {
    key: 'SOFT',
    name: 'Soft Coral',
    coralCategory: 'SOFT',
    description: 'Lower intensity, softer spectrum for soft corals.',
    intensities: p([45, 50, 70, 65, 10, 8, 10, 35, 15]),
    rampUpMinutes: 45,
    rampDownMinutes: 45,
  },
  {
    key: 'FISH_ONLY',
    name: 'Fish Only',
    coralCategory: 'FISH_ONLY',
    description: 'Natural, white-forward viewing light for fish-only systems.',
    intensities: p([20, 30, 50, 55, 25, 20, 25, 70, 10]),
    rampUpMinutes: 30,
    rampDownMinutes: 30,
  },
  {
    key: 'CUSTOM',
    name: 'Custom',
    coralCategory: 'MIXED_REEF',
    description: 'Template for your own profile (starts from AB+ values).',
    intensities: p([90, 90, 90, 95, 2, 2, 3, 30, 20]),
    rampUpMinutes: 60,
    rampDownMinutes: 60,
  },
];

export const RECOMMENDED_PRESET: Record<CoralCategoryKey, string> = {
  SPS: 'SPS',
  LPS: 'LPS',
  SOFT: 'SOFT',
  MIXED_REEF: 'AB_PLUS',
  FISH_ONLY: 'FISH_ONLY',
  ANEMONE: 'LPS',
};

export const AB_PLUS = PRESETS[0].intensities;
