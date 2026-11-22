import { Prisma } from '@prisma/client';
import { getPresetProfile } from '../lighting/presets.service';

/**
 * Every account gets a full Organization → Site → Tank hierarchy so the data
 * model is identical for home and enterprise customers. Home users never see
 * it: the UI hides organization/site management for PERSONAL organizations.
 */
export async function bootstrapTenant(
  tx: Prisma.TransactionClient,
  params: { userId: string; displayName: string; accountType: 'HOME' | 'ENTERPRISE'; organizationName?: string },
) {
  const isHome = params.accountType === 'HOME';
  const org = await tx.organization.create({
    data: {
      name: isHome ? `${params.displayName}'s Reef` : params.organizationName || `${params.displayName}'s Organization`,
      type: isHome ? 'PERSONAL' : 'ENTERPRISE',
      memberships: { create: { userId: params.userId, role: 'OWNER', isDefault: true } },
      sites: { create: { name: isHome ? 'Home' : 'Main Site' } },
    },
    include: { sites: true },
  });

  const tank = await tx.tank.create({
    data: { siteId: org.sites[0].id, name: isHome ? 'My Reef Tank' : 'Display Tank 1', coralCategory: 'MIXED_REEF' },
  });

  const abPlus = await getPresetProfile('AB_PLUS', tx);
  await tx.tankProfileAssignment.create({ data: { tankId: tank.id, profileId: abPlus.id } });

  return { organization: org, site: org.sites[0], tank };
}
