import { AB_PLUS, ChannelIntensities } from '../domain/channels';
import {
  ApplyPayload,
  ApplyResult,
  DeviceAdapter,
  DeviceAdapterError,
  DeviceStatusReport,
  DiscoveredDevice,
  ProvisioningResult,
  ProvisioningStep,
  WifiCredentials,
} from './DeviceAdapter';

interface SimDevice {
  info: DiscoveredDevice;
  connected: boolean;
  online: boolean;
  provisioned: boolean;
  ssid?: string;
  ipAddress?: string;
  intensities: ChannelIntensities;
  lastSeenAt: Date;
}

export interface SimulatorOptions {
  /** 0..1 chance that any operation fails, for exercising error paths */
  failureRate?: number;
  /** artificial latency per step (ms) */
  latencyMs?: number;
  random?: () => number;
}

/**
 * In-memory controller simulator. Clearly reports `simulated: true` on every
 * device so the UI can label it — this is NOT real hardware communication.
 *
 * Built-in test hooks:
 *  - SSID "fail-network"   → network join fails
 *  - password "wrongpass"  → Wi-Fi authentication fails
 *  - hardwareId ending "-OFFLINE" → device goes offline after provisioning
 */
export class SimulatedDeviceAdapter implements DeviceAdapter {
  readonly kind = 'SIMULATED' as const;
  readonly isSimulated = true;
  private devices = new Map<string, SimDevice>();
  private readonly failureRate: number;
  private readonly latencyMs: number;
  private readonly random: () => number;

  constructor(opts: SimulatorOptions = {}) {
    this.failureRate = opts.failureRate ?? 0;
    this.latencyMs = opts.latencyMs ?? 0;
    this.random = opts.random ?? Math.random;
    this.seed();
  }

  private seed() {
    const mk = (suffix: string, name: string, rssi: number): SimDevice => ({
      info: {
        hardwareId: `SIM-REEF9-${suffix}`,
        name,
        model: 'Reef9 Controller (Simulated)',
        rssi,
        firmwareVersion: 'sim-1.4.2',
        simulated: true,
      },
      connected: false,
      online: false,
      provisioned: false,
      intensities: { ...AB_PLUS },
      lastSeenAt: new Date(),
    });
    for (const d of [mk('A1B2', 'Reef9-A1B2', -48), mk('C3D4', 'Reef9-C3D4', -63), mk('E5F6-OFFLINE', 'Reef9-E5F6', -80)]) {
      this.devices.set(d.info.hardwareId, d);
    }
  }

  private async tick() {
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  private maybeFail(code: DeviceAdapterError['code'], msg: string) {
    if (this.failureRate > 0 && this.random() < this.failureRate) throw new DeviceAdapterError(code, msg);
  }

  /** Lets tests and the seed script create devices on demand. */
  ensureDevice(hardwareId: string): SimDevice {
    let d = this.devices.get(hardwareId);
    if (!d) {
      d = {
        info: { hardwareId, name: hardwareId, model: 'Reef9 Controller (Simulated)', rssi: -55, firmwareVersion: 'sim-1.4.2', simulated: true },
        connected: true,
        online: !hardwareId.endsWith('-OFFLINE'),
        provisioned: true,
        intensities: { ...AB_PLUS },
        lastSeenAt: new Date(),
      };
      this.devices.set(hardwareId, d);
    }
    return d;
  }

  private get(hardwareId: string): SimDevice {
    // Controllers already registered in the database survive API restarts:
    // any SIM-* id the simulator doesn't know yet is re-created as a provisioned device.
    const d = this.devices.get(hardwareId) ?? (hardwareId.startsWith('SIM-') ? this.ensureDevice(hardwareId) : undefined);
    if (!d) throw new DeviceAdapterError('DEVICE_NOT_FOUND', `No controller with id ${hardwareId} is in range`);
    return d;
  }

  async isBluetoothAvailable() {
    await this.tick();
    return true;
  }

  async scan(): Promise<DiscoveredDevice[]> {
    await this.tick();
    return [...this.devices.values()].filter((d) => !d.provisioned).map((d) => ({ ...d.info }));
  }

  async connect(hardwareId: string) {
    await this.tick();
    const d = this.get(hardwareId);
    this.maybeFail('CONNECTION_FAILED', 'Bluetooth pairing timed out. Move closer to the controller and retry.');
    d.connected = true;
    return { connected: true, firmwareVersion: d.info.firmwareVersion };
  }

  async provisionWifi(hardwareId: string, creds: WifiCredentials): Promise<ProvisioningResult> {
    const steps: ProvisioningStep[] = [];
    const push = (step: ProvisioningStep['step'], ok: boolean, message: string) =>
      steps.push({ step, ok, message, at: new Date().toISOString() });
    const fail = (code: string, message: string): ProvisioningResult => ({ success: false, steps, error: { code, message } });

    push('BLUETOOTH_CHECK', true, 'Bluetooth is enabled (simulated)');
    const d = this.devices.get(hardwareId);
    if (!d) {
      push('DEVICE_AVAILABLE', false, 'Controller not found');
      return fail('DEVICE_NOT_FOUND', 'Controller is not in range or is powered off.');
    }
    push('DEVICE_AVAILABLE', true, `${d.info.name} found (RSSI ${d.info.rssi} dBm)`);
    if (!d.connected) {
      push('BLE_CONNECTED', false, 'Not paired');
      return fail('CONNECTION_FAILED', 'Connect to the controller over Bluetooth first.');
    }
    push('BLE_CONNECTED', true, 'Secure BLE session established');

    await this.tick();
    if (!creds.ssid.trim() || creds.ssid.length > 32) {
      push('WIFI_VALIDATED', false, 'Invalid SSID');
      return fail('WIFI_INVALID', 'SSID must be 1–32 characters.');
    }
    if (creds.password.length < 8 || creds.password.length > 63) {
      push('WIFI_VALIDATED', false, 'Invalid password length');
      return fail('WIFI_INVALID', 'WPA2/WPA3 passwords must be 8–63 characters.');
    }
    push('WIFI_VALIDATED', true, 'Credentials format valid');

    await this.tick();
    if (creds.password === 'wrongpass') {
      push('NETWORK_JOINED', false, 'Authentication rejected by access point');
      return fail('WIFI_AUTH_FAILED', `The controller could not join "${creds.ssid}": wrong password.`);
    }
    if (creds.ssid === 'fail-network') {
      push('NETWORK_JOINED', false, 'Access point not reachable');
      return fail('NETWORK_UNREACHABLE', `Network "${creds.ssid}" was not found. Controllers support 2.4 GHz networks only.`);
    }
    try {
      this.maybeFail('NETWORK_UNREACHABLE', 'Simulated random network failure');
    } catch (e) {
      push('NETWORK_JOINED', false, (e as Error).message);
      return fail('NETWORK_UNREACHABLE', (e as Error).message);
    }
    d.ssid = creds.ssid;
    d.ipAddress = `192.168.1.${100 + Math.floor(this.random() * 100)}`;
    push('NETWORK_JOINED', true, `Joined "${creds.ssid}" with IP ${d.ipAddress}`);

    await this.tick();
    d.provisioned = true;
    d.online = !hardwareId.endsWith('-OFFLINE');
    d.lastSeenAt = new Date();
    push('CLOUD_REACHABLE', true, 'Controller reached the cloud service (simulated)');
    return { success: true, steps, ipAddress: d.ipAddress, firmwareVersion: d.info.firmwareVersion };
  }

  async getStatus(hardwareId: string): Promise<DeviceStatusReport> {
    await this.tick();
    const d = this.get(hardwareId);
    if (d.online) d.lastSeenAt = new Date();
    return {
      online: d.online,
      firmwareVersion: d.info.firmwareVersion,
      lastSeenAt: d.lastSeenAt.toISOString(),
      intensities: { ...d.intensities },
      measuredPowerWatts: null, // simulator has no power sensor → UI shows estimate
      temperatureC: d.online ? 38 + Math.round(this.random() * 40) / 10 : null,
      rssi: d.online ? d.info.rssi : null,
    };
  }

  async applyConfiguration(hardwareId: string, payload: ApplyPayload): Promise<ApplyResult> {
    await this.tick();
    const d = this.get(hardwareId);
    if (!d.online) throw new DeviceAdapterError('DEVICE_OFFLINE', 'Controller is offline. The change is queued and will sync when it reconnects.');
    this.maybeFail('APPLY_FAILED', 'Controller rejected the configuration (simulated failure).');
    d.intensities = { ...payload.intensities };
    d.lastSeenAt = new Date();
    return { acknowledged: true, appliedAt: d.lastSeenAt.toISOString(), reported: { ...d.intensities }, storedOnDevice: true };
  }

  async disconnect(hardwareId: string) {
    const d = this.devices.get(hardwareId);
    if (d) {
      d.connected = false;
      d.provisioned = false;
      d.online = false;
    }
  }

  /** Test/demo helper: flip a device on- or offline. */
  setOnline(hardwareId: string, online: boolean) {
    this.ensureDevice(hardwareId).online = online;
  }
}
