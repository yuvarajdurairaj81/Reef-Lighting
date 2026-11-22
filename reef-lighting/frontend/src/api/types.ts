import type { Intensities, Wattages } from '../domain/channels';

export interface User { id: string; email: string; displayName: string; accountType: 'HOME' | 'ENTERPRISE'; emailVerified: boolean; mfaEnabled: boolean }
export interface OrgSummary { id: string; name: string; type: 'PERSONAL' | 'ENTERPRISE'; role: 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER'; isDefault: boolean; siteCount: number; tankCount: number }
export interface Session { accessToken: string; user: User }
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'PROVISIONING' | 'ERROR';
export type SyncStatus = 'NEVER_SYNCED' | 'PENDING' | 'SYNCED' | 'FAILED';

export interface Tank {
  id: string; name: string; volumeLiters: number | null; coralCategory: string;
  site: { id: string; name: string };
  devices: { id: string; name: string; status: DeviceStatus; isSimulated: boolean; syncStatus: SyncStatus }[];
  assignment: { profile: { id: string; name: string; currentVersion: number } } | null;
}

export interface Device {
  id: string; name: string; hardwareId: string; model: string; firmwareVersion: string | null;
  connectionMode: string; isSimulated: boolean; status: DeviceStatus; lastSeenAt: string | null;
  syncStatus: SyncStatus; lastSyncedAt: string | null; tank: { id: string; name: string } | null; maxWatts: number;
}

export interface Profile {
  id: string; name: string; description: string | null; coralCategory: string; visibility: 'PRIVATE' | 'SHARED' | 'SYSTEM';
  isBuiltIn: boolean; presetKey: string | null; currentVersion: number; assignedTankCount: number;
  rampUpMinutes: number; rampDownMinutes: number; intensities: Intensities; updatedAt: string;
}

export interface TankLighting {
  tank: { id: string; name: string; coralCategory: string; site: { name: string } };
  profile: { id: string; name: string; version: number; isBuiltIn: boolean; organizationId: string | null; rampUpMinutes: number; rampDownMinutes: number; coralCategory: string };
  pinnedVersion: number | null; sharedTankCount: number;
  baseIntensities: Intensities; overrides: Partial<Intensities>; effective: Intensities;
  devices: { id: string; name: string; status: DeviceStatus; isSimulated: boolean; syncStatus: SyncStatus; lastSyncedAt: string | null; firmwareVersion: string | null; wattages: Wattages; power: { estimatedWatts: number; maxWatts: number } }[];
}

export interface AlertItem { id: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'; code: string; message: string; createdAt: string; device?: { id: string; name: string } | null }

export interface Dashboard {
  organizationType: 'PERSONAL' | 'ENTERPRISE';
  totals: { tanks: number; sites: number; devices: number; connected: number; offline: number; activeProfiles: number; openAlerts: number; simulatedDevices: number };
  lastSyncAt: string | null;
  alerts: AlertItem[];
  tanks: { id: string; name: string; siteId: string; coralCategory: string }[];
  devices: { id: string; name: string; tankId: string | null; status: DeviceStatus; isSimulated: boolean }[];
  sites?: { id: string; name: string; tanks: number; devices: number; offline: number }[];
  focus: null | {
    tank: { id: string; name: string; siteName: string; coralCategory: string };
    device: null | { id: string; name: string; status: DeviceStatus; isSimulated: boolean; firmwareVersion: string | null; lastSeenAt: string | null; syncStatus: SyncStatus; lastSyncedAt: string | null };
    profile: { id: string; name: string; version: number };
    intensities: Intensities; intensitiesSource: 'controller' | 'configured'; mode: string;
    power: { estimatedWatts: number; maxWatts: number; isMeasured: boolean; perChannel: Record<string, { watts: number; maxWatts: number }> };
    health: 'HEALTHY' | 'DEGRADED' | 'OFFLINE' | 'NO_DEVICE'; temperatureC: number | null;
  };
}
