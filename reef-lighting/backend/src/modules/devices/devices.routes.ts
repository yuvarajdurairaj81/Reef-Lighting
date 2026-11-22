import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { CHANNELS, CHANNEL_KEYS } from '../../domain/channels';
import { estimatePower } from '../../domain/power';
import { wattagesSchema } from '../../domain/validation';
import { getDeviceAdapter } from '../../iot';
import { badRequest, conflict } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { ah, validateBody } from '../../middleware/common';
import { auditFromReq } from '../audit/audit.service';
import { channelsToIntensities, deviceWattages, markDevicesPending } from '../lighting/lighting.service';
import { findDeviceInTenant, findTankInTenant } from '../tenancy/guards';

export const devicesRouter = Router();
const adapter = () => getDeviceAdapter();

// ───────────── Onboarding (discovery → BLE connect → Wi-Fi → register) ─────────────

devicesRouter.get('/onboarding/bluetooth', requirePermission('device:manage'), ah(async (_req, res) => {
  const a = adapter();
  res.json({ available: await a.isBluetoothAvailable(), transport: a.kind, simulated: a.isSimulated });
}));

devicesRouter.post('/onboarding/scan', requirePermission('device:manage'), ah(async (req, res) => {
  const a = adapter();
  const found = await a.scan();
  const registered = await prisma.device.findMany({ where: { hardwareId: { in: found.map((f) => f.hardwareId) } }, select: { hardwareId: true } });
  const taken = new Set(registered.map((r) => r.hardwareId));
  res.json({ simulated: a.isSimulated, devices: found.filter((f) => !taken.has(f.hardwareId)) });
}));

const hardwareIdSchema = z.object({ hardwareId: z.string().trim().min(3).max(64) });

devicesRouter.post('/onboarding/connect', requirePermission('device:manage'), validateBody(hardwareIdSchema), ah(async (req, res) => {
  const r = await adapter().connect(req.body.hardwareId);
  res.json({ ...r, simulated: adapter().isSimulated });
}));

devicesRouter.post(
  '/onboarding/wifi',
  requirePermission('device:manage'),
  validateBody(hardwareIdSchema.extend({ ssid: z.string().trim().min(1).max(32), password: z.string().max(63) })),
  ah(async (req, res) => {
    // The Wi-Fi password is forwarded to the controller once and never stored or logged.
    const result = await adapter().provisionWifi(req.body.hardwareId, { ssid: req.body.ssid, password: req.body.password });
    res.status(result.success ? 200 : 422).json({ ...result, simulated: adapter().isSimulated });
  }),
);

devicesRouter.post(
  '/',
  requirePermission('device:manage'),
  validateBody(hardwareIdSchema.extend({ name: z.string().trim().min(1).max(80), tankId: z.string().uuid().optional(), ssid: z.string().max(32).optional() })),
  ah(async (req, res) => {
    const orgId = req.tenant!.organizationId;
    if (req.body.tankId) await findTankInTenant(req.body.tankId, orgId);
    if (await prisma.device.findUnique({ where: { hardwareId: req.body.hardwareId } })) {
      throw conflict('This controller is already registered to an account. Factory-reset it to transfer ownership.');
    }
    const a = adapter();
    const status = await a.getStatus(req.body.hardwareId); // confirms the controller is reachable
    const device = await prisma.device.create({
      data: {
        organizationId: orgId,
        tankId: req.body.tankId,
        hardwareId: req.body.hardwareId,
        name: req.body.name,
        firmwareVersion: status.firmwareVersion,
        connectionMode: a.isSimulated ? 'SIMULATED' : 'WIFI',
        isSimulated: a.isSimulated,
        status: status.online ? 'ONLINE' : 'OFFLINE',
        lastSeenAt: new Date(status.lastSeenAt),
        reportedState: (status.intensities ?? undefined) as Prisma.InputJsonValue | undefined,
        channels: { create: CHANNELS.map((c) => ({ channelKey: c.key, position: c.position, label: c.label, maxWattage: c.defaultMaxWattage })) },
        connections: { create: { mode: a.isSimulated ? 'SIMULATED' : 'WIFI', ssid: req.body.ssid, succeeded: true, message: 'Registered' } },
      },
    });
    if (device.tankId) await markDevicesPending(device.tankId);
    await auditFromReq(req, 'device.register', { entityType: 'Device', entityId: device.id, metadata: { hardwareId: device.hardwareId, simulated: device.isSimulated } });
    res.status(201).json({ device });
  }),
);

// ───────────── Management ─────────────

devicesRouter.get('/', requirePermission('device:read'), ah(async (req, res) => {
  const devices = await prisma.device.findMany({
    where: { organizationId: req.tenant!.organizationId, ...(req.query.tankId ? { tankId: String(req.query.tankId) } : {}) },
    include: { tank: { select: { id: true, name: true } }, channels: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    devices: devices.map(({ channels, ...d }) => ({
      ...d,
      maxWatts: channels.reduce((s, c) => s + c.maxWattage, 0),
    })),
  });
}));

devicesRouter.get('/:id', requirePermission('device:read'), ah(async (req, res) => {
  const d = await findDeviceInTenant(req.params.id, req.tenant!.organizationId);
  const connections = await prisma.deviceConnection.findMany({ where: { deviceId: d.id }, orderBy: { createdAt: 'desc' }, take: 10 });
  const reported = (d.reportedState ?? null) as Record<string, number> | null;
  res.json({
    device: d,
    connections,
    power: reported ? estimatePower(channelsToIntensities(CHANNEL_KEYS.map((k) => ({ channelKey: k, intensity: reported[k] ?? 0 }))), deviceWattages(d.channels)) : null,
  });
}));

devicesRouter.patch(
  '/:id',
  requirePermission('device:manage'),
  validateBody(z.object({ name: z.string().trim().min(1).max(80).optional(), tankId: z.string().uuid().nullable().optional() })),
  ah(async (req, res) => {
    const d = await findDeviceInTenant(req.params.id, req.tenant!.organizationId);
    if (req.body.tankId) await findTankInTenant(req.body.tankId, req.tenant!.organizationId);
    const device = await prisma.device.update({ where: { id: d.id }, data: req.body });
    if (req.body.tankId) await markDevicesPending(req.body.tankId);
    await auditFromReq(req, 'device.update', { entityType: 'Device', entityId: d.id, metadata: req.body });
    res.json({ device });
  }),
);

devicesRouter.delete('/:id', requirePermission('device:manage'), ah(async (req, res) => {
  const d = await findDeviceInTenant(req.params.id, req.tenant!.organizationId);
  try {
    await adapter().disconnect(d.hardwareId);
  } catch {
    /* removing an unreachable controller from the account must still work */
  }
  await prisma.device.delete({ where: { id: d.id } });
  await auditFromReq(req, 'device.remove', { entityType: 'Device', entityId: d.id });
  res.status(204).end();
}));

/** Polls the controller for status, firmware, last communication time and telemetry. */
devicesRouter.post('/:id/refresh', requirePermission('device:read'), ah(async (req, res) => {
  const d = await findDeviceInTenant(req.params.id, req.tenant!.organizationId);
  let status;
  try {
    status = await adapter().getStatus(d.hardwareId);
  } catch (e) {
    const device = await prisma.device.update({ where: { id: d.id }, data: { status: 'OFFLINE' } });
    return res.json({ device, error: (e as Error).message });
  }
  const wasOnline = d.status === 'ONLINE';
  const device = await prisma.device.update({
    where: { id: d.id },
    data: {
      status: status.online ? 'ONLINE' : 'OFFLINE',
      firmwareVersion: status.firmwareVersion,
      lastSeenAt: new Date(status.lastSeenAt),
      reportedState: (status.intensities ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  if (status.online && status.intensities) {
    const est = estimatePower(status.intensities, deviceWattages(d.channels));
    await prisma.deviceTelemetry.create({
      data: {
        deviceId: d.id,
        intensities: status.intensities as unknown as Prisma.InputJsonValue,
        powerWatts: status.measuredPowerWatts ?? est.estimatedWatts,
        powerIsMeasured: status.measuredPowerWatts !== null,
        temperatureC: status.temperatureC,
        rssi: status.rssi,
      },
    });
  }
  if (wasOnline && !status.online) {
    await prisma.alert.create({
      data: { organizationId: d.organizationId, deviceId: d.id, severity: 'WARNING', code: 'DEVICE_OFFLINE', message: `${d.name} stopped responding. It keeps running its stored schedule.` },
    });
  }
  res.json({ device, status });
}));

devicesRouter.put('/:id/wattage', requirePermission('device:wattage'), validateBody(wattagesSchema), ah(async (req, res) => {
  const d = await findDeviceInTenant(req.params.id, req.tenant!.organizationId);
  const entries = Object.entries(req.body as Record<string, number>);
  if (!entries.length) throw badRequest('Provide at least one channel wattage');
  await prisma.$transaction(
    entries.map(([channelKey, maxWattage]) =>
      prisma.ledChannel.update({ where: { deviceId_channelKey: { deviceId: d.id, channelKey } }, data: { maxWattage } }),
    ),
  );
  await auditFromReq(req, 'device.wattage_update', { entityType: 'Device', entityId: d.id, metadata: req.body });
  const channels = await prisma.ledChannel.findMany({ where: { deviceId: d.id }, orderBy: { position: 'asc' } });
  res.json({ channels, maxWatts: channels.reduce((s, c) => s + c.maxWattage, 0) });
}));
