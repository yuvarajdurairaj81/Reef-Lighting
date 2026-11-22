import { AB_PLUS, CHANNELS, DEFAULT_WATTAGES, clampIntensity, estimatePower, validateIntensities } from '../src/domain/channels';

describe('frontend lighting domain (mirrors backend)', () => {
  it('has the nine channels in spec order', () => {
    expect(CHANNELS.map((c) => c.label)).toEqual(['Ultraviolet (UV)', 'Violet', 'Royal Blue', 'Blue', 'Green', 'Yellow', 'Red', 'White', 'Moon Light']);
  });
  it('AB+ and default wattages match the specification', () => {
    expect(AB_PLUS).toEqual({ UV: 90, VIOLET: 90, ROYAL_BLUE: 90, BLUE: 95, GREEN: 2, YELLOW: 2, RED: 3, WHITE: 30, MOONLIGHT: 20 });
    expect(DEFAULT_WATTAGES).toEqual({ UV: 15, VIOLET: 15, ROYAL_BLUE: 20, BLUE: 20, GREEN: 10, YELLOW: 10, RED: 10, WHITE: 25, MOONLIGHT: 5 });
  });
  it('estimates AB+ at 73.2 W of 130 W', () => {
    expect(estimatePower(AB_PLUS)).toMatchObject({ estimatedWatts: 73.2, maxWatts: 130 });
  });
  it('clamps manual entry to 0–100 integers', () => {
    expect(clampIntensity(150)).toBe(100);
    expect(clampIntensity(-5)).toBe(0);
    expect(clampIntensity(42.6)).toBe(43);
    expect(clampIntensity(NaN)).toBe(0);
  });
  it('validates before sending to a device', () => {
    expect(validateIntensities(AB_PLUS)).toEqual([]);
    expect(validateIntensities({ ...AB_PLUS, RED: 101 })[0]).toMatch(/Red/);
  });
});
