import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { CHANNEL_KEYS, ChannelIntensities } from '../../domain/channels';
import { coralCategorySchema, intensitiesSchema, scheduleSchema } from '../../domain/validation';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { ah, validateBody } from '../../middleware/common';
import { auditFromReq } from '../audit/audit.service';
import { findTankInTenant } from '../tenancy/guards';
import { channelsToIntensities, loadVersion, markDevicesPending, visibleProfilesWhere } from './lighting.service';

export const profilesRouter = Router();

const rampSchema = z.number().int().min(0).max(480);

// Prisma.validator keeps literal types so GetPayload infers `versions[].channels` correctly.
const withLatest = Prisma.validator<Prisma.LightingProfileInclude>()({
  versions: { orderBy: { version: 'desc' }, take: 1, include: { channels: true } },
  _count: { select: { assignments: true } },
});

type ProfileWithLatest = Prisma.LightingProfileGetPayload<{ include: typeof withLatest }>;

const present = (p: ProfileWithLatest) => {
  const v = p.versions[0];
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    coralCategory: p.coralCategory,
    visibility: p.visibility,
    isBuiltIn: p.isBuiltIn,
    presetKey: p.presetKey,
    currentVersion: p.currentVersion,
    assignedTankCount: p._count.assignments,
    rampUpMinutes: v?.rampUpMinutes,
    rampDownMinutes: v?.rampDownMinutes,
    intensities: v ? channelsToIntensities(v.channels) : null,
    updatedAt: p.updatedAt,
  };
};

const channelRows = (i: ChannelIntensities) => CHANNEL_KEYS.map((k) => ({ channelKey: k, intensity: i[k] }));

async function findVisibleProfile(id: string, orgId: string, userId: string) {
  const p = await prisma.lightingProfile.findFirst({ where: { id, ...visibleProfilesWhere(orgId, userId) }, include: withLatest });
  if (!p) throw notFound('Lighting profile');
  return p;
}

profilesRouter.get('/', requirePermission('profile:read'), ah(async (req, res) => {
  const profiles = await prisma.lightingProfile.findMany({
    where: visibleProfilesWhere(req.tenant!.organizationId, req.user!.id),
    include: withLatest,
    orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
  });
  res.json({ profiles: profiles.map(present) });
}));

profilesRouter.get('/:id', requirePermission('profile:read'), ah(async (req, res) => {
  const p = await findVisibleProfile(req.params.id, req.tenant!.organizationId, req.user!.id);
  const versions = await prisma.profileVersion.findMany({
    where: { profileId: p.id },
    orderBy: { version: 'desc' },
    select: { version: true, createdAt: true, notes: true, rampUpMinutes: true, rampDownMinutes: true },
  });
  const tanks = await prisma.tankProfileAssignment.findMany({
    where: { profileId: p.id, tank: { site: { organizationId: req.tenant!.organizationId } } },
    include: { tank: { select: { id: true, name: true } } },
  });
  res.json({ profile: present(p), versions, assignedTanks: tanks.map((t) => t.tank) });
}));

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional(),
  coralCategory: coralCategorySchema,
  intensities: intensitiesSchema,
  rampUpMinutes: rampSchema.default(60),
  rampDownMinutes: rampSchema.default(60),
  assignToTankId: z.string().uuid().optional(),
});

async function createProfile(orgId: string, userId: string, input: z.infer<typeof createSchema>, forkedFromId?: string) {
  return prisma.lightingProfile.create({
    data: {
      organizationId: orgId,
      name: input.name,
      description: input.description,
      coralCategory: input.coralCategory,
      forkedFromId,
      versions: {
        create: {
          version: 1,
          rampUpMinutes: input.rampUpMinutes,
          rampDownMinutes: input.rampDownMinutes,
          createdById: userId,
          channels: { create: channelRows(input.intensities) },
        },
      },
    },
    include: withLatest,
  });
}

async function assignTank(tankId: string, profileId: string) {
  await prisma.tankProfileAssignment.upsert({
    where: { tankId },
    create: { tankId, profileId },
    update: { profileId, pinnedVersionId: null, overrides: Prisma.DbNull },
  });
  await markDevicesPending(tankId);
}

/** "Save As New Profile" */
profilesRouter.post('/', requirePermission('profile:write'), validateBody(createSchema), ah(async (req, res) => {
  const orgId = req.tenant!.organizationId;
  if (req.body.assignToTankId) await findTankInTenant(req.body.assignToTankId, orgId);
  const p = await createProfile(orgId, req.user!.id, req.body);
  if (req.body.assignToTankId) await assignTank(req.body.assignToTankId, p.id);
  await auditFromReq(req, 'profile.create', { entityType: 'LightingProfile', entityId: p.id });
  res.status(201).json({ profile: present(p) });
}));

/** "Duplicate Profile" */
profilesRouter.post('/:id/duplicate', requirePermission('profile:write'), validateBody(z.object({ name: z.string().trim().min(1).max(80).optional() })), ah(async (req, res) => {
  const src = await findVisibleProfile(req.params.id, req.tenant!.organizationId, req.user!.id);
  const v = src.versions[0];
  const p = await createProfile(req.tenant!.organizationId, req.user!.id, {
    name: req.body.name ?? `${src.name} (copy)`,
    description: src.description ?? undefined,
    coralCategory: src.coralCategory,
    intensities: channelsToIntensities(v.channels),
    rampUpMinutes: v.rampUpMinutes,
    rampDownMinutes: v.rampDownMinutes,
  }, src.id);
  await auditFromReq(req, 'profile.duplicate', { entityType: 'LightingProfile', entityId: p.id, metadata: { from: src.id } });
  res.status(201).json({ profile: present(p) });
}));

/**
 * Edit a profile. If it is assigned to more than one tank, the client must
 * choose a strategy (the UI shows a confirmation dialog):
 *   UPDATE_ALL   – new version; every tank following "latest" picks it up
 *   NEW_VERSION  – new version; other tanks are pinned to the previous version,
 *                  only `tankId` (if given) moves to the new one
 *   FORK         – leave the shared profile untouched; create a copy for `tankId`
 */
const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  coralCategory: coralCategorySchema.optional(),
  intensities: intensitiesSchema,
  rampUpMinutes: rampSchema.optional(),
  rampDownMinutes: rampSchema.optional(),
  notes: z.string().max(240).optional(),
  strategy: z.enum(['UPDATE_ALL', 'NEW_VERSION', 'FORK']).optional(),
  tankId: z.string().uuid().optional(),
});

profilesRouter.put('/:id', requirePermission('profile:write'), validateBody(updateSchema), ah(async (req, res) => {
  const orgId = req.tenant!.organizationId;
  const body = req.body as z.infer<typeof updateSchema>;
  const p = await findVisibleProfile(req.params.id, orgId, req.user!.id);
  if (p.isBuiltIn) throw forbidden('Built-in presets cannot be edited. Use "Save As New Profile" or "Duplicate Profile".');
  if (p.organizationId !== orgId) throw forbidden('Profiles shared with you are read-only. Duplicate it to make changes.');
  if (body.tankId) await findTankInTenant(body.tankId, orgId);

  const assignments = await prisma.tankProfileAssignment.findMany({ where: { profileId: p.id }, include: { tank: { select: { id: true, name: true } } } });
  if (assignments.length > 1 && !body.strategy) {
    throw new AppError(409, 'SHARED_PROFILE_CONFIRMATION', `"${p.name}" is used by ${assignments.length} tanks. Choose how to apply this change.`, {
      affectedTanks: assignments.map((a) => a.tank),
      options: ['UPDATE_ALL', 'NEW_VERSION', 'FORK'],
    });
  }
  const latest = p.versions[0];

  if (body.strategy === 'FORK') {
    if (!body.tankId) throw badRequest('tankId is required to fork a profile for one tank');
    const tank = assignments.find((a) => a.tankId === body.tankId)?.tank;
    const fork = await createProfile(orgId, req.user!.id, {
      name: `${body.name ?? p.name} – ${tank?.name ?? 'fork'}`,
      description: body.description ?? p.description ?? undefined,
      coralCategory: body.coralCategory ?? p.coralCategory,
      intensities: body.intensities,
      rampUpMinutes: body.rampUpMinutes ?? latest.rampUpMinutes,
      rampDownMinutes: body.rampDownMinutes ?? latest.rampDownMinutes,
    }, p.id);
    await assignTank(body.tankId, fork.id);
    await auditFromReq(req, 'profile.fork', { entityType: 'LightingProfile', entityId: fork.id, metadata: { from: p.id, tankId: body.tankId } });
    return res.status(201).json({ profile: present(fork), strategy: 'FORK' });
  }

  const nextVersion = p.currentVersion + 1;
  await prisma.$transaction(async (tx) => {
    if (body.strategy === 'NEW_VERSION') {
      // Freeze other tanks on the version they are running now.
      await tx.tankProfileAssignment.updateMany({
        where: { profileId: p.id, pinnedVersionId: null, ...(body.tankId ? { NOT: { tankId: body.tankId } } : {}) },
        data: { pinnedVersionId: latest.id },
      });
    }
    await tx.profileVersion.create({
      data: {
        profileId: p.id,
        version: nextVersion,
        rampUpMinutes: body.rampUpMinutes ?? latest.rampUpMinutes,
        rampDownMinutes: body.rampDownMinutes ?? latest.rampDownMinutes,
        notes: body.notes,
        createdById: req.user!.id,
        channels: { create: channelRows(body.intensities) },
      },
    });
    await tx.lightingProfile.update({
      where: { id: p.id },
      data: { currentVersion: nextVersion, name: body.name, description: body.description, coralCategory: body.coralCategory },
    });
    if (body.strategy === 'UPDATE_ALL') {
      await tx.tankProfileAssignment.updateMany({ where: { profileId: p.id }, data: { pinnedVersionId: null } });
    }
  });

  const following = await prisma.tankProfileAssignment.findMany({ where: { profileId: p.id, pinnedVersionId: null } });
  for (const a of following) await markDevicesPending(a.tankId);
  await auditFromReq(req, 'profile.update', { entityType: 'LightingProfile', entityId: p.id, metadata: { version: nextVersion, strategy: body.strategy ?? 'SINGLE' } });
  res.json({ profile: present(await findVisibleProfile(p.id, orgId, req.user!.id)), strategy: body.strategy ?? 'SINGLE', updatedTanks: following.length });
}));

profilesRouter.delete('/:id', requirePermission('profile:write'), ah(async (req, res) => {
  const p = await findVisibleProfile(req.params.id, req.tenant!.organizationId, req.user!.id);
  if (p.isBuiltIn || p.organizationId !== req.tenant!.organizationId) throw forbidden('This profile cannot be deleted');
  if (p._count.assignments > 0) throw badRequest('This profile is assigned to tanks. Assign another profile first.');
  await prisma.lightingProfile.delete({ where: { id: p.id } });
  await auditFromReq(req, 'profile.delete', { entityType: 'LightingProfile', entityId: p.id });
  res.status(204).end();
}));

/** Cloud sharing foundation: share a profile (read-only) with another user by email. */
profilesRouter.post('/:id/share', requirePermission('profile:write'), validateBody(z.object({ email: z.string().email() })), ah(async (req, res) => {
  const p = await findVisibleProfile(req.params.id, req.tenant!.organizationId, req.user!.id);
  if (p.organizationId !== req.tenant!.organizationId) throw forbidden();
  const target = await prisma.user.findUnique({ where: { email: req.body.email.toLowerCase() } });
  // Respond identically whether or not the email exists (no account enumeration).
  if (target && target.id !== req.user!.id) {
    await prisma.profileShare.upsert({
      where: { profileId_sharedWithId: { profileId: p.id, sharedWithId: target.id } },
      create: { profileId: p.id, sharedWithId: target.id },
      update: {},
    });
    await prisma.lightingProfile.update({ where: { id: p.id }, data: { visibility: 'SHARED' } });
    await auditFromReq(req, 'profile.share', { entityType: 'LightingProfile', entityId: p.id, metadata: { sharedWith: target.id } });
  }
  res.json({ ok: true });
}));

// ───────────── Scheduler foundation (Phase 5) ─────────────

profilesRouter.get('/:id/versions/:version/schedule', requirePermission('profile:read'), ah(async (req, res) => {
  const p = await findVisibleProfile(req.params.id, req.tenant!.organizationId, req.user!.id);
  const v = await loadVersion(p.id, Number(req.params.version));
  const schedule = await prisma.lightingSchedule.findUnique({ where: { profileVersionId: v.id }, include: { channelWindows: true, ramps: true, overrides: true } });
  res.json({ schedule, executesOn: 'controller', note: 'Schedules are executed by the controller using its own clock (Phase 5).' });
}));

profilesRouter.put('/:id/versions/:version/schedule', requirePermission('profile:write'), validateBody(scheduleSchema), ah(async (req, res) => {
  const p = await findVisibleProfile(req.params.id, req.tenant!.organizationId, req.user!.id);
  if (p.organizationId !== req.tenant!.organizationId) throw forbidden();
  const v = await loadVersion(p.id, Number(req.params.version));
  const body = req.body as z.infer<typeof scheduleSchema>;
  const schedule = await prisma.$transaction(async (tx) => {
    const s = await tx.lightingSchedule.upsert({
      where: { profileVersionId: v.id },
      create: { profileVersionId: v.id, timezone: body.timezone, enabled: body.enabled },
      update: { timezone: body.timezone, enabled: body.enabled },
    });
    await tx.scheduleChannelWindow.deleteMany({ where: { scheduleId: s.id } });
    await tx.scheduleRamp.deleteMany({ where: { scheduleId: s.id } });
    await tx.scheduleChannelWindow.createMany({ data: body.channelWindows.map((w) => ({ ...w, scheduleId: s.id })) });
    await tx.scheduleRamp.createMany({ data: body.ramps.map((r) => ({ ...r, scheduleId: s.id })) });
    return tx.lightingSchedule.findUniqueOrThrow({ where: { id: s.id }, include: { channelWindows: true, ramps: true } });
  });
  await auditFromReq(req, 'schedule.update', { entityType: 'LightingSchedule', entityId: schedule.id });
  res.json({ schedule });
}));
