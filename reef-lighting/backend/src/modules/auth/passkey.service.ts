import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { env } from '../../config/env';
import { badRequest, unauthorized } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { audit } from '../audit/audit.service';

/**
 * WebAuthn / Passkeys. On iPhone/iPad/Mac the platform authenticator is
 * Face ID or Touch ID; on Android/Windows it's the device biometric or PIN.
 * The browser never exposes Face ID directly — it brokers a WebAuthn ceremony
 * and we only ever see a public key + signed challenge.
 * WebAuthn requires HTTPS (localhost is exempt for development).
 */

const CHALLENGE_TTL_MS = 5 * 60_000;

async function storeChallenge(kind: string, challenge: string, userId?: string) {
  const row = await prisma.authChallenge.create({
    data: { kind, challenge, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
  return row.id;
}

async function takeChallenge(id: string, kind: string) {
  const row = await prisma.authChallenge.findUnique({ where: { id } });
  if (row) await prisma.authChallenge.delete({ where: { id } });
  if (!row || row.kind !== kind || row.expiresAt < new Date()) throw badRequest('Passkey request expired. Try again.');
  return row;
}

export async function registrationOptions(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { passkeys: true } });
  const options = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    userName: user.email,
    userDisplayName: user.displayName,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: user.passkeys.map((p) => ({ id: p.credentialId, transports: p.transports })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required', authenticatorAttachment: 'platform' },
  });
  const challengeId = await storeChallenge('passkey-register', options.challenge, userId);
  return { challengeId, options };
}

export async function verifyRegistration(userId: string, challengeId: string, response: RegistrationResponseJSON, deviceName?: string) {
  const ch = await takeChallenge(challengeId, 'passkey-register');
  if (ch.userId !== userId) throw unauthorized();
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: ch.challenge,
    expectedOrigin: env.webauthnOrigins,
    expectedRPID: env.WEBAUTHN_RP_ID,
    requireUserVerification: true,
  });
  if (!result.verified) throw badRequest('Passkey could not be verified');
  const { credential } = result.registrationInfo;
  await prisma.passkeyCredential.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: credential.transports ?? [],
      deviceName: deviceName?.slice(0, 80),
    },
  });
  await audit({ action: 'auth.passkey_registered', userId });
}

export async function authenticationOptions() {
  // Discoverable credentials: no email needed — the OS shows the user's passkeys.
  const options = await generateAuthenticationOptions({ rpID: env.WEBAUTHN_RP_ID, userVerification: 'required' });
  const challengeId = await storeChallenge('passkey-login', options.challenge);
  return { challengeId, options };
}

export async function verifyAuthentication(challengeId: string, response: AuthenticationResponseJSON) {
  const ch = await takeChallenge(challengeId, 'passkey-login');
  const cred = await prisma.passkeyCredential.findUnique({ where: { credentialId: response.id }, include: { user: true } });
  if (!cred) throw unauthorized('This passkey is not registered');
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: ch.challenge,
    expectedOrigin: env.webauthnOrigins,
    expectedRPID: env.WEBAUTHN_RP_ID,
    requireUserVerification: true,
    credential: {
      id: cred.credentialId,
      publicKey: new Uint8Array(cred.publicKey),
      counter: Number(cred.counter),
      transports: cred.transports as never,
    },
  });
  if (!result.verified) throw unauthorized('Passkey verification failed');
  await prisma.passkeyCredential.update({
    where: { id: cred.id },
    data: { counter: BigInt(result.authenticationInfo.newCounter), lastUsedAt: new Date() },
  });
  await audit({ action: 'auth.login_passkey', userId: cred.userId });
  return cred.user;
}

export async function listPasskeys(userId: string) {
  return prisma.passkeyCredential.findMany({
    where: { userId },
    select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function deletePasskey(userId: string, id: string) {
  await prisma.passkeyCredential.deleteMany({ where: { id, userId } });
  await audit({ action: 'auth.passkey_deleted', userId });
}
