import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

export interface AuditEntry {
  action: string;
  userId?: string | null;
  organizationId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/** Best-effort audit write — never breaks the user's request. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { ...entry, metadata: entry.metadata as Prisma.InputJsonValue | undefined },
    });
  } catch (err) {
    logger.warn({ err, action: entry.action }, 'audit write failed');
  }
}

export const auditFromReq = (req: Request, action: string, extra: Omit<AuditEntry, 'action'> = {}) =>
  audit({
    action,
    userId: req.user?.id,
    organizationId: req.tenant?.organizationId,
    ip: req.ip,
    ...extra,
  });
