import { env } from '../config/env';
import { DeviceAdapter } from './DeviceAdapter';
import { SimulatedDeviceAdapter } from './SimulatedDeviceAdapter';
import { BleDeviceAdapter, MqttDeviceAdapter, WifiDeviceAdapter } from './stubAdapters';

let adapter: DeviceAdapter | null = null;

export function getDeviceAdapter(): DeviceAdapter {
  if (!adapter) {
    switch (env.IOT_ADAPTER) {
      case 'ble':
        adapter = new BleDeviceAdapter();
        break;
      case 'wifi':
        adapter = new WifiDeviceAdapter();
        break;
      case 'mqtt':
        adapter = new MqttDeviceAdapter();
        break;
      default:
        adapter = new SimulatedDeviceAdapter({ failureRate: env.SIM_FAILURE_RATE, latencyMs: env.isTest ? 0 : 250 });
    }
  }
  return adapter;
}

/** Test hook */
export function setDeviceAdapter(a: DeviceAdapter) {
  adapter = a;
}

export * from './DeviceAdapter';
