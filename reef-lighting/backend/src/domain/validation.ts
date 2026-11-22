import { z } from 'zod';
import { CHANNEL_KEYS, CORAL_CATEGORIES } from './channels';

export const intensitySchema = z
  .number({ invalid_type_error: 'Intensity must be a number' })
  .int('Intensity must be a whole percentage (1% increments)')
  .min(0, 'Intensity cannot be below 0%')
  .max(100, 'Intensity cannot exceed 100%');

/** All nine channels are required — partial configurations are never sent to a device. */
export const intensitiesSchema = z
  .object(Object.fromEntries(CHANNEL_KEYS.map((k) => [k, intensitySchema])) as Record<
    (typeof CHANNEL_KEYS)[number],
    typeof intensitySchema
  >)
  .strict();

export const partialIntensitiesSchema = intensitiesSchema.partial();

export const wattageSchema = z.number().min(0).max(500);
export const wattagesSchema = z
  .object(Object.fromEntries(CHANNEL_KEYS.map((k) => [k, wattageSchema])) as Record<
    (typeof CHANNEL_KEYS)[number],
    typeof wattageSchema
  >)
  .partial()
  .strict();

export const coralCategorySchema = z.enum(CORAL_CATEGORIES);

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm (24h)');

/** Phase 5 schedule payload — validated and stored now, executed on the controller later. */
export const scheduleSchema = z.object({
  timezone: z.string().min(1).refine(isValidTimeZone, 'Unknown IANA time zone'),
  enabled: z.boolean().default(true),
  channelWindows: z
    .array(z.object({ channelKey: z.enum(CHANNEL_KEYS), onTime: hhmm, offTime: hhmm }))
    .max(CHANNEL_KEYS.length),
  ramps: z
    .array(
      z.object({
        channelKey: z.enum(CHANNEL_KEYS).nullable().default(null),
        type: z.enum(['SUNRISE', 'SUNSET']),
        startTime: hhmm,
        durationMinutes: z.number().int().min(1).max(480),
      }),
    )
    .max(40),
});

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
