import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { ah, validateBody } from '../../middleware/common';
import { auditFromReq } from '../audit/audit.service';

export const alertsRouter = Router();

alertsRouter.get('/', requirePermission('alert:read'), ah(async (req, res) => {
  const status = z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional().parse(req.query.status);
  const alerts = await prisma.alert.findMany({
    where: { organizationId: req.tenant!.organizationId, ...(status ? { status } : {}) },
    include: { device: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({ alerts });
}));

alertsRouter.patch('/:id', requirePermission('alert:manage'), validateBody(z.object({ status: z.enum(['ACKNOWLEDGED', 'RESOLVED']) })), ah(async (req, res) => {
  const a = await prisma.alert.findFirst({ where: { id: req.params.id, organizationId: req.tenant!.organizationId } });
  if (!a) throw notFound('Alert');
  const alert = await prisma.alert.update({
    where: { id: a.id },
    data: { status: req.body.status, resolvedAt: req.body.status === 'RESOLVED' ? new Date() : null },
  });
  await auditFromReq(req, `alert.${req.body.status.toLowerCase()}`, { entityType: 'Alert', entityId: a.id });
  res.json({ alert });
}));

/** Phase 6 foundation: audit log viewer. */
export const auditRouter = Router();
auditRouter.get('/', requirePermission('audit:read'), ah(async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    where: { organizationId: req.tenant!.organizationId },
    include: { user: { select: { email: true, displayName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({ logs });
}));
