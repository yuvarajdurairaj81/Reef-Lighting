import { CHANNEL_KEYS, ChannelIntensities, ChannelKey, ChannelWattages, DEFAULT_WATTAGES } from './channels';

export interface PowerEstimate {
  estimatedWatts: number;
  maxWatts: number;
  perChannel: Record<ChannelKey, { watts: number; maxWatts: number; intensity: number }>;
  /** true only when the controller reports measured power telemetry */
  isMeasured: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Estimated Wattage = Σ (Channel Maximum Wattage × Channel Intensity / 100)
 */
export function estimatePower(
  intensities: ChannelIntensities,
  wattages: ChannelWattages = DEFAULT_WATTAGES,
): PowerEstimate {
  const perChannel = {} as PowerEstimate['perChannel'];
  let total = 0;
  let max = 0;
  for (const key of CHANNEL_KEYS) {
    const maxW = wattages[key] ?? 0;
    const intensity = intensities[key] ?? 0;
    const w = (maxW * intensity) / 100;
    perChannel[key] = { watts: round(w), maxWatts: maxW, intensity };
    total += w;
    max += maxW;
  }
  return { estimatedWatts: round(total), maxWatts: round(max), perChannel, isMeasured: false };
}
