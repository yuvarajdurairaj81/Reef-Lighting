import { AB_PLUS } from '../../src/domain/channels';
import { SimulatedDeviceAdapter } from '../../src/iot/SimulatedDeviceAdapter';
import { DeviceAdapterError } from '../../src/iot/DeviceAdapter';
import { BleDeviceAdapter } from '../../src/iot/stubAdapters';

describe('SimulatedDeviceAdapter', () => {
  let sim: SimulatedDeviceAdapter;
  beforeEach(() => (sim = new SimulatedDeviceAdapter()));

  it('discovers simulated controllers and labels them as simulated', async () => {
    const found = await sim.scan();
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((d) => d.simulated)).toBe(true);
    expect(sim.isSimulated).toBe(true);
  });

  it('runs the full onboarding flow with progress steps', async () => {
    await sim.connect('SIM-REEF9-A1B2');
    const r = await sim.provisionWifi('SIM-REEF9-A1B2', { ssid: 'ReefNet', password: 'correct-horse' });
    expect(r.success).toBe(true);
    expect(r.steps.map((s) => s.step)).toEqual(['BLUETOOTH_CHECK', 'DEVICE_AVAILABLE', 'BLE_CONNECTED', 'WIFI_VALIDATED', 'NETWORK_JOINED', 'CLOUD_REACHABLE']);
    expect((await sim.scan()).find((d) => d.hardwareId === 'SIM-REEF9-A1B2')).toBeUndefined();
  });

  it('requires BLE pairing before Wi-Fi provisioning', async () => {
    const r = await sim.provisionWifi('SIM-REEF9-A1B2', { ssid: 'ReefNet', password: 'correct-horse' });
    expect(r.success).toBe(false);
    expect(r.error?.code).toBe('CONNECTION_FAILED');
  });

  it.each([
    ['short', 'ReefNet', 'WIFI_INVALID'],
    ['wrongpass', 'ReefNet', 'WIFI_AUTH_FAILED'],
    ['long-enough-pw', 'fail-network', 'NETWORK_UNREACHABLE'],
  ])('reports meaningful Wi-Fi errors (password=%s ssid=%s → %s)', async (password, ssid, code) => {
    await sim.connect('SIM-REEF9-C3D4');
    const r = await sim.provisionWifi('SIM-REEF9-C3D4', { ssid, password });
    expect(r.success).toBe(false);
    expect(r.error?.code).toBe(code);
  });

  it('applies and stores configuration on an online controller', async () => {
    sim.ensureDevice('SIM-TEST-1');
    const r = await sim.applyConfiguration('SIM-TEST-1', { intensities: { ...AB_PLUS, BLUE: 40 } });
    expect(r.acknowledged).toBe(true);
    expect(r.storedOnDevice).toBe(true);
    expect((await sim.getStatus('SIM-TEST-1')).intensities?.BLUE).toBe(40);
  });

  it('refuses to apply to an offline controller', async () => {
    sim.ensureDevice('SIM-TEST-OFFLINE');
    await expect(sim.applyConfiguration('SIM-TEST-OFFLINE', { intensities: AB_PLUS })).rejects.toMatchObject({ code: 'DEVICE_OFFLINE' });
  });

  it('honours the configurable failure rate', async () => {
    const flaky = new SimulatedDeviceAdapter({ failureRate: 1, random: () => 0 });
    flaky.ensureDevice('SIM-FLAKY');
    await expect(flaky.applyConfiguration('SIM-FLAKY', { intensities: AB_PLUS })).rejects.toBeInstanceOf(DeviceAdapterError);
  });

  it('real-hardware adapters are explicit stubs, not fake successes', async () => {
    await expect(new BleDeviceAdapter().scan()).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
