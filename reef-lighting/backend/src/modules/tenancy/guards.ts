import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

/** Tenant guard helpers — every lookup is scoped by organizationId. */
export async function findTankInTenant(tankId: string, organizationId: string) {
  const tank = await prisma.tank.findFirst({ where: { id: tankId, site: { organizationId } }, include: { site: true } });
  if (!tank) throw notFound('Tank');
  return tank;
}

export async function findSiteInTenant(siteId: string, organizationId: string) {
  const site = await prisma.site.findFirst({ where: { id: siteId, organizationId } });
  if (!site) throw notFound('Site');
  return site;
}

export async function findDeviceInTenant(deviceId: string, organizationId: string) {
  const device = await prisma.device.findFirst({ where: { id: deviceId, organizationId }, include: { channels: true, tank: true } });
  if (!device) throw notFound('Device');
  return device;
}
