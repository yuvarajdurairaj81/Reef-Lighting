import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { hasPermission, PermissionKey, Role } from '../domain/permissions';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  typ: 'access';
}

export interface TenantContext {
  organizationId: string;
  organizationType: 'PERSONAL' | 'ENTERPRISE';
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
      tenant?: TenantContext;
    }
  }
}

export const signAccessToken = (user: { id: string; email: string }) =>
  jwt.sign({ sub: user.id, email: user.email, typ: 'access' } satisfies AccessTokenPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });

/** Verifies the Bearer access token. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    if (payload.typ !== 'access') return next(unauthorized('Invalid token type'));
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    next(unauthorized('Session expired'));
  }
}

/**
 * Resolves the active organization (X-Organization-Id header, or the user's
 * default membership) and verifies membership. Every tenant-scoped query
 * must filter by req.tenant.organizationId — this is the isolation boundary.
 */
export async function requireTenant(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) throw unauthorized();
    const requested = req.header('x-organization-id');
    const membership = await prisma.membership.findFirst({
      where: requested
        ? { userId: req.user.id, organizationId: requested }
        : { userId: req.user.id, isDefault: true },
      include: { organization: true },
    });
    if (!membership) throw forbidden('You are not a member of this organization');
    req.tenant = {
      organizationId: membership.organizationId,
      organizationType: membership.organization.type,
      role: membership.role as Role,
    };
    next();
  } catch (e) {
    next(e);
  }
}

export const requirePermission =
  (perm: PermissionKey) => (req: Request, _res: Response, next: NextFunction) => {
    if (!req.tenant) return next(unauthorized());
    if (!hasPermission(req.tenant.role, perm)) return next(forbidden());
    next();
  };
