import type { ChannelIntensities } from '../domain/channels';

/**
 * Transport-agnostic contract for talking to a reef LED controller.
 *
 * Implementations:
 *  - SimulatedDeviceAdapter  (implemented — used by this release)
 *  - BleDeviceAdapter        (interface stub — BLE GATT provisioning)
 *  - WifiDeviceAdapter       (interface stub — local LAN HTTP/mDNS)
 *  - MqttDeviceAdapter       (interface stub — cloud sync, Phase 5)
 *
 * Note: in production, Bluetooth discovery and Wi-Fi provisioning happen
 * *between the user's phone/browser and the controller* (Web Bluetooth or a
 * native app). The server-side adapter receives the results and handles
 * registration, configuration pushes and telemetry.
 */

export type TransportKind = 'SIMULATED' | 'BLE' | 'WIFI' | 'MQTT';

export interface DiscoveredDevice {
  hardwareId: string;
  name: string;
  model: string;
  rssi: number;
  firmwareVersion: string;
  simulated: boolean;
}

export interface WifiCredentials {
  ssid: string;
  password: string; // used once for provisioning, never persisted
}

export interface ProvisioningStep {
  step: 'BLUETOOTH_CHECK' | 'DEVICE_AVAILABLE' | 'BLE_CONNECTED' | 'WIFI_VALIDATED' | 'NETWORK_JOINED' | 'CLOUD_REACHABLE';
  ok: boolean;
  message: string;
  at: string;
}

export interface ProvisioningResult {
  success: boolean;
  steps: ProvisioningStep[];
  ipAddress?: string;
  firmwareVersion?: string;
  error?: { code: string; message: string };
}

export interface DeviceStatusReport {
  online: boolean;
  firmwareVersion: string;
  lastSeenAt: string;
  intensities: ChannelIntensities | null;
  measuredPowerWatts: number | null; // null => not available, show estimate instead
  temperatureC: number | null;
  rssi: number | null;
}

export interface ApplyPayload {
  intensities: ChannelIntensities;
  profileName?: string;
  profileVersion?: number;
  rampUpMinutes?: number;
  rampDownMinutes?: number;
}

export interface ApplyResult {
  acknowledged: boolean;
  appliedAt: string;
  reported: ChannelIntensities;
  storedOnDevice: boolean; // controller persisted it to flash => survives offline
}

export interface DeviceAdapter {
  readonly kind: TransportKind;
  readonly isSimulated: boolean;
  isBluetoothAvailable(): Promise<boolean>;
  scan(): Promise<DiscoveredDevice[]>;
  connect(hardwareId: string): Promise<{ connected: boolean; firmwareVersion: string }>;
  provisionWifi(hardwareId: string, creds: WifiCredentials): Promise<ProvisioningResult>;
  getStatus(hardwareId: string): Promise<DeviceStatusReport>;
  applyConfiguration(hardwareId: string, payload: ApplyPayload): Promise<ApplyResult>;
  disconnect(hardwareId: string): Promise<void>;
}

export class DeviceAdapterError extends Error {
  constructor(
    public readonly code:
      | 'BLUETOOTH_DISABLED'
      | 'DEVICE_NOT_FOUND'
      | 'CONNECTION_FAILED'
      | 'WIFI_INVALID'
      | 'WIFI_AUTH_FAILED'
      | 'NETWORK_UNREACHABLE'
      | 'DEVICE_OFFLINE'
      | 'APPLY_FAILED'
      | 'NOT_IMPLEMENTED',
    message: string,
  ) {
    super(message);
  }
}
