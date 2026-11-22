import { Prisma } from '@prisma/client';
import { CHANNEL_KEYS, ChannelIntensities, ChannelKey, ChannelWattages, DEFAULT_WATTAGES } from '../../domain/channels';
import { estimatePower } from '../../domain/power';
import { intensitiesSchema } from '../../domain/validation';
import { badRequest, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { getDeviceAdapter, DeviceAdapterError } from '../../iot';
import { audit } from '../audit/audit.service';
import { findTankInTenant } from '../tenancy/guards';

export interface DesiredState {
  intensities: ChannelIntensities;
  profileId: string;
  profileName: string;
  profileVersion: number;
  rampUpMinutes: number;
  rampDownMinutes: number;
  updatedAt: string;
}

export const channelsToIntensities = (rows: { channelKey: string; intensity: number }[]): ChannelIntensities =>
  Object.fromEntries(CHANNEL_KEYS.map((k) => [k, rows.find((r) => r.channelKey === k)?.intensity ?? 0])) as ChannelIntensities;

export const deviceWattages = (channels: { channelKey: string; maxWattage: number }[]): ChannelWattages =>
  Object.fromEntries(
    CHANNEL_KEYS.map((k) => [k, channels.find((c) => c.channelKey === k)?.maxWattage ?? DEFAULT_WATTAGES[k]]),
  ) as ChannelWattages;

/** Profiles a tenant can see: built-in presets, its own, and ones shared with the user. */
export const visibleProfilesWhere = (organizationId: string, userId: string): Prisma.LightingProfileWhereInput => ({
  OR: [{ visibility: 'SYSTEM' }, { organizationId }, { shares: { some: { sharedWithId: userId } } }],
});

export async function loadVersion(profileId: string, version?: number) {
  const v = await prisma.profileVersion.findFirst({
    where: { profileId, ...(version ? { version } : {}) },
    orderBy: { version: 'desc' },
    include: { channels: true, profile: true },
  });
  if (!v) throw notFound('Profile version');
  return v;
}

/** Effective config = assigned profile version (pinned or latest) + per-tank overrides. */
export async function getTankLighting(tankId: string, organizationId: string) {
  const tank = await findTankInTenant(tankId, organizationId);
  const assignment = await prisma.tankProfileAssignment.findUnique({ where: { tankId } });
  if (!assignment) throw notFound('Lighting assignment');
  const version = assignment.pinnedVersionId
    ? await prisma.profileVersion.findUniqueOrThrow({ where: { id: assignment.pinnedVersionId }, include: { channels: true, profile: true } })
    : await loadVersion(assignment.profileId);
  const base = channelsToIntensities(version.channels);
  const overrides = (assignment.overrides ?? {}) as Partial<ChannelIntensities>;
  const effective = { ...base, ...overrides } as ChannelIntensities;

  const devices = await prisma.device.findMany({
    where: { tankId, organizationId },
    include: { channels: true },
    orderBy: { createdAt: 'asc' },
  });
  const sharedTankCount = await prisma.tankProfileAssignment.count({ where: { profileId: assignment.profileId } });

  return {
    tank,
    profile: { ...version.profile, version: version.version, rampUpMinutes: version.rampUpMinutes, rampDownMinutes: version.rampDownMinutes },
    pinnedVersion: assignment.pinnedVersionId ? version.version : null,
    sharedTankCount,
    baseIntensities: base,
    overrides,
    effective,
    devices: devices.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      isSimulated: d.isSimulated,
      syncStatus: d.syncStatus,
      lastSyncedAt: d.lastSyncedAt,
      firmwareVersion: d.firmwareVersion,
      reportedState: d.reportedState,
      wattages: deviceWattages(d.channels),
      power: estimatePower(effective, deviceWattages(d.channels)),
    })),
    version,
  };
}

const diffOverrides = (base: ChannelIntensities, wanted: ChannelIntensities) => {
  const o: Partial<Record<ChannelKey, number>> = {};
  for (const k of CHANNEL_KEYS) if (base[k] !== wanted[k]) o[k] = wanted[k];
  return o;
};

/** Marks every device on the tank as needing a sync with the new desired state. */
async function markDevicesPending(tankId: string) {
  const devices = await prisma.device.findMany({ where: { tankId }, select: { id: true, organizationId: true } });
  if (!devices.length) return;
  const lighting = await getTankLighting(tankId, devices[0].organizationId);
  const desired: DesiredState = {
    intensities: lighting.effective,
    profileId: lighting.profile.id,
    profileName: lighting.profile.name,
    profileVersion: lighting.profile.version,
    rampUpMinutes: lighting.profile.rampUpMinutes,
    rampDownMinutes: lighting.profile.rampDownMinutes,
    updatedAt: new Date().toISOString(),
  };
  await prisma.device.updateMany({
    where: { tankId },
    data: { desiredState: desired as unknown as Prisma.InputJsonValue, syncStatus: 'PENDING', activeProfileVersionId: lighting.version.id },
  });
}

/**
 * "Save Configuration": selects the profile for the tank and stores channel
 * values that differ from the profile as per-tank overrides. Does NOT push to hardware.
 */
export async function saveTankLighting(
  tankId: string,
  organizationId: string,
  userId: string,
  input: { profileId: string; intensities?: ChannelIntensities },
) {
  await findTankInTenant(tankId, organizationId);
  const profile = await prisma.lightingProfile.findFirst({ where: { id: input.profileId, ...visibleProfilesWhere(organizationId, userId) } });
  if (!profile) throw notFound('Lighting profile');
  const latest = await loadVersion(profile.id);
  const base = channelsToIntensities(latest.channels);
  const overrides = input.intensities ? diffOverrides(base, intensitiesSchema.parse(input.intensities)) : {};

  await prisma.tankProfileAssignment.upsert({
    where: { tankId },
    create: { tankId, profileId: profile.id, overrides: overrides as Prisma.InputJsonValue },
    update: { profileId: profile.id, pinnedVersionId: null, overrides: overrides as Prisma.InputJsonValue },
  });
  await markDevicesPending(tankId);
  await audit({ action: 'lighting.save', userId, organizationId, entityType: 'Tank', entityId: tankId, metadata: { profileId: profile.id, overrides } });
  return getTankLighting(tankId, organizationId);
}

/**
 * "Apply Configuration": validates, then pushes to every controller on the
 * tank. The controller stores the profile locally so it keeps running offline.
 */
export async function applyTankLighting(tankId: string, organizationId: string, userId: string) {
  const lighting = await getTankLighting(tankId, organizationId);
  if (!lighting.devices.length) throw badRequest('No controller is assigned to this tank. Add one on the Devices page.');
  const check = intensitiesSchema.safeParse(lighting.effective);
  if (!check.success) throw badRequest('Configuration failed validation; nothing was sent to the device.', check.error.flatten());

  await markDevicesPending(tankId);
  const adapter = getDeviceAdapter();
  const results = [];
  for (const d of await prisma.device.findMany({ where: { tankId, organizationId } })) {
    try {
      const r = await adapter.applyConfiguration(d.hardwareId, {
        intensities: check.data,
        profileName: lighting.profile.name,
        profileVersion: lighting.profile.version,
        rampUpMinutes: lighting.profile.rampUpMinutes,
        rampDownMinutes: lighting.profile.rampDownMinutes,
      });
      await prisma.device.update({
        where: { id: d.id },
        data: { reportedState: r.reported as unknown as Prisma.InputJsonValue, syncStatus: 'SYNCED', lastSyncedAt: new Date(r.appliedAt), lastSeenAt: new Date(), status: 'ONLINE' },
      });
      await prisma.deviceTelemetry.create({
        data: { deviceId: d.id, intensities: r.reported as unknown as Prisma.InputJsonValue, powerWatts: lighting.devices.find((x) => x.id === d.id)?.power.estimatedWatts, powerIsMeasured: false },
      });
      results.push({ deviceId: d.id, name: d.name, ok: true, syncStatus: 'SYNCED' as const, storedOnDevice: r.storedOnDevice });
    } catch (e) {
      const offline = e instanceof DeviceAdapterError && e.code === 'DEVICE_OFFLINE';
      await prisma.device.update({
        where: { id: d.id },
        data: { syncStatus: offline ? 'PENDING' : 'FAILED', status: offline ? 'OFFLINE' : d.status },
      });
      await prisma.alert.create({
        data: {
          organizationId,
          deviceId: d.id,
          severity: offline ? 'WARNING' : 'CRITICAL',
          code: offline ? 'DEVICE_OFFLINE' : 'APPLY_FAILED',
          message: `${d.name}: ${(e as Error).message}`,
        },
      });
      results.push({ deviceId: d.id, name: d.name, ok: false, syncStatus: offline ? ('PENDING' as const) : ('FAILED' as const), error: (e as Error).message });
    }
  }
  await audit({ action: 'lighting.apply', userId, organizationId, entityType: 'Tank', entityId: tankId, metadata: { results } });
  return { results, lighting: await getTankLighting(tankId, organizationId) };
}

export { markDevicesPending };
