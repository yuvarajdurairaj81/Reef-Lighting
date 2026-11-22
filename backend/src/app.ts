import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { openApiDocument } from './docs/openapi';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { requireAuth, requireTenant } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/common';
import { alertsRouter, auditRouter } from './modules/alerts/alerts.routes';
import { authRouter } from './modules/auth/auth.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { devicesRouter } from './modules/devices/devices.routes';
import { tankLightingRouter } from './modules/lighting/lighting.routes';
import { profilesRouter } from './modules/lighting/profiles.routes';
import { metaRouter } from './modules/meta/meta.routes';
import { tenancyRouter } from './modules/tenancy/tenancy.routes';
import { voiceRouter } from './modules/voice/voice.routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind nginx / load balancer
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (!env.isTest) app.use(pinoHttp({ logger }));

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'ok' });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  app.get('/api/docs.json', (_req, res) => res.json(openApiDocument));
  app.use('/api/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(openApiDocument));

  const api = express.Router();
  api.use('/auth', authRouter);
  api.use('/meta', metaRouter);

  // Everything below requires a valid access token AND a resolved tenant.
  api.use(requireAuth, requireTenant);
  api.use('/tanks/:tankId/lighting', tankLightingRouter);
  api.use('/profiles', profilesRouter);
  api.use('/devices', devicesRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/alerts', alertsRouter);
  api.use('/audit-logs', auditRouter);
  api.use('/voice', voiceRouter);
  api.use('/', tenancyRouter);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
