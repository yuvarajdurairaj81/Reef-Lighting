/**
 * Browser-side transport interfaces. Real BLE provisioning in a browser uses
 * Web Bluetooth (Chrome/Edge desktop + Android). iOS Safari does not support
 * Web Bluetooth — iPhone users will onboard through the future native app.
 * This release routes onboarding through the server-side SIMULATED adapter.
 */
export interface BrowserBleSupport {
  apiPresent: boolean;
  adapterAvailable: boolean | null; // null = unknown
  reason?: string;
}

type NavigatorWithBluetooth = Navigator & { bluetooth?: { getAvailability?: () => Promise<boolean> } };

export async function detectWebBluetooth(): Promise<BrowserBleSupport> {
  const nav = navigator as NavigatorWithBluetooth;
  if (!nav.bluetooth) {
    return { apiPresent: false, adapterAvailable: null, reason: 'This browser does not support Web Bluetooth (e.g. Safari/iOS, Firefox).' };
  }
  if (!window.isSecureContext) return { apiPresent: true, adapterAvailable: null, reason: 'Web Bluetooth requires HTTPS.' };
  try {
    const available = (await nav.bluetooth.getAvailability?.()) ?? null;
    return { apiPresent: true, adapterAvailable: available, reason: available === false ? 'Bluetooth appears to be turned off.' : undefined };
  } catch {
    return { apiPresent: true, adapterAvailable: null };
  }
}

/** Planned GATT contract for real controllers (Phase 5 hardware integration). */
export const REEF9_GATT = {
  service: '0000ree9-0000-1000-8000-00805f9b34fb',
  provisioningCharacteristic: 'wifi-credentials (write, encrypted)',
  statusCharacteristic: 'provisioning-status (notify)',
  configCharacteristic: 'lighting-config (write)',
} as const;
