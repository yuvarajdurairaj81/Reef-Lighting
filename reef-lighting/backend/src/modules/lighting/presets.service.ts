import { Prisma, PrismaClient } from '@prisma/client';
import { CHANNEL_KEYS, PRESETS } from '../../domain/channels';
import { prisma as defaultPrisma } from '../../lib/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

/** Idempotently creates the built-in SYSTEM presets (AB+, SPS, LPS, Soft Coral, Fish Only, Custom). */
export async function ensureSystemPresets(db: Db = defaultPrisma) {
  for (const preset of PRESETS) {
    const existing = await db.lightingProfile.findUnique({ where: { presetKey: preset.key } });
    if (existing) continue;
    await db.lightingProfile.create({
      data: {
        name: preset.name,
        description: preset.description,
        coralCategory: preset.coralCategory,
        visibility: 'SYSTEM',
        isBuiltIn: true,
        presetKey: preset.key,
        currentVersion: 1,
        versions: {
          create: {
            version: 1,
            rampUpMinutes: preset.rampUpMinutes,
            rampDownMinutes: preset.rampDownMinutes,
            channels: { create: CHANNEL_KEYS.map((k) => ({ channelKey: k, intensity: preset.intensities[k] })) },
          },
        },
      },
    });
  }
}

export async function getPresetProfile(key: string, db: Db = defaultPrisma) {
  await ensureSystemPresets(db);
  return db.lightingProfile.findUniqueOrThrow({
    where: { presetKey: key },
    include: { versions: { orderBy: { version: 'desc' }, take: 1, include: { channels: true } } },
  });
}
