import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env';
import { CHANNEL_KEYS, ChannelIntensities } from '../../domain/channels';
import { badRequest } from '../../lib/errors';
import { requirePermission } from '../../middleware/auth';
import { ah, validateBody } from '../../middleware/common';
import { auditFromReq } from '../audit/audit.service';
import { getPresetProfile } from '../lighting/presets.service';
import { applyTankLighting, getTankLighting, saveTankLighting } from '../lighting/lighting.service';
import { describeIntent, isMutating, parseIntent, VoiceIntent } from './intentParser';

export const voiceRouter = Router();

/**
 * Step 1 — interpret. Nothing changes on the device; mutating intents return a
 * short-lived confirmation token that the user must explicitly confirm.
 */
voiceRouter.post('/intents', requirePermission('tank:read'), validateBody(z.object({ utterance: z.string().min(1).max(300), tankId: z.string().uuid() })), ah(async (req, res) => {
  const intent = parseIntent(req.body.utterance);
  const lighting = await getTankLighting(req.body.tankId, req.tenant!.organizationId);
  if (intent.type === 'STATUS') {
    return res.json({ intent, requiresConfirmation: false, answer: `${lighting.tank.name} is running ${lighting.profile.name} v${lighting.profile.version}.` });
  }
  if (!isMutating(intent)) return res.json({ intent, requiresConfirmation: false, answer: "Sorry, I didn't understand that command." });
  const confirmationToken = jwt.sign(
    { typ: 'voice', sub: req.user!.id, org: req.tenant!.organizationId, tankId: req.body.tankId, intent },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '2m' },
  );
  res.json({ intent, requiresConfirmation: true, summary: `${describeIntent(intent)} on ${lighting.tank.name}?`, confirmationToken });
}));

/** Step 2 — execute only after the user confirms. */
voiceRouter.post('/confirm', requirePermission('device:apply'), validateBody(z.object({ confirmationToken: z.string() })), ah(async (req, res) => {
  let payload: { typ: string; sub: string; org: string; tankId: string; intent: VoiceIntent };
  try {
    payload = jwt.verify(req.body.confirmationToken, env.JWT_ACCESS_SECRET) as typeof payload;
  } catch {
    throw badRequest('Confirmation expired. Please repeat the command.');
  }
  if (payload.typ !== 'voice' || payload.sub !== req.user!.id || payload.org !== req.tenant!.organizationId) throw badRequest('Invalid confirmation');

  const orgId = req.tenant!.organizationId;
  const current = await getTankLighting(payload.tankId, orgId);
  const intent = payload.intent;
  if (intent.type === 'APPLY_PRESET') {
    const preset = await getPresetProfile(intent.presetKey);
    await saveTankLighting(payload.tankId, orgId, req.user!.id, { profileId: preset.id });
  } else if (intent.type === 'SET_CHANNEL' || intent.type === 'ALL_OFF') {
    const next: ChannelIntensities = { ...current.effective };
    if (intent.type === 'SET_CHANNEL') next[intent.channel] = intent.intensity;
    else CHANNEL_KEYS.forEach((k) => (next[k] = 0));
    await saveTankLighting(payload.tankId, orgId, req.user!.id, { profileId: current.profile.id, intensities: next });
  }
  const result = await applyTankLighting(payload.tankId, orgId, req.user!.id);
  await auditFromReq(req, 'voice.execute', { entityType: 'Tank', entityId: payload.tankId, metadata: { intent } });
  res.json({ ok: true, executed: describeIntent(intent), results: result.results });
}));
