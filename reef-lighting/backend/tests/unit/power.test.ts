import { AB_PLUS, CHANNEL_KEYS, DEFAULT_WATTAGES } from '../../src/domain/channels';
import { estimatePower } from '../../src/domain/power';

describe('estimatePower', () => {
  it('default channel wattages total 130W', () => {
    expect(Object.values(DEFAULT_WATTAGES).reduce((a, b) => a + b, 0)).toBe(130);
  });

  it('applies Σ(max × intensity / 100) for the AB+ preset', () => {
    // 15*.9 + 15*.9 + 20*.9 + 20*.95 + 10*.02 + 10*.02 + 10*.03 + 25*.3 + 5*.2 = 73.2
    const r = estimatePower(AB_PLUS);
    expect(r.estimatedWatts).toBe(73.2);
    expect(r.maxWatts).toBe(130);
    expect(r.isMeasured).toBe(false);
    expect(r.perChannel.WHITE).toEqual({ watts: 7.5, maxWatts: 25, intensity: 30 });
  });

  it('respects per-controller wattage overrides', () => {
    const all100 = Object.fromEntries(CHANNEL_KEYS.map((k) => [k, 100])) as typeof AB_PLUS;
    const r = estimatePower(all100, { ...DEFAULT_WATTAGES, WHITE: 50 });
    expect(r.estimatedWatts).toBe(155);
    expect(r.maxWatts).toBe(155);
  });

  it('is 0W when everything is off', () => {
    const off = Object.fromEntries(CHANNEL_KEYS.map((k) => [k, 0])) as typeof AB_PLUS;
    expect(estimatePower(off).estimatedWatts).toBe(0);
  });
});
