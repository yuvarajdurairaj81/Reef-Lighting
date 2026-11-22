import { AB_PLUS, PRESETS } from '../../src/domain/channels';
import { intensitiesSchema, scheduleSchema } from '../../src/domain/validation';

describe('channel validation', () => {
  it('AB+ matches the specification exactly', () => {
    expect(AB_PLUS).toEqual({ UV: 90, VIOLET: 90, ROYAL_BLUE: 90, BLUE: 95, GREEN: 2, YELLOW: 2, RED: 3, WHITE: 30, MOONLIGHT: 20 });
  });

  it('every preset passes validation', () => {
    for (const p of PRESETS) expect(intensitiesSchema.safeParse(p.intensities).success).toBe(true);
  });

  it.each([
    [{ ...AB_PLUS, UV: 101 }, 'above 100'],
    [{ ...AB_PLUS, RED: -1 }, 'below 0'],
    [{ ...AB_PLUS, BLUE: 50.5 }, 'non-integer'],
  ])('rejects %o (%s)', (value) => {
    expect(intensitiesSchema.safeParse(value).success).toBe(false);
  });

  it('rejects missing or unknown channels', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { MOONLIGHT, ...missing } = AB_PLUS;
    expect(intensitiesSchema.safeParse(missing).success).toBe(false);
    expect(intensitiesSchema.safeParse({ ...AB_PLUS, CYAN: 10 }).success).toBe(false);
  });

  it('validates schedules (time format and IANA time zone)', () => {
    const ok = scheduleSchema.safeParse({
      timezone: 'America/Chicago',
      channelWindows: [{ channelKey: 'BLUE', onTime: '09:00', offTime: '21:00' }],
      ramps: [{ type: 'SUNRISE', startTime: '09:00', durationMinutes: 60 }],
    });
    expect(ok.success).toBe(true);
    expect(scheduleSchema.safeParse({ timezone: 'Mars/Olympus', channelWindows: [], ramps: [] }).success).toBe(false);
    expect(scheduleSchema.safeParse({ timezone: 'UTC', channelWindows: [{ channelKey: 'BLUE', onTime: '25:00', offTime: '21:00' }], ramps: [] }).success).toBe(false);
  });
});
