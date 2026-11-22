import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { ah, validateBody } from '../../middleware/common';
import { unauthorized } from '../../lib/errors';
import { audit } from '../audit/audit.service';
import * as auth from './auth.service';
import * as passkeys from './passkey.service';
import {
  emailOnlySchema,
  loginSchema,
  mfaDisableSchema,
  mfaVerifySchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
  totpCodeSchema,
} from './auth.schemas';

export const authRouter = Router();

// Brute-force protection on credential endpoints.
const strict = rateLimit({ windowMs: 15 * 60_000, limit: env.isTest ? 1000 : 20, standardHeaders: 'draft-7', legacyHeaders: false });

authRouter.post('/register', strict, validateBody(registerSchema), ah(async (req, res) => {
  const user = await auth.register(req.body);
  res.status(201).json({ user, emailVerificationRequired: env.REQUIRE_EMAIL_VERIFICATION });
}));

authRouter.post('/verify-email', validateBody(tokenSchema), ah(async (req, res) => {
  await auth.verifyEmail(req.body.token);
  res.json({ ok: true });
}));

authRouter.post('/resend-verification', strict, validateBody(emailOnlySchema), ah(async (req, res) => {
  await auth.resendVerification(req.body.email);
  res.json({ ok: true });
}));

authRouter.post('/login', strict, validateBody(loginSchema), ah(async (req, res) => {
  const user = await auth.verifyCredentials(req.body.email, req.body.password);
  if (user.mfaEnabled) {
    return res.json({ mfaRequired: true, mfaToken: auth.signMfaToken(user.id, req.body.remember) });
  }
  await audit({ action: 'auth.login', userId: user.id, ip: req.ip });
  res.json(await auth.issueSession(req, res, user, req.body.remember));
}));

authRouter.post('/mfa/verify', strict, validateBody(mfaVerifySchema), ah(async (req, res) => {
  const { sub, remember } = auth.readMfaToken(req.body.mfaToken);
  const user = await prisma.user.findUnique({ where: { id: sub } });
  if (!user || !user.mfaEnabled || !auth.verifyTotp(user.mfaSecretEnc, req.body.code)) {
    throw unauthorized('Invalid authentication code');
  }
  await audit({ action: 'auth.login', userId: user.id, ip: req.ip, metadata: { mfa: true } });
  res.json(await auth.issueSession(req, res, user, remember));
}));

authRouter.post('/refresh', ah(async (req, res) => {
  res.json(await auth.refreshSession(req, res));
}));

authRouter.post('/logout', ah(async (req, res) => {
  await auth.logout(req, res);
  res.status(204).end();
}));

authRouter.post('/forgot-password', strict, validateBody(emailOnlySchema), ah(async (req, res) => {
  await auth.forgotPassword(req.body.email);
  res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
}));

authRouter.post('/reset-password', strict, validateBody(resetPasswordSchema), ah(async (req, res) => {
  await auth.resetPassword(req.body.token, req.body.password);
  res.json({ ok: true });
}));

// ── Authenticated account endpoints ──
authRouter.get('/me', requireAuth, ah(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    include: {
      memberships: { include: { organization: { include: { _count: { select: { sites: true } } } } } },
      _count: { select: { passkeys: true } },
    },
  });
  const tankCounts = await prisma.tank.groupBy({
    by: ['siteId'],
    where: { site: { organizationId: { in: user.memberships.map((m) => m.organizationId) } } },
    _count: true,
  });
  const siteOrg = await prisma.site.findMany({ where: { id: { in: tankCounts.map((t) => t.siteId) } }, select: { id: true, organizationId: true } });
  const tanksByOrg: Record<string, number> = {};
  for (const t of tankCounts) {
    const org = siteOrg.find((s) => s.id === t.siteId)?.organizationId;
    if (org) tanksByOrg[org] = (tanksByOrg[org] ?? 0) + t._count;
  }
  res.json({
    user: auth.publicUser(user),
    passkeyCount: user._count.passkeys,
    organizations: user.memberships.map((m) => ({
      id: m.organizationId,
      name: m.organization.name,
      type: m.organization.type,
      role: m.role,
      isDefault: m.isDefault,
      siteCount: m.organization._count.sites,
      tankCount: tanksByOrg[m.organizationId] ?? 0,
    })),
  });
}));

authRouter.post('/mfa/setup', requireAuth, ah(async (req, res) => {
  res.json(await auth.beginMfaSetup(req.user!.id));
}));
authRouter.post('/mfa/enable', requireAuth, validateBody(totpCodeSchema), ah(async (req, res) => {
  await auth.enableMfa(req.user!.id, req.body.code);
  res.json({ ok: true });
}));
authRouter.post('/mfa/disable', requireAuth, validateBody(mfaDisableSchema), ah(async (req, res) => {
  await auth.disableMfa(req.user!.id, req.body.code, req.body.password);
  res.json({ ok: true });
}));

// ── Passkeys (Face ID / Touch ID / Windows Hello via WebAuthn) ──
authRouter.post('/passkeys/register/options', requireAuth, ah(async (req, res) => {
  res.json(await passkeys.registrationOptions(req.user!.id));
}));
authRouter.post(
  '/passkeys/register/verify',
  requireAuth,
  validateBody(z.object({ challengeId: z.string().uuid(), response: z.any(), deviceName: z.string().max(80).optional() })),
  ah(async (req, res) => {
    await passkeys.verifyRegistration(req.user!.id, req.body.challengeId, req.body.response, req.body.deviceName);
    res.status(201).json({ ok: true });
  }),
);
authRouter.post('/passkeys/login/options', strict, ah(async (_req, res) => {
  res.json(await passkeys.authenticationOptions());
}));
authRouter.post(
  '/passkeys/login/verify',
  strict,
  validateBody(z.object({ challengeId: z.string().uuid(), response: z.any(), remember: z.boolean().default(false) })),
  ah(async (req, res) => {
    const user = await passkeys.verifyAuthentication(req.body.challengeId, req.body.response);
    // A user-verified passkey is already multi-factor (possession + biometric), so TOTP is skipped.
    res.json(await auth.issueSession(req, res, user, req.body.remember));
  }),
);
authRouter.get('/passkeys', requireAuth, ah(async (req, res) => {
  res.json({ passkeys: await passkeys.listPasskeys(req.user!.id) });
}));
authRouter.delete('/passkeys/:id', requireAuth, ah(async (req, res) => {
  await passkeys.deletePasskey(req.user!.id, req.params.id);
  res.status(204).end();
}));
