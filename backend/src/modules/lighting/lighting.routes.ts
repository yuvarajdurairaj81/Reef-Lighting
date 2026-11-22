import { Router } from 'express';
import { z } from 'zod';
import { estimatePower } from '../../domain/power';
import { intensitiesSchema } from '../../domain/validation';
import { requirePermission } from '../../middleware/auth';
import { ah, validateBody } from '../../middleware/common';
import { applyTankLighting, getTankLighting, saveTankLighting } from './lighting.service';

/** Mounted at /tanks/:tankId/lighting */
export const tankLightingRouter = Router({ mergeParams: true });

const present = (l: Awaited<ReturnType<typeof getTankLighting>>) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { version, ...rest } = l;
  return rest;
};

tankLightingRouter.get('/', requirePermission('tank:read'), ah(async (req, res) => {
  res.json(present(await getTankLighting(req.params.tankId, req.tenant!.organizationId)));
}));

/** Save Configuration (stores desired state; does not touch hardware). */
tankLightingRouter.put(
  '/',
  requirePermission('profile:write'),
  validateBody(z.object({ profileId: z.string().uuid(), intensities: intensitiesSchema.optional() })),
  ah(async (req, res) => {
    res.json(present(await saveTankLighting(req.params.tankId, req.tenant!.organizationId, req.user!.id, req.body)));
  }),
);

/** Apply Configuration (validates, pushes to the controller(s), reports per-device result). */
tankLightingRouter.post('/apply', requirePermission('device:apply'), ah(async (req, res) => {
  const { results, lighting } = await applyTankLighting(req.params.tankId, req.tenant!.organizationId, req.user!.id);
  res.status(results.every((r) => r.ok) ? 200 : 207).json({ results, ...present(lighting) });
}));

/** Real-time power preview for unsaved slider values (uses the tank's first controller wattages). */
tankLightingRouter.post('/preview', requirePermission('tank:read'), validateBody(z.object({ intensities: intensitiesSchema })), ah(async (req, res) => {
  const l = await getTankLighting(req.params.tankId, req.tenant!.organizationId);
  res.json({ power: estimatePower(req.body.intensities, l.devices[0]?.wattages) });
}));
