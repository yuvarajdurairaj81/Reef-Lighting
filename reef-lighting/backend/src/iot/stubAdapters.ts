import { DeviceAdapter, DeviceAdapterError, TransportKind } from './DeviceAdapter';

/**
 * Placeholders for real hardware transports. They implement the same
 * interface so that swapping IOT_ADAPTER requires no changes elsewhere, but
 * every method throws NOT_IMPLEMENTED — nothing here pretends to talk to hardware.
 *
 * Integration notes for the next phases:
 *  - BLE:  GATT service exposing a provisioning characteristic (Wi-Fi creds,
 *          encrypted with a per-device key from the QR label) and a config
 *          characteristic. Browser side: Web Bluetooth (Chrome/Edge/Android);
 *          iOS Safari has no Web Bluetooth → native app (React Native / Swift).
 *  - WIFI: controller advertises _reef9._tcp via mDNS, exposes a local
 *          HTTPS API signed with a device certificate.
 *  - MQTT: topics  reef/{orgId}/{deviceId}/desired | reported | telemetry,
 *          retained "desired" messages make offline controllers catch up on reconnect.
 */
abstract class NotImplementedAdapter implements DeviceAdapter {
  abstract readonly kind: TransportKind;
  readonly isSimulated = false;
  private async ni(): Promise<never> {
    throw new DeviceAdapterError('NOT_IMPLEMENTED', `${this.kind} transport is not implemented in this release. Set IOT_ADAPTER=simulated.`);
  }
  isBluetoothAvailable(): Promise<boolean> { return this.ni(); }
  scan(): Promise<never> { return this.ni(); }
  connect(): Promise<never> { return this.ni(); }
  provisionWifi(): Promise<never> { return this.ni(); }
  getStatus(): Promise<never> { return this.ni(); }
  applyConfiguration(): Promise<never> { return this.ni(); }
  disconnect(): Promise<void> { return this.ni(); }
}

export class BleDeviceAdapter extends NotImplementedAdapter { readonly kind = 'BLE' as const; }
export class WifiDeviceAdapter extends NotImplementedAdapter { readonly kind = 'WIFI' as const; }
export class MqttDeviceAdapter extends NotImplementedAdapter { readonly kind = 'MQTT' as const; }
