import { CHANNEL_KEYS, ChannelKey, PRESETS } from '../../domain/channels';

/**
 * Minimal rule-based intent parser — the extension point for a future voice
 * assistant (Alexa skill, Google Assistant action, Siri Shortcut, or an LLM).
 * Whatever produces the intent, execution always goes through the
 * propose → confirm flow in voice.routes.ts.
 */
export type VoiceIntent =
  | { type: 'SET_CHANNEL'; channel: ChannelKey; intensity: number }
  | { type: 'APPLY_PRESET'; presetKey: string }
  | { type: 'ALL_OFF' }
  | { type: 'STATUS' }
  | { type: 'UNKNOWN'; utterance: string };

const CHANNEL_ALIASES: [RegExp, ChannelKey][] = [
  [/\broyal\s*blue\b/, 'ROYAL_BLUE'],
  [/\b(uv|ultra\s*violet)\b/, 'UV'],
  [/\bviolet\b/, 'VIOLET'],
  [/\bblue\b/, 'BLUE'],
  [/\bgreen\b/, 'GREEN'],
  [/\byellow\b/, 'YELLOW'],
  [/\bred\b/, 'RED'],
  [/\bwhite\b/, 'WHITE'],
  [/\bmoon\s*light\b|\bmoon\b/, 'MOONLIGHT'],
];

export function parseIntent(raw: string): VoiceIntent {
  const u = raw.toLowerCase().trim();
  if (/\b(status|how are|what('s| is) (the )?(light|lighting))\b/.test(u)) return { type: 'STATUS' };
  if (/\b(turn|switch) (off|out) (all )?(the )?lights?\b|\blights? off\b/.test(u)) return { type: 'ALL_OFF' };

  const preset = PRESETS.find((p) => new RegExp(`\\b${p.name.toLowerCase().replace('+', '\\+')}(?![\\w+])`).test(u) || u.includes(p.key.toLowerCase().replace('_', ' ')));
  if (/\b(apply|use|switch to|set)\b.*\b(profile|preset|mode)\b|\bab\+/.test(u) && preset) {
    return { type: 'APPLY_PRESET', presetKey: preset.key };
  }

  const pct = u.match(/(\d{1,3})\s*(%|percent)?/);
  const channel = CHANNEL_ALIASES.find(([re]) => re.test(u))?.[1];
  if (channel && pct) {
    const intensity = Number(pct[1]);
    if (intensity >= 0 && intensity <= 100) return { type: 'SET_CHANNEL', channel, intensity };
  }
  return { type: 'UNKNOWN', utterance: raw };
}

export const describeIntent = (i: VoiceIntent): string => {
  switch (i.type) {
    case 'SET_CHANNEL':
      return `Set ${i.channel.replace('_', ' ').toLowerCase()} to ${i.intensity}%`;
    case 'APPLY_PRESET':
      return `Apply the ${PRESETS.find((p) => p.key === i.presetKey)?.name} profile`;
    case 'ALL_OFF':
      return 'Turn all channels off (0%)';
    case 'STATUS':
      return 'Read current lighting status';
    default:
      return 'Unrecognized command';
  }
};

export const isMutating = (i: VoiceIntent) => i.type === 'SET_CHANNEL' || i.type === 'APPLY_PRESET' || i.type === 'ALL_OFF';
export { CHANNEL_KEYS };
