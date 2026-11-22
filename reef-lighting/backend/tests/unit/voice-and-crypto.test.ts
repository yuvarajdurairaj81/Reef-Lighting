import { decrypt, encrypt, sha256 } from '../../src/lib/crypto';
import { isMutating, parseIntent } from '../../src/modules/voice/intentParser';
import { hasPermission } from '../../src/domain/permissions';

describe('voice intent parser', () => {
  it.each([
    ['set blue to 60 percent', { type: 'SET_CHANNEL', channel: 'BLUE', intensity: 60 }],
    ['Set royal blue 45%', { type: 'SET_CHANNEL', channel: 'ROYAL_BLUE', intensity: 45 }],
    ['moonlight to 10', { type: 'SET_CHANNEL', channel: 'MOONLIGHT', intensity: 10 }],
    ['apply the SPS profile', { type: 'APPLY_PRESET', presetKey: 'SPS' }],
    ['switch to AB+ preset', { type: 'APPLY_PRESET', presetKey: 'AB_PLUS' }],
    ['turn off the lights', { type: 'ALL_OFF' }],
    ["what's the lighting status", { type: 'STATUS' }],
  ])('"%s"', (utterance, expected) => {
    expect(parseIntent(utterance)).toEqual(expected);
  });

  it('rejects out-of-range values and unknown phrases', () => {
    expect(parseIntent('set blue to 150').type).toBe('UNKNOWN');
    expect(parseIntent('feed the fish').type).toBe('UNKNOWN');
  });

  it('marks device-changing intents as requiring confirmation', () => {
    expect(isMutating(parseIntent('set red to 5'))).toBe(true);
    expect(isMutating(parseIntent('status'))).toBe(false);
  });
});

describe('crypto helpers', () => {
  const key = Buffer.alloc(32, 1).toString('base64');
  it('round-trips AES-GCM and detects tampering', () => {
    const enc = encrypt('JBSWY3DPEHPK3PXP', key);
    expect(decrypt(enc, key)).toBe('JBSWY3DPEHPK3PXP');
    const [iv, tag, data] = enc.split('.');
    const tampered = [iv, tag, Buffer.from('x' + Buffer.from(data, 'base64').toString()).toString('base64')].join('.');
    expect(() => decrypt(tampered, key)).toThrow();
  });
  it('hashes deterministically', () => expect(sha256('a')).toHaveLength(64));
});

describe('RBAC', () => {
  it('viewers cannot apply lighting; operators can', () => {
    expect(hasPermission('VIEWER', 'device:apply')).toBe(false);
    expect(hasPermission('OPERATOR', 'device:apply')).toBe(true);
    expect(hasPermission('OPERATOR', 'users:manage')).toBe(false);
    expect(hasPermission('ADMIN', 'device:wattage')).toBe(true);
  });
});
