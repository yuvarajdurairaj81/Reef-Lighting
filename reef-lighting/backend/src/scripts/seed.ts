/**
 * Seeds permissions, built-in presets and three demo accounts covering all
 * customer categories. All demo controllers are SIMULATED.
 *
 *   home@reef.local        / ReefDemo2026!   Home – single tank
 *   multi@reef.local       / ReefDemo2026!   Home – multiple tanks
 *   admin@aquarium.example / ReefDemo2026!   Enterprise – 2 sites, 4 tanks
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { CHANNELS, PRESETS } from '../domain/channels';
import { PERMISSIONS, ROLE_PERMISSIONS, Role } from '../domain/permissions';

const prisma = new PrismaClient();
const PASSWORD = 'ReefDemo2026!';

async function ensurePresets() {
  for (const p of PRESETS) {
    if (await prisma.lightingProfile.findUnique({ where: { presetKey: p.key } })) continue;
    await prisma.lightingProfile.create({
      data: {
        name: p.name,
        description: p.description,
        coralCategory: p.coralCategory,
        visibility: 'SYSTEM',
        isBuiltIn: true,
        presetKey: p.key,
        versions: {
          create: {
            version: 1,
            rampUpMinutes: p.rampUpMinutes,
            rampDownMinutes: p.rampDownMinutes,
            channels: { create: Object.entries(p.intensities).map(([channelKey, intensity]) => ({ channelKey, intensity })) },
          },
        },
      },
    });
  }
}

async function ensurePermissions() {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, create: { key, description }, update: { description } });
  }
  const perms = await prisma.permission.findMany();
  for (const [role, keys] of Object.entries(ROLE_PERMISSIONS) as [Role, string[]][]) {
    for (const k of keys) {
      const permissionId = perms.find((p) => p.key === k)!.id;
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role, permissionId } },
        create: { role, permissionId },
        update: {},
      });
    }
  }
}

async function preset(key: string) {
  return prisma.lightingProfile.findUniqueOrThrow({ where: { presetKey: key } });
}

async function createAccount(opts: {
  email: string;
  displayName: string;
  accountType: 'HOME' | 'ENTERPRISE';
  orgName: string;
  sites: { name: string; timezone: string; tanks: { name: string; coral: 'SPS' | 'LPS' | 'SOFT' | 'MIXED_REEF' | 'FISH_ONLY' | 'ANEMONE'; preset: string; device?: string }[] }[];
}) {
  if (await prisma.user.findUnique({ where: { email: opts.email } })) {
    console.log(`  • ${opts.email} already exists, skipping`);
    return;
  }
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      displayName: opts.displayName,
      accountType: opts.accountType,
      passwordHash: await bcrypt.hash(PASSWORD, 12),
      emailVerifiedAt: new Date(),
    },
  });
  const org = await prisma.organization.create({
    data: {
      name: opts.orgName,
      type: opts.accountType === 'HOME' ? 'PERSONAL' : 'ENTERPRISE',
      memberships: { create: { userId: user.id, role: 'OWNER', isDefault: true } },
    },
  });
  for (const s of opts.sites) {
    const site = await prisma.site.create({ data: { organizationId: org.id, name: s.name, timezone: s.timezone } });
    for (const t of s.tanks) {
      const profile = await preset(t.preset);
      const tank = await prisma.tank.create({
        data: { siteId: site.id, name: t.name, coralCategory: t.coral, assignment: { create: { profileId: profile.id } } },
      });
      if (t.device) {
        await prisma.device.create({
          data: {
            organizationId: org.id,
            tankId: tank.id,
            hardwareId: t.device,
            name: `${t.name} Light`,
            firmwareVersion: 'sim-1.4.2',
            connectionMode: 'SIMULATED',
            isSimulated: true,
            status: t.device.endsWith('-OFFLINE') ? 'OFFLINE' : 'ONLINE',
            lastSeenAt: new Date(),
            syncStatus: 'NEVER_SYNCED',
            channels: { create: CHANNELS.map((c) => ({ channelKey: c.key, position: c.position, label: c.label, maxWattage: c.defaultMaxWattage })) },
            connections: { create: { mode: 'SIMULATED', ssid: 'DemoNet', succeeded: true, message: 'Seeded' } },
          },
        });
      }
    }
  }
  console.log(`  ✓ ${opts.email} (${opts.accountType})`);
}

async function main() {
  console.log('Seeding…');
  await ensurePermissions();
  await ensurePresets();

  await createAccount({
    email: 'home@reef.local',
    displayName: 'Hannah Home',
    accountType: 'HOME',
    orgName: "Hannah's Reef",
    sites: [{ name: 'Home', timezone: 'America/Chicago', tanks: [{ name: 'Living Room Reef', coral: 'MIXED_REEF', preset: 'AB_PLUS', device: 'SIM-REEF9-HOME1' }] }],
  });

  await createAccount({
    email: 'multi@reef.local',
    displayName: 'Marco Multi',
    accountType: 'HOME',
    orgName: "Marco's Reef",
    sites: [{
      name: 'Home',
      timezone: 'America/New_York',
      tanks: [
        { name: 'SPS Dominant', coral: 'SPS', preset: 'SPS', device: 'SIM-REEF9-MULTI1' },
        { name: 'LPS Frag Tank', coral: 'LPS', preset: 'LPS', device: 'SIM-REEF9-MULTI2' },
        { name: 'Nano Softie', coral: 'SOFT', preset: 'SOFT' },
      ],
    }],
  });

  await createAccount({
    email: 'admin@aquarium.example',
    displayName: 'Erin Enterprise',
    accountType: 'ENTERPRISE',
    orgName: 'Gulf Coast Public Aquarium',
    sites: [
      {
        name: 'Main Exhibit Hall',
        timezone: 'America/Chicago',
        tanks: [
          { name: 'Indo-Pacific Reef', coral: 'MIXED_REEF', preset: 'AB_PLUS', device: 'SIM-REEF9-ENT1' },
          { name: 'Anemone Garden', coral: 'ANEMONE', preset: 'LPS', device: 'SIM-REEF9-ENT2' },
        ],
      },
      {
        name: 'Coral Propagation Lab',
        timezone: 'America/Chicago',
        tanks: [
          { name: 'Prop System A', coral: 'SPS', preset: 'SPS', device: 'SIM-REEF9-ENT3' },
          { name: 'Prop System B', coral: 'SPS', preset: 'SPS', device: 'SIM-REEF9-ENT4-OFFLINE' },
        ],
      },
    ],
  });

  console.log(`Done. Demo password for all accounts: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
