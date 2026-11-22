import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { findSiteInTenant, findTankInTenant } from './guards';
import { requirePermission } from '../../middleware/auth';
import { ah, validateBody } from '../../middleware/common';
import { coralCategorySchema, isValidTimeZone } from '../../domain/validation';
import { auditFromReq } from '../audit/audit.service';
import { getPresetProfile } from '../lighting/presets.service';

export const tenancyRouter = Router();

// ── Organization ──
tenancyRouter.get('/organization', ah(async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: req.tenant!.organizationId },
    include: { _count: { select: { sites: true, devices: true, memberships: true } } },
  });
  res.json({ organization: org, role: req.tenant!.role });
}));

tenancyRouter.patch('/organization', requirePermission('org:manage'), validateBody(z.object({ name: z.string().trim().min(2).max(120) })), ah(async (req, res) => {
  const org = await prisma.organization.update({ where: { id: req.tenant!.organizationId }, data: { name: req.body.name } });
  await auditFromReq(req, 'organization.update', { entityType: 'Organization', entityId: org.id });
  res.json({ organization: org });
}));

// Phase 6 foundation: membership listing for User Management.
tenancyRouter.get('/organization/members', requirePermission('users:manage'), ah(async (req, res) => {
  const members = await prisma.membership.findMany({
    where: { organizationId: req.tenant!.organizationId },
    include: { user: { select: { id: true, email: true, displayName: true, mfaEnabled: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ members: members.map((m) => ({ id: m.id, role: m.role, user: m.user, createdAt: m.createdAt })) });
}));

// ── Sites ──
tenancyRouter.get('/sites', requirePermission('tank:read'), ah(async (req, res) => {
  const sites = await prisma.site.findMany({
    where: { organizationId: req.tenant!.organizationId },
    include: { _count: { select: { tanks: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ sites });
}));

const siteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: z.string().refine(isValidTimeZone, 'Unknown time zone').default('UTC'),
  address: z.string().max(240).optional(),
});

tenancyRouter.post('/sites', requirePermission('site:manage'), validateBody(siteSchema), ah(async (req, res) => {
  const site = await prisma.site.create({ data: { ...req.body, organizationId: req.tenant!.organizationId } });
  await auditFromReq(req, 'site.create', { entityType: 'Site', entityId: site.id });
  res.status(201).json({ site });
}));

tenancyRouter.patch('/sites/:id', requirePermission('site:manage'), validateBody(siteSchema.partial()), ah(async (req, res) => {
  await findSiteInTenant(req.params.id, req.tenant!.organizationId);
  const site = await prisma.site.update({ where: { id: req.params.id }, data: req.body });
  res.json({ site });
}));

tenancyRouter.delete('/sites/:id', requirePermission('site:manage'), ah(async (req, res) => {
  await findSiteInTenant(req.params.id, req.tenant!.organizationId);
  const count = await prisma.site.count({ where: { organizationId: req.tenant!.organizationId } });
  if (count <= 1) throw badRequest('An organization must keep at least one site');
  await prisma.site.delete({ where: { id: req.params.id } });
  await auditFromReq(req, 'site.delete', { entityType: 'Site', entityId: req.params.id });
  res.status(204).end();
}));

// ── Tanks ──
tenancyRouter.get('/tanks', requirePermission('tank:read'), ah(async (req, res) => {
  const tanks = await prisma.tank.findMany({
    where: { site: { organizationId: req.tenant!.organizationId } },
    include: {
      site: { select: { id: true, name: true } },
      devices: { select: { id: true, name: true, status: true, isSimulated: true, syncStatus: true } },
      assignment: { include: { profile: { select: { id: true, name: true, currentVersion: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ tanks });
}));

const tankSchema = z.object({
  name: z.string().trim().min(1).max(120),
  siteId: z.string().uuid().optional(),
  volumeLiters: z.number().int().min(1).max(1_000_000).optional(),
  coralCategory: coralCategorySchema.default('MIXED_REEF'),
});

tenancyRouter.post('/tanks', requirePermission('tank:manage'), validateBody(tankSchema), ah(async (req, res) => {
  const orgId = req.tenant!.organizationId;
  const siteId = req.body.siteId
    ? (await findSiteInTenant(req.body.siteId, orgId)).id
    : (await prisma.site.findFirstOrThrow({ where: { organizationId: orgId }, orderBy: { createdAt: 'asc' } })).id;
  const abPlus = await getPresetProfile('AB_PLUS');
  const tank = await prisma.tank.create({
    data: {
      name: req.body.name,
      volumeLiters: req.body.volumeLiters,
      coralCategory: req.body.coralCategory,
      siteId,
      assignment: { create: { profileId: abPlus.id } },
    },
  });
  await auditFromReq(req, 'tank.create', { entityType: 'Tank', entityId: tank.id });
  res.status(201).json({ tank });
}));

tenancyRouter.patch('/tanks/:id', requirePermission('tank:manage'), validateBody(tankSchema.partial()), ah(async (req, res) => {
  await findTankInTenant(req.params.id, req.tenant!.organizationId);
  if (req.body.siteId) await findSiteInTenant(req.body.siteId, req.tenant!.organizationId);
  const tank = await prisma.tank.update({ where: { id: req.params.id }, data: req.body });
  res.json({ tank });
}));

tenancyRouter.delete('/tanks/:id', requirePermission('tank:manage'), ah(async (req, res) => {
  await findTankInTenant(req.params.id, req.tenant!.organizationId);
  await prisma.tank.delete({ where: { id: req.params.id } }); // devices are unassigned (SetNull), not deleted
  await auditFromReq(req, 'tank.delete', { entityType: 'Tank', entityId: req.params.id });
  res.status(204).end();
}));
