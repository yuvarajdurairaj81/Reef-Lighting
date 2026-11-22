import { Router } from 'express';
import { CHANNEL_KEYS, ChannelIntensities } from '../../domain/channels';
import { estimatePower } from '../../domain/power';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { ah } from '../../middleware/common';
import { deviceWattages, getTankLighting } from '../lighting/lighting.service';

export const dashboardRouter = Router();

function currentMode(intensities: ChannelIntensities | null): string {
  if (!intensities) return 'Unknown';
  const nonMoon = CHANNEL_KEYS.filter((k) => k !== 'MOONLIGHT').reduce((s, k) => s + intensities[k], 0);
  if (nonMoon === 0 && intensities.MOONLIGHT > 0) return 'Moonlight';
  if (nonMoon === 0) return 'Off';
  return 'Daylight';
}

/**
 * GET /dashboard?tankId=…&deviceId=…
 * Organization-wide counts + a focused view of one tank (defaults to the first).
 */
dashboardRouter.get('/', requirePermission('tank:read'), ah(async (req, res) => {
  const orgId = req.tenant!.organizationId;
  const [tanks, devices, alerts, sites] = await Promise.all([
    prisma.tank.findMany({ where: { site: { organizationId: orgId } }, select: { id: true, name: true, siteId: true, coralCategory: true }, orderBy: { createdAt: 'asc' } }),
    prisma.device.findMany({ where: { organizationId: orgId }, include: { channels: true }, orderBy: { createdAt: 'asc' } }),
    prisma.alert.findMany({ where: { organizationId: orgId, status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.site.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
  ]);

  const activeProfiles = await prisma.tankProfileAssignment.findMany({
    where: { tank: { site: { organizationId: orgId } } },
    distinct: ['profileId'],
    select: { profileId: true },
  });

  let tankId = typeof req.query.tankId === 'string' ? req.query.tankId : undefined;
  if (!tankId && typeof req.query.deviceId === 'string') tankId = devices.find((d) => d.id === req.query.deviceId)?.tankId ?? undefined;
  tankId = tankId ?? tanks[0]?.id;

  let focus = null;
  if (tankId) {
    const l = await getTankLighting(tankId, orgId);
    const tankDevices = devices.filter((d) => d.tankId === tankId);
    const primary = tankDevices.find((d) => d.id === req.query.deviceId) ?? tankDevices[0];
    const reported = (primary?.reportedState ?? null) as ChannelIntensities | null;
    const intensities = reported ?? l.effective;
    const lastTelemetry = primary
      ? await prisma.deviceTelemetry.findFirst({ where: { deviceId: primary.id }, orderBy: { recordedAt: 'desc' } })
      : null;
    const power = estimatePower(intensities, primary ? deviceWattages(primary.channels) : undefined);
    if (lastTelemetry?.powerIsMeasured && lastTelemetry.powerWatts != null) {
      power.estimatedWatts = lastTelemetry.powerWatts;
      power.isMeasured = true;
    }
    focus = {
      tank: { id: l.tank.id, name: l.tank.name, siteName: l.tank.site.name, coralCategory: l.tank.coralCategory },
      device: primary
        ? { id: primary.id, name: primary.name, status: primary.status, isSimulated: primary.isSimulated, firmwareVersion: primary.firmwareVersion, lastSeenAt: primary.lastSeenAt, syncStatus: primary.syncStatus, lastSyncedAt: primary.lastSyncedAt }
        : null,
      profile: { id: l.profile.id, name: l.profile.name, version: l.profile.version },
      intensities,
      intensitiesSource: reported ? 'controller' : 'configured',
      mode: currentMode(intensities),
      power,
      health: !primary ? 'NO_DEVICE' : primary.status !== 'ONLINE' ? 'OFFLINE' : primary.syncStatus === 'FAILED' ? 'DEGRADED' : 'HEALTHY',
      temperatureC: lastTelemetry?.temperatureC ?? null,
    };
  }

  const online = devices.filter((d) => d.status === 'ONLINE').length;
  const lastSync = devices.map((d) => d.lastSyncedAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;

  res.json({
    organizationType: req.tenant!.organizationType,
    totals: {
      tanks: tanks.length,
      sites: sites.length,
      devices: devices.length,
      connected: online,
      offline: devices.length - online,
      activeProfiles: activeProfiles.length,
      openAlerts: alerts.length,
      simulatedDevices: devices.filter((d) => d.isSimulated).length,
    },
    lastSyncAt: lastSync,
    alerts,
    tanks,
    devices: devices.map((d) => ({ id: d.id, name: d.name, tankId: d.tankId, status: d.status, isSimulated: d.isSimulated })),
    // Enterprise roll-up by site
    sites: req.tenant!.organizationType === 'ENTERPRISE'
      ? sites.map((s) => {
          const siteTanks = tanks.filter((t) => t.siteId === s.id).map((t) => t.id);
          const siteDevices = devices.filter((d) => d.tankId && siteTanks.includes(d.tankId));
          return { ...s, tanks: siteTanks.length, devices: siteDevices.length, offline: siteDevices.filter((d) => d.status !== 'ONLINE').length };
        })
      : undefined,
    focus,
  });
}));

/** Energy history for charts (from telemetry). */
dashboardRouter.get('/energy', requirePermission('device:read'), ah(async (req, res) => {
  const orgId = req.tenant!.organizationId;
  const since = new Date(Date.now() - 7 * 86400_000);
  const rows = await prisma.deviceTelemetry.findMany({
    where: { device: { organizationId: orgId }, recordedAt: { gte: since }, ...(req.query.deviceId ? { deviceId: String(req.query.deviceId) } : {}) },
    select: { deviceId: true, recordedAt: true, powerWatts: true, powerIsMeasured: true },
    orderBy: { recordedAt: 'asc' },
    take: 2000,
  });
  res.json({ points: rows });
}));
