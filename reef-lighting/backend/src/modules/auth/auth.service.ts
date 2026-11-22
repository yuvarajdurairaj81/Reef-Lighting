import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Response, Request } from 'express';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { env } from '../../config/env';
import { decrypt, encrypt, randomToken, sha256 } from '../../lib/crypto';
import { AppError, badRequest, unauthorized } from '../../lib/errors';
import { resetEmail, sendMail, verificationEmail } from '../../lib/mailer';
import { prisma } from '../../lib/prisma';
import { signAccessToken } from '../../middleware/auth';
import { audit } from '../audit/audit.service';
import { bootstrapTenant } from '../tenancy/bootstrap.service';

export const REFRESH_COOKIE = 'reef_rt';
const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('timing-attack-dummy-password', 10);

authenticator.options = { window: 1 }; // ±30s clock drift

type UserRow = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;

export const publicUser = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  accountType: u.accountType,
  emailVerified: !!u.emailVerifiedAt,
  mfaEnabled: u.mfaEnabled,
});

// ───────────── Registration & email verification ─────────────

export async function register(input: {
  email: string;
  password: string;
  displayName: string;
  accountType: 'HOME' | 'ENTERPRISE';
  organizationName?: string;
}) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw new AppError(409, 'EMAIL_IN_USE', 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        accountType: input.accountType,
        emailVerifiedAt: env.REQUIRE_EMAIL_VERIFICATION ? null : new Date(),
      },
    });
    await bootstrapTenant(tx, { userId: u.id, displayName: u.displayName, accountType: input.accountType, organizationName: input.organizationName });
    return u;
  });

  if (env.REQUIRE_EMAIL_VERIFICATION) await sendVerification(user.id, user.email);
  await audit({ action: 'auth.register', userId: user.id });
  return publicUser(user);
}

async function createEmailToken(userId: string, purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET', ttlMs: number) {
  const token = randomToken();
  await prisma.emailToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.emailToken.create({ data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}

export async function sendVerification(userId: string, email: string) {
  const token = await createEmailToken(userId, 'EMAIL_VERIFICATION', 24 * 3600_000);
  await sendMail(verificationEmail(email, `${env.APP_URL}/verify-email?token=${token}`));
}

async function consumeEmailToken(token: string, purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') {
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) {
    throw badRequest('This link is invalid or has expired. Request a new one.');
  }
  await prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return row;
}

export async function verifyEmail(token: string) {
  const row = await consumeEmailToken(token, 'EMAIL_VERIFICATION');
  await prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ action: 'auth.email_verified', userId: row.userId });
}

export async function resendVerification(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerifiedAt) await sendVerification(user.id, user.email);
  // Always succeed: never reveal whether an email is registered.
}

// ───────────── Password reset ─────────────

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const token = await createEmailToken(user.id, 'PASSWORD_RESET', 3600_000);
  await sendMail(resetEmail(user.email, `${env.APP_URL}/reset-password?token=${token}`));
  await audit({ action: 'auth.password_reset_requested', userId: user.id });
}

export async function resetPassword(token: string, password: string) {
  const row = await consumeEmailToken(token, 'PASSWORD_RESET');
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) } }),
    // Sign out everywhere after a reset.
    prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ action: 'auth.password_reset', userId: row.userId });
}

// ───────────── Login, sessions & refresh rotation ─────────────

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await audit({ action: 'auth.login_failed', userId: user?.id, metadata: { email } });
    throw unauthorized('Incorrect email or password');
  }
  if (env.REQUIRE_EMAIL_VERIFICATION && !user.emailVerifiedAt) {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Please confirm your email address before signing in');
  }
  return user;
}

export const signMfaToken = (userId: string, remember: boolean) =>
  jwt.sign({ sub: userId, typ: 'mfa', remember }, env.JWT_ACCESS_SECRET, { expiresIn: '5m' });

export function readMfaToken(token: string): { sub: string; remember: boolean } {
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub: string; typ: string; remember: boolean };
    if (p.typ !== 'mfa') throw new Error('wrong type');
    return p;
  } catch {
    throw unauthorized('Your sign-in attempt expired. Please sign in again.');
  }
}

function setRefreshCookie(res: Response, token: string, expiresAt: Date, remember: boolean) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'strict',
    path: '/api/v1/auth',
    // Session cookie unless "remember this device" was chosen.
    ...(remember ? { expires: expiresAt } : {}),
  });
}

export async function issueSession(req: Request, res: Response, user: UserRow, remember: boolean, familyId?: string) {
  const token = randomToken(48);
  const days = remember ? env.REMEMBER_ME_TTL_DAYS : env.REFRESH_TOKEN_TTL_DAYS;
  const expiresAt = new Date(Date.now() + days * 86400_000);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      familyId: familyId ?? crypto.randomUUID(),
      remember,
      userAgent: req.get('user-agent')?.slice(0, 255),
      ip: req.ip,
      expiresAt,
    },
  });
  setRefreshCookie(res, token, expiresAt, remember);
  return { accessToken: signAccessToken(user), user: publicUser(user) };
}

export async function refreshSession(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!raw) throw unauthorized('No active session');
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
  if (!row) throw unauthorized('No active session');
  if (row.revokedAt) {
    // Token reuse => likely theft. Kill the whole rotation family.
    await prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ action: 'auth.refresh_reuse_detected', userId: row.userId });
    throw unauthorized('Session revoked');
  }
  if (row.expiresAt < new Date()) throw unauthorized('Session expired');
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  return issueSession(req, res, row.user, row.remember, row.familyId);
}

export async function logout(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (raw) await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
}

// ───────────── MFA (TOTP authenticator apps) ─────────────

export async function beginMfaSetup(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.mfaEnabled) throw badRequest('MFA is already enabled');
  const secret = authenticator.generateSecret();
  await prisma.user.update({ where: { id: userId }, data: { mfaSecretEnc: encrypt(secret, env.MFA_ENCRYPTION_KEY) } });
  const otpauthUrl = authenticator.keyuri(user.email, 'Reef Lighting', secret);
  return { otpauthUrl, qrCodeDataUrl: await QRCode.toDataURL(otpauthUrl), secret };
}

export function verifyTotp(secretEnc: string | null, code: string) {
  if (!secretEnc) return false;
  return authenticator.verify({ token: code, secret: decrypt(secretEnc, env.MFA_ENCRYPTION_KEY) });
}

export async function enableMfa(userId: string, code: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!verifyTotp(user.mfaSecretEnc, code)) throw badRequest('That code is not valid. Check your authenticator app and try again.');
  await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
  await audit({ action: 'auth.mfa_enabled', userId });
}

export async function disableMfa(userId: string, code: string, password: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(password, user.passwordHash))) throw unauthorized('Incorrect password');
  if (!verifyTotp(user.mfaSecretEnc, code)) throw badRequest('Invalid code');
  await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecretEnc: null } });
  await audit({ action: 'auth.mfa_disabled', userId });
}
